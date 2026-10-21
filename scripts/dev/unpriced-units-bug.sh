#!/usr/bin/env bash
# VERIFY A-17's CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# Two kinds of units no statement prices reach the live book: a depository's
# closing balance on an account that sent no holding statement, and units a
# holding statement records and prints no rate for (ABSL Balanced Advantage,
# priced by a sibling statement at the same depository). Every caption must
# name which, and Family & Entities must list, per valued account, the lines its
# statement records with a quantity and no value — never one the live book
# values at AMFI's NAV. Each bug below is applied on its own, rebuilt, swept over
# the routes it touches and restored: every check must PASS the page and FAIL
# the page with its bug put back.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and it REBUILDS on the way out:
# restoring the source alone leaves `dist/` at the bugged build for the next run
# to report under the wrong name. A patch that does not apply, or a tree that
# does not build, is reported as NOT A RESULT rather than as a clean run.
#
# DO NOT EDIT ANY FILE IN `FILES` WHILE THIS RUNS: the restore puts the snapshot
# back, silently undoing the edit. `BASE` is passed through to the sweep (a
# preview on another port: `BASE=http://127.0.0.1:4195`), and `CASES=2,5` runs
# only those cases.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-unpriced-units-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/lib/fundNavs.ts"
  "src/pages/FamilyEntities.tsx"
  "src/pages/HoldingsBehind.tsx"
  "src/pages/PortfolioMonitor.tsx"
  "src/pages/StockInfo.tsx"
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

FAM=family-unvalued-lines,family-partial
ALL=stock-unpriced,family-unvalued-lines,family-partial,monitor-open-all,holdings-book

put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }

sweep() {
  THEMES=light ONLY="$1" npm run check:pages 2>&1 | grep -aE 'INVARIANT FAILED|^✓|^✗|combinations' | sed 's/^/   /'
}
suite() {
  npm run test:family 2>&1 | tr -d '\000' | grep -aE '^FAIL|^✗|failed' | head -20 | sed 's/^/   suite: /'
  echo "   suite exit: ${PIPESTATUS[0]}"
}

# run_case <number> <routes> <suite:yes|no> <name> <patch command…>
run_case() {
  local num="$1" routes="$2" withSuite="$3" name="$4"; shift 4
  if [ -n "${CASES:-}" ] && ! [[ ",$CASES," == *",$num,"* ]]; then return; fi
  echo ""
  echo "════════ BUG $num: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    sweep "$routes"
    [ "$withSuite" = yes ] && suite
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

if [ -z "${CASES:-}" ]; then
  echo "════════ CONTROL: no patch"
  npm run build >/dev/null 2>&1 && sweep "$ALL"
fi

# ── 1 ── a line the live book values at AMFI's NAV listed on an "in no total" card
run_case 1 "$FAM" no "the card lists a line the live book values at AMFI's NAV" \
  sub src/pages/FamilyEntities.tsx \
    'lines: g.lines.filter((l) => !l.valuedLive) }))' \
    'lines: g.lines }))'

# ── 2 ── an account's lines dropped from the card
run_case 2 "$FAM" no "the card drops an account whose statement records lines nothing values" \
  sub src/pages/FamilyEntities.tsx \
    '.filter((g) => g.lines.length > 0);' \
    '.filter((g, i) => g.lines.length > 0 && i > 0);'

# ── 3 ── the summary's hover stops saying a line is valued at AMFI's NAV
run_case 3 "$FAM" no "the hover stops naming the line valued at AMFI's published NAV" \
  sub src/pages/FamilyEntities.tsx \
    "valued here at AMFI's published NAV" \
    "valued here"

# ── 4 ── the summary counts the live line as not valued
run_case 4 "$FAM" no "the summary counts a line valued live as not valued" \
  sub src/pages/FamilyEntities.tsx \
    '{`${notValued} held, not valued`}' \
    '{`${notValued + live} held, not valued`}'

# ── 5 ── the depository's copies of fund units are no longer counted
run_case 5 "$FAM" no "the depository's copies of units a fund reports are not counted" \
  sub src/pages/FamilyEntities.tsx \
    'data-unvalued-lines-elsewhere={g.reportedElsewhere}' \
    'data-unvalued-lines-elsewhere={0}'

# ── 6 ── a line loses its reason
run_case 6 "$FAM" no "an unvalued line loses the reason in its hover" \
  sub src/pages/FamilyEntities.tsx \
    'title={l.row.reason ?? undefined}' \
    'title={undefined}'

# ── 7 ── the no-rate sentence stops saying what the statement did
run_case 7 "stock-unpriced,monitor-open-all" yes "the no-rate sentence stops saying the statement records the units and prints no rate" \
  sub src/lib/fundNavs.ts \
    'records and prints no rate for —' \
    'reports without a rate —'

# ── 8 ── the no-rate sentence stops naming its witness
run_case 8 "stock-unpriced,monitor-open-all" yes "the no-rate sentence stops naming the statement that prices the scheme" \
  sub src/lib/fundNavs.ts \
    'const witness = w ? `${w.owner}'"'"'s ${w.provider} ${w.accountNo}` : "another account at the same depository";' \
    'const witness = "another account at the same depository";'

# ── 9 ── a no-rate row described as a closing balance on an account with no holding statement
run_case 9 "$ALL" yes "a no-rate row is described as an account that sent no holding statement" \
  sub src/lib/fundNavs.ts \
    'if (d.kind === "no-rate") {' \
    'if (d.kind === "no-rate" && d.asOf === "never") {'

# ── 10 ── the price tile back to the hard-coded closing-balance sentence
run_case 10 "stock-unpriced" no "the price tile says the account sent no holding statement" \
  sub src/pages/StockInfo.tsx \
    '${depositoryUnitsGist(rows)}, so no statement prices them.' \
    'a depository'"'"'s own closing balance, on an account that sent no holding statement, so no statement prices them.'

# ── 11 ── /holdings back to the hard-coded closing-balance sentence
run_case 11 "holdings-book" no "/holdings says every unpriced row is an account with no holding statement" \
  sub src/pages/HoldingsBehind.tsx \
    '${depositoryUnitsGist(depositoryRows)}' \
    'a depository'"'"'s own closing units on an account that sent a transaction statement and no holding statement'

# ── 12 ── the Monitor's statement line back to the hard-coded closing-balance sentence
run_case 12 "monitor-open-all" no "the Monitor's line says every unpriced line is an account with no holding statement" \
  sub src/pages/PortfolioMonitor.tsx \
    '? ` No statement priced these units: they are ${v.depositoryWhy}.`' \
    '? ` These units are a depository'"'"'s own closing balance of ${v.depositoryAsOf}, on an account that sent a transaction statement and no holding statement — no statement priced them.`'

# ── 13 ── THE CHECKER'S OWN DEFECT: a route naming the member by id resolves to
# nobody, so the card's claims expect nothing — the fix that made family-partial
# pass must be load-bearing, or those claims describe no member at all.
run_case 13 "$FAM" no "the checker resolves a route's member by display name only" \
  sub scripts/check-pages.mjs \
    'const unpricedOwnerOf = (ctx) => { const e = entityOfRoute(ctx); return UNPRICED_BOOK?.nameOf?.get(e) ?? e; };' \
    'const unpricedOwnerOf = (ctx) => entityOfRoute(ctx);'
