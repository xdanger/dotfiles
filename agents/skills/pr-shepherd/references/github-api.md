# GitHub & git command reference

Exact invocations for the operations the loop needs. The agent already knows
`gh` and `git`; this file pins down the non-obvious parts — chiefly resolving
review threads (which has **no REST endpoint and no `gh pr` subcommand**, only a
GraphQL mutation) and reading the true merge state.

Assumes `gh` is authenticated and `jq` is installed. `OWNER`, `REPO`, `PR` are
the repo owner, repo name, and PR number.

## Table of contents

1. Read state (the verdict script)
2. Inspect a failing check
3. Reply to a review comment
4. Resolve / unresolve a review thread
5. Re-request review
6. Update a branch that is behind base
7. Merge method detection
8. Merge + remote branch deletion
9. Local cleanup (worktree, branch, main)
10. State-value cheat sheet

---

## 1. Read state — always via the bundled script

```bash
scripts/pr_status.sh <PR>                 # current repo
scripts/pr_status.sh OWNER/REPO <PR>      # explicit
scripts/pr_status.sh <pr-url>
```

Emits one JSON object; exit code = verdict (`0 GREEN`, `10 WAITING_CI`,
`20 NEEDS_WORK`, `30 BLOCKED_HUMAN`, `40 NOT_ELIGIBLE`, `50 ERROR`). The JSON
carries `checks.failing_runs[]`, `reviewThreads.open_threads[]` (each with
`threadId` and `reply_to_comment_id`), `blockers[]`, `mergeable`, and
`mergeStateStatus`. Re-run it at the top of every loop iteration; never decide
"green" from a partial view such as `gh pr checks` alone.

## 2. Inspect a failing check

```bash
gh pr checks <PR>                                   # quick table of all checks
gh run view <run-id> --log-failed                   # only the failed step logs
gh pr view <PR> --json statusCheckRollup -q '.statusCheckRollup[]'
```

`failing_runs[].url` from the verdict points at the run/details page. For a
GitHub Actions failure, extract the run id from that URL and pull `--log-failed`.
Re-run only genuine flakes, once:

```bash
gh run rerun <run-id> --failed
```

## 3. Reply to a review comment (REST — reliable)

Reply in-thread to the first comment of a thread (`reply_to_comment_id` from the
verdict):

```bash
gh api -X POST \
  repos/OWNER/REPO/pulls/PR/comments/COMMENT_ID/replies \
  -f body="Done in <sha> — renamed as suggested."
```

For a general (non-thread) PR comment: `gh pr comment <PR> --body "..."`.

## 4. Resolve / unresolve a review thread (GraphQL only)

```bash
gh api graphql -f threadId="THREAD_NODE_ID" -f query='
mutation($threadId:ID!){
  resolveReviewThread(input:{threadId:$threadId}){ thread { isResolved } }
}'
```

`THREAD_NODE_ID` is `open_threads[].threadId` (a base64 node id like
`PRRT_kwDO...`), **not** the numeric comment id. Unresolve uses
`unresolveReviewThread` with the same shape — useful if you resolved something
prematurely.

## 5. Re-request review (after pushing fixes for CHANGES_REQUESTED)

```bash
gh pr edit <PR> --add-reviewer LOGIN
# or, to re-request everyone who already reviewed:
gh api -X POST repos/OWNER/REPO/pulls/PR/requested_reviewers \
  -f 'reviewers[]=LOGIN'
```

Re-requesting does not clear another person's CHANGES_REQUESTED on its own — only
a new review from that person does. This is why `approval_outstanding` is a
`BLOCKED_HUMAN`, not something to push through.

## 6. Update a branch that is behind base (`branch_behind_base`)

Prefer GitHub's own update so it matches the repo's merge style:

```bash
gh pr update-branch <PR>            # merges base into head (or rebases if configured)
```

Only fall back to a local rebase when the user has asked for a linear history
and you are certain no one else is pushing to the head branch. Never force-push
a shared/long-lived branch.

## 7. Merge method detection

```bash
gh api repos/OWNER/REPO \
  --jq '{squash:.allow_squash_merge, merge:.allow_merge_commit, rebase:.allow_rebase_merge}'
```

Pick the user's configured preference if given; otherwise prefer `squash` when
allowed (clean single-commit history for a feature PR), then `merge`, then
`rebase`. Use only a method the repo allows.

## 8. Merge + remote branch deletion

```bash
gh pr merge <PR> --squash               # or --merge / --rebase
gh pr merge <PR> --squash --delete-branch   # also deletes the REMOTE head branch
```

`--delete-branch` removes the remote branch and _attempts_ the local one — but it
fails or misbehaves when the branch is checked out in a worktree, so for
worktree-based flows do the merge WITHOUT `--delete-branch`, delete the remote
explicitly, then handle local cleanup in step 9:

```bash
gh pr merge <PR> --squash
gh api -X DELETE repos/OWNER/REPO/git/refs/heads/HEAD_REF   # delete remote branch
```

Skip the remote deletion entirely for long-lived branches (see SKILL.md).

## 9. Local cleanup (run from the PRIMARY worktree, never the one being removed)

```bash
git -C <primary-worktree> fetch --prune origin
# if the head branch lives in a dedicated worktree:
git -C <primary-worktree> worktree remove <path-to-head-worktree>   # add --force only if you have verified there are no unsaved changes
git -C <primary-worktree> branch -D HEAD_REF      # -D: a squash-merge leaves the branch "unmerged" to git, so -d refuses
git -C <primary-worktree> switch main             # or master
git -C <primary-worktree> pull --ff-only origin main
git -C <primary-worktree> worktree prune
```

`-D` (capital) is deliberate: after a squash or rebase merge, `git branch -d`
reports the branch as unmerged and refuses. You have already confirmed via the
verdict that the PR merged, so the force delete is safe.

## 10. State-value cheat sheet

- **CheckRun.status**: QUEUED, IN_PROGRESS, COMPLETED.
- **CheckRun.conclusion**: SUCCESS, NEUTRAL, SKIPPED (all pass); FAILURE,
  TIMED_OUT, CANCELLED, STALE, STARTUP_FAILURE (fail); ACTION_REQUIRED (needs a
  human, e.g. a deployment gate).
- **StatusContext.state**: SUCCESS (pass); PENDING, EXPECTED (still running);
  FAILURE, ERROR (fail).
- **PR.mergeable**: MERGEABLE, CONFLICTING, UNKNOWN (still computing — re-poll).
- **PR.mergeStateStatus**: CLEAN (ready), BLOCKED (branch protection, e.g. review
  missing), BEHIND (head behind base), DIRTY (conflict), UNSTABLE (mergeable but
  non-required checks pending/failing), DRAFT, HAS_HOOKS, UNKNOWN.
- **PR.reviewDecision**: APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, or null
  (no review required by branch protection).
