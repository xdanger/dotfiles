#!/usr/bin/env bash
# pr_status.sh — emit a deterministic JSON verdict on whether a PR is *truly*
# ready to merge, so the agent never has to eyeball "looks green".
#
# A PR is GREEN only when ALL of the following hold simultaneously:
#   - every check run has reached a terminal state (no QUEUED / IN_PROGRESS)
#     and every status context is settled (no PENDING / EXPECTED);
#   - no check is failing (FAILURE / ERROR / TIMED_OUT / CANCELLED / STALE);
#   - every review thread is resolved or outdated (none left open);
#   - the PR is MERGEABLE (no conflict, not behind base);
#   - no *required* human approval is still outstanding;
#   - coverage is complete (≤100 review threads and ≤100 checks — see truncation note).
#
# Usage:
#   pr_status.sh <pr-number>                # uses the repo of the cwd
#   pr_status.sh <owner/repo> <pr-number>
#   pr_status.sh <pr-url>                   # https://github.com/o/r/pull/123
#
# Requires: gh (authenticated) and jq.
# Output: one JSON object on stdout describing the PR and the verdict.
# Exit code mirrors the verdict so callers can branch without parsing:
#   0 GREEN   10 WAITING_CI   20 NEEDS_WORK   30 BLOCKED_HUMAN
#   40 NOT_ELIGIBLE (draft/closed)   50 ERROR
#
# Coverage cap: the GraphQL query fetches the first 100 review threads and first
# 100 checks (GitHub's per-page max). If a PR exceeds either, the result is
# flagged `truncated`, a warning is emitted to stderr, and the verdict is held
# back from GREEN — the cap is surfaced, never silent.
set -euo pipefail

die() {
  # escape backslashes and double quotes so the JSON stays valid on any message
  # (runs even when jq is missing, so it can't depend on jq)
  local m=${1//\\/\\\\}
  m=${m//\"/\\\"}
  printf '{"verdict":"ERROR","error":"%s"}\n' "$m"
  exit 50
}
command -v gh >/dev/null || die "gh not found"
command -v jq >/dev/null || die "jq not found"

owner="" repo="" pr=""
case "${1:-}" in
  https://*|http://*)
    # https://github.com/<owner>/<repo>/pull/<n>
    path="${1#*github.com/}"; owner="${path%%/*}"; rest="${path#*/}"
    repo="${rest%%/*}"; pr="$(printf '%s' "$1" | grep -oE '[0-9]+$')" ;;
  */*)
    owner="${1%%/*}"; repo="${1#*/}"; pr="${2:-}" ;;
  *)
    pr="${1:-}"
    nwo="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
    [ -n "$nwo" ] || die "no <owner/repo> given and not inside a gh repo"
    owner="${nwo%%/*}"; repo="${nwo#*/}" ;;
esac
[ -n "$owner" ] && [ -n "$repo" ] && [ -n "$pr" ] || die "could not resolve owner/repo/pr from args"

read -r -d '' QUERY <<'GQL' || true
query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      number title isDraft state
      mergeable mergeStateStatus reviewDecision
      headRefName baseRefName
      reviewThreads(first:100){
        totalCount
        pageInfo{ hasNextPage }
        nodes{
          id isResolved isOutdated path line
          comments(first:1){ nodes{ databaseId author{login} body } }
        }
      }
      commits(last:1){ nodes{ commit{ oid statusCheckRollup{ state
        contexts(first:100){
          totalCount
          pageInfo{ hasNextPage }
          nodes{
            __typename
            ... on CheckRun{ name status conclusion detailsUrl }
            ... on StatusContext{ context state targetUrl }
          }
        }
      }}}}
    }
  }
}
GQL

raw="$(gh api graphql -f owner="$owner" -f repo="$repo" -F pr="$pr" -f query="$QUERY" 2>/dev/null)" \
  || die "graphql query failed (check PR number / access)"

echo "$raw" | jq --arg owner "$owner" --arg repo "$repo" '
  .data.repository.pullRequest as $pr
  | ($pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes // []) as $ctx
  | ($pr.reviewThreads.nodes // []) as $threads
  | (($pr.reviewThreads.pageInfo.hasNextPage // false)
     or ($pr.commits.nodes[0].commit.statusCheckRollup.contexts.pageInfo.hasNextPage // false)) as $truncated
  | ($ctx | map(select(
      (.__typename=="CheckRun" and (.status=="QUEUED" or .status=="IN_PROGRESS"))
      or (.__typename=="StatusContext" and (.state=="PENDING" or .state=="EXPECTED"))
    ))) as $pending
  | ($ctx | map(select(
      (.__typename=="CheckRun" and (.conclusion | IN("FAILURE","TIMED_OUT","CANCELLED","STALE","STARTUP_FAILURE")))
      or (.__typename=="StatusContext" and (.state | IN("FAILURE","ERROR")))
    ))) as $failing
  | ($ctx | map(select(.__typename=="CheckRun" and .conclusion=="ACTION_REQUIRED"))) as $action
  | ($threads | map(select(.isResolved==false and .isOutdated==false))) as $unresolved
  | ($pr.mergeStateStatus // "UNKNOWN") as $mss
  | ($pr.reviewDecision // null) as $rd
  | {
      repo: ($owner+"/"+$repo), pr: $pr.number, title: $pr.title,
      state: $pr.state, isDraft: $pr.isDraft,
      headRefName: $pr.headRefName, baseRefName: $pr.baseRefName,
      mergeable: $pr.mergeable, mergeStateStatus: $mss, reviewDecision: $rd,
      truncated: $truncated,
      checks: { total: ($ctx|length), pending: ($pending|length), failing: ($failing|length),
                pending_names: ($pending|map(.name // .context)),
                failing_runs: ($failing|map({name:(.name // .context),
                                conclusion:(.conclusion // .state),
                                url:(.detailsUrl // .targetUrl)})) },
      reviewThreads: { total: ($threads|length), unresolved: ($unresolved|length),
                open_threads: ($unresolved|map({threadId:.id, path:.path, line:.line,
                                reply_to_comment_id:(.comments.nodes[0].databaseId),
                                author:(.comments.nodes[0].author.login),
                                snippet:((.comments.nodes[0].body // "")[0:140])})) },
      _e: {
        pending: ($pending|length), failing: ($failing|length), unresolved: ($unresolved|length),
        action_required: ($action|length),
        conflict: ($pr.mergeable=="CONFLICTING"),
        behind: ($mss=="BEHIND"),
        mergeable_unknown: ($pr.mergeable=="UNKNOWN"),
        approval_outstanding: (($rd=="REVIEW_REQUIRED") or ($rd=="CHANGES_REQUESTED")),
        protection_blocked: ($mss=="BLOCKED"),
        truncated: $truncated
      }
    }
  | .blockers = ([
      (if ._e.failing>0 then "ci_failing" else empty end),
      (if ._e.unresolved>0 then "unresolved_review_threads" else empty end),
      (if ._e.conflict then "merge_conflict" else empty end),
      (if ._e.behind then "branch_behind_base" else empty end),
      (if ._e.approval_outstanding then ("approval_outstanding:"+($rd//"")) else empty end),
      (if ._e.action_required>0 then "check_action_required" else empty end),
      (if ._e.protection_blocked then "branch_protection_blocked" else empty end),
      (if ._e.truncated then "coverage_truncated" else empty end)
    ])
  | .verdict = (
      if ($pr.isDraft==true) then "NOT_ELIGIBLE"
      elif ($pr.state!="OPEN") then "NOT_ELIGIBLE"
      elif (._e.pending>0 or ._e.mergeable_unknown) then "WAITING_CI"
      elif (._e.failing>0 or ._e.unresolved>0 or ._e.conflict or ._e.behind or ._e.truncated) then "NEEDS_WORK"
      elif (._e.approval_outstanding or ._e.action_required>0 or ._e.protection_blocked) then "BLOCKED_HUMAN"
      else "GREEN" end )
  | del(._e)
'

# loud, not silent: if either connection hit the 100 cap, GREEN can't be trusted
if echo "$raw" | jq -e '
  (.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage // false)
  or (.data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.pageInfo.hasNextPage // false)
' >/dev/null; then
  echo "warning: PR has >100 review threads or >100 checks; results truncated and verdict held back from GREEN. Add pagination for full coverage." >&2
fi

v="$(echo "$raw" | jq -r '
  .data.repository.pullRequest as $pr
  | ($pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes // []) as $ctx
  | ($pr.reviewThreads.nodes // []) as $t
  | (($pr.reviewThreads.pageInfo.hasNextPage // false)
     or ($pr.commits.nodes[0].commit.statusCheckRollup.contexts.pageInfo.hasNextPage // false)) as $trunc
  | (($ctx|map(select((.__typename=="CheckRun" and (.status=="QUEUED" or .status=="IN_PROGRESS")) or (.__typename=="StatusContext" and (.state=="PENDING" or .state=="EXPECTED")))))|length) as $pend
  | (($ctx|map(select((.__typename=="CheckRun" and (.conclusion | IN("FAILURE","TIMED_OUT","CANCELLED","STALE","STARTUP_FAILURE"))) or (.__typename=="StatusContext" and (.state | IN("FAILURE","ERROR"))))))|length) as $fail
  | (($ctx|map(select(.__typename=="CheckRun" and .conclusion=="ACTION_REQUIRED")))|length) as $act
  | (($t|map(select(.isResolved==false and .isOutdated==false)))|length) as $un
  | ($pr.mergeStateStatus // "UNKNOWN") as $mss
  | ($pr.reviewDecision // null) as $rd
  | if ($pr.isDraft==true or $pr.state!="OPEN") then "NOT_ELIGIBLE"
    elif ($pend>0 or $pr.mergeable=="UNKNOWN") then "WAITING_CI"
    elif ($fail>0 or $un>0 or $pr.mergeable=="CONFLICTING" or $mss=="BEHIND" or $trunc) then "NEEDS_WORK"
    elif (($rd=="REVIEW_REQUIRED") or ($rd=="CHANGES_REQUESTED") or ($act>0) or ($mss=="BLOCKED")) then "BLOCKED_HUMAN"
    else "GREEN" end')"
case "$v" in
  GREEN) exit 0;; WAITING_CI) exit 10;; NEEDS_WORK) exit 20;;
  BLOCKED_HUMAN) exit 30;; NOT_ELIGIBLE) exit 40;; *) exit 50;;
esac
