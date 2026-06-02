# ai-agent power-monitor (macOS)

Continuously tracks what drains power/CPU/GPU on this Mac, and lets Claude
root-cause it, safely fix what's safe, and keep a long-term archive + memory so
problems are tracked over time — not rediscovered every session.

macOS-only by design (powermetrics, launchd) — hence under `darwin/`.

## Architecture

```
Thin collector  (launchd LaunchDaemon, root, every 5 min)        ← the only script
  collect.py: one short `powermetrics --format plist` sample → compact NDJSON
              (per-process energy_impact / CPU / IO / net + system power/load).
              Runs DIRECTLY from this repo — edits take effect next tick.
              Output chowned back to the user; raw logs gzip@14d, delete@60d.

The brain  (Claude — run on demand or on a schedule; NO script calls `claude`)
  /power-audit: a high-level routine prompt. Claude reads the data, root-causes
  the real drivers, applies conservative reversible fixes, archives findings,
  distills root causes to memory, and periodically tunes the thin collector
  (logging each change to CHANGELOG.md). It aggregates the raw samples at
  runtime — no pre-built digest; baseline comes from past findings.

Memory
  cold: ~/.local/state/ai-agent/power-monitor/{raw,archive}  (per machine)
  hot:  reference_power_offenders memory file  (distilled, cross-session)
```

## Files (this dir, version-controlled)

| file | role |
|---|---|
| `collect.py` | the thin collector — run as root by the LaunchDaemon |
| `com.ai-agent.power-collector.plist` | LaunchDaemon template (root) |
| `install.sh` | installer / uninstaller for the collector |
| `CHANGELOG.md` | history of script changes (read at the start of each audit) |

The routine prompt lives at `../../../claude/commands/power-audit.md` (→ `/power-audit`).

## Install (per machine)

Requires the `/etc/sudoers.d/ai-agent` NOPASSWD grant. As your user:

```bash
./install.sh                 # collector every 5 min
./install.sh --interval 120  # sample every 120s instead
```

The data dir, log path, repo script path, and interval are baked into the plist
at install time (the daemon runs as root, whose `~` is /var/root — so paths are
never inferred from `~`; collected files are chowned back to you).

## Running the audit

There is **no scheduled script that runs Claude.** Instead:

- **Manual:** type `/power-audit` in Claude Code (optionally `/power-audit 48`).
- **Scheduled:** create a **Routine in the Claude App** and paste the
  `/power-audit` prompt (the body of `claude/commands/power-audit.md`) as its
  natural-language instruction. Claude itself runs it on schedule and discovers
  the details at runtime.

## Safety model

- The collector only reads metrics and appends data points — it never changes
  system state.
- Fixes are Claude's job and **conservative**: only safe, reversible, user-space
  actions are auto-applied; system-critical processes and live user activities are
  off-limits; risky/irreversible changes are left as recommendations. Every applied
  fix is logged in `archive/findings.md` with a revert recipe.
- Script self-edits are logged in `CHANGELOG.md` and verified before relying on them.

## Inspect / revoke

```bash
sudo -n launchctl print system/com.ai-agent.power-collector   # collector status
tail -f ~/.local/state/ai-agent/power-monitor/state/collector.log

./install.sh --uninstall            # remove the collector, keep data
./install.sh --uninstall --purge    # also delete collected data
```
