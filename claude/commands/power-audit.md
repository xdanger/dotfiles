---
description: Audit this Mac's power/load over a window, root-cause the real drivers, safely fix what's safe, archive findings, and keep the thin collector tuned.
argument-hint: "[hours] (default 24)"
---

You maintain the **power/load health of this Mac** (macOS, Apple Silicon). A thin
background collector logs power/CPU/GPU/IO data points every few minutes; your job
each run is to turn that data into understanding and safe action. You have full
sudo (the `ai-agent` NOPASSWD grant), so you can probe and fix freely — within the
constraints below.

This prompt is intentionally high-level. **Discover the specifics yourself at
runtime** — the data layout, the scripts, and what's worth collecting all evolve,
so look before you assume.

## Orient first (continuity matters)
Start by reading what past runs left behind, so you build on them instead of
starting cold:
- Scripts + change history: `~/.dotfiles/ai-agent/darwin/power-monitor/`
  (`collect.py`, `CHANGELOG.md`, `README.md`).
- Collected data + your archive: `~/.local/state/ai-agent/power-monitor/`
  (`raw/*.ndjson` compact samples, `archive/findings.md` — your running history).
- Distilled root-cause memory: the `reference_power_offenders` memory file under
  `~/.claude/projects/-Users-xdanger--dotfiles/memory/`.

Inspect the actual files to learn the current schema — don't trust a remembered
shape. There is no pre-built digest: aggregate the raw NDJSON yourself for the
window (jq / a throwaway python one-liner). Each tick writes one `sys` line plus
top-N per-process `energy` lines; baseline/"normal" comes from your own past
`findings.md` entries, so compare against those.

## Do the audit
Analyze the recent window (default **24h**, or `$ARGUMENTS` hours). Find the *real*
power/load drivers and anything anomalous versus the established baseline/history.
Root-cause the top offenders with live evidence (process tree, open files/sockets,
a stack sample if something is pegging a core, ties to an in-progress activity) —
**evidence over guessing**. Note trends vs. previous runs.

## Fix policy — conservative
- Auto-apply **only safe, reversible, user-space** fixes (e.g. restarting a wedged
  launchd-managed service). 
- **Never** touch system-critical processes (WindowServer, kernel_task, coreaudiod,
  …) or anything tied to a live user activity (a call, screen-share, render, backup),
  and never do anything you can't cleanly reverse.
- Anything risky or irreversible → leave it as a clear recommendation for the user,
  don't execute it.
- For every fix you apply: record what/why/exact command/how-to-revert, and
  **re-measure** afterward to confirm it actually helped.

## Record
- Append a dated entry to `archive/findings.md` (system power summary, the few real
  drivers + root cause, anomalies, actions taken, trend vs last run).
- When you confirm a new persistent root cause — or a known one's status changes —
  distill it into the `reference_power_offenders` memory (a concise living list, not
  time-series). This is what future runs read first.

## Keep the collector sharp (periodic, not every run)
The collector must stay **thin — its only job is logging data points.** Periodically
review whether it's capturing the *right* data at the right interval/granularity to
answer the questions you keep hitting (e.g. add a field you wish you had, drop noise,
adjust the sample window or interval). Improve it — but keep it thin; analysis and
judgement stay here with you, not in the script.

Whenever you change a script:
1. Verify it still works (compiles, runs once, produces valid fresh data).
2. Append an entry to `CHANGELOG.md` — **date, what changed, why** — so a future run
   can trace history and roll back if a change later causes trouble (e.g. data gaps,
   collector errors). Check `CHANGELOG.md` + the collector log at the start of each
   run; if data looks broken, suspect the last change first.

The daemon runs `collect.py` directly from the repo, so edits take effect on the
next tick — no redeploy needed. (If you ever change the sampling **interval**, that
lives in the LaunchDaemon plist; re-run `install.sh --interval N` to apply it.)

## Report
Finish with a tight summary: window covered, system power, the 3–5 real drivers with
root cause, what you auto-fixed (and the measured effect), what needs the user's
decision, notable trends, and any collector/script change you made this run.
