---
name: pr-shepherd
description: >-
  End-to-end driver that takes a ready-for-review pull request all the way to a
  clean merge. Use whenever the user wants Claude to shepherd, babysit, watch, or
  drive a PR to green and merge it — e.g. "take PR #123 through CI and merge it",
  "babysit this PR until everything is green", "land this PR and clean up". It loops over the
  PR's checks and reviews: fixes real CI failures (re-running only genuine
  flakes), replies to every review comment, resolves each conversation, and
  re-polls until a strict gate passes — all checks actually completed and
  passing, every thread resolved or outdated, mergeable with no required approval
  outstanding — not merely "looks fixed". Then it merges with the repo's
  preferred method, deletes the remote branch unless it is long-lived, removes
  the local branch and git worktree, and fast-forwards local main/master. Trigger
  even when the user only describes the outcome ("get this merged once CI is
  happy") without naming the steps.
---

# PR Shepherd

Drive a `ready-for-review` pull request from "submitted" to "merged and cleaned
up", autonomously but safely. The hard part is not the individual git/gh
commands — it is (a) refusing to call a PR "green" until it genuinely is, and
(b) never gaming that definition to finish faster. Hold the line on both.

This skill assumes a Claude Code-style environment with `gh` (authenticated),
`git`, `jq`, and a bash shell. The local-cleanup steps (worktree, branch, main)
require real filesystem access, so they only apply when running locally; if you
are operating purely through an API/MCP surface, do the GitHub-side work and tell
the user the local cleanup must run on their machine.

## When this runs

Start when a PR is `ready-for-review` — either freshly opened that way, or just
flipped from draft. If the PR is still a draft, stop and say so; do not babysit a
draft. The user may invoke this directly ("shepherd PR #123 home") or it may be
handed to you as a task mandate. Either way you own the PR until it reaches a
terminal state: merged, or escalated to a human with a clear reason.

## The loop

Run this cycle. Cap it at **5 iterations**; if you would exceed that, stop and
hand back to the human with a summary of what is still red and why — repeated
failure usually means a real blocker or a flake that needs a person, and a
runaway loop that keeps pushing commits is worse than asking.

1. **Read the truth.** Run `scripts/pr_status.sh <PR>` and read its JSON +
   exit code. This is the single source of truth for the gate; do not infer
   green from `gh pr checks` alone or from a glance at the web UI. The verdict is
   one of `GREEN`, `WAITING_CI`, `NEEDS_WORK`, `BLOCKED_HUMAN`, `NOT_ELIGIBLE`.

2. **Branch on the verdict:**
   - `NOT_ELIGIBLE` — draft or closed. Report and stop.
   - `WAITING_CI` — checks are still QUEUED/IN_PROGRESS or mergeability is still
     computing. Wait, don't poll-spin. Block on completion, then re-read:
     ```bash
     gh pr checks <PR> --watch --fail-fast=false   # returns when all checks settle
     ```
     Then go back to step 1.
   - `NEEDS_WORK` — address the specific `blockers[]` (next section), push, and
     loop.
   - `BLOCKED_HUMAN` — something only a person can clear (a required approval, an
     `ACTION_REQUIRED` deployment gate, a branch-protection block). Do every
     thing you _can_ (address comments, resolve threads, push fixes), then stop
     and tell the human precisely what is outstanding. Do not self-approve or
     attempt to bypass protections.
   - `GREEN` — proceed to **Merge & cleanup**.

3. After any push, the head SHA changes and CI restarts. Return to step 1; the
   gate will report `WAITING_CI` until the new run settles.

## Handling NEEDS_WORK

The verdict's `blockers[]` tells you what to fix. Work the real problem, not the
symptom.

### Failing checks (`ci_failing`)

For each entry in `checks.failing_runs[]`, open the failure (`references/github-api.md`
§2) and diagnose before touching code:

- **Real bug** — your code is wrong: fix it, add/adjust a test if the failure
  exposed a gap, commit with a message that says what broke and why, push.
- **Genuine flake** — a known-nondeterministic test, a transient network/runner
  error, an unrelated infra blip: re-run it **once** (`gh run rerun <id> --failed`).
  If it fails again the same way, treat it as real or escalate; do not re-run on
  a loop hoping for green.
- **Lint/format/type** — fix it; these are cheap and unambiguous.
- **A check that is failing for reasons outside this PR's scope** (e.g. a
  pre-existing broken `main`, a check that requires secrets a fork can't see):
  don't fabricate a fix. Note it and, if it blocks merge, escalate.

The instinct to make a check pass "somehow" is the thing to resist. Disabling a
test, weakening an assertion, or `# noqa`-ing a real warning makes the gate green
while leaving the bug — that defeats the entire purpose of the strict definition.

### Unresolved review threads (`unresolved_review_threads`)

For each thread in `reviewThreads.open_threads[]`, **address then resolve** — in
that order, never the reverse:

- A correct nitpick or actionable suggestion → make the change, then reply
  pointing at the commit (`references/github-api.md` §3), then resolve the thread
  (§4).
- A question → answer it in a reply. Resolve only once it is actually answered.
- A suggestion you disagree with → reply with your reasoning and propose the
  alternative. If it's a judgment call the reviewer should weigh in on, leave it
  open and flag it to the human rather than resolving unilaterally.
- Outdated threads (`isOutdated`) already count as satisfied for the gate; you
  may resolve them for tidiness but needn't.

Resolving a thread you haven't actually addressed is gaming the gate. Don't.

### Merge conflict (`merge_conflict`) / behind base (`branch_behind_base`)

Prefer `gh pr update-branch <PR>` to bring the head up to date in the repo's
configured style (`references/github-api.md` §6). For a true content conflict
that needs hand-resolution, resolve it carefully in the head branch and push —
but if the resolution is non-trivial or risks clobbering someone's work, pause
and confirm the approach with the human first. Never force-push a shared branch.

## Merge & cleanup (only after a verified GREEN)

Re-confirm GREEN immediately before merging — state can change between iterations
(a new review, a fresh push from a teammate). Then:

1. **Choose the merge method.** Use the user's stated preference; otherwise
   detect allowed methods and prefer merge → squash → rebase
   (`references/github-api.md` §7).

2. **Decide the merge autonomy.** By default, ask for a one-line confirmation
   before the irreversible merge, showing what you're about to do
   ("All green — merge-committing #123 into main and deleting `feature/x`. Go?").
   If the user has explicitly asked for hands-off operation, or handed you an
   autonomous mandate, skip the prompt and merge — the strict GREEN gate is the
   safety mechanism in that case. Either way, merge is the point of no return:
   only cross it on a gate you trust.

3. **Merge.** `gh pr merge <PR> --merge` (or chosen method).

4. **Delete the remote branch — unless it is long-lived.** Treat as long-lived
   (do NOT delete) any branch that is: a default/integration branch
   (`main`, `master`, `develop`, `dev`, `staging`, `production`), matches a
   release/hotfix pattern (`release/*`, `hotfix/*`, `support/*`), is protected by
   a branch-protection rule, or matches a user-provided keep-list. Otherwise
   delete it (`references/github-api.md` §8). When unsure whether a branch is
   meant to persist, ask rather than delete.

5. **Local cleanup** (local runs only), from the primary worktree — never from
   the worktree you're about to remove (`references/github-api.md` §9):
   `git worktree remove` the head's worktree if it had one, `git branch -D` the
   head branch (capital `-D` because a squash/rebase merge leaves it "unmerged"
   to git), switch to the base branch, `git pull --ff-only`, and
   `git worktree prune`.

6. **Report** the final state: merged commit, branch dispositions
   (remote deleted? local cleaned?), and anything you deliberately left (e.g. a
   long-lived branch kept, a thread left open for the reviewer).

## Safety rails (these protect the user, not bureaucracy)

- The GREEN gate is strict on purpose. "All problems addressed" ≠ green; green is
  the script's positive verdict that every check _finished_ and passed, every
  thread is resolved/outdated, the PR is mergeable, and no required approval is
  outstanding. Never substitute your own looser judgment for it.
- Never bypass human gates: no self-approving to clear a required review, no
  editing branch-protection rules, no merging while `BLOCKED_HUMAN`.
- Never force-push to a shared or long-lived branch. Only operate on the PR's own
  head branch.
- Never delete a branch you cannot confirm is disposable, and never `--force` a
  worktree removal without first checking for uncommitted changes.
- Don't weaken tests, suppress warnings, or resolve unaddressed threads to reach
  green faster. If you can't legitimately get to green, escalate — that's the
  correct outcome, not a failure.
- If the same blocker survives two fix attempts, stop and bring in the human.

## Configurable knobs (mention these if the user wants to tune behavior)

- **Merge method**: merge commit (default if allowed) / squash / rebase.
- **Merge autonomy**: confirm-before-merge (default) / fully autonomous.
- **Long-lived branch keep-list**: extra patterns beyond the built-in set.
- **Iteration cap**: default 5.
- **Flake re-run policy**: default one re-run per failing check, then escalate.
- **Required-only checks**: by default _all_ checks must pass (the user's strict
  definition); optionally relax to "only branch-protection-required checks".
