#!/usr/bin/env bash
# VERIFY THE REPAIRED CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# Stage 10ci moved the sweep's own re-derivation of Private Market returns onto
# FIFO — the basis the page has struck them on since Stage 10ca — corrected the
# whole-book HPR's hover, and taught `check:family` the fifth Extras page. A
# check that was failing on a correct page has only ever been seen to fail, so
# each bug below is applied on its own, rebuilt, swept over the routes it
# touches, and restored: every repaired check must now PASS the page and FAIL
# the page with its bug put back.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and it REBUILDS on the way out:
# restoring the source alone leaves `dist/` at the bugged build for the next run
# to report under the wrong name. A patch that does not apply, or a tree that
# does not build, is reported as NOT A RESULT rather than as a clean run.
#
# DO NOT EDIT ANY FILE IN `FILES` WHILE THIS RUNS: the restore puts the snapshot
# back, silently undoing the edit. `BASE` is passed through to both sweeps (a
# preview on another port: `BASE=http://127.0.0.1:4180`), and `CASES=2,5` runs
# only those cases.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-pm-fifo-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/lib/fundReturns.ts"
  "src/lib/privateBook.ts"
  "src/pages/PrivateMarket.tsx"
  "src/lib/nav.ts"
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

PM_ROUTES=private-market,private-market-tiles,private-market-returns

put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }

# run_case <number> <pages|family> <name> <patch command…>
run_case() {
  local num="$1" suite="$2" name="$3"; shift 3
  if [ -n "${CASES:-}" ] && ! [[ ",$CASES," == *",$num,"* ]]; then return; fi
  echo ""
  echo "════════ BUG $num ($suite): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  elif [ "$suite" = pages ]; then
    THEMES=light ONLY=$PM_ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT FAILED|^✓|^✗' | sed 's/^/   /'
  else
    npm run check:family 2>&1 | grep -E '^FAIL|passed, [0-9]+ failed' | sed 's/^/   /'
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

echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && {
  THEMES=light ONLY=$PM_ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT FAILED|^✓|^✗' | sed 's/^/   /'
  npm run check:family 2>&1 | grep -E '^FAIL|passed, [0-9]+ failed' | sed 's/^/   /'
}

# ── 1 ── a fund row's HPR back to value against the cost of the units still held
run_case 1 pages "a fund row's HPR is value against the cost held, not FIFO" \
  sub src/pages/PrivateMarket.tsx \
    ': (measure: ReturnMeasure) => fundMeasuredReturn(g, fundDated.get(g.securityKey ?? ""), measure, moneyN, fmtDate));' \
    ': (measure: ReturnMeasure) => fundMeasuredReturn({ ...g, returnPct: g.cost ? ((g.value! - g.cost) / g.cost) * 100 : g.returnPct }, fundDated.get(g.securityKey ?? ""), measure, moneyN, fmtDate));'

# ── 2 ── the page's own gap identity back to calls against the cost held — Neo
# Infra reads as a gap and loses its XIRR, in silence
run_case 2 pages "the calls are held to the cost of the units still held, so a redeeming fund reads as a gap" \
  sub src/lib/fundReturns.ts \
    'const deployed = p.costBasis == null ? null : p.costBasis + sold;' \
    'const deployed = p.costBasis == null ? null : p.costBasis + 0 * sold;'

# ── 3 ── the whole-book HPR back to value against the cost held
run_case 3 pages "the whole private book's HPR is value against the cost held, not FIFO" \
  sub src/pages/PrivateMarket.tsx \
    'return { shown: true, pct: fig.returnPct, tag: "HPR", note: aggHprNote(held) };' \
    'return { shown: true, pct: scope === "total" && fig.cost ? ((fig.value! - fig.cost) / fig.cost) * 100 : fig.returnPct, tag: "HPR", note: aggHprNote(held) };'

# ── 4 ── the hover back to the sentence FIFO made false
run_case 4 pages "the book's HPR hover says cash paid back is not in it" \
  sub src/pages/PrivateMarket.tsx \
    '? "FIFO, not annualised: the gain on the units held plus the gain on units redeemed, over the capital paid in for both. The principal returned on redeemed units is in it; income, equalisation and any payout that redeemed no units are not — XIRR counts those."' \
    '? "Current value against the capital paid in, not annualised. Cash the funds have paid back is not in it — XIRR counts it."'

# ── 5 ── the hover names FIFO but loses the principal clause: it no longer asks
# whether a fund in the set redeemed units
run_case 5 pages "the hover says FIFO and never names the principal on redeemed units" \
  sub src/pages/PrivateMarket.tsx \
    'held.some((f) => (f.position?.costOfUnitsSold ?? 0) > 0)' \
    'held.some((f) => (f.position?.costOfUnitsSold ?? 0) > 1e15)'

# ── 6 ── Corporate actions leaves Extras
run_case 6 family "Corporate actions & dividends is filed outside Extras" \
  sub src/lib/nav.ts \
    '{ to: "/corporate-actions", label: "Corporate actions & dividends", icon: Receipt, group: EXTRAS },' \
    '{ to: "/corporate-actions", label: "Corporate actions & dividends", icon: Receipt, group: "Allocation" },'

# ── 7 ── Extras holds the five, in the wrong order
run_case 7 family "Extras holds the five pages out of order" \
  sub src/lib/nav.ts \
    '  { to: "/corporate-actions", label: "Corporate actions & dividends", icon: Receipt, group: EXTRAS },
  { to: "/ledger", label: "Ledger Insights", icon: Calculator, group: EXTRAS },' \
    '  { to: "/ledger", label: "Ledger Insights", icon: Calculator, group: EXTRAS },
  { to: "/corporate-actions", label: "Corporate actions & dividends", icon: Receipt, group: EXTRAS },'

# ── 8 ── THE ORIGINAL DEFECT, IN THE CHECKER: its HPR re-derivation back on the
# cost held, against the page as it is. The HPR check must fail again, and the
# new proof with it — a checker that cannot tell the two bases apart could not
# catch cases 1 and 3, and had the page drifted back with it every HPR check
# would have agreed. (The calls identity is case 2's, from the page's side.)
run_case 8 pages "the sweep's HPR re-derivation back on value against the cost held" \
  sub scripts/check-pages.mjs \
    'const hpr = deployed != null && deployed > 0 && costCoversAll ? ((mv - cost + realised) / deployed) * 100 : null;' \
    'const hpr = cost != null && cost > 0 && costCoversAll ? ((mv - cost) / cost) * 100 : null;'
