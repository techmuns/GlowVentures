#!/usr/bin/env bash
# VERIFY STAGE 10bw's CHECKS BY REINTRODUCING EACH BUG.
#
# *"Remove the highlighted texts from the dashboard UI"* and *"Allow us to
# select different benchmarks … make sure that the benchmark returns are live
# just like the Nifty 500 benchmark."* A removal renders the same words whether
# the text is gone or moved; a benchmark control wired to nothing still draws a
# perfect Nifty 500 chart. So a check nobody has watched fail here is a check
# that may be asserting nothing. Each bug is applied on its own, rebuilt, swept
# and restored.
#
# Same three rules as `sectors-bug.sh` and `polycab-bug.sh`: restore by COPY on a
# trap, rebuild on the way out, and report a patch that does not apply or a
# build that fails as NOT A RESULT rather than as a clean run. Two files here
# are NEW and untracked, where `git checkout --` silently does nothing.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-nav-bench-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/components/NavVsIndex.tsx"
  "src/components/NavMovers.tsx"
  "src/pages/MorningCIO.tsx"
  "src/pages/FamilyEntities.tsx"
  "src/pages/SectorComposition.tsx"
  "src/lib/benchmarks.ts"
  "functions/api/prices.js"
  "scripts/check-pages.mjs"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
put_back() {
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; cmp -s "$SNAP/$f" "$f" || echo "!! $f did NOT restore"; done
}
restore() {
  put_back
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

ROUTES=cio-nav,cio-nav-live,cio-nav-bench,cio-nav-bench-wrong,cio-movers-funds,family-entity,sectors,sectors-direct,sectors-compare,performance

CASE_N=0
want_case() {
  CASE_N=$((CASE_N + 1))
  [ -z "${CASES:-}" ] && return 0
  case ",$CASES," in *",$CASE_N,"*) return 0 ;; esac
  return 1
}

sweep() { ONLY=$ROUTES npm run check:pages 2>&1 | grep -aE 'INVARIANT|^✓|^✗' | grep -av 'every KPI tile on this book carries a figure' | sed 's/^/   /'; }

run_case() {
  local name="$1"; shift
  want_case || return 0
  echo ""
  echo "════════ BUG $CASE_N: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    sweep
  fi
  put_back
}

# THE BENCHMARK SUITE ALONE, for the bugs that live in a Function the page sweep
# serves from a fixture. The verdict is the suite's own exit status — never a
# pipeline's — and the output's NULs are stripped before grep sees it.
run_suite_case() {
  local name="$1"; shift
  want_case || return 0
  echo ""
  echo "════════ BUG $CASE_N (suite): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  local out; out=$(mktemp -d)
  if ! node_modules/.bin/esbuild src/lib/__tests__/benchmarks.test.ts --bundle --platform=node --format=esm \
       --outfile="$out/b.mjs" --packages=external --alias:@="$PWD/src" --log-level=error; then
    echo "   NOT A RESULT — the suite does not bundle"
  else
    node "$out/b.mjs" > "$out/log" 2>&1; local st=$?
    tr -d '\000' < "$out/log" | grep -a '^FAIL' | sed 's/^/   /'
    [ $st -ne 0 ] && echo "   SUITE FAILED (exit $st)" || echo "   SUITE clean"
  fi
  rm -rf "$out"
  put_back
}

py() { python3 - "$@"; }

echo "════════ CONTROL: no patch — this must be CLEAN"
npm run build >/dev/null 2>&1 && sweep || echo "   !! the UNPATCHED tree does not build — nothing below is a result"

# 1 ── the benchmark control is deleted
run_case "the benchmark control is gone" py <<'EOF'
import sys
p='src/components/NavVsIndex.tsx'; s=open(p).read()
old='            {BENCHMARKS.map((b) => ('
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'            {BENCHMARKS.filter(() => false).map((b) => ('))
EOF

# 2 ── the chart fetches the Nifty 500 whatever is selected, and relabels it
run_case "the chart fetches the default index whatever is selected" py <<'EOF'
import sys
p='src/components/NavVsIndex.tsx'; s=open(p).read()
old='    fetchPriceHistory(bench.symbol).then((r) => {'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'    fetchPriceHistory(BENCHMARKS[0].symbol).then((r) => {'))
EOF

# 3 ── the identity gate is gone
run_case "the identity gate accepts any instrument" py <<'EOF'
import sys
p='src/lib/benchmarks.ts'; s=open(p).read()
old='  if (reported.some((n) => b.expect.includes(norm(n)))) return { ok: true };'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'  if (reported.length >= 0) return { ok: true };'))
EOF

# 4 ── the tab keeps naming the Nifty 500
run_case "Morning CIO's tab ignores the benchmark" py <<'EOF'
import sys
p='src/pages/MorningCIO.tsx'; s=open(p).read()
old='                {v.key === "nav" ? navTabLabel : v.label}'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'                {v.label}'))
EOF

# 5 ── the Book pill comes back into the header
run_case "a Book pill returns beside the title" py <<'EOF'
import sys
p='src/components/NavVsIndex.tsx'; s=open(p).read()
old='          Portfolio NAV vs {bench.label}\n        </span>'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'          Portfolio NAV vs {bench.label}\n        </span>{bookRet != null && <span> Book {fmtPct(bookRet, { sign: true })}</span>}'))
EOF

# 6 ── the basis line comes back as a subtitle
run_case "the basis line returns under the title" py <<'EOF'
import sys
p='src/components/NavVsIndex.tsx'; s=open(p).read()
old='''    <Card className="flex flex-col"
      title={'''
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'''    <Card className="flex flex-col"
      subtitle={<span>{model.dates.length} dated points, {cov.from} → {cov.to} · {stats.coveredCount} of {stats.accountsTotal} accounts</span>}
      title={'''))
EOF

# 7 ── the hover loses the like-for-like pair
run_case "the title's hover drops the book-vs-benchmark pair" py <<'EOF'
import sys
p='src/components/NavVsIndex.tsx'; s=open(p).read()
old="net of capital flows, ${bench.label} ${fmtPct(indexRet, { sign: true })} over the same dates."
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,"net of capital flows."))
EOF

# 8 ── the hover loses the not-proven disclosure
run_case "the title's hover drops the not-proven disclosure" py <<'EOF'
import sys
p='src/components/NavVsIndex.tsx'; s=open(p).read()
old='    unproven.length > 0\n      ? `Not proven to be performance:'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'    unproven.length < 0\n      ? `Not proven to be performance:'))
EOF

# 9 ── the NAV movers' basis panel comes back
run_case "the 'What this measures' panel returns" py <<'EOF'
import sys
p='src/components/NavMovers.tsx'; s=open(p).read()
old='      <div className="mt-4 overflow-x-auto">'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'      <div className="mt-3 rounded-xl border p-4"><div className="label-xs">What this measures</div><p data-testid="navmovers-basis">{basisText}</p></div>\n'+old))
EOF

# 10 ── the NAV movers' hover is dropped with the panel
run_case "the NAV movers tile loses its basis hover" py <<'EOF'
import sys
p='src/components/NavMovers.tsx'; s=open(p).read()
old='           data-testid="navmovers-tile" title={basisText}'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'           data-testid="navmovers-tile"'))
EOF

# 11 ── Family & Entities' paragraph comes back
run_case "the paragraph under the sector mix returns" py <<'EOF'
import sys
p='src/pages/FamilyEntities.tsx'; s=open(p).read()
old='                <span className="text-slate-500">Sector source</span>'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,old+'\n                <p className="w-full">{sectorMixWhy}</p>'))
EOF

# 12 ── …and its hover is dropped
run_case "the sector-mix subtitle loses its hover" py <<'EOF'
import sys
p='src/pages/FamilyEntities.tsx'; s=open(p).read()
old='<span data-fe-sector-why title={sectorMixWhy} className="cursor-help">'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'<span data-fe-sector-why className="cursor-help">'))
EOF

# 13 ── Sector Composition's "N sectors" pill comes back
run_case "the header's sector-count pill returns" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='''               context it always has. */
        />'''
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'''               context it always has. */
        right={<span>{sectors.length} sectors</span>}
        />'''))
EOF

# 14 ── the Function stops handing back the name
run_suite_case "/api/prices returns no name" py <<'EOF'
import sys
p='functions/api/prices.js'; s=open(p).read()
old='    name: res.meta?.longName ?? res.meta?.shortName ?? null,\n    longName: res.meta?.longName ?? null,\n    shortName: res.meta?.shortName ?? null,'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,''))
EOF

# 15 ── the gate accepts an unnamed history
run_suite_case "an unnamed history is accepted as a match" py <<'EOF'
import sys
p='src/lib/benchmarks.ts'; s=open(p).read()
old='  if (reported.some((n) => b.expect.includes(norm(n)))) return { ok: true };'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'  if (!reported.length || reported.some((n) => b.expect.includes(norm(n)))) return { ok: true };'))
EOF

echo ""
echo "════════ done"
