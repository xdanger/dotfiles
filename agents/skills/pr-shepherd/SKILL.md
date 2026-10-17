---
name: pr-shepherd
description: Shepherd a pull request through CI, review, merge, and cleanup when the user requests that outcome. Status checks or read-only reviews do not authorize merging.
---

# PR Shepherd

Drive a pull request from ready-for-review to merged and cleaned up. The hard part is not
the `gh`/`git` commands: it is refusing to call a PR green until it genuinely is, and never
gaming that definition to finish faster.

Requires `gh` (authenticated), `git`, `jq`, and bash. Local cleanup needs filesystem
access; on an API/MCP-only surface, do the GitHub-side work and tell the user to run the
local cleanup on their machine.

## Scope and authorization

- **Drafts:** continue only if the user authorized taking the PR through readiness and
  delivery. Mark it ready once the required readiness checks pass, then re-read the gate.
  Otherwise report what is missing; never mark arbitrary drafts ready.
- **Ownership:** you own the PR until it is merged, or escalated to a human with a clear
  reason.
- **Merging:** an explicit request to merge or land the PR, or an established mandate that
  clearly includes merging, authorizes merging after a strict GREEN with no further
  confirmation. Requests to inspect, review, watch, or repair do not. "Deliver the PR"
  alone may mean opening or handing off a ready PR, so it is not sufficient either. Ask
  only when merging is outside the established scope. Required GitHub approvals stay
  mandatory.

## The loop

Track repair rounds (cap **5**), waiting, and task authorization separately; waiting
consumes no repair round. Carry the PR, head SHA, last verdict, repair count, and time of
last meaningful progress across wait calls. A wait timeout returns control; it neither
revokes an authorized shepherd task nor by itself requires human approval. Continue only
while the task remains authorized and work or CI is progressing; if the user cancels or
narrows the task, stop or reconfirm before acting on a later GREEN. Judge stalled checks
against the expected CI duration and any task deadline instead of blindly restarting wait
budgets, and escalate an actionable human blocker or persistent lack of progress with the
saved state.

1. **Read the gate:** `scripts/pr_status.sh <PR>`. Its JSON and exit code are the single
   source of truth; never infer green from `gh pr checks` or the web UI.
2. **Act on the verdict:**
   - `NOT_ELIGIBLE` — a draft follows the draft rule above; a closed PR is reported, never
     reopened implicitly.
   - `WAITING_CI` — checks are queued/running or mergeability is computing. Don't
     poll-spin; run `scripts/wait_for_settle.sh <PR>`. It re-reads the full gate on an
     interval and returns once the verdict leaves `WAITING_CI`, so new failures, comments,
     and human gates surface while other checks still run. Choose a `--max-wait` that keeps
     you responsive to the user. A settled result is the next gate read. Exit `10` only
     means this call's budget ran out: the output is the last snapshot, so reconcile saved
     state before continuing.
   - `NEEDS_WORK` — fix the `blockers[]` (next section), push if needed, and loop. Act even
     while other checks are still running, but partial results never permit merging.
   - `BLOCKED_HUMAN` — only a person can clear it (required approval, `ACTION_REQUIRED`
     deployment gate, branch protection). Do everything you can — fixes, replies,
     resolutions — then tell the human exactly what is outstanding.
   - `GREEN` — go to **Merge & cleanup**.
3. A push changes the head SHA and restarts CI; return to step 1.

## Fixing NEEDS_WORK

Fix the real problem, not the symptom.

**`ci_failing`** — open each `checks.failing_runs[]` entry (`references/github-api.md` §2)
and diagnose before editing:

- **Real bug:** fix it, add or adjust a test if the failure exposed a gap, commit saying
  what broke and why, push.
- **Genuine flake** (known-nondeterministic test, transient runner or network error):
  `gh run rerun <id> --failed` **once**. If it fails the same way again, treat it as real
  or escalate.
- **Lint/format/type:** fix within the repository's authorization rules. If policy
  requires a decision first, report the rule, location, and proposed fix while continuing
  unaffected work. Never change linter configuration implicitly.
- **Outside this PR's scope** (already-broken `main`, secrets a fork can't see): don't
  fabricate a fix; note it, and escalate if it blocks merging.

Disabling a test, weakening an assertion, or suppressing a real warning turns the gate
green while keeping the bug. Don't.

**`unresolved_review_threads`** — for each `reviewThreads.open_threads[]`, address first,
then resolve:

- **Actionable suggestion:** make the change, reply citing the commit (§3), resolve (§4).
- **Question:** answer it; resolve only once it is actually answered.
- **Disagreement:** reply with your reasoning and an alternative. If the reviewer should
  weigh in, leave it open and flag it to the human.
- **Outdated** (`isOutdated`) threads already satisfy the gate; resolving them is
  optional.

**`merge_conflict` / `branch_behind_base`** — prefer `gh pr update-branch <PR>` (§6).
Resolve true conflicts in the head branch, but confirm the approach with the human first
if it is non-trivial or could clobber someone's work.

## Merge & cleanup — only after a fresh GREEN

Re-read the gate immediately before merging; a new review or teammate push can land
between iterations.

1. **Method:** the user's preference; otherwise the first allowed of merge → squash →
   rebase (§7).
2. **Merge:** `gh pr merge <PR> --merge` (or the chosen method). A merge queue may only
   enqueue the PR, so confirm its state is `MERGED` and note the merge commit before any
   cleanup.
3. **Remote branch:** delete it (§8) unless it is long-lived: the default branch or any
   integration branch (e.g. `main`, `master`, `develop`, `dev`, `staging`, `production`),
   `release/*`, `hotfix/*`, `support/*`, any protected branch, or one on the user's
   keep-list. If unsure, ask.
4. **Local cleanup** (local runs only), from the primary worktree, never the one being
   removed (§9): remove the head's worktree if it has one, `git branch -D` the head branch
   (squash and rebase merges look unmerged to git), switch to the base branch,
   `git pull --ff-only`, and `git worktree prune`.
5. **Report:** the merge commit, what happened to each branch, and anything deliberately
   left (a kept long-lived branch, a thread left open for the reviewer).

## Safety rails

- GREEN is strict on purpose: every check finished and passed, every thread is resolved
  or outdated, the PR is mergeable, and no required approval is outstanding. "All problems
  addressed" is not green; never substitute a looser judgment.
- Never bypass human gates: no self-approval, no editing branch protection, no merging
  while `BLOCKED_HUMAN`.
- Operate only on the PR's own head branch; never force-push a shared or long-lived
  branch.
- Never delete a branch you can't confirm is disposable, and never `--force` a worktree
  removal without checking for uncommitted changes.
- Never weaken tests, suppress warnings, or resolve unaddressed threads to reach green. If
  you can't get there legitimately, escalating is the correct outcome.
- If the same blocker survives two fix attempts, bring in the human.

## Tunable defaults

Mention these if the user wants to tune behavior:

- **Merge method:** merge commit if allowed, then squash, then rebase.
- **Merge authorization:** the user's established scope; never inferred from a status or
  review request.
- **Long-lived branches:** extra keep-list patterns beyond the built-in set.
- **Repair rounds:** 5; waiting is tracked separately.
- **Flake reruns:** one per failing check, then escalate.
- **Waiting:** `wait_for_settle.sh --interval` (default 10s) and `--max-wait` (default
  1800s per call); both must be positive. Use `pr_status.sh` for a single read.
- **Required checks:** all checks by default; optionally only branch-protection-required
  ones.
- **Wait transport:** bounded polling by default. Repo admins on a local host can add
  webhook wakes (`references/github-api.md` §11); `pr_status.sh` remains the gate.
