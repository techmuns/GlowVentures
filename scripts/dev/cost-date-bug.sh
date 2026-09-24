#!/usr/bin/env bash
# VERIFY THE PR-D COORDINATOR CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# Two facts a reader holding a statement needs and a page did not give them:
# a cost on the GROSS-PAID basis (every rupee paid, where the statement nets its
# stamp duty out — VD-24) and the date a statement mark PRICES at, where that is
# not its balance date (ICICI NSDL: balances of 31 Mar at the 30 Mar close —
# VD-17). Each bug below is applied on its own, rebuilt, swept over the routes
# it touches and restored: every check must PASS the page and FAIL the page
# with its bug put back.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and it REBUILDS on the way out. A patch
# that does not apply, or a tree that does not build, is reported as NOT A
# RESULT rather than as a clean run. DO NOT EDIT A FILE IN `FILES` WHILE THIS
# RUNS. `BASE` is passed through to the sweep, `CASES=2,5` runs only those.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-cost-date-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/lib/tranches.ts"
  "src/lib/analytics.ts"
  "src/lib/valuedAt.ts"
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
put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }

sweep() {
  THEMES=light ONLY="$1" npm run check:pages 2>&1 | tr -d '\000' | grep -aE 'INVARIANT FAILED|^✓|^✗|combinations' | sed 's/^/   /'
}
suite() {
  npm run test:family 2>&1 | tr -d '\000' | grep -aE '^FAIL|^✗|failed' | head -20 | sed 's/^/   suite: /'
  echo "   suite exit: ${PIPESTATUS[0]}"
}
run_case() {
  local num="$1" routes="$2" withSuite="$3" name="$4"; shift 4
  if [ -n "${CASES:-}" ] && ! [[ ",$CASES," == *",$num,"* ]]; then return; fi
  echo ""
  echo "════════ BUG $num: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    [ -n "$routes" ] && sweep "$routes"
    [ "$withSuite" = yes ] && suite
  fi
  put_back
}
sub() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys
p, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p, encoding="utf-8").read()
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY
}

GROSS=monitor,stock-gross
if [ -z "${CASES:-}" ]; then
  echo "════════ CONTROL: no patch"
  npm run build >/dev/null 2>&1 && sweep "$GROSS,stock-carried,stock"
fi

# ── 1 ── the Monitor's Invested cell loses the gross-paid hover
run_case 1 "monitor" no "the Monitor's Invested cell stops saying the cost is what was paid" \
  sub src/pages/PortfolioMonitor.tsx \
    'const grossWhy = gross ? grossPaidNote(gross, (v) => fmtFromBase(v)) : "";' \
    'const grossWhy = "";'

# ── 2 ── the note prints its figures at compact precision, so paid and net read alike
run_case 2 "$GROSS" no "the note prints the two costs at compact precision, where they read alike" \
  sub src/lib/tranches.ts \
    'export function grossPaidNote(g: GrossPaidCost, exact: (v: number) => string): string {' \
    'export function grossPaidNote(g: GrossPaidCost, exactFull: (v: number) => string): string {
  const exact = (v: number) => exactFull(Math.round(v / 1e5) * 1e5);'

# ── 3 ── the stock page's account row loses its hover
run_case 3 "stock-gross" no "the stock page's account row stops naming the statement's net" \
  sub src/pages/StockInfo.tsx \
    '? <span title={grossPaidNote(grossPaidOf([r])!, (v) => fmtFromBase(v))}>{money(r.costBasis)}</span>' \
    '? <span>{money(r.costBasis)}</span>'

# ── 4 ── the Avg cost tile forgets its basis
run_case 4 "stock-gross" no "the Avg cost tile stops saying its cost is what was paid" \
  sub src/pages/StockInfo.tsx \
    'const gross = cost === null || carried ? null : grossPaidOf(drows);' \
    'const gross = null as ReturnType<typeof grossPaidOf>;'

# ── 5 ── a clubbed row's note covers one of its folios, not the row
run_case 5 "monitor" no "the Monitor's note counts one folio's charges, not the row's" \
  sub src/pages/PortfolioMonitor.tsx \
    'const gross = r.costNA || carried ? null : grossPaidOf(r.trancheSet);' \
    'const gross = r.costNA || carried ? null : grossPaidOf(r.trancheSet.slice(0, 1));'

# ── 6 ── a value is dated at the balances' day, not the day it was priced
run_case 6 "stock,monitor" yes "a statement mark is dated at its balances' day rather than its pricing day" \
  sub src/lib/analytics.ts \
    'return p.priceAsOf ?? statementAsOf ?? null;' \
    'return statementAsOf ?? null;'

# ── 7 ── the Holding value tile stops naming the balances' own date
run_case 7 "stock" no "the Holding value tile's hover names one date for both" \
  sub src/lib/valuedAt.ts \
    'const priced = drawn.length === 1 ? ` The statement counts its balances at ${fmtDate(drawn[0])} and prices them as of ${d}.` : "";' \
    'const priced = "";'

# ── 8 ── the Monitor's price cell names one date for both
run_case 8 "monitor" no "the Monitor's price cell stops saying the value was priced on another day" \
  sub src/pages/PortfolioMonitor.tsx \
    '    ? `${lead} as of ${fmtDate(drawn[0])}, priced as of ${fmtDate(valuedAt)}.`' \
    '    ? `${lead} as of ${fmtDate(valuedAt)}.`'

