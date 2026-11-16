#!/usr/bin/env bash
# MERGE ON GREEN (Stage 10op). The family, 16 Nov 2026: "Automatically merge once
# done always". A pull request labelled `automerge` is squash-merged into main
# when its CI run passes, on GitHub, so no one has to watch it.
#
# Run by .github/workflows/merge-on-green.yml from main's own checkout; it never
# checks out or runs the pull request's code. Locally, dry:
#   DRY_RUN=1 REPO=techmuns/GlowVentures SHA=<head sha> [PR=<n>] .github/scripts/merge-on-green.sh
#
# It leaves alone a PR without the label, a draft, a fork, a head that has moved,
# and a PR whose CI has not passed: its own CI run decides it later. A conflict is
# left to whoever owns the PR. A labelled PR that is green but can't be merged
# safely gets a comment saying why: a check failing or still running, main
# overtaking it on the same files, or a stage letter main already uses. The repo
# CLAUDE.md requires both of those last checks before a merge.
set -euo pipefail
: "${REPO:?REPO is owner/name}" "${SHA:?SHA is the head commit CI ran on}"
LABEL=automerge
say() { echo "merge-on-green: $*"; }
leave() { say "#${PR:-?} left open: $1"; exit 0; }
note() {
  say "#$PR not merged: $1"
  [ "${DRY_RUN:-}" = 1 ] || gh pr comment "$PR" -R "$REPO" --body "Not merged automatically: $1"
  exit 0
}

# The open pull request into main whose head is exactly the commit CI passed on.
if [ -z "${PR:-}" ]; then
  PR=$(gh api "repos/$REPO/commits/$SHA/pulls" --jq "[.[] | select(.state == \"open\" and .base.ref == \"main\"
    and .head.repo.full_name == \"$REPO\" and .head.sha == \"$SHA\")][0].number // empty")
fi
[ -n "$PR" ] || { say "no open pull request into main has head $SHA"; exit 0; }

view() { gh pr view "$PR" -R "$REPO" --json isDraft,isCrossRepository,labels,headRefOid,baseRefName,mergeable,statusCheckRollup,files; }
pr=$(view)
jq -e --arg l "$LABEL" 'any(.labels[]; .name == $l)' <<<"$pr" >/dev/null || leave "no $LABEL label"
[ "$(jq -r .isDraft <<<"$pr")" = false ] || leave "a draft"
[ "$(jq -r .isCrossRepository <<<"$pr")" = false ] || leave "from a fork"
[ "$(jq -r .baseRefName <<<"$pr")" = main ] || leave "not into main"
[ "$(jq -r .headRefOid <<<"$pr")" = "$SHA" ] || leave "its head moved past $SHA"

# CI's latest run on this exact commit. A label added while CI is still running
# exits here, and the workflow_run trigger brings it back when CI finishes.
ci=$(gh api "repos/$REPO/actions/runs?head_sha=$SHA&event=pull_request&per_page=50" \
  --jq '[.workflow_runs[] | select(.name == "CI")] | sort_by(.run_started_at) | last | .conclusion // "not finished"')
[ "$ci" = success ] || leave "CI on $SHA is $ci"

# Every other check on the commit has passed (Cloudflare Pages, for one).
open=$(jq -r '[.statusCheckRollup[] | select((.workflowName // "") != "Merge on green")
  | select(if .__typename == "StatusContext" then .state != "SUCCESS"
           else (.status != "COMPLETED" or ((.conclusion // "") | IN("SUCCESS", "SKIPPED", "NEUTRAL") | not)) end)
  | (.name // .context)] | unique | join(", ")' <<<"$pr")
[ -z "$open" ] || note "these checks have not passed: $open."

# GitHub works out mergeability lazily after a push; give it a moment.
for _ in 1 2 3 4 5 6; do
  state=$(jq -r .mergeable <<<"$pr")
  [ "$state" = UNKNOWN ] || break
  sleep 10; pr=$(view)
done
case "$state" in
  MERGEABLE) ;;
  CONFLICTING) leave "it conflicts with main" ;;
  *) note "GitHub could not say whether it merges cleanly ($state). Push again or merge it by hand." ;;
esac

# Main overtook the branch on a file it also changes: the merge would be untested,
# and generated files must be regenerated, never text-merged (repo CLAUDE.md).
ahead=$(gh api "repos/$REPO/compare/$SHA...main")
if [ "$(jq -r .ahead_by <<<"$ahead")" != 0 ]; then
  both=$(comm -12 <(jq -r '.files[].path' <<<"$pr" | sort -u) <(jq -r '.files[].filename' <<<"$ahead" | sort -u) | paste -sd, - | sed 's/,/, /g')
  [ -z "$both" ] || note "main has changed $both since this branch was cut. Merge main into it and push."
fi

# Two notes under one stage letter merge with no conflict marker (repo CLAUDE.md).
while read -r stage; do
  [ -n "$stage" ] || continue
  if grep -rqs -- "^### $stage " docs/history CLAUDE.md; then
    note "main already has a $stage note. Renumber this PR's note and push."
  fi
done < <(gh pr diff "$PR" -R "$REPO" | sed -n 's/^+### \(Stage 10[a-z]*\) .*/\1/p' | sort -u)

if [ "${DRY_RUN:-}" = 1 ]; then say "#$PR would be squash-merged at $SHA"; exit 0; fi
gh pr merge "$PR" -R "$REPO" --squash --match-head-commit "$SHA"
say "#$PR squash-merged at $SHA"
