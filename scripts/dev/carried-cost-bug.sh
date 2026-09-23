#!/usr/bin/env bash
# VERIFY THE CARRIED-COST CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# Buoyant moved both family folios from Class A1 into Class A4 and its
# statements restate the cost at the switch-day NAV; the book carries what was
# PAID through the switch (Stage 10br). Each bug below is applied on its own,
# rebuilt, run against the check that should catch it, and restored — the
# discipline `txn-merge-bug.sh` and `polycab-bug.sh` already follow, and for the
# same reasons, which are not repeated at length here:
#
#   * THE RESTORE IS BY COPY AND ON A TRAP. Several of these files are new and
#     untracked, where `git checkout --` silently does nothing.
#   * IT REBUILDS ON THE WAY OUT, or `dist/` is left at the last bugged build.
#   * A PATCH THAT DOES NOT APPLY, OR A TREE THAT DOES NOT BUILD, IS "NOT A
#     RESULT" — never a clean run.
#   * THE SUITE VERDICT IS THE SUITE'S OWN EXIT STATUS, never a grep over its
#     output (which carries NUL bytes and reads as binary).
#
# Three kinds of case, because the claims live at three layers:
#   page   — rebuilt and swept on the five routes that carry the claims;
#   book   — `build-book` re-run, then the book-anchored suites;
#   ingest — the reader and the carry machinery, against their own suites.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-carried-cost-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/pages/PortfolioMonitor.tsx"
  "src/pages/StockInfo.tsx"
  "src/lib/tranches.ts"
  "scripts/build-book.mjs"
  "scripts/lib/classSwitch.mjs"
  "scripts/ingest/providers/altFundStatements.mjs"
  "src/lib/txnAxis.ts"
  "src/data/glowData.ts"
  "docs/BOOK-REPORT.md"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
put_back() {
  for f in "${FILES[@]}"; do
    cp "$SNAP/$f" "$f"
    cmp -s "$SNAP/$f" "$f" || echo "!! $f did not restore"
  done
}
restore() {
  put_back
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

# ...and two Transactions routes, because funding Buoyant's record put its two
# folios on that card, where an empty cash line once filed them under "not stated".
ROUTES=monitor,monitor-tranche,monitor-tranche-switch,monitor-tranche-shared,stock-carried,monitor-txns,monitor-txn-basket

run_page_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG (page): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    ONLY=$ROUTES npm run check:pages 2>&1 | tr -d '\000' | grep -aE 'INVARIANT|NOT CHECKED|^✓|^✗' | sed 's/^/   /'
  fi
  put_back
}

# The two book-anchored suites, bundled the way `test-family.mjs` bundles them.
run_book_suites() {
  local dir rc=0
  dir=$(mktemp -d -p node_modules)
  for t in carriedCost tranches; do
    ./node_modules/.bin/esbuild "src/lib/__tests__/$t.test.ts" --bundle --platform=node --format=esm \
      --outfile="$dir/$t.mjs" --packages=external "--alias:@=$PWD/src" --log-level=error || { rc=1; continue; }
    local out r
    out=$(GLOW_FIXTURES="$PWD/src/lib/__tests__/fixtures" node "$dir/$t.mjs" 2>&1); r=$?
    if [ $r -eq 0 ]; then echo "   SUITE $t clean"; else
      rc=1; printf '%s\n' "$out" | tr -d '\000' | grep -aE '^FAIL' | head -8 | sed "s/^/   SUITE $t /"
    fi
  done
  rm -rf "$dir"
  return $rc
}

run_book_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG (book): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build-book >/dev/null 2>&1; then
    echo "   NOT A RESULT — build-book failed on the bugged tree"
  elif run_book_suites; then
    echo "   BOOK SUITES CLEAN — THE BUG DID NOT FIRE"
  fi
  put_back
}

run_ingest_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG (ingest): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  local out rc
  out=$(node scripts/ingest/__tests__/run.mjs 2>&1); rc=$?
  if [ $rc -eq 0 ]; then echo "   INGEST SUITES CLEAN — THE BUG DID NOT FIRE"; else
    printf '%s\n' "$out" | tr -d '\000' | grep -aE '^\s+(FAIL|PASS)' | sed 's/^/   /'
  fi
  put_back
}

py() { python3 - "$@"; }

echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && ONLY=$ROUTES npm run check:pages 2>&1 | tr -d '\000' | grep -aE 'INVARIANT|NOT CHECKED|^✓|^✗' | sed 's/^/   /'
run_book_suites >/dev/null && echo "   book suites clean" || echo "   !! book suites FAIL on the unpatched tree"
node scripts/ingest/__tests__/run.mjs >/dev/null 2>&1 && echo "   ingest suites clean" || echo "   !! ingest suites FAIL on the unpatched tree"

# ── page ────────────────────────────────────────────────────────────────────
run_page_case "the Invested cell stops saying its cost was carried" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = '${carriedWhy ? ` ${carriedWhy}` : ""}'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

run_page_case "the row shows the statement's restated cost again" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = "        const cost = sumOrNull(dps.map((x) => x.costBasis));"
new = "        const cost = sumOrNull(dps.map((x) => x.printedCostBasis ?? x.costBasis));"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_page_case "a switched contribution loses its mark" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = "data-tranche-switched={t.move.carriedFrom?.switchedOn ?? undefined}"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "data-tranche-switched={undefined}", 1))
PY

run_page_case "the NAV a switched row was bought at becomes the restated one" py <<'PY'
import sys
p = "src/lib/tranches.ts"
s = open(p, encoding="utf-8").read()
old = "t.move.carriedFrom && t.move.carriedFrom.units > 0 ? t.invested / t.move.carriedFrom.units : null;"
new = "t.move.carriedFrom && t.move.carriedFrom.units > 0 ? t.navAtEntry : null;"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_page_case "the panel stops saying what a switched row is" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
a = s.find("statement prints{tranches.rows.some((t) => t.move.carriedFrom) && <>")
b = s.find("</>}. A contribution held a year or more", a)
if a < 0 or b < 0: sys.exit(1)
s = s[:a] + "statement prints" + s[b + len("</>}"):]
open(p, "w", encoding="utf-8").write(s)
PY

run_page_case "a tranche's HPR attribute carries the printed (maybe annualised) figure" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = "data-tranche-hpr={t.returnPct}"
new = 'data-tranche-hpr={t.ret.kind === "absent" ? undefined : t.ret.pct}'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_page_case "the company page's Avg cost tile forgets its basis" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '''            : carried ? <span title={carriedWhy} data-stock-cost-carried={carried.paid}>invested {money(cost)} &middot; as paid, across a class switch</span>
'''
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

run_page_case "the company page's per-account cell forgets its hover" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '''                          ? <span title={carriedCostNote(carriedCostOf([r], BOOK_POSITION_TRANCHES)!, (v) => money(v))}>{money(r.costBasis)}</span>'''
new = '''                          ? <span>{money(r.costBasis)}</span>'''
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_page_case "an empty cash sleeve makes a funded account mixed again" py <<'PY'
import sys
p = "src/lib/txnAxis.ts"
s = open(p, encoding="utf-8").read()
old = "    const keys = new Set((held.length ? held : all).map((p) => groupKeyFor(axis, idx, p)));"
new = "    const keys = new Set(all.map((p) => groupKeyFor(axis, idx, p)));"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── book ────────────────────────────────────────────────────────────────────
run_book_case "the cost is never carried through the switch" py <<'PY'
import sys
p = "scripts/build-book.mjs"
s = open(p, encoding="utf-8").read()
old = "  carryCostThroughSwitches(positions, positionTranches, reclassifications, accountBridges, notes);\n"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

run_book_case "the lots are carried unit for unit, ignoring the switch ratio" py <<'PY'
import sys
p = "scripts/lib/classSwitch.mjs"
s = open(p, encoding="utf-8").read()
old = "    const ratio = s.toUnits / s.fromUnits;"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "    const ratio = 1;", 1))
PY

run_book_case "a carried lot takes the switch-day value as what it cost" py <<'PY'
import sys
p = "scripts/lib/classSwitch.mjs"
s = open(p, encoding="utf-8").read()
old = "      units: Math.round(m.units * ratio * 1e4) / 1e4,\n"
new = old + "      invested: Math.round(m.invested * (s.amount / sum(moved.map((x) => x.invested))) * 100) / 100,\n"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── ingest ──────────────────────────────────────────────────────────────────
run_ingest_case "gate A — the printed cost is not reconciled to the allotments" py <<'PY'
import sys
p = "scripts/lib/classSwitch.mjs"
s = open(p, encoding="utf-8").read()
old = "    if (Math.abs(allotments - p.costBasis) > 1) {"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "    if (false && Math.abs(allotments - p.costBasis) > 1) {", 1))
PY

run_ingest_case "gate B — the restated gap is not held to the appraisal's Realized Gain" py <<'PY'
import sys
p = "scripts/lib/classSwitch.mjs"
s = open(p, encoding="utf-8").read()
old = "    if (alone && bridge && Math.abs(bridge.realized - gap) > 1) {"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "    if (false && alone && bridge && Math.abs(bridge.realized - gap) > 1) {", 1))
PY

run_ingest_case "the deposits are not held to the statement's Capital Invested" py <<'PY'
import sys
p = "scripts/ingest/providers/altFundStatements.mjs"
s = open(p, encoding="utf-8").read()
old = "    if (Math.abs(total - n(invested[1])) > 1) {"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "    if (false && Math.abs(total - n(invested[1])) > 1) {", 1))
PY

run_ingest_case "a class switch is published as money in and out" py <<'PY'
import sys
p = "scripts/ingest/providers/altFundStatements.mjs"
s = open(p, encoding="utf-8").read()
old = '''        kind: "reclassification", amount: -out.amount, units: -out.units,'''
new = '''        kind: "withdrawal", amount: -out.amount, units: -out.units,'''
if s.count(old) != 1: sys.exit(1)
s = s.replace(old, new, 1)
old = '''        kind: "reclassification", amount: inn.amount, units: inn.units,'''
new = '''        kind: "contribution", amount: inn.amount, units: inn.units,'''
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

echo ""
echo "════════ done"
