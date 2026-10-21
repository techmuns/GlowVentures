#!/usr/bin/env bash
# VERIFY DL-9's CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# A live quote the corporate-action check HELD BACK is a different fact from one
# that never came, and the Monitor, the basis pill and the top bar used to word
# both as "no live price" / "no quote in this round". Each bug below is applied
# on its own, rebuilt, swept over the three routes that walk the live fixture
# (the capture answered, the capture never arriving, and Performance's basis
# pill) and restored: every check must PASS the page and FAIL it with its bug
# put back.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and it REBUILDS on the way out:
# restoring the source alone leaves `dist/` at the bugged build for the next run
# to report under the wrong name. A patch that does not apply, or a tree that
# does not build, is reported as NOT A RESULT rather than as a clean run.
#
# DO NOT EDIT ANY FILE IN `FILES` WHILE THIS RUNS: the restore puts the snapshot
# back, silently undoing the edit. `BASE` is passed through to the sweep (a
# preview on another port: `BASE=http://127.0.0.1:4198`), and `CASES=2,5` runs
# only those cases.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-withheld-quote-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/context/PortfolioContext.tsx"
  "src/components/BasisPill.tsx"
  "src/components/TopBar.tsx"
  "src/pages/PortfolioMonitor.tsx"
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

ALL=monitor-withheld,monitor-withheld-loading,performance-live

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

if [ -z "${CASES:-}" ]; then
  echo "════════ CONTROL: no patch"
  npm run build >/dev/null 2>&1 && sweep "$ALL"
fi

# ── 1 ── a held row's price back to "no live price"
run_case 1 "$ALL" "a held row's price says there is no live price" \
  sub src/pages/PortfolioMonitor.tsx \
    'A live quote arrived for this security and the corporate-action check held it back — ${rowWithheld.reason}. ' \
    'No live price for this security — '

# ── 2 ── a held row's Day cell back to "no live quote"
run_case 2 "$ALL" "a held row's Day cell says no quote arrived" \
  sub src/pages/PortfolioMonitor.tsx \
    '`a live quote arrived and the corporate-action check held it back — ${rowWithheld.reason} — so there is no previous close to move from`' \
    '"no live quote for this security, so there is no previous close to move from"'

# ── 3 ── the held-back quotes counted again among the ones that never came
run_case 3 "$ALL" "notLive re-includes the held-back quotes" \
  sub src/context/PortfolioContext.tsx \
    'notLive: all.filter((e) => !e.live && e.hasSymbol && !e.withheld).length,' \
    'notLive: all.filter((e) => !e.live && e.hasSymbol).length,'

# ── 4 ── no held-back count at all
run_case 4 "$ALL" "the context never counts a held-back quote" \
  sub src/context/PortfolioContext.tsx \
    'liveWithheld: all.filter((e) => !e.live && e.hasSymbol && e.withheld).length,' \
    'liveWithheld: 0,'

# ── 5 ── the basis pill drops its clause
run_case 5 "$ALL" "the basis pill stops naming the held-back quotes" \
  sub src/components/BasisPill.tsx \
    'liveWithheld ? `${liveWithheld} had a live quote' \
    'false ? `${liveWithheld} had a live quote'

# ── 6 ── the top bar back to the workbook wording
run_case 6 "$ALL" "the top bar says the unquoted are on workbook marks" \
  sub src/components/TopBar.tsx \
    '${notLive} got no quote in this round and are on their statement marks' \
    '${notLive} on workbook marks — ETFs, warrants and securities the price feed does not carry'

# ── 7 ── the top bar drops the held-back clause
run_case 7 "$ALL" "the top bar stops naming the held-back quotes" \
  sub src/components/TopBar.tsx \
    '${liveWithheld ? ` · ${liveWithheld} had a quote the corporate-action check held back' \
    '${false ? ` · ${liveWithheld} had a quote the corporate-action check held back'

# ── 8 ── a statement line ignores the hold
venue_ignores() {
  sub src/pages/PortfolioMonitor.tsx 'const wh = withheldOf(v.positions);' 'const wh = withheldOf([]);' \
  && sub src/pages/PortfolioMonitor.tsx 'data-cmp-withheld={withheldOf(v.positions) ? "1" : undefined}' 'data-cmp-withheld={withheldOf([]) ? "1" : undefined}'
}
run_case 8 "$ALL" "a statement line's price ignores the hold" venue_ignores

# ── 9 ── a mandate share on a statement mark carries no flag again. Written as
# a comparison, not `|| true`: TypeScript refuses an always-truthy expression,
# and a patch that does not build is not a result.
run_case 9 "$ALL" "a mandate share's price carries no not-live flag" \
  sub src/pages/PortfolioMonitor.tsx \
    'h.live ? fmtFromBase(h.currentPrice)' \
    'h.live || h.currentPrice !== null ? fmtFromBase(h.currentPrice)'

# ── 10 ── every not-live price claims a hold
run_case 10 "$ALL" "every line not on a live price is said to be held back" \
  sub src/pages/PortfolioMonitor.tsx \
    'const reasons = ps.map((p) => liveWithheldReason(p, corporateActionReturns)).filter((x): x is string => !!x);' \
    'const reasons = ps.map((p) => liveWithheldReason(p, corporateActionReturns) ?? "held").filter((x): x is string => !!x);'

# ── 11 ── a mandate says all its shares were held back
run_case 11 "$ALL" "a mandate counts every share as held back" \
  sub src/pages/PortfolioMonitor.tsx \
    'held: reasons.length, of: ps.length' \
    'held: ps.length, of: ps.length'

# ── 12 ── THE CHECKER'S OWN DEFECT: the loading walk stops holding the capture,
# so it walks the answered page and reads it against the loading book.
run_case 12 "$ALL" "the loading walk lets the capture answer" \
  sub scripts/check-pages.mjs \
    'if (name === "monitor-withheld-loading") {' \
    'if (name === "never-a-route") {'

# ── 13 ── THE CHECKER'S OWN DEFECT: its re-expression of the gate forgets the
# sales-after reason, so it expects no line held back. The claims that a marker
# is NOT where the book holds nothing must still run — and fail on the page's
# five markers — rather than every claim abstaining.
run_case 13 "$ALL" "the checker's copy of the gate finds nothing held" \
  sub scripts/check-pages.mjs \
    'if ((Number(p.realizedLotsAfter) || 0) > 0) return "Sales are recorded after this statement";' \
    ''
