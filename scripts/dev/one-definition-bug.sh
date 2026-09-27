#!/usr/bin/env bash
# VERIFY STAGE 10cv's ONE-DEFINITION CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# Four figures had two answers on two surfaces: what a side of the book is
# (marketSides against SIDE_NOTE, CK-C5), a mandate share's sector (the row's own
# statement against the shared tiers, DSM-C9), whether an account is "redeemed"
# (a bare word against the NAV card's measured nil) and what the Excel export is
# handed (the loader's rows against its whole answer, MSX-19). One more is a
# check that was written before Stage 10ct counted each capital account once
# and failed a correct card (CK-C12). Each bug below is applied on its own,
# rebuilt, run against the layer that guards it and restored: every check must
# PASS the tree as committed and FAIL with its bug put back.
#
# THE RESTORE IS BY COPY AND ON A TRAP, it is VERIFIED with `cmp`, and it
# REBUILDS on the way out: restoring the source alone leaves `dist/` at the
# bugged build for the next run to report under the wrong name. A patch that
# does not apply, or a tree that does not build, is reported as NOT A RESULT
# rather than as a clean run.
#
# DO NOT EDIT ANY FILE IN `FILES` WHILE THIS RUNS: the restore puts the snapshot
# back, silently undoing the edit. `BASE` is passed through to the sweep (a
# preview on another port: `BASE=http://127.0.0.1:4199`), and `CASES=2,5` runs
# only those cases.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-one-definition-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/lib/analytics.ts"
  "src/lib/drilldown.ts"
  "src/lib/aifCategory.ts"
  "src/pages/PortfolioMonitor.tsx"
  "src/pages/MandateHoldings.tsx"
  "src/pages/MorningCIO.tsx"
  "src/pages/HoldingsBehind.tsx"
  "src/pages/CapitalGains.tsx"
  "src/pages/StockInfo.tsx"
  "src/lib/statementNotes.ts"
  "scripts/check-pages.mjs"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
put_back() {
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
  for f in "${FILES[@]}"; do cmp -s "$SNAP/$f" "$f" || echo "!! restore of $f DID NOT TAKE"; done
}
restore() {
  put_back
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

SIDES=upload,history,holdings-book,cio-allocation
MANDATES=mandate,mandate-sector,mandate-fifo
CG=capital-gains,capital-gains-missing
NOTES=stock-pretax,monitor
DROPS=cio-allocation,holdings-row-1,holdings-row-3,holdings-aif,holdings-winners,holdings-listed,holdings-book

sweep() {
  THEMES=light ONLY="$1" npm run check:pages 2>&1 | tr -d '\000' \
    | grep -aE 'INVARIANT FAILED|INVARIANTS has two|^✓|^✗|combinations' | sed 's/^/   /'
}
suite() {
  npm run test:family > "$SNAP/suite.txt" 2>&1
  local rc=$?
  tr -d '\000' < "$SNAP/suite.txt" | grep -aE '^(FAIL|✗)' | head -20 | sed 's/^/   suite: /'
  echo "   suite exit: $rc"
}

# run_case <number> <routes|-> <suite:yes|no> <name> <patch command…>
run_case() {
  local num="$1" routes="$2" withSuite="$3" name="$4"; shift 4
  if [ -n "${CASES:-}" ] && ! [[ ",$CASES," == *",$num,"* ]]; then return; fi
  echo ""
  echo "════════ BUG $num: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if [ "$routes" != "-" ]; then
    if ! npm run build >/dev/null 2>&1; then
      echo "   NOT A RESULT — the bugged tree does not build"
      put_back; return
    fi
    sweep "$routes"
  elif ! npx tsc -b >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not typecheck"
    put_back; return
  fi
  [ "$withSuite" = yes ] && suite
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

# SEVERAL substitutions in one file, each of which must match exactly once:
# `subs <file> <old1> <new1> <old2> <new2> …`.
subs() {
  python3 - "$@" <<'PY'
import sys
p, pairs = sys.argv[1], sys.argv[2:]
s = open(p, encoding="utf-8").read()
for old, new in zip(pairs[::2], pairs[1::2]):
    if s.count(old) != 1: sys.exit(1)
    s = s.replace(old, new, 1)
open(p, "w", encoding="utf-8").write(s)
PY
}

# The side reasons as marketSides printed them before this stage — the SEBI
# category alone placing a fund, the rule before Stage 10bw.
OLD_LISTED='Money invested in listed markets — company shares, mutual funds, ETFs, cash, and the Category III AIFs whose own statements say they trade listed securities.'
OLD_PRIVATE='Private capital — unlisted holdings, structured products, and the AIFs whose statements print Category I or II or name their own discipline as private equity or venture.'
OLD_UNPLACED='No statement for these funds prints a SEBI category, so this book places them on neither side. They are in the total and on neither half of it.'

if [ -z "${CASES:-}" ]; then
  echo "════════ CONTROL: no patch"
  if npm run build >/dev/null 2>&1; then sweep "$SIDES,$MANDATES,$DROPS,$CG,$NOTES"; else echo "   the committed tree does not build"; fi
  suite
fi

# ── 1 ── marketSides' listed reason back to the category-alone rule (CK-C5)
run_case 1 "$SIDES" yes "Upload History and Data Refresh explain the listed side by the SEBI category alone again" \
  sub src/lib/analytics.ts \
    '{ key: "listed", label: "Listed", value: s.listed, why: SIDE_NOTE.listed },' \
    "{ key: \"listed\", label: \"Listed\", value: s.listed, why: \"$OLD_LISTED\" },"

# ── 2 ── a second copy of the side reasons, in the drill-down, on the old rule
run_case 2 "$SIDES" yes "the drill-down carries its own copy of the side reasons again, on the old rule" \
  subs src/lib/drilldown.ts \
    'isUnplacedSide, SIDE_NOTE, sum }' 'isUnplacedSide, sum }' \
    'export { SIDE_NOTE };' \
    "export const SIDE_NOTE = { listed: \"$OLD_LISTED\", private: \"$OLD_PRIVATE\", unplaced: \"$OLD_UNPLACED\" } as const;"

# ── 3 ── the not-placed reason stops saying the family have not classified the fund
run_case 3 "$SIDES" yes "the not-placed reason says only that no statement prints a category" \
  sub src/lib/analytics.ts \
    '{ key: "unplaced", label: "Not placed", value: s.unplaced, why: SIDE_NOTE.unplaced },' \
    "{ key: \"unplaced\", label: \"Not placed\", value: s.unplaced, why: \"$OLD_UNPLACED\" },"

# ── 4 ── the mandate page's Sector column back on the row's own statement (DSM-C9)
run_case 4 "$MANDATES" no "the mandate Sector column reads the row's own statement again" \
  sub src/pages/MandateHoldings.tsx \
    'isCompanyShare(r) ? companySectors.get(r.securityKey)?.sector || UNCLASSIFIED_SECTOR : r.sector;' \
    'isCompanyShare(r) ? (r.sector || companySectors.get(r.securityKey)?.sector || UNCLASSIFIED_SECTOR) : r.sector;'

# ── 5 ── the cell's text is the statement's while its handle says the shared sector
run_case 5 "$MANDATES" no "the Sector cell prints the statement's sector under the shared one's handle" \
  sub src/pages/MandateHoldings.tsx \
    'data-mandate-sector-key={r.securityKey}>{sectorOf(r)}</span>}' \
    'data-mandate-sector-key={r.securityKey}>{r.sector}</span>}'

# ── 6 ── "redeemed" is any reason that says the word again
run_case 6 - yes "the drill-downs call any reason saying \"redeemed\" a measured nil" \
  sub src/lib/aifCategory.ts \
    'if (isMeasuredNilAccount({ noPositionsReason: r })) return "redeemed";' \
    'if (/redeemed/i.test(r) || isMeasuredNilAccount({ noPositionsReason: r })) return "redeemed";'

# ── 7 ── the Excel export handed the loader's rows alone again (MSX-19)
run_case 7 - yes "the Monitor's Export hands the sheet the tape's rows, not the loader's answer" \
  sub src/pages/PortfolioMonitor.tsx \
    'await exportPortfolioExcel(positions, portfolio.accounts, data);' \
    'await exportPortfolioExcel(positions, portfolio.accounts, data?.txns ?? []);'

# ── 8 ── Capital deployment's committed on the register as printed (CK-C12)
run_case 8 "cio-allocation" no "the card's committed counts the second Transition Venture trust again" \
  sub src/pages/MorningCIO.tsx \
    'committed: sum(counted.map((c) => c.committed)) + fundDeploy.committed,' \
    'committed: sum(commitments.map((c) => c.committed)) + fundDeploy.committed,'

# ── 9 ── THE CHECKER'S OWN DEFECT: CK-C12's check on the register as printed.
# Put back, it must FAIL the correct card — the fix is what lets it pass.
run_case 9 "cio-allocation" no "the CK-C12 check compares the card with the register as printed" \
  sub scripts/check-pages.mjs \
    'const committed = CAPITAL_BOOK.once?.committedCr ?? CAPITAL_BOOK.committedCr;' \
    'const committed = CAPITAL_BOOK.committedCr;'

# ── 10 ── every drill-down counts the BOOK's closed and sub-₹1,000 rows (XP-13)
run_case 10 "$DROPS" no "each drill-down's footer counts the whole book's dropped rows again" \
  subs src/lib/drilldown.ts \
    'const negligible = d.negligible.filter(belongs);' 'const negligible = d.negligible;' \
    'closedExcluded: d.closed.filter(belongs).length,' 'closedExcluded: d.closed.length,'

# ── 11 ── the footer loses the handle the count is read by — a finding, never an abstention
run_case 11 "$DROPS" no "the footer's dropped-row handle is gone" \
  sub src/pages/HoldingsBehind.tsx \
    'data-hb-closed={closedExcluded} ' ''

# ── 12 ── the Lots total prints an account count again (XP-16)
run_case 12 "$CG" no "the Capital Gains Lots total says \"7 of 51 accounts\" again" \
  sub src/pages/CapitalGains.tsx \
    'data-cg-foot-lots={footLots}>{footLots}</td>,' \
    'data-cg-foot-lots={footLots}>{reported.length} of {cg.length} accounts</td>,'

# ── 13 ── the missing-data band opens on arrival — its checks must RUN to catch it
run_case 13 "$CG" no "the no-statement band is open on arrival" \
  sub src/pages/CapitalGains.tsx \
    'const [missingOpen, setMissingOpen] = useState(false);' \
    'const [missingOpen, setMissingOpen] = useState(true);'

# ── 14 ── a second block under one route key: the checker must refuse to run
run_case 14 "$CG" no "INVARIANTS gains a second \"capital-gains\" block" \
  sub scripts/check-pages.mjs \
    'const INVARIANTS = {
' \
    'const INVARIANTS = {
  "capital-gains": [],
'

# ── 15 ── the price tile keeps the note in its hover and drops it from its line (VD-16)
run_case 15 "stock-pretax" no "the price tile no longer says pre-tax NAV on its face" \
  sub src/pages/StockInfo.tsx \
    '{priceNote.line}{markNote ? ` · ${markNote.short}` : ""}</span>}' \
    '{priceNote.line}</span>}'

# ── 16 ── a clubbed fund row's price dash drops the note (VD-16)
run_case 16 "monitor" no "Sanshi's clubbed row no longer says its mark is pre-tax" \
  sub src/pages/PortfolioMonitor.tsx \
    'reason={`${statementNoteForSet(r.trancheSet)?.note ? `${statementNoteForSet(r.trancheSet)!.note} ` : ""}Each unit class' \
    'reason={`Each unit class'

# ── 17 ── the pledge note cites words its statement does not print (VD-18)
run_case 17 - yes "the pledge note's citation no longer matches its statement" \
  sub src/lib/statementNotes.ts \
    '"ABSL LIQF D-GROWTH 0.000 264720.521"' \
    '"ABSL LIQF D-GROWTH 264720.521 0.000"'

# ── 18 ── the not-live marker's hover drops the note (VD-18)
run_case 18 "monitor" no "the pledged cash line's marker no longer says it is pledged" \
  sub src/pages/PortfolioMonitor.tsx \
    'title={(statementNoteForSet(r.trancheSet)?.note ? `${statementNoteForSet(r.trancheSet)!.note} ` : "") + (r.navPriced' \
    'title={(r.navPriced'
