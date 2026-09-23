#!/usr/bin/env bash
# VERIFY THE SECTOR COMPOSITION LAYOUT CHECKS BY REINTRODUCING EACH BUG.
#
# *"this compare sectors needs to be a subtab next to direct equity … give this
# whole table of Sector breakdown next to this pie chart table by splitting the
# page into two parts right and left."* Every claim that ask makes is geometry
# or structure, and not one word on the page changes when any of it regresses —
# so a check nobody has watched fail here is a check that may be asserting
# nothing. Each bug is applied on its own, rebuilt, swept and restored.
#
# Same three rules as `polycab-bug.sh` and `txn-merge-bug.sh`: restore by COPY on
# a trap, rebuild on the way out, and report a patch that does not apply or a
# build that fails as NOT A RESULT rather than as a clean run.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-sectors-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/pages/SectorComposition.tsx"
  "scripts/check-pages.mjs"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
restore() {
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

# ALL THREE TABS. Only the active tab's right half is in the DOM, and the
# Compare tab is half of what was asked.
ROUTES=sectors,sectors-direct,sectors-compare

run_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|NOT CHECKED|^✓|^✗' | sed 's/^/   /'
  fi
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
}

py() { python3 - "$@"; }

echo "════════ CONTROL: no patch — this must be CLEAN"
npm run build >/dev/null 2>&1 && ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|NOT CHECKED|^✓|^✗' | sed 's/^/   /' || echo "   !! the UNPATCHED tree does not build — nothing below is a result"

# 1 ── the two halves stack again
run_case "the chart and the table stack instead of sitting side by side" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='lg:grid-cols-[minmax(0,3fr)_minmax(0,5fr)]'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'lg:grid-cols-1'))
EOF

# 2 ── the legend comes back beside the donut
run_case "the donut's legend comes back" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='              <div className="mt-4" data-sector-partition>{partition}</div>'
new='              <><ul className="mt-2">{sectors.map((x) => <li key={x.key}>{x.key} {(x.weight * 100).toFixed(1)}%</li>)}</ul><div className="mt-4" data-sector-partition>{partition}</div></>'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 3 ── Compare is no longer a tab
run_case "Compare sectors is dropped from the tabs" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='''  { key: "compare", label: "Compare sectors",
    title: "Up to four sectors side by side, on both sets at once: the family's total exposure and what they bought themselves." },
'''
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,''))
EOF

# 4 ── the default tab moves off Consolidated
run_case "the page opens on Direct Equity" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='  const [view, setView] = useViewParam<SectorView>(SECTOR_VIEWS);'
new='  const [rawView, setView] = useViewParam<SectorView>(SECTOR_VIEWS);\n  const view = (rawView === "consolidated" ? "direct" : rawView) as SectorView;'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 5 ── the Direct Equity rows of the comparison show the consolidated figures
run_case "the comparison's Direct Equity value reads the consolidated set" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='''<CompareRow label="Value" keys={compare} render={(k) => {
                      const s = directByKey.get(k);'''
new='''<CompareRow label="Value" keys={compare} render={(k) => {
                      const s = consByKey.get(k);'''
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 6 ── a sector's total exposure loses its derived half
run_case "the comparison's total exposure is the measured half alone" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='return s ? money(s.mv) : <AbsentCell reason="no company this family is exposed to sits in this sector" />;'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'return s ? money(s.measured) : <AbsentCell reason="no company this family is exposed to sits in this sector" />;'))
EOF

# 7 ── Compare opens on an empty table
run_case "Compare opens with nothing picked" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='const compare = (picked ?? defaultPick)'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'const compare = (picked ?? [])'))
EOF

# 8 ── the sector table's Return column goes back to a bare dash
run_case "the Return column prints a bare dash" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='<AbsentCell reason={s.returnWhy ?? CONSOLIDATED_RETURN_WHY} />'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'"—"'))
EOF

# 9 ── the right half cuts its table off
run_case "the sector table is wider than its half" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='<table className="min-w-full text-[13px]" data-sector-table>'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'<table className="min-w-[1600px] text-[13px]" data-sector-table>'))
EOF

# 10 ── the partition figures leave the left half
run_case "the partition figures are dropped" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='              <div className="mt-4" data-sector-partition>{partition}</div>'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'              <div className="mt-4" />'))
EOF

# 11 ── the tabs leave the title's line
run_case "the tabs drop below the title" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='''      <PageHeader eyebrow="Allocation" title="Sector Composition"
        beside={'''
new='''      <PageHeader eyebrow="Allocation" title="Sector Composition"
        subtitle={'''
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 12 ── the old Compare card comes back on the table tabs
run_case "a Compare table is drawn on the table tabs too" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='              <div className="mt-4" data-sector-partition>{partition}</div>'
new='              <><div className="mt-4" data-sector-partition>{partition}</div><table data-sector-compare data-table-static="x"><tbody><tr><td>click a chip to add or remove</td></tr></tbody></table></>'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 13 ── a return is struck over a sector's costed few
run_case "the coverage gate is dropped from the sector return" py <<'EOF'
import sys
p='src/pages/SectorComposition.tsx'; s=open(p).read()
old='const returnPct = covered && cost !== null && cost > 0 && pnl !== null ? (pnl / cost) * 100 : null;'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'const returnPct = cost !== null && cost > 0 && pnl !== null ? (pnl / cost) * 100 : null;'))
EOF

echo ""
echo "════════ done — the tree is restored by the EXIT trap"
