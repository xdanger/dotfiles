# power-monitor script changelog

Append-only history of changes to the collector / helper scripts, newest last.
The `/power-audit` routine reads this at the start of every run; if collected data
looks broken, suspect the most recent change first and roll back if needed.

Format: `## YYYY-MM-DD — <what changed> — <why>`

## 2026-06-02 — initial version — baseline
- `collect.py`: thin root collector. One `powermetrics --format plist` sample
  (1.5s window) every 5 min → compact NDJSON in `raw/`. Per tick: 1 `sys` line
  (cpu/gpu/ane power, gpu freq/busy, load, ncpu) + top-30 `energy` lines
  (per-process energy_impact, cpu_ms_s, intr/idle wakeups, disk & net IO, pid,
  start time). Output chowned to the data-dir owner; raw gzip@14d, delete@60d.
- No analysis script: aggregation, baseline, and anomaly detection are done by
  Claude at runtime (the `/power-audit` routine reads `raw/` directly), keeping
  the persistent code "thin — just data points". (A `rollup.py` helper existed
  briefly and was dropped same-day to honor that.)
- Collector runs directly from this repo via LaunchDaemon `com.ai-agent.power-collector`
  (edits take effect next tick; sampling interval lives in the plist).
