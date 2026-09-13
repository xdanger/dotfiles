#!/usr/bin/env bash
# Wait for actionable work or a terminal PR verdict by polling the full gate.
# Every read and sleep is clipped to --max-wait (default 1800 seconds).
# Exit 10 means this call exhausted its wait budget, not that human approval is needed.
# Resume from the saved PR state only within the caller's ongoing authorization.
# Requires gh, jq, bash; uses timeout/gtimeout or a background watchdog.
set -euo pipefail

INTERVAL=10      # seconds between full-gate polls
MAX_WAIT=1800    # cap on total wall-clock wait; resumable on timeout
READ_TIMEOUT=60  # maximum per-read time, further clipped to the remaining budget

usage() {
  cat >&2 <<'EOF'
wait_for_settle.sh — poll the full PR gate until its verdict leaves WAITING_CI, then
print that settled verdict JSON and exit with its code.

Usage (same arg forms as pr_status.sh, plus two knobs):
  wait_for_settle.sh <pr-number>
  wait_for_settle.sh <owner/repo> <pr-number>
  wait_for_settle.sh <pr-url>
  wait_for_settle.sh [--interval SECONDS] [--max-wait SECONDS] <pr...>

Defaults: --interval 10, --max-wait 1800. Exit code mirrors the settled verdict
(0/20/30/40/50); exit 10 on wait-budget exhaustion (retain state before resuming).
EOF
  exit "${1:-0}"
}

ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --interval) INTERVAL="${2:?--interval needs a value}"; shift 2 ;;
    --interval=*) INTERVAL="${1#*=}"; shift ;;
    --max-wait) MAX_WAIT="${2:?--max-wait needs a value}"; shift 2 ;;
    --max-wait=*) MAX_WAIT="${1#*=}"; shift ;;
    -h|--help) usage 0 ;;
    --) shift; while [ $# -gt 0 ]; do ARGS+=("$1"); shift; done ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
[ "${#ARGS[@]}" -gt 0 ] || usage 1

# --interval / --max-wait flow into $((...)) and sleep, so reject non-integers
# up front with a clear message instead of a later arithmetic-expansion crash.
case "$INTERVAL" in ''|*[!0-9]*) echo "wait_for_settle: --interval must be a non-negative integer (got '$INTERVAL')" >&2; exit 50 ;; esac
case "$MAX_WAIT" in ''|*[!0-9]*) echo "wait_for_settle: --max-wait must be a non-negative integer (got '$MAX_WAIT')" >&2; exit 50 ;; esac
[ "$INTERVAL" -ge 1 ] || { echo "wait_for_settle: --interval must be >= 1" >&2; exit 50; }
[ "$MAX_WAIT" -ge 1 ] || { echo "wait_for_settle: --max-wait must be >= 1; use pr_status.sh for a single state read" >&2; exit 50; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATUS="$SCRIPT_DIR/pr_status.sh"
[ -x "$STATUS" ] || { echo "wait_for_settle: cannot run $STATUS" >&2; exit 50; }

# GNU timeout or its macOS name bounds a gate read. The watchdog below
# provides the same budget when neither is installed (up to 1s cleanup grace).
TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then TIMEOUT_BIN=timeout
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN=gtimeout; fi

# The watchdog read (used only when there's no timeout binary) reaps a hung
# child — the real `gh` process — with pkill -P. Without pkill that child can
# orphan, so warn once if this fallback would run without either tool.
PKILL_BIN=""
command -v pkill >/dev/null 2>&1 && PKILL_BIN=pkill
if [ -z "$TIMEOUT_BIN" ] && [ -z "$PKILL_BIN" ]; then
  echo "wait_for_settle: no timeout/gtimeout or pkill found — a hung gate read stays bounded, but its gh child may orphan. Install coreutils (timeout) or procps (pkill) to avoid leaks." >&2
fi

# Bound reads by the smaller of READ_TIMEOUT and the remaining call budget.
read_gate() {
  if [ -n "$TIMEOUT_BIN" ]; then
    "$TIMEOUT_BIN" -k 1 "$read_budget" "$STATUS" "$@"
    return $?
  fi
  local out err waited=0 pid rc
  out="$(mktemp "${TMPDIR:-/tmp}/wfs.XXXXXX")" || return 50
  err="$(mktemp "${TMPDIR:-/tmp}/wfs.XXXXXX")" || { rm -f "$out"; return 50; }
  # Redirect both streams to files (not inherited fds): an unreaped child can't
  # then hold a caller's pipe open, and pr_status.sh's stderr is still surfaced
  # afterward so its diagnostics (e.g. the truncation warning) stay visible.
  "$STATUS" "$@" >"$out" 2>"$err" &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$waited" -ge "$read_budget" ]; then
      [ -n "$PKILL_BIN" ] && "$PKILL_BIN" -KILL -P "$pid" 2>/dev/null || true  # reap the hung child (e.g. gh)
      kill -KILL "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      cat "$out"; cat "$err" >&2; rm -f "$out" "$err"
      return 124
    fi
    sleep 1; waited=$((waited + 1))
  done
  wait "$pid"; rc=$?
  cat "$out"; cat "$err" >&2; rm -f "$out" "$err"
  return "$rc"
}

SECONDS=0
seen_ok=0
errors=0
last_json=""

while [ "$SECONDS" -lt "$MAX_WAIT" ]; do
  remaining=$((MAX_WAIT - SECONDS))
  read_budget=$READ_TIMEOUT
  [ "$remaining" -lt "$read_budget" ] && read_budget=$remaining
  set +e
  json="$(read_gate "${ARGS[@]}")"
  code=$?
  set -e
  [ -n "$json" ] && last_json="$json"

  case "$code" in
    0|20|30|40)
      printf '%s\n' "$json"
      exit "$code"
      ;;
    10)
      seen_ok=1
      errors=0
      ;;
    124|137)
      # A budget-clipped read is not a new PR verdict.
      errors=$((errors + 1))
      ;;
    *)
      if [ "$seen_ok" != 1 ]; then
        [ -n "$json" ] && printf '%s\n' "$json"
        exit 50
      fi
      errors=$((errors + 1))
      ;;
  esac
  if [ "$errors" -ge 5 ]; then
    [ -n "$last_json" ] && printf '%s\n' "$last_json"
    echo "wait_for_settle: five consecutive gate-read errors; retain PR state and diagnose access or transport." >&2
    exit 50
  fi

  remaining=$((MAX_WAIT - SECONDS))
  [ "$remaining" -gt 0 ] || break
  delay=$INTERVAL
  [ "$remaining" -lt "$delay" ] && delay=$remaining
  sleep "$delay"
done

[ -n "$last_json" ] && printf '%s\n' "$last_json"
echo "wait_for_settle: call budget exhausted (${MAX_WAIT}s); last output is a snapshot, not a fresh merge authorization. Retain PR state before continuing." >&2
exit 10
