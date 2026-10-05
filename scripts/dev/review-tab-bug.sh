#!/usr/bin/env bash
# VERIFY THE MOPWM REVIEW TAB'S CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# The family asked for Private Market to show the private-market data in their
# consolidated review (MOPWM, 30 June 2026), "making sure nothing is missed and
# there are no logical or calculation errors" (Stage 10dg). `check:pages` holds
# the tab to the workbook and to its own arithmetic on `private-market-review`,
# and `reviewPrivate.test.ts` holds the generated module to the workbook. A check
# nobody has watched fail is a check nobody knows can fail, so each bug below is
# applied on its own, rebuilt, checked by the layer that can see it, and restored.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and it REBUILDS on the way out:
# restoring the source alone leaves `dist/` at the bugged build for the next run
# to report under the wrong name. A patch that does not apply, or a tree that
# does not build, is reported as NOT A RESULT rather than as a clean run.
#
# DO NOT EDIT ANY FILE IN `FILES` WHILE THIS RUNS: the restore puts the snapshot
# back, silently undoing the edit. `BASE` is passed through to the sweep, so a
# preview on another port can be swept (`BASE=http://127.0.0.1:4179`).
# `CASES=3,7` runs chosen cases; the control always runs first.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-review-tab-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/components/ReviewPrivateTable.tsx"
  "src/pages/PrivateMarket.tsx"
  "scripts/build-review-private.mjs"
  "src/data/reviewPrivate.ts"
  "docs/REVIEW-PRIVATE-MARKET.md"
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

ROUTES=private-market-review
ALL_PM=private-market,private-market-owners,private-market-transactions,private-market-review
WANT="${CASES:-}"

put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }

sweep() {
  ONLY="$1" npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | grep -v 'NOT CHECKED' | sed 's/^/   /'
}

# The review suite on its own, bundled exactly as `test:family` bundles it.
suite() {
  local d; d=$(mktemp -d node_modules/.glow-review-bug-XXXX)
  if ! node_modules/.bin/esbuild src/lib/__tests__/reviewPrivate.test.ts --bundle --platform=node --format=esm \
       --outfile="$d/t.mjs" --packages=external --alias:@=src --log-level=error; then
    echo "   NOT A RESULT — the suite does not bundle"; rm -rf "$d"; return
  fi
  local out; out=$(GLOW_FIXTURES="$PWD/src/lib/__tests__/fixtures" node "$d/t.mjs" 2>&1); local st=$?
  rm -rf "$d"
  if [ $st -eq 0 ]; then echo "   SUITE clean"; else echo "$out" | grep -E '^\s*FAIL' | sed 's/^/   SUITE /'; fi
}

N=0
# run_case <name> <routes|-> <regen:0|1> <suite:0|1> <patch command…>
run_case() {
  N=$((N+1))
  local name="$1" routes="$2" regen="$3" st="$4"; shift 4
  if [ -n "$WANT" ] && ! echo ",$WANT," | grep -q ",$N,"; then return; fi
  echo ""
  echo "════════ BUG $N: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if [ "$regen" = 1 ] && ! npm run build-review-private >/dev/null 2>&1; then
    echo "   NOT A RESULT — the generator did not run"; put_back; return
  fi
  [ "$st" = 1 ] && suite
  if [ "$routes" != "-" ]; then
    if ! npm run build >/dev/null 2>&1; then echo "   NOT A RESULT — the bugged tree does not build"
    else sweep "$routes"; fi
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

T=src/components/ReviewPrivateTable.tsx

echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && sweep "$ALL_PM"
suite

# ── 1 ── a block draws one line fewer than it carries
run_case "each block draws one line fewer than it carries" $ROUTES 0 0 \
  sub $T '{open && rows.map((r, i) => lineRow(r, i, rows.length))}' '{open && rows.slice(1).map((r, i) => lineRow(r, i, rows.length))}'

# ── 2 ── a line goes missing CONSISTENTLY: the block, its band and the footer all
#          agree with each other, so only the workbook can say a line is gone
lose_line() {
  sub $T '  const lineSections = d.sections;' '  const lineSections = d.sections.map((s) => (s.key === "at-cost" ? { ...s, rows: s.rows.slice(1) } : s));' \
  && sub $T '  const all = useMemo(() => allReviewRows(d), [d]);' '  const all = useMemo(() => lineSections.flatMap((s) => s.rows), [lineSections]);'
}
run_case "an at-cost line is dropped everywhere at once" $ROUTES 0 0 lose_line

# ── 3 ── the return printed on the review's cost, whatever the line's basis
run_case "a return is printed on the review's cost rather than on what was paid in" $ROUTES 0 0 \
  sub $T '{pct(r.ret)}{rateCell(r.ret, r.reviewRet, 0.0001, "return")}' '{pct(r.invested && r.gain !== null ? r.gain / r.invested : r.ret)}{rateCell(r.ret, r.reviewRet, 0.0001, "return")}'

# ── 4 ── a rate compounded onto a year the money has not seen
run_case "a sub-year XIRR is shown" $ROUTES 0 0 \
  sub $T 'days !== null && days < YEAR_DAYS) {' 'days !== null && days < 0) {'

# ── 5 ── the review's own figure differs and nothing says so
run_case "the ≠ marker is never drawn" $ROUTES 0 0 \
  sub $T 'mine !== null && printed !== null && Math.abs(mine - printed) > tol' 'tol < 0 && mine !== null && printed !== null && Math.abs(mine - printed) > tol'

# ── 6 ── a figure the review does not print reads ₹0
run_case "an absent figure renders ₹0" $ROUTES 0 0 \
  sub $T '? <td className="px-4 py-2 text-right"><AbsentCell reason={opts.why} /></td>' '? <td className="mono px-4 py-2 text-right">{money(0)}</td>'

# ── 7 ── a written-off line reads as a missing value
run_case "a written-off line's measured ₹0 renders as an absence" $ROUTES 0 0 \
  sub $T 'title="Written off on the review: a measured ₹0, not a missing figure.">{money(0)}</td>' 'title="Written off on the review: a measured ₹0, not a missing figure."><AbsentCell reason="no value" /></td>'

# ── 8 ── the members band open on arrival
run_case "the members band is open on arrival" $ROUTES 0 0 \
  sub $T '  const bands = useExpanded(lineSections.map((s) => s.key));' '  const bands = useExpanded([...lineSections.map((s) => s.key), "members"]);'

# ── 9 ── the footer struck on one block
run_case "the footer totals one block, not the table" $ROUTES 0 0 \
  sub $T '  const foot = useMemo(() => reviewTotals(all), [all]);' '  const foot = useMemo(() => reviewTotals(lineSections[0].rows), [lineSections]);'

# ── 10 ── a band totals part of its block
run_case "a band totals only its first line" $ROUTES 0 0 \
  sub $T '    const t = reviewTotals(s.rows);' '    const t = reviewTotals(s.rows.slice(0, 1));'

# ── 11 ── the review tab drawn under the funds table too
run_case "the funds table is drawn on the review tab as well" $ROUTES 0 0 \
  sub src/pages/PrivateMarket.tsx '        {(view === "funds" || view === "owners") && (
          <div className="overflow-x-auto">' '        {view !== "transactions" && (
          <div className="overflow-x-auto">'

# ── 12 ── the tab missing from the control
run_case "the review tab is not offered" $ALL_PM 0 0 \
  sub src/pages/PrivateMarket.tsx '    key: "review", label: "MOPWM review",' '    key: "review-off", label: "MOPWM review",'

# ── 13 ── the GENERATOR strikes a gain without what was paid back
run_case "the generator leaves what was paid back out of a gain" $ROUTES 1 1 \
  sub scripts/build-review-private.mjs 'r2(l.value + (paidBack ?? 0) - base)' 'r2(l.value - base)'

# ── 14 ── the GENERATOR reads a fund's cost out of its value column
run_case "the generator takes a line's cost from its market value" $ROUTES 1 1 \
  sub scripts/build-review-private.mjs 'invested: l.cost, paidIn, paidBack, value: l.value' 'invested: l.value, paidIn, paidBack, value: l.value'

echo ""
echo "════════ done"
