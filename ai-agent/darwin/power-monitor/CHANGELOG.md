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

## 2026-06-02 — add `pwr` + `batt_pct` to sys record — recurring analysis need
- `collect.py`: new `read_power_source()` helper (cheap `pmset -g batt` parse,
  failsafe → `(None, None)`) adds two fields to each `sys` line: `pwr`
  ("ac"/"battery"/null) and `batt_pct` (int). This is a laptop, so AC-vs-battery
  context matters for reading a burst, and the `/power-audit` routine had been
  fetching it manually via `pmset` on all 3 runs so far — promoting it into the
  time series. Backward-compatible (analysis reads keys with `.get()`; old records
  lacking the field still parse). Verified: compiles, dry-run emits a valid record
  with `"pwr":"ac","batt_pct":80`. Interval unchanged → no `install.sh` rerun needed.

## 2026-06-02 — fix `gpu_mhz` (was 0.0 every tick) — dead field, unit bug
- `collect.py`: `gpu_mhz` had been `round(gpu["freq_hz"] / 1e6, 1)`, but on this
  hardware (Mac17,7 / M5 Max, osver 25F80) powermetrics emits the GPU avg freq in
  **MHz** under the mislabeled `freq_hz` key (e.g. `373.137`, ≈ residency-weighted
  avg of the 338/486/636 MHz `dvfm_states`). The `/1e6` therefore rounded every
  sample to `0.0` — **all 92 ticks of the 9th-audit day, incl. 36 with gpu_busy>50%,
  read 0.0**. The documented "check the freq, not just busy% — low MHz at high busy%
  = light compositing" tell was reading a dead field (audit 8's "338 MHz" came from a
  live `dvfm_states` read, not this field). Fix: treat the value as MHz, with a guard
  (`> 1e5 → /1e6`) so a hypothetical build returning true Hz still parses. Verified:
  compiles, dry-run now emits `"gpu_mhz":352.4` at 22.9% busy (≈ the 338 MHz floor =
  light load, as expected). Backward-compatible; interval unchanged → no `install.sh`
  rerun. Daemon runs from the repo working tree, so it's live next tick.
