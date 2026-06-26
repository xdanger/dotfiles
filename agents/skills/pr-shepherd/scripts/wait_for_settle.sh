#!/usr/bin/env bash
# wait_for_settle.sh — block until pr_status.sh's verdict *leaves* WAITING_CI,
# then print that settled verdict JSON and exit with its code.
#
# Why this exists: `pr_status.sh` reports WAITING_CI when EITHER checks are still
# pending OR mergeability is still UNKNOWN. The old wait (`gh pr checks --watch`)
# only handles the first case — when WAITING_CI is driven by mergeability still
# computing (no pending checks), `--watch` returns immediately and the caller
# re-reads, re-gets WAITING_CI, and spins. `--watch` is also blind to review /
# thread state changing mid-wait. This wrapper closes that gap:
#   - checks pending  -> block on `gh pr checks --watch` (efficient, no polling)
#   - otherwise       -> short, bounded poll of the full gate (catches
#                        mergeability finishing AND review/thread changes)
# It never invents a verdict; pr_status.sh stays the single source of truth.
#
# Usage (same arg forms as pr_status.sh, plus two knobs):
#   wait_for_settle.sh <pr-number>
#   wait_for_settle.sh <owner/repo> <pr-number>
#   wait_for_settle.sh <pr-url>
#   wait_for_settle.sh --interval 10 --max-wait 1800 <pr-number>
#
# Requires: gh (authenticated), jq, bash. No new hard dependency over
# pr_status.sh. `timeout`/`gtimeout` is used if present to bound reads and block
# efficiently on the checks-watch; without it, reads are bounded by a background
# watchdog and the checks-wait falls back to interval polling — so --max-wait is
# honored on every platform.
# Output: the settled verdict JSON on stdout (same shape pr_status.sh emits).
# Exit code mirrors the settled verdict (0 GREEN / 20 NEEDS_WORK / 30
# BLOCKED_HUMAN / 40 NOT_ELIGIBLE / 50 ERROR). Exit 10 only on --max-wait
# timeout while still WAITING_CI — re-run to resume the wait.
set -euo pipefail

INTERVAL=10      # seconds between polls / --watch refresh interval
MAX_WAIT=1800    # cap on total wall-clock wait; resumable on timeout
READ_TIMEOUT=60  # cap on a single gate read, so a hung gh/GraphQL call retries

usage() {
  cat >&2 <<'EOF'
wait_for_settle.sh — block until pr_status.sh's verdict leaves WAITING_CI, then
print that settled verdict JSON and exit with its code.

Usage (same arg forms as pr_status.sh, plus two knobs):
  wait_for_settle.sh <pr-number>
  wait_for_settle.sh <owner/repo> <pr-number>
  wait_for_settle.sh <pr-url>
  wait_for_settle.sh [--interval SECONDS] [--max-wait SECONDS] <pr...>

Defaults: --interval 10, --max-wait 1800. Exit code mirrors the settled verdict
(0/20/30/40/50); exit 10 only on --max-wait timeout (re-run to resume).
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATUS="$SCRIPT_DIR/pr_status.sh"
[ -x "$STATUS" ] || { echo "wait_for_settle: cannot run $STATUS" >&2; exit 50; }

# Resolve a timeout binary once (GNU coreutils `timeout`, or `gtimeout` on
# macOS/Homebrew). It is preferred but not required: with it, each gate read is
# bounded and the checks-watch is blocked efficiently; without it, reads are
# bounded by a background+watchdog fallback (see read_gate) and the checks-wait
# falls back to interval polling — never an unbounded watch or read.
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

# Read the gate, bounding it by READ_TIMEOUT so a hung gh call surfaces as exit
# 124 (treated as a transient, retryable error) instead of blocking --max-wait
# forever. With a timeout binary that bound is one exec; without one, a
# background job + watchdog kill enforces it portably — so the resumable
# --max-wait promise holds on every platform, not just where `timeout` exists.
read_gate() {
  if [ -n "$TIMEOUT_BIN" ]; then
    "$TIMEOUT_BIN" "$READ_TIMEOUT" "$STATUS" "$@"
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
    if [ "$waited" -ge "$READ_TIMEOUT" ]; then
      [ -n "$PKILL_BIN" ] && "$PKILL_BIN" -P "$pid" 2>/dev/null || true  # reap the hung child (e.g. gh)
      kill "$pid" 2>/dev/null || true
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

while true; do
  set +e
  json="$(read_gate "${ARGS[@]}")"
  code=$?
  set -e
  [ -n "$json" ] && last_json="$json"

  if [ "$code" = 124 ]; then
    # gate read hit READ_TIMEOUT (gh/GraphQL hung) — always transient, even on
    # the first read. back off and retry; give up only after several in a row.
    errors=$((errors + 1))
    if [ "$errors" -ge 5 ]; then
      echo "wait_for_settle: gate read timed out ${errors}x in a row (gh/GraphQL hung); giving up." >&2
      exit 50
    fi
  elif [ "$code" = 50 ]; then
    if [ "$seen_ok" != 1 ]; then
      # first read failed: almost always a usage / access error, not a blip.
      # don't spend the retry budget on it — surface and exit.
      [ -n "$json" ] && printf '%s\n' "$json"
      exit 50
    fi
    errors=$((errors + 1))
    if [ "$errors" -ge 5 ]; then
      [ -n "$json" ] && printf '%s\n' "$json"
      echo "wait_for_settle: pr_status.sh failed ${errors}x in a row; giving up." >&2
      exit 50
    fi
  elif [ "$code" != 10 ]; then
    # settled verdict (GREEN / NEEDS_WORK / BLOCKED_HUMAN / NOT_ELIGIBLE):
    # emit it as a valid gate read and mirror the exit code.
    printf '%s\n' "$json"
    exit "$code"
  else
    seen_ok=1
    errors=0
  fi

  # still WAITING_CI (or backing off a transient error). honor the cap first so
  # a long wait stays resumable rather than running unbounded.
  if [ "$SECONDS" -ge "$MAX_WAIT" ]; then
    [ -n "$last_json" ] && printf '%s\n' "$last_json"
    # include the effective knobs so resuming keeps custom --interval/--max-wait
    # (ARGS holds only the positional pr args; the flags were parsed out).
    echo "wait_for_settle: still WAITING_CI after ${MAX_WAIT}s. Re-run to resume: $(basename "$0") --interval $INTERVAL --max-wait $MAX_WAIT ${ARGS[*]}" >&2
    exit 10
  fi

  pending=0
  pr=""
  repo=""
  if [ "$code" = 10 ] && [ -n "$json" ]; then
    pending="$(printf '%s' "$json" | jq -r '.checks.pending // 0' 2>/dev/null || echo 0)"
    pending="${pending//[^0-9]/}"; pending="${pending:-0}"
    pr="$(printf '%s' "$json" | jq -r '.pr // empty' 2>/dev/null || true)"
    repo="$(printf '%s' "$json" | jq -r '.repo // empty' 2>/dev/null || true)"
  fi

  if [ "$pending" -gt 0 ] && [ -n "$pr" ] && [ -n "$TIMEOUT_BIN" ]; then
    # checks are the holdup AND we can bound the watch: block on it (efficient,
    # no polling churn). the gate, not --watch, decides green, so ignore its exit
    # code. --repo pins the watch to the repo pr_status.sh queried (not the cwd
    # repo), so the owner/repo and url arg forms watch the right PR. the timeout
    # wrap keeps --max-wait honored even if CI hangs. (without a timeout binary
    # we fall through to the polling branch below instead — never an unbounded
    # watch, so --max-wait holds on every platform.)
    remaining=$((MAX_WAIT - SECONDS)); [ "$remaining" -lt 1 ] && remaining=1
    watch=("$TIMEOUT_BIN" "$remaining" gh pr checks "$pr" --watch --fail-fast=false --interval "$INTERVAL")
    [ -n "$repo" ] && watch+=(--repo "$repo")
    t0=$SECONDS
    "${watch[@]}" >/dev/null 2>&1 || true
    # guard against a fast-returning/erroring --watch spinning the loop hot
    [ $((SECONDS - t0)) -lt "$INTERVAL" ] && [ "$SECONDS" -lt "$MAX_WAIT" ] && sleep "$INTERVAL"
  else
    # interval-poll the gate: nothing pending (mergeability/review wait, which
    # --watch can't see), no timeout binary to bound a --watch, or backing off a
    # transient error. re-reading the full verdict keeps --max-wait honored via
    # the top-of-loop cap, so this stays bounded and resumable on every platform.
    sleep "$INTERVAL"
  fi
done
