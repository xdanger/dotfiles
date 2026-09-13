---
name: orchestrate-agents
description: Supervise codex or grok CLI workers for concurrent implementation or independent review. Use for external CLI orchestration across isolated tasks, not in-process subagents or a single sequential task.
---

# Orchestrate agents: codex + grok

Act as the supervisor: decompose, delegate, monitor, verify, and integrate. Keep architecture,
merge order, and final judgment; delegate bounded implementation or read-only review.

## Task contracts

- **Implementation:** isolate concurrent changes in worktrees and branches, specify
  whether commits and integration are authorized, and independently review every diff.
- **Read-only investigation or review:** give the target snapshot and evidence
  requirements. Do not require a commit, changed files, or integration. Reuse a stable
  read-only checkout, or an isolated snapshot when concurrent edits would invalidate
  the review. Experiments belong in scratch space.

A request to delegate does not by itself authorize publishing or merging. Apply the
user's established scope and repository rules throughout.

Fan out only as wide as you can review and land. Leave lanes idle when the host is saturated,
file scopes collide, or no independent work remains.

## Choose the lane

|                 | Lane A: one process per task                  | Lane B: persistent app-server                              |
| --------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Best for        | grok (always); codex fire-and-forget fallback | codex workers (default)                                    |
| Progress        | coarse JSONL items, exit code                 | token deltas, live diff, plan updates, in-turn token usage |
| Mid-run control | kill and restart                              | steer, interrupt, fork, per-action approvals               |
| Context cost    | paid again for every process                  | amortized across turns in a thread                         |

Default codex workers to Lane B. Read [Lane B](references/lane-b.md) only when
using that lane; read [Lane A](references/lane-a.md) for one-shot workers. `codex exec` is itself an app-server client, so Lane A runs
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
2. **Decompose.** Give each concurrent implementation task one worker, one worktree, one branch,
   one brief, and a non-overlapping file scope. Use the read-only contract for reviewers. Serialize dependency changes, migrations, protocol changes, and
   any other shared boundary; land those before dependent work.
3. **Brief.** State the goal, constraints, acceptance criteria, file scope, commit requirements if applicable, and
   verification. Specify durable invariants rather than preferred code paths. Treat the
   supervisor's previous instruction as a possible source of the defect.
4. **Launch.** In Lane B, start one thread per task with the contract-selected directory as its `cwd` and apply a
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
For read-only tasks, verify the findings against the target snapshot and confirm
that the reviewer did not modify it.

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

On worker exit or turn completion, clean up only processes positively identified
as owned by that worker. A cwd match alone is insufficient in a shared read-only
checkout: another reviewer, user shell, or service may use the same directory.
Cwd-wide cleanup is appropriate only inside an exclusive disposable worker
worktree. Track ownership in the harness, terminate gracefully before escalating,
and inspect child processes after the fleet drains; command text searches can
miss bare busy loops. The app-server does not reap agent-spawned processes.

Do not rely on worker-authored traps or process-group capture for cleanup. A background subshell
may hide the real child PID, a session launcher may exit before its process group is captured, and
no trap runs after `SIGKILL`.

Drain workers before moving or deleting anything they resolve at runtime, including profile and
sandbox-helper paths. Kill and relaunch workers attached to the old path.

## Result contract

Use a strict structured contract appropriate to the task. For implementation require:

- `summary`: what changed and the resulting behavior;
- `committed`: whether a commit was created within the authorized scope;
- `files_changed`: the complete changed-file list.

For read-only workers, require findings, evidence, verification performed, and a
nullable `blocked_reason`; no commit or changed-file requirement applies.

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

## Non-negotiables

1. Use one worktree and one worker per concurrent implementation task; keep reviews read-only.
2. Keep worktrees, logs, and orchestration state outside the supervised repository.
3. Use explicit branch names that satisfy repository rules.
4. Give concurrent workers non-overlapping file ownership; never change dependencies in parallel.
5. Serialize git operations and shared-boundary changes.
6. Apply hard budgets and preflight the actual credential and quota.
7. Have someone other than the implementer review every diff.
8. Never weaken security controls merely to pass a test.
9. Report blockers, omitted work, and verification truthfully.
10. Do not change `AGENTS.md` to relax constraints on the current task. Explicitly
    authorized instruction maintenance may edit it within the requested scope.
