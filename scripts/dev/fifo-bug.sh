#!/usr/bin/env bash
# FIFO BUG REINTRODUCTION — each case puts one defect back, runs the checks that
# exist for it, and restores the tree. A check that cannot fail is a defect of
# its own, and this is how one is found.
#
#   scripts/dev/fifo-bug.sh            every case
#   scripts/dev/fifo-bug.sh 3 5        just those
#
# Suite cases run `npm run test:family`. Page cases rebuild and walk only the
# routes that assert on the defect (a `vite preview` must be serving :4173).
#
# THE RESTORE IS BY COPY, ON A TRAP, AND IT REBUILDS ON THE WAY OUT: restoring
# the source alone leaves `dist/` at the bugged build and the next sweep reports
# this case's failures under the next one's name. A patch that does not apply,
# or a build that fails, is NOT A RESULT — never read as a clean run.
set -uo pipefail
cd "$(dirname "$0")/../.."
FILES=(src/lib/fifo.ts shared/fifo.mjs src/lib/tranches.ts src/pages/PortfolioMonitor.tsx src/pages/MandateHoldings.tsx scripts/build-book.mjs src/data/glowData.ts)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
exec 9>"$SNAP/.lock"
restore() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; cmp -s "$SNAP/$f" "$f" || echo "RESTORE FAILED: $f"; done; }
BUILT=0
cleanup() { restore; if [ "$BUILT" = 1 ]; then npm run -s build >/dev/null 2>&1 || echo "rebuild on exit FAILED"; fi; rm -rf "$SNAP"; }
trap cleanup EXIT

# patch <file> <from> <to> — exactly one occurrence, or the case is not a result.
patch() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys
p, a, b = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p).read()
n = s.count(a)
if n != 1:
    print(f"PATCH NOT APPLIED: {n} match(es) in {p}"); sys.exit(3)
open(p, "w").write(s.replace(a, b))
PY
}

suite() {
  local out; out=$(npm run -s test:family 2>&1 | tr -d '\000')
  local fails; fails=$(printf '%s\n' "$out" | grep -c '^FAIL ')
  printf '%s\n' "$out" | grep '^FAIL ' | head -6 | sed 's/^/      /'
  [ "$fails" -gt 0 ] && echo "    FIRED ($fails)" || echo "    CLEAN — the check did not fire"
}
pages() {
  BUILT=1
  if ! npm run -s build >/dev/null 2>&1; then echo "    NOT A RESULT — build failed"; return; fi
  local out; out=$(ONLY="$1" npm run -s check:pages 2>&1 | tr -d '\000')
  printf '%s\n' "$out" | grep -E 'invariant|INVARIANT|✗|FAIL' | head -8 | sed 's/^/      /'
  printf '%s\n' "$out" | tail -2 | sed 's/^/    /'
}

run_case() {
  local id=$1; echo "── case $id"
  case $id in
    1) echo "   aggregate back to survivors only: deployed = cost held, realised ignored"
       patch src/lib/fifo.ts 'deployed = add(deployed, c + sold);' 'deployed = add(deployed, c);' || return
       patch src/lib/fifo.ts 'if (isNum(p.realizedPnL)) { realised = add(realised, p.realizedPnL); realisedCovered += 1; }' 'realisedCovered += 1;' || return
       suite ;;
    2) echo "   a carried lot appended at the back of the queue (LIFO wearing FIFO's name)"
       patch shared/fifo.mjs '      lots.sort((a, b) => a.date.localeCompare(b.date));
    }' '    }' || return
       suite ;;
    3) echo "   no mandate is ever struck whole on its capital"
       patch src/lib/fifo.ts 'if (a?.engagement !== "PMS" || !cap || !(cap.contributed > 0)) continue;' 'continue;' || return
       suite ;;
    4) echo "   an aggregate struck as the mean of the holdings' percentages"
       patch src/lib/fifo.ts 'const returnPct = covers && gain !== null && isNum(deployed) && deployed > 0 ? (gain / deployed) * 100 : null;' 'const pcts = set.map((p) => (isNum(p.costBasis) && p.costBasis > 0 ? ((p.marketValue - p.costBasis) / p.costBasis) * 100 : NaN)).filter(Number.isFinite); const returnPct = covers && pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;' || return
       suite ;;
    5) echo "   the Monitor's mandate rows back to unrealised ÷ cost of the survivors"
       patch src/lib/fifo.ts 'realised = add(realised, gain - unr);
    deployed = add(deployed, cap.contributed);' 'realised = add(realised, 0);
    deployed = add(deployed, mandateCost.get(acct) ?? 0);' || return
       pages "monitor,mandate-fifo" ;;
    6) echo "   the mandate page's FIFO tile shows the unrealised ÷ cost it replaced"
       patch src/pages/MandateHoldings.tsx 'const ret = fifo.returnPct;' 'const ret = cost && cost > 0 && pnl !== null ? (pnl / cost) * 100 : null;' || return
       pages "mandate-fifo" ;;
    7) echo "   the Monitor footer's return struck over the whole book, so the coverage test refuses it"
       patch src/pages/PortfolioMonitor.tsx 'const totalRet = totFifoCosted.returnPct;' 'const totalRet = totFifo.returnPct;' || return
       pages "monitor" ;;
    8) echo "   two contributions at one entry NAV earn different holding-period returns by date"
       patch src/lib/tranches.ts 'const returnPct = ((value - m.invested) / m.invested) * 100;' 'const returnPct = ((value - m.invested) / m.invested) * 100 + (m.date < "2025-01-01" ? 1 : 0);' || return
       pages "monitor-tranche-shared" ;;
    *) echo "   no such case"; return ;;
  esac
  restore
}

CASES=("$@"); [ ${#CASES[@]} -eq 0 ] && CASES=(1 2 3 4 5 6 7 8)
for c in "${CASES[@]}"; do run_case "$c"; done
