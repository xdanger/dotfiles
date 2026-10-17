# GitHub & git command reference

Exact invocations for the loop, focused on the non-obvious parts: resolving review threads
(GraphQL only — there is no REST endpoint or `gh pr` subcommand) and reading the true
merge state. `OWNER`, `REPO`, and `PR` are placeholders; `gh` must be authenticated and
`jq` installed.

Sections: 1 read state · 2 failing checks · 3 reply · 4 resolve threads · 5 re-request
review · 6 update branch · 7 merge method · 8 merge and remote delete · 9 local cleanup ·
10 state values · 11 optional webhook wakes

## 1. Read state — always via the bundled script

```bash
scripts/pr_status.sh <PR>                 # current repo
scripts/pr_status.sh OWNER/REPO <PR>      # explicit
scripts/pr_status.sh <pr-url>
```

Prints one JSON object; the exit code is the verdict: `0 GREEN`, `10 WAITING_CI`,
`20 NEEDS_WORK`, `30 BLOCKED_HUMAN`, `40 NOT_ELIGIBLE`, `50 ERROR`. The JSON includes
`blockers[]`, `checks.failing_runs[]`, `reviewThreads.open_threads[]` (each with `threadId`
and `reply_to_comment_id`), `mergeable`, and `mergeStateStatus`.

## 2. Inspect a failing check

```bash
gh pr checks <PR>                     # all checks at a glance
gh run view <run-id> --log-failed     # failed step logs only
gh run rerun <run-id> --failed        # genuine flakes only, once
```

`failing_runs[].url` links to the run; for GitHub Actions, take the run id from it.

## 3. Reply to a review comment

```bash
gh api -X POST repos/OWNER/REPO/pulls/PR/comments/COMMENT_ID/replies \
  -f body="Done in <sha> — renamed as suggested."
```

`COMMENT_ID` is the thread's `reply_to_comment_id`. For a top-level PR comment, use
`gh pr comment <PR> --body "..."`.

## 4. Resolve a review thread (GraphQL only)

```bash
gh api graphql -f threadId="THREAD_NODE_ID" -f query='
mutation($threadId:ID!){
  resolveReviewThread(input:{threadId:$threadId}){ thread { isResolved } }
}'
```

`THREAD_NODE_ID` is `open_threads[].threadId` (a node id like `PRRT_kwDO...`), **not** the
numeric comment id. `unresolveReviewThread` takes the same shape if you resolved one
prematurely.

## 5. Re-request review after fixing CHANGES_REQUESTED

```bash
gh pr edit <PR> --add-reviewer LOGIN
```

Re-requesting doesn't clear CHANGES_REQUESTED; only that reviewer's new review does. That
is why `approval_outstanding` is `BLOCKED_HUMAN`, not something to push through.

## 6. Update a branch that is behind base

```bash
gh pr update-branch <PR>    # merges base into head (or rebases if configured)
```

Rebase locally only when the user wants linear history and no one else pushes to the head
branch. Never force-push a shared or long-lived branch.

## 7. Detect allowed merge methods

```bash
gh api repos/OWNER/REPO \
  --jq '{merge:.allow_merge_commit, squash:.allow_squash_merge, rebase:.allow_rebase_merge}'
```

## 8. Merge and delete the remote branch

```bash
gh pr merge <PR> --merge                                    # or --squash / --rebase
gh pr view <PR> --json state,mergeCommit,isCrossRepository,headRepositoryOwner,headRepository
gh api -X DELETE repos/HEAD_OWNER/HEAD_REPO/git/refs/heads/HEAD_REF   # skip for long-lived branches
```

Delete only once `state` is `MERGED`: with a merge queue, `gh pr merge` can return after
merely enqueueing the PR. The head ref lives in the head repository, which differs from
the base for a fork PR (`isCrossRepository`); if you can't write there, skip the deletion
rather than removing a same-named branch from the base repository.

`gh pr merge --delete-branch` also tries to delete the local branch, which fails or
misbehaves when that branch is checked out in a worktree. In worktree flows, merge without
it, delete the remote as above, and clean up locally per §9.

## 9. Local cleanup — from the primary worktree, never the one being removed

```bash
git -C <primary> fetch --prune origin
git -C <primary> worktree remove <head-worktree>   # --force only after verifying no unsaved changes
git -C <primary> branch -D HEAD_REF                # -d refuses after squash/rebase merges
git -C <primary> switch main                       # or the base branch
git -C <primary> pull --ff-only origin main
git -C <primary> worktree prune
```

`-D` is safe here because §8 confirmed the PR is `MERGED`; a GREEN verdict alone only
proves it was ready to merge.

## 10. State values

- **CheckRun.status:** QUEUED, IN_PROGRESS, COMPLETED.
- **CheckRun.conclusion:** SUCCESS, NEUTRAL, SKIPPED pass; FAILURE, TIMED_OUT, CANCELLED,
  STALE, STARTUP_FAILURE fail; ACTION_REQUIRED needs a human (e.g. a deployment gate).
- **StatusContext.state:** SUCCESS passes; PENDING, EXPECTED are still running; FAILURE,
  ERROR fail.
- **PR.mergeable:** MERGEABLE, CONFLICTING, UNKNOWN (still computing — re-poll).
- **PR.mergeStateStatus:** CLEAN (ready), BLOCKED (branch protection, e.g. missing
  review), BEHIND (head behind base), DIRTY (conflict), UNSTABLE (non-required checks
  pending or failing), DRAFT, HAS_HOOKS, UNKNOWN.
- **PR.reviewDecision:** APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, or null (no review
  required).

## 11. Optional: webhook wakes (repo admin + local host)

The default wait (`scripts/wait_for_settle.sh`) polls the full gate and needs only `gh`.
Use webhooks only when all of these hold: you have **repo admin** (required to create the
hook), you run on a **local host** that can keep a long-running foreground process (not
an API/MCP-only surface), and you need fast wakes on review, thread, or branch events. The
official `cli/gh-webhook` extension tunnels deliveries through GitHub, so no public
endpoint, smee, or ngrok is needed:

```bash
gh extension install cli/gh-webhook
gh webhook forward --repo=OWNER/REPO \
  --events=pull_request,check_run,check_suite,status,pull_request_review,pull_request_review_thread,workflow_run \
  --url=http://localhost:PORT/hook    # a minimal local receiver
```

A delivery is only a wake signal: re-run `scripts/pr_status.sh` and act on its verdict.
There is no `mergeable` event — GitHub computes mergeability asynchronously, so only a
fresh query can confirm it.

Caveats:

- One forwarder per repo (a second fails with `Hook already exists`). Officially dev/test
  only, and unsupported on GitHub Enterprise Server.
- Repo-level events need no extra scope. Org-level events need
  `gh auth refresh -s admin:org_hook`, which persistently lets your token manage every
  webhook in the org; skip it unless you truly need org events.
- Use placeholders (`OWNER/REPO`, `PORT`); never commit a real URL, port, token, or local
  path to this public repository.
