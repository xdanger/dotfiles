---
name: orchestrate-agents
description: >-
  Orchestrate codex and grok CLIs as parallel workers from a supervising agent session.
  Use when work should be delegated across isolated worktrees, run concurrently, or
  cross-reviewed by another model. Drives codex workers through per-profile app-server
  threads by default, with one-shot exec as the fallback lane; grok always runs as
  processes. Covers usage-aware routing, lane selection, decomposition, durable state,
  budgets, cleanup, verification, and serialized integration. Do not use for
  in-process subagents or a single sequential task.
---

# Orchestrate agents: codex + grok

Act as the supervisor: decompose, delegate, monitor, verify, and integrate. Keep architecture,
merge order, and final judgment; delegate bounded implementation.

Fan out only as wide as you can review and land. Leave lanes idle when the host is saturated,
file scopes collide, or no independent work remains.

## Choose the lane

|                 | Lane A: one process per task                  | Lane B: persistent app-server                              |
| --------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Best for        | grok (always); codex fire-and-forget fallback | codex workers (default)                                    |
| Progress        | coarse JSONL items, exit code                 | token deltas, live diff, plan updates, in-turn token usage |
| Mid-run control | kill and restart                              | steer, interrupt, fork, per-action approvals               |
| Context cost    | paid again for every process                  | amortized across turns in a thread                         |

Default codex workers to Lane B. `codex exec` is itself an app-server client, so Lane A runs
the same runtime behind a downsampling layer that discards the control channel; Lane B removes
that layer rather than adding a dependency. Its controls turn chronic failure modes from
brief-level requests into harness-level enforcement: corrective rounds (steer without repaying
context), quota evidence (authoritative rate-limit reads), and escalations (per-action approvals
for actions the sandbox does not already allow).

Fall back to Lane A for codex when a task is genuinely fire-and-forget and a crude external
wall-clock bound is worth more than steerability, when the supervisor cannot hold a connection
for the task's lifetime, or when the app-server itself is the suspect. grok has no app-server;
it always runs Lane A.

## Route by observed capacity

Maintain an explicit server-to-`CODEX_HOME` inventory. For profiles with a running lane
server, read capacity in-protocol: `account/rateLimits/read` returns authoritative usage
(used percent per window, reset time, plan type, credits, spend control, per-limit buckets),
and `account/rateLimits/updated` pushes sparse rolling revisions mid-turn. Treat the last full
read as the snapshot of record: merge an update's present fields into it — an absent or null
field carries no information and never clears a previously observed value — or refetch the full
snapshot. Replacing the snapshot with a sparse update overstates capacity wherever the update
omits a window, credits, or spend-control state.

For profiles without a running server, fall back to `scripts/read-codex-usage.py`. It derives
the newest `token_count.rate_limits` event across each profile's session logs within the
freshness window and verifies that `codex login status` reports ChatGPT authentication. Pass
one `--home PROFILE=CODEX_HOME` per server and set `--max-age` to the fleet's freshness
tolerance. Consume `status`, `schedulable`, `snapshot_age_seconds`,
`effective_remaining_percent`, and the raw `rate_limits`; one bad profile remains a data
record rather than aborting the sample round. Treat script output as an observed snapshot,
not a live billing query: session logs refresh only when Codex emits a usage event, and
polling the same files more often does not make their snapshot fresher. Never describe a
stale or post-reset snapshot as current.

Route work from the normalized snapshot and in-flight reservations:

- Exclude profiles with invalid authentication, missing or stale evidence, a reached limit, or
  spend control. Treat credits as supplemental capacity, not as a substitute for window quota.
- Use the lowest remaining percentage across reported windows as effective headroom. Reserve
  expected usage for running and queued work so simultaneous dispatches do not all consume the
  same apparent capacity.
- Estimate task cost and uncertainty from prior deltas. Prefer the smallest eligible capacity
  that still leaves the configured reserve, preserving room for expensive or unpredictable work.
- When no profile safely fits, reduce concurrency or wait for the earliest relevant reset. Do not
  evade a limit by changing identity outside the declared profile inventory.

## Run the fleet

1. **Preflight.** Read repository instructions, resolve the upstream base, check host capacity,
   identify runtime and dependency collisions, and verify the credential and quota each worker
   will actually spend. Use login status only to establish auth mode; obtain capacity as above.
2. **Decompose.** Give each concurrent task one worker, one worktree, one branch, one brief, and
   a non-overlapping file scope. Serialize dependency changes, migrations, protocol changes, and
   any other shared boundary; land those before dependent work.
3. **Brief.** State the goal, constraints, acceptance criteria, file scope, required commit, and
   verification. Specify durable invariants rather than preferred code paths. Treat the
   supervisor's previous instruction as a possible source of the defect.
4. **Launch.** In Lane B, start one thread per task with the worktree as its `cwd` and apply a
   supervisor-owned wall-clock budget per turn. In Lane A, apply both wall-clock and tool-level
   budgets where available. Keep workers as visible background tasks unless they must outlive
   the supervisor session. Close inherited stdin and keep structured output, final output, and
   stderr separate.
5. **Persist state.** Store every round's brief, structured result, terminal status, logs,
   branch, worktree, and — in Lane B — thread ID on disk, together with usage observations and
   capacity reservations. Reconstruct fleet state from those artifacts and live processes after
   every checkpoint; never depend on conversation memory.
6. **Monitor.** Judge completion from the structured terminal state — `turn/completed` status in
   Lane B, process exit status plus structured terminal state in Lane A — not from the presence
   of output or the word `error`. Preserve partial worktrees for inspection.
7. **Review.** Give a different model the brief and diff without the implementer's assessment.
   Judge findings before relaying them; never apply a suggested snippet merely because a reviewer
   proposed it.
8. **Integrate.** Diff, review, rebase, and merge one branch at a time. Re-verify after each
   rebase. Remove both the worktree and branch only after the task is merged or deliberately
   abandoned.

## Brief corrective rounds

- Prefer `turn/steer` for corrections a Lane B worker can absorb mid-flight: it injects
  guidance without discarding accumulated context or lifting the output contract. Start a
  fresh round when the accumulated context is itself the defect.
- When the same defect shape recurs, brief the class and require the worker to find every instance
  within its scope. Do not imply that the manager's examples are exhaustive.
- Above roughly five affected sites, require an inventory of each site, its previous protection,
  and its new protection. Reject uncheckable claims such as “all sites handled.”
- When one round recreates the defect removed by the previous round, stop prescribing a trigger
  or code path. State the invariant and require a test for each half.
- If a prior manager instruction caused the problem, say so and replace it with the intended
  property. Owning the bad premise produces better corrections than restating it.
- Diagnose before changing a security check. A failing test may be wrong while production is
  correctly failing closed.
- Never widen a timeout as the fix without proving it is causal and justifying the new value from
  measurements.

## Verify real behavior

Passing-test counts are weak evidence. For critical behavior, temporarily break the fix, confirm
that the relevant test fails, then restore it. Add state-specific verification where mutation is
unsafe or insufficient.

In Lane B, read the accumulated `turn/diff/updated` stream before believing a completion claim:
what the worker actually changed is evidence; what it says it changed is not.

A suite that always bootstraps from scratch cannot expose defects that occur only on an
already-migrated system. Inspect or test upgrade state explicitly.

Distinguish infrastructure failures from code failures. Rerun a genuine flake once; investigate
if it repeats.

## Enforce controls in the harness

Anything mechanically enforceable belongs in the harness rather than only in a brief. Enforce
budgets, worktree creation, accepted lanes, result capture, process cleanup, and failure reporting.
Repeating an ignored instruction is not control.

In Lane B, answer every server-to-client request — an unanswered approval hangs the turn — and
adjudicate each one against the task's brief. Do not mistake approvals for file-scope
enforcement: with a writable worktree sandbox, edits inside the workspace never surface a
request, so a worker can touch out-of-scope files without asking. Enforce file scope
mechanically by validating the worktree's actual Git diff against the declared scope before
integration, and reject the round when it strays.

On every worker exit (Lane A) or turn completion (Lane B), reap processes whose resolved current
working directory is the worker's resolved worktree or a descendant; the app-server does not reap
agent-spawned background processes. Escalate from graceful termination when necessary. After the
fleet drains, inspect parent PID directly for remaining processes under worker worktrees; command
text searches miss bare busy loops.

Do not rely on worker-authored traps or process-group capture for cleanup. A background subshell
may hide the real child PID, a session launcher may exit before its process group is captured, and
no trap runs after `SIGKILL`.

Drain workers before moving or deleting anything they resolve at runtime, including profile and
sandbox-helper paths. Kill and relaunch workers attached to the old path.

## Result contract

Use the same strict structured contract for every worker. Require:

- `summary`: what changed and the resulting behavior;
- `committed`: whether the worker created the required commit;
- `files_changed`: the complete changed-file list.

Carry the schema via `turn/start.outputSchema` in Lane B and `--output-schema` in Lane A; both
enforce it at the model boundary, and steering does not lift the contract.

For tasks that need richer reporting, also require verification performed, omitted work, and a
nullable `blocked_reason`. A truthful blocker is better than false success; never use the string
`none` to hide skipped work.

Keep strict-schema properties required and use nullable values where absence is meaningful. Treat
any turn status other than `completed` (Lane B) or any nonzero exit (Lane A) as no usable final
result, even when partial edits remain — `interrupted` is terminal without being `failed`, and a
budget-interrupted turn has no schema-conforming answer. Distinguish advisory error items from a
failed terminal state.

## Lane-specific rules

### Lane B (codex default)

- Spawn a dedicated `codex app-server --listen stdio://` child per `CODEX_HOME` and own its
  lifetime; never
  attach orchestration to an operator's already-running daemon or its control socket, where a
  supervisor bug can disturb interactive sessions. One process is one credential profile; a
  multi-account fleet is N processes. If a socket listener is unavoidable, prefer a private Unix
  socket, authenticate WebSocket listeners, protect token files, and tunnel non-loopback traffic.
- Treat stdio as newline-delimited JSON-RPC and Unix or TCP listeners as WebSocket transports. Do
  not reuse stdio framing on sockets.
- Generate protocol bindings from the installed binary (`codex app-server generate-ts` /
  `codex app-server generate-json-schema`); they are version-locked to that binary by construction. Regenerate on
  every codex upgrade and treat a resulting compile break as the upgrade signal. Do not build the
  supervisor on experimental-marked methods or fields.
- Complete the `initialize`/`initialized` handshake and assert that the returned `codexHome`
  equals the intended profile before dispatching work. The home assertion does not establish
  which credential the process will spend: launch the server with a sanitized environment,
  removing API-key and custom-provider overrides exactly as Lane A requires, because such keys
  outrank the profile's stored login and `codex login status` does not report them.
- Start one thread per task via `thread/start` with the worktree as `cwd` and per-thread sandbox,
  approval policy, and config overrides. Start threads non-ephemeral so they persist, and record
  each thread ID in fleet state. Thread creation can restart the configured MCP server set and is
  not free: reuse threads for serialized follow-up work, and measure contention before assuming
  parallel threads produce linear throughput.
- `turn/start` returns an in-progress handle immediately; the turn's only completion signal is
  the `turn/completed` notification carrying terminal status. `turn/steer` requires the
  `expectedTurnId` from that handle — an intended guard against steering the wrong turn.
  Budgets are supervisor-owned: bound each turn by wall clock, escalate `turn/interrupt`, and
  only as a last resort kill the process, which takes every thread in it.
- A server crash takes down all its threads. On restart or reconnection, resume from persisted
  thread IDs via `thread/resume`. A lost connection is not a dead server: when the process
  survived, the original turn may still be running, so read the resumed thread's status and
  `turn/interrupt` any live turn before dispatching anything — otherwise two turns race the same
  worktree. Then reconcile before retrying: a turn that performed side effects before the
  crash — commits, file mutations, spawned processes — repeats them if replayed verbatim, and
  replayed thread history is lossy (not every command execution is persisted), so treat the
  worktree and external state as the authority on what already happened. Continue from that
  reconciled checkpoint with a brief scoped to the remainder, retrying only operations known to
  be idempotent, rather than re-issuing the original turn.

### Lane A (grok always; codex fallback)

- Use headless one-shot execution in an isolated worktree. Bound codex with an external wall-clock
  timeout; bound grok by both turns and wall clock.
- Select codex credentials through the intended `CODEX_HOME`, remove unintended API-key overrides,
  and inspect the resolved auth mode in the worker's environment before a wide fan-out. Custom
  provider environment keys can outrank both stored login and standard overrides.
- Keep machine-readable output and diagnostics separate. Store final-output files outside the
  worktree so orchestration artifacts do not dirty it.
- Use headless codex review when codex is the reviewer. A review target and a free-form prompt are
  mutually exclusive, so carry the specification in the prompt and tell the reviewer which diff
  to resolve. Validate the base independently; an invalid base can yield a plausible review of the
  wrong range.
- Set grok permissions deliberately. Prefer targeted allowances; pair any broad unattended
  permission mode with a sandbox boundary.

## Non-negotiables

1. Use one worktree and one worker per concurrent task.
2. Keep worktrees, logs, and orchestration state outside the supervised repository.
3. Use explicit branch names that satisfy repository rules.
4. Give concurrent workers non-overlapping file ownership; never change dependencies in parallel.
5. Serialize git operations and shared-boundary changes.
6. Apply hard budgets and preflight the actual credential and quota.
7. Have someone other than the implementer review every diff.
8. Never weaken security controls merely to pass a test.
9. Report blockers, omitted work, and verification truthfully.
10. Never let an agent author `AGENTS.md`; surface the gap for a human to fix.
