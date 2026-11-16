#!/usr/bin/env bash
# MERGE ON GREEN (Stage 10op). The family, 16 Nov 2026: "Automatically merge once
# done always". Every open pull request into main labelled `automerge` is
# squash-merged once CI on its exact head has passed, on GitHub, so no one has to
# watch CI. Called from two places:
#   - CI's last job (ci.yml › merge-on-green), once every job on a labelled PR has
#     passed. CI_RUN_ID is that run, counted as passed because its `needs` hold.
#   - .github/workflows/merge-on-green.yml, run from main when CI completes
#     anywhere or a PR is labelled. That covers branches cut before this existed
#     and a label added after CI passed.
# Each call sweeps every labelled PR, so a green PR waiting on nothing merges on
# the next run. Locally, dry: DRY_RUN=1 REPO=techmuns/GlowVentures [SHA=<head>] bash this
#
# A PR is left alone if it is a draft, from a fork, its CI hasn't passed, or
# GitHub says it conflicts with main (Auto-fix wakes the owner for that). If it
# is green but unsafe to merge, the PR whose CI just finished (SHA) gets a
# comment saying why:
#   - another check failed or is still running;
#   - main changed a generated file it also changes, which must be regenerated,
#     never text-merged (repo CLAUDE.md);
#   - main already has its stage letter, since two notes can land under one letter
#     with no conflict marker (repo CLAUDE.md).
set -euo pipefail
: "${REPO:?REPO is owner/name}"
LABEL=automerge
GENERATED='^(src/data/glowData\.ts|src/data/readModels\.json|public/audit/|docs/[A-Z-]*REPORT[A-Z-]*\.md|docs/SOURCE-COVERAGE\.md|docs/INGEST-INVENTORY\.md|scripts/check-pages\.mjs)'
SELF_CHECKS='["merge-on-green", "Merge on green"]'
say() { echo "merge-on-green: $*"; }

# A reason a green PR was not merged, as a comment, only on the PR whose CI just
# finished and never twice in a row.
tell() {
  local pr=$1 loud=$2 body="Not merged automatically: $3"
  say "#$pr not merged: $3"
  [ "$loud" = 1 ] && [ "${DRY_RUN:-}" != 1 ] || return 0
  last=$(gh api "repos/$REPO/issues/$pr/comments?per_page=100" --jq '[.[] | select(.user.login == "github-actions[bot]")] | last | .body // ""')
  [ "$last" = "$body" ] || gh pr comment "$pr" -R "$REPO" --body "$body"
}

ci_passed() {  # $1 = head sha
  [ -n "${CI_RUN_ID:-}" ] && [ "${1}" = "${SHA:-}" ] && return 0
  [ "$(gh api "repos/$REPO/actions/runs?head_sha=$1&event=pull_request&per_page=50" \
    --jq '[.workflow_runs[] | select(.name == "CI")] | sort_by(.run_started_at) | last | .conclusion // "none"')" = success ]
}

try_merge() {  # $1 = PR number, $2 = its head sha
  local n=$1 sha=$2 loud=0 pr open state ahead both stage
  [ "$sha" = "${SHA:-}" ] && loud=1
  pr=$(gh pr view "$n" -R "$REPO" --json isDraft,isCrossRepository,headRefOid,baseRefName,mergeable,statusCheckRollup,files)
  [ "$(jq -r '.isDraft or .isCrossRepository or .baseRefName != "main"' <<<"$pr")" = false ] || { say "#$n skipped: draft, fork or not into main"; return 0; }
  [ "$(jq -r .headRefOid <<<"$pr")" = "$sha" ] || { say "#$n skipped: head moved"; return 0; }
  ci_passed "$sha" || { say "#$n waiting: CI on ${sha:0:7} has not passed"; return 0; }

  open=$(jq -r --argjson self "$SELF_CHECKS" '[.statusCheckRollup[]
    | select(((.name // .context) | IN($self[])) or ((.workflowName // "") | IN($self[])) | not)
    | select(if .__typename == "StatusContext" then .state != "SUCCESS"
             else (.status != "COMPLETED" or ((.conclusion // "") | IN("SUCCESS", "SKIPPED", "NEUTRAL") | not)) end)
    | (.name // .context)] | unique | join(", ")' <<<"$pr")
  # Inside CI, the run's own jobs have all passed (`needs`), whatever the rollup has caught up to.
  [ -n "${CI_RUN_ID:-}" ] && [ "$loud" = 1 ] && open=$(tr ',' '\n' <<<"$open" | sed 's/^ *//' | grep -vxE 'rapid-statements|build|statements|upload-e2e' | paste -sd, - | sed 's/,/, /g' || true)
  [ -z "$open" ] || { tell "$n" "$loud" "these checks have not passed: $open."; return 0; }

  # GitHub works out mergeability lazily after a push or a merge; give it a moment.
  for _ in 1 2 3 4 5 6; do
    state=$(jq -r .mergeable <<<"$pr"); [ "$state" = UNKNOWN ] || break
    sleep 10; pr=$(gh pr view "$n" -R "$REPO" --json mergeable,files)
  done
  case "$state" in
    MERGEABLE) ;;
    CONFLICTING) say "#$n left open: it conflicts with main"; return 0 ;;
    *) tell "$n" "$loud" "GitHub could not say whether it merges cleanly ($state). Push again or merge it by hand."; return 0 ;;
  esac

  ahead=$(gh api "repos/$REPO/compare/$sha...main")
  if [ "$(jq -r .ahead_by <<<"$ahead")" != 0 ]; then
    both=$(comm -12 <(jq -r '.files[].path' <<<"$pr" | grep -E "$GENERATED" | sort -u) \
                    <(jq -r '.files[].filename' <<<"$ahead" | grep -E "$GENERATED" | sort -u) | paste -sd, - | sed 's/,/, /g')
    [ -z "$both" ] || { tell "$n" "$loud" "main has changed $both since this branch was cut. Merge main in, regenerate, and push."; return 0; }
  fi

  while read -r stage; do
    [ -n "$stage" ] || continue
    if grep -qs -- "^### $stage " "$MAIN_NOTES"; then
      tell "$n" "$loud" "main already has a $stage note. Renumber this PR's note and push."; return 0
    fi
  done < <(gh pr diff "$n" -R "$REPO" | sed -n 's/^+### \(Stage 10[a-z]*\) .*/\1/p' | sort -u)

  if [ "${DRY_RUN:-}" = 1 ]; then say "#$n would be squash-merged at ${sha:0:7}"; return 0; fi
  gh pr merge "$n" -R "$REPO" --squash --match-head-commit "$sha" && say "#$n squash-merged at ${sha:0:7}" \
    || say "#$n merge refused by GitHub; left open"
  refresh_notes
}

# main's stage headings: CLAUDE.md and every docs/history file, read from GitHub so
# any checkout works. Refreshed after each merge, since that merge may add one.
MAIN_NOTES=$(mktemp)
refresh_notes() {
  : >"$MAIN_NOTES"
  for f in CLAUDE.md $(gh api "repos/$REPO/contents/docs/history?ref=main" --jq '.[] | select(.name | endswith(".md")) | .path'); do
    gh api -H "Accept: application/vnd.github.raw" "repos/$REPO/contents/$f?ref=main" | grep -E '^### Stage ' >>"$MAIN_NOTES" || true
  done
}
refresh_notes

# The PR whose CI just finished first, then every other labelled PR, oldest first.
list=$(gh pr list -R "$REPO" --base main --label "$LABEL" --state open --limit 100 --json number,headRefOid \
  | jq -r --arg sha "${SHA:-}" 'sort_by(.headRefOid != $sha, .number) | .[] | "\(.number) \(.headRefOid)"')
[ -n "$list" ] || { say "no open pull request into main is labelled $LABEL"; exit 0; }
while read -r n sha <&3; do try_merge "$n" "$sha"; done 3<<<"$list"
