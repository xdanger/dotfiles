---
name: orchestrate-agents
description: >-
  Orchestrate codex and grok CLIs as parallel workers from a supervising agent session.
  Use when work should be delegated across isolated worktrees, run concurrently, or
  cross-reviewed by another model. Covers lane selection, decomposition, durable state,
  budgets, cleanup, verification, and serialized integration. Do not use for in-process
  subagents or a single sequential task.
---

# Orchestrate agents: codex + grok

Act as the supervisor: decompose, delegate, monitor, verify, and integrate. Keep architecture,
merge order, and final judgment; delegate bounded implementation.

Fan out only as wide as you can review and land. Leave lanes idle when the host is saturated,
file scopes collide, or no independent work remains.

## Choose the lane

|                 | Lane A: one process per task      | Lane B: persistent app-server     |
| --------------- | --------------------------------- | --------------------------------- |
| Best for        | bounded implementation and review | repeated or steerable work        |
| Context cost    | paid again for every process      | amortized across turns            |
| Mid-run control | kill and restart                  | steer, interrupt, fork, approvals |
| Default         | yes                               | only when its controls matter     |

Use Lane A by default. Use Lane B when mid-turn correction, thread reuse, programmatic
approvals, or rate-limit inspection justifies the extra protocol and lifecycle complexity.

## Run the fleet

1. **Preflight.** Read repository instructions, resolve the upstream base, check host capacity,
   identify runtime and dependency collisions, and verify the credential and quota each worker
   will actually spend. Do not infer billing from a profile name or login-status message.
2. **Decompose.** Give each concurrent task one worker, one worktree, one branch, one brief, and
   a non-overlapping file scope. Serialize dependency changes, migrations, protocol changes, and
   any other shared boundary; land those before dependent work.
3. **Brief.** State the goal, constraints, acceptance criteria, file scope, required commit, and
   verification. Specify durable invariants rather than preferred code paths. Treat the
   supervisor's previous instruction as a possible source of the defect.
4. **Launch.** Apply both wall-clock and tool-level budgets where available. Keep workers as
   visible background tasks unless they must outlive the supervisor session. Close inherited
   stdin and keep structured output, final output, and stderr separate.
5. **Persist state.** Store every round's brief, structured result, exit code, logs, branch, and
   worktree on disk. Reconstruct fleet state from those artifacts and live processes after every
   checkpoint; never depend on conversation memory.
6. **Monitor.** Judge completion from the process exit status and structured terminal state, not
   from the presence of output or the word `error`. Preserve partial worktrees for inspection.
7. **Review.** Give a different model the brief and diff without the implementer's assessment.
   Judge findings before relaying them; never apply a suggested snippet merely because a reviewer
   proposed it.
8. **Integrate.** Diff, review, rebase, and merge one branch at a time. Re-verify after each
   rebase. Remove both the worktree and branch only after the task is merged or deliberately
   abandoned.

## Brief corrective rounds

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

A suite that always bootstraps from scratch cannot expose defects that occur only on an
already-migrated system. Inspect or test upgrade state explicitly.

Distinguish infrastructure failures from code failures. Rerun a genuine flake once; investigate
if it repeats.

## Enforce controls in the harness

Anything mechanically enforceable belongs in the harness rather than only in a brief. Enforce
budgets, worktree creation, accepted lanes, result capture, process cleanup, and failure reporting.
Repeating an ignored instruction is not control.

On every worker exit, reap processes whose resolved current working directory is the worker's
resolved worktree or a descendant. Escalate from graceful termination when necessary. After the
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

For tasks that need richer reporting, also require verification performed, omitted work, and a
nullable `blocked_reason`. A truthful blocker is better than false success; never use the string
`none` to hide skipped work.

Keep strict-schema properties required and use nullable values where absence is meaningful. Treat
any nonzero exit as no usable final result, even when partial edits remain. Distinguish advisory
error items from a failed terminal state.

## Lane-specific rules

### Lane A

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

### Lane B

- Follow the app-server lifecycle and generate protocol schemas from the installed binary. Do not
  build the supervisor on experimental methods.
- Treat stdio as newline-delimited JSON and Unix or TCP listeners as WebSocket transports. Do not
  reuse stdio framing on sockets.
- Prefer a private Unix socket on a shared host. Authenticate WebSocket listeners, protect token
  files, and tunnel non-loopback traffic because the listener does not provide TLS.
- Treat one app-server process as one credential profile. Assert the returned profile directory
  during initialization and use one server per profile when accounts must differ.
- Reuse threads when appropriate: thread creation can restart the configured MCP server set and is
  not free. Measure contention before assuming parallel threads produce linear throughput.

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
