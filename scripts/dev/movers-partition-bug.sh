#!/usr/bin/env bash
# VERIFY THE MOVERS CARD'S CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# Stage 10dc. Since #104 Today's movers ranks a name whose share count the
# corporate-action gate has not verified by its exchange % move alone, and
# leaves it out of every rupee figure. The card therefore shows two sets — the
# names it RANKS and the names its money total COVERS — and every one of its
# checks is about keeping the two apart on the face, in the hovers and in the
# totals. Each bug below is applied on its own, rebuilt, swept over the Morning
# CIO routes that draw the card, and restored: every check must PASS the page
# and FAIL it with its bug put back.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and it REBUILDS on the way out:
# restoring the source alone leaves `dist/` at the bugged build for the next run
# to report under the wrong name. A patch that does not apply, or a tree that
# does not build, is reported as NOT A RESULT rather than as a clean run.
#
# RUN IT IN A SEPARATE WORKTREE with its own preview, because for as long as it
# runs the files it patches carry a bug:
#
#   git worktree add ../wt-movers HEAD && ln -s "$PWD/node_modules" ../wt-movers/
#   (cd ../wt-movers && npx vite preview --port 4179 --strictPort &)
#   (cd ../wt-movers && BASE=http://127.0.0.1:4179 bash scripts/dev/movers-partition-bug.sh)
#
# DO NOT EDIT ANY FILE IN `FILES` WHILE THIS RUNS: the restore puts the snapshot
# back, silently undoing the edit. `CASES=2,5` runs only those cases.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-movers-partition-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/components/TodaysMovers.tsx"
  "src/components/DailyMovers.tsx"
  "scripts/check-pages.mjs"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
restore() {
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
  for f in "${FILES[@]}"; do cmp -s "$SNAP/$f" "$f" || echo "!! restore of $f DID NOT TAKE"; done
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

# The routes that serve quotes and so draw the ranked card; the no-feed card;
# and the funds branch, which must not draw the direct-equity card at all.
LIVE=cio-live,cio-live-capture-lag,cio-cached,cio-index-loading,cio-alerts-badge
ALL=cio,$LIVE,cio-movers-funds

put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }

sweep() {
  THEMES=light ONLY="$1" npm run check:pages 2>&1 | grep -aE 'INVARIANT FAILED|INVARIANT NOT CHECKED|^✓|^✗|combinations' | sed 's/^/   /'
}

# run_case <number> <routes> <name> <patch command…>
run_case() {
  local num="$1" routes="$2" name="$3"; shift 3
  if [ -n "${CASES:-}" ] && ! [[ ",$CASES," == *",$num,"* ]]; then return; fi
  echo ""
  echo "════════ BUG $num: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    sweep "$routes"
  fi
  put_back
}

# ONE substitution in one file, which must match exactly once — a patch that
# matched nothing (or twice) is not a result, and says so.
sub() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys
p, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p, encoding="utf-8").read()
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY
}

M=src/components/TodaysMovers.tsx

if [ -z "${CASES:-}" ]; then
  echo "════════ CONTROL: no patch"
  npm run build >/dev/null 2>&1 && sweep "$ALL"
fi

# ── 1 ── #104's amber sentence back on the face
run_case 1 "$LIVE" "the %-only names are a two-sentence paragraph on the face again" \
  sub "$M" \
    '{model.priceOnlyNames.length} name{model.priceOnlyNames.length === 1 ? "" : "s"} {rank === "impact" ? "left out" : "ranked by % move only"} · share count{model.priceOnlyNames.length === 1 ? "" : "s"} unverified' \
    'Share counts await verification for {model.priceOnlyNames.length} names. Their exchange % moves are shown; money impact is withheld.'

# ── 2 ── #104's coverage sentence back on the face
run_case 2 "$LIVE" "the coverage line is #104's sentence again" \
  sub "$M" \
    '{model.impactNames} of {model.distinct} names{clock ? ` · quotes ${clock}` : ""}' \
    '{model.pricedNames} of {model.distinct} names with price changes · {model.impactNames} of {model.distinct} names with verified impact{clock ? ` · quotes ${clock}` : ""}'

# ── 3 ── a rupee figure over an empty set
run_case 3 "cio-cached,cio-live" "the coverage line prints ₹0 of ₹Y held over no verified name" \
  sub "$M" \
    '{model.impactNames > 0 && <>{fmtFromBase(model.movedValue' \
    '{<>{fmtFromBase(model.movedValue'

# ── 4 ── the amber hover stops naming the gate's reason
run_case 4 "cio-live" "the %-only names' hover drops the gate's own reason" \
  sub "$M" \
    '${model.priceOnlyReasons.length ? ` Why: ' \
    '${model.priceOnlyReasons.length > 999 ? ` Why: '

# ── 5 ── the coverage hover stops saying the ranking spans both halves
run_case 5 "cio-live" "the coverage hover drops how many names the % ranking spans" \
  sub "$M" \
    '${model.priceOnlyNames.length ? ` By % move the gainers' \
    '${model.priceOnlyNames.length > 999 ? ` By % move the gainers'

# ── 6 ── the %-only names dropped from the ranking
run_case 6 "cio-live,cio-live-capture-lag" "the %-only names are dropped from the ranking" \
  sub "$M" \
    'const ranked = rank === "impact" ? impactRows : rows;' \
    'const ranked = rank === "impact" ? impactRows : impactRows;'

# ── 7 ── a %-only row prints a measured ₹0. ITS FIRST RUN SWEPT CLEAN: "₹0"
# carries no sign, and the row check matched "+₹…" or "—", so it skipped the row
# rather than failing it. The per-row money-cell check is what catches it now.
run_case 7 "cio-live" "a %-only gainer's money impact prints ₹0" \
  sub "$M" \
    '{fmt(r.dayChange, { compact: true, sign: true })}' \
    '{fmt(r.dayChange ?? 0, { compact: true, sign: true })}'

# ── 8 ── the money total claims every ranked name
run_case 8 "cio-live" "the tile's money total counts the %-only names as covered" \
  sub "$M" \
    'impactNames: impactRows.length,' \
    'impactNames: rows.length,'

# ── 9 ── the no-feed card makes a claim about the BOOK again
run_case 9 "cio" "with no feed, the card says no holding carries a day change" \
  sub "$M" \
    '<p className="text-sm font-medium text-slate-300">Daily price changes are temporarily unavailable</p>' \
    '<p className="text-sm font-medium text-slate-300">No direct-equity holding carries a day change right now</p>'

# ── 10 ── the direct-equity card drawn on the funds branch as well
run_case 10 "cio-movers-funds" "the funds branch draws the direct-equity card too" \
  sub src/components/DailyMovers.tsx \
    '? <NavMovers scopeToggle={toggle} />' \
    '? <><NavMovers scopeToggle={toggle} /><TodaysMovers scopeToggle={toggle} /></>'

# ── 11 ── a gainers total summed over part of the list
run_case 11 "cio-live" "the gainers total sums the verified names and prints it under the full count" \
  sub "$M" \
    'gainSum: gainers.length && gainers.every((r) => r.dayChange !== null) ? gainers.reduce((a, r) => a + r.dayChange!, 0) : null,' \
    'gainSum: gainers.some((r) => r.dayChange !== null) ? gainers.reduce((a, r) => a + (r.dayChange ?? 0), 0) : null,'

# ── 12 ── the gainers total's dash loses its reason
run_case 12 "cio-live" "the gainers total is a bare dash with no reason" \
  sub "$M" \
    'title={`No total: ' \
    'data-gone={`No total: '

# ── 13 ── the tile's label stops naming its scope
run_case 13 "cio-live" "the day-move tile's label drops Direct Equity" \
  sub "$M" \
    '<div className="label-xs">{SCOPE.label} &middot; {sessionLabel}</div>' \
    '<div className="label-xs">{sessionLabel}</div>'

# ── 14 ── a %-only row's dash loses its reason
run_case 14 "cio-live" "a %-only row's money dash names no reason" \
  sub "$M" \
    'data-mover-cell="impact" title={r.dayChange === null' \
    'data-mover-cell="impact" data-gone={r.dayChange === null'

# ── 15 ── every row's money impact a dash, verified names included
run_case 15 "cio-live" "every row's money impact is drawn as a dash" \
  sub "$M" \
    '{fmt(r.dayChange, { compact: true, sign: true })}' \
    '{fmt(null, { compact: true, sign: true })}'

echo ""
echo "════════ DONE"
