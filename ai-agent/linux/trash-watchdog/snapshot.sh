#!/usr/bin/env bash
set -euo pipefail
trap 'exit 255' ERR

state_dir=${1:?state directory is required}
snapshot_path="$state_dir/snapshot.json"
decision_path="$state_dir/decision.json"

/usr/bin/install -d -m 0700 "$state_dir"
: >"$decision_path"
/usr/bin/chmod 0600 "$decision_path"

generated_at=$(/usr/bin/date --iso-8601=seconds)
snapshot=$(/usr/bin/jq -cn --arg generated_at "$generated_at" \
  '{generated_at: $generated_at, candidates: []}')

while IFS= read -r pid; do
  [[ $pid =~ ^[1-9][0-9]*$ ]] || continue
  [[ -r /proc/$pid/comm && -r /proc/$pid/cmdline && -r /proc/$pid/stat ]] || continue

  comm=$(</proc/$pid/comm)
  [[ $comm == trash ]] || continue

  argv=()
  mapfile -d '' -t argv </proc/$pid/cmdline || true
  ((${#argv[@]} >= 2)) || continue
  [[ ${argv[0]} =~ ^/usr/bin/python3([.][0-9]+)?$ ]] || continue
  [[ ${argv[1]} == /usr/bin/trash ]] || continue

  process_row=$(/usr/bin/ps -p "$pid" -o ppid=,etimes=,pcpu= 2>/dev/null || true)
  [[ -n $process_row ]] || continue
  read -r ppid elapsed_seconds cpu_percent <<<"$process_row"
  [[ $ppid =~ ^[0-9]+$ && $elapsed_seconds =~ ^[0-9]+$ ]] || continue

  start_ticks=$(/usr/bin/awk '{print $22}' "/proc/$pid/stat")
  [[ $start_ticks =~ ^[0-9]+$ ]] || continue

  threshold_confirmed=false
  if ((elapsed_seconds >= 300)) && /usr/bin/awk -v cpu="$cpu_percent" 'BEGIN { exit !(cpu >= 90) }'; then
    threshold_confirmed=true
  fi

  evidence_confirmed=false
  erofs_count=0
  trace_path=""
  if [[ $threshold_confirmed == true ]]; then
    trace_path=$(/usr/bin/mktemp "$state_dir/trace.$pid.XXXXXX")
    /usr/bin/timeout 0.25s /usr/bin/strace -f -tt -T -e trace=file -p "$pid" \
      2>"$trace_path" || true
    erofs_count=$(/usr/bin/awk '
      /\/home\/xdanger\/[.]local\/share\/Trash\/info\/.*[.]trashinfo.*EROFS/ {
        count++
      }
      END { print count + 0 }
    ' "$trace_path")
    if [[ $erofs_count =~ ^[0-9]+$ ]] && ((erofs_count >= 10)); then
      evidence_confirmed=true
    fi
  fi

  target=${argv[2]:-}
  parent_args=$(/usr/bin/ps -p "$ppid" -o args= 2>/dev/null || true)
  candidate=$(/usr/bin/jq -cn \
    --argjson pid "$pid" \
    --argjson ppid "$ppid" \
    --argjson start_ticks "$start_ticks" \
    --argjson elapsed_seconds "$elapsed_seconds" \
    --argjson cpu_percent "$cpu_percent" \
    --argjson threshold_confirmed "$threshold_confirmed" \
    --argjson evidence_confirmed "$evidence_confirmed" \
    --argjson erofs_count "$erofs_count" \
    --arg target "$target" \
    --arg parent_args "$parent_args" \
    --arg trace_path "$trace_path" \
    '{
      pid: $pid,
      ppid: $ppid,
      start_ticks: $start_ticks,
      elapsed_seconds: $elapsed_seconds,
      cpu_percent: $cpu_percent,
      identity_confirmed: true,
      threshold_confirmed: $threshold_confirmed,
      evidence_confirmed: $evidence_confirmed,
      erofs_count: $erofs_count,
      target: $target,
      parent_args: $parent_args,
      trace_path: $trace_path
    }')
  snapshot=$(/usr/bin/jq -c --argjson candidate "$candidate" \
    '.candidates += [$candidate]' <<<"$snapshot")
done < <(/usr/bin/pgrep -x trash 2>/dev/null || true)

snapshot_tmp=$(/usr/bin/mktemp "$state_dir/snapshot.XXXXXX")
/usr/bin/printf '%s\n' "$snapshot" >"$snapshot_tmp"
/usr/bin/chmod 0600 "$snapshot_tmp"
/usr/bin/mv -f "$snapshot_tmp" "$snapshot_path"

if /usr/bin/jq -e '
  any(.candidates[];
    .identity_confirmed and
    .threshold_confirmed and
    .evidence_confirmed
  )
' "$snapshot_path" >/dev/null; then
  /usr/bin/echo 'watchdog: eligible trash-cli candidate detected; requesting Codex decision'
  exit 0
fi

/usr/bin/echo 'watchdog: no eligible trash-cli candidate; skipping Codex decision'
exit 1
