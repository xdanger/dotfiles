#!/usr/bin/env bash
set -euo pipefail

state_dir=${1:?state directory is required}
snapshot_path="$state_dir/snapshot.json"
decision_path="$state_dir/decision.json"

if [[ ! -s $snapshot_path || ! -s $decision_path ]]; then
  /usr/bin/echo 'watchdog: missing snapshot or decision; no action taken'
  exit 0
fi

if ! /usr/bin/jq -e '
  (.action == "noop" or .action == "terminate") and
  (.pids | type == "array") and
  (.reason | type == "string")
' "$decision_path" >/dev/null; then
  /usr/bin/echo 'watchdog: invalid decision; no action taken'
  exit 0
fi

action=$(/usr/bin/jq -r '.action' "$decision_path")
reason=$(/usr/bin/jq -r '.reason' "$decision_path")
if [[ $action == noop ]]; then
  /usr/bin/echo "watchdog: no action: $reason"
  exit 0
fi

mapfile -t requested_pids < <(/usr/bin/jq -r '.pids[]' "$decision_path")
for pid in "${requested_pids[@]}"; do
  [[ $pid =~ ^[1-9][0-9]*$ ]] || continue

  candidate=$(/usr/bin/jq -ce --argjson pid "$pid" '
    .candidates[] |
    select(
      .pid == $pid and
      .identity_confirmed == true and
      .threshold_confirmed == true and
      .evidence_confirmed == true and
      .elapsed_seconds >= 300 and
      .cpu_percent >= 90 and
      .erofs_count >= 10
    )
  ' "$snapshot_path" 2>/dev/null || true)
  if [[ -z $candidate ]]; then
    /usr/bin/echo "watchdog: rejected PID $pid because the snapshot evidence is insufficient"
    continue
  fi

  [[ -r /proc/$pid/comm && -r /proc/$pid/cmdline && -r /proc/$pid/stat ]] || {
    /usr/bin/echo "watchdog: PID $pid already exited"
    continue
  }

  expected_start=$(/usr/bin/jq -r '.start_ticks' <<<"$candidate")
  current_start=$(/usr/bin/awk '{print $22}' "/proc/$pid/stat")
  [[ $current_start == "$expected_start" ]] || {
    /usr/bin/echo "watchdog: rejected PID $pid because its identity changed"
    continue
  }

  comm=$(</proc/$pid/comm)
  argv=()
  mapfile -d '' -t argv </proc/$pid/cmdline || true
  if [[ $comm != trash || ${argv[0]:-} != /usr/bin/python3* || ${argv[1]:-} != /usr/bin/trash ]]; then
    /usr/bin/echo "watchdog: rejected PID $pid because it is no longer trash-cli"
    continue
  fi

  process_row=$(/usr/bin/ps -p "$pid" -o etimes=,pcpu= 2>/dev/null || true)
  [[ -n $process_row ]] || continue
  read -r elapsed_seconds cpu_percent <<<"$process_row"
  if ((elapsed_seconds < 300)) || ! /usr/bin/awk -v cpu="$cpu_percent" 'BEGIN { exit !(cpu >= 90) }'; then
    /usr/bin/echo "watchdog: rejected PID $pid because the live threshold is no longer met"
    continue
  fi

  /usr/bin/kill -TERM "$pid"
  /usr/bin/echo "watchdog: sent SIGTERM to confirmed runaway trash-cli PID $pid"

  exited=false
  for _ in {1..10}; do
    if ! /usr/bin/kill -0 "$pid" 2>/dev/null; then
      exited=true
      break
    fi
    /usr/bin/sleep 0.5
  done
  [[ $exited == true ]] && continue

  [[ -r /proc/$pid/stat ]] || continue
  current_start=$(/usr/bin/awk '{print $22}' "/proc/$pid/stat")
  if [[ $current_start == "$expected_start" ]]; then
    /usr/bin/kill -KILL "$pid"
    /usr/bin/echo "watchdog: sent SIGKILL to unresponsive trash-cli PID $pid"
  fi
done
