#!/usr/bin/env bash
# VERIFY THE POLYCAB CHECKS BY REINTRODUCING THE BUG EACH ONE EXISTS FOR.
#
# A check nobody has watched fail is a check nobody knows can fail, and this
# repo has found more defects IN ITS CHECKS this way than in the pages they
# guard. Each bug below is applied on its own, rebuilt, swept, and restored.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and both halves are load-bearing:
# several of the files this patches are NEW and therefore UNTRACKED, where
# `git checkout -- <file>` silently does nothing and leaves the bug in place for
# the next run to report under the wrong name. Measured in this repo twice.
#
# AND IT REBUILDS ON THE WAY OUT. Restoring the source alone leaves `dist/` at
# the bugged build, so the next sweep reads it and reports the previous bug's
# failures under the next one's name — the stale-`dist` defect this file's own
# predecessors record.
#
# A PATCH THAT DOES NOT APPLY, OR A BUILD THAT FAILS, IS REPORTED AS NOT A
# RESULT rather than as a clean run. A sweep that cannot build is not a sweep
# that passed.
#
# ── THE PAGE IS ONE CARD NOW, SO THE CASES WERE REWRITTEN, NOT RETIRED ───────
#
# The page this harness was written against had a hero, five tiles and four
# stacked cards; it is one card with three tables behind a toggle. Cases 3–7
# patched markup that no longer exists and would each have reported NOT A
# RESULT — which is the harness telling the truth about itself, and still a
# pass that proves nothing. Each was re-pointed at the table that now carries
# its subject, and cases 10–20 are the ways the NEW page can regress.
set -uo pipefail
cd "$(dirname "$0")/../.."

# ONE AT A TIME, ENFORCED — see `txn-merge-bug.sh`: two copies fighting over one
# `dist/` and one snapshot report each other's builds.
exec 9>"${TMPDIR:-/tmp}/glow-polycab-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/pages/Polycab.tsx"
  "src/lib/polycabLive.ts"
  "src/data/polycabLive.ts"
  "shared/polycabSources.mjs"
  "shared/polycabSources.d.mts"
  "scripts/build-polycab-live.mjs"
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

# ALL THREE TABLES AND THE REDIRECT. Only the active table is in the DOM, so a
# harness walking `/polycab` alone could not see a bug on the other two.
ROUTES=polycab,polycab-dividends,polycab-promoter,polycab-stock-redirect

# `CASES=3,11` RUNS ONLY THOSE CASES (1-based, in file order); the control
# always runs. For re-checking one case after its check changed, without the
# whole pass — which costs a build and a sweep per case.
CASE_N=0
want_case() {
  CASE_N=$((CASE_N + 1))
  [ -z "${CASES:-}" ] && return 0
  case ",$CASES," in *",$CASE_N,"*) return 0 ;; esac
  return 1
}

run_case() {
  local name="$1"; shift
  want_case || return 0
  echo ""
  echo "════════ BUG $CASE_N: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | sed 's/^/   /'
    # THE SUITE'S VERDICT IS ITS OWN EXIT STATUS, never grep's: its output
    # carries NUL bytes, so grep classifies it as binary and suppresses the
    # very lines it was asked to print (see `txn-merge-bug.sh`).
    local out rc
    out=$(node scripts/test-family.mjs 2>&1); rc=$?
    if [ $rc -ne 0 ]; then
      printf '%s\n' "$out" | tr -d '\000' | grep -aE '^FAIL|failure\(s\)' | sed 's/^/   SUITE /'
    fi
  fi
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
}

py() { python3 - "$@"; }

# A NO-PATCH CONTROL FIRST. Without it a tree that was already failing reports
# every bug below as "fired" — the harness measuring itself rather than the
# checks. Measured in this very file's history: the first run reported all nine
# cases as NOT A RESULT because `tsc` was failing on an unrelated declaration,
# and only the control makes that legible.
echo "════════ CONTROL: no patch — this must be CLEAN"
npm run build >/dev/null 2>&1 && ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | sed 's/^/   /' || echo "   !! the UNPATCHED tree does not build — nothing below is a result"

# 1 ── the pledge defaults to 0 instead of staying null
run_case "the pledge defaults to 0 rather than staying null" py <<'EOF'
import sys
p='shared/polycabSources.mjs'; s=open(p).read()
old='''    const pledgePct =
      typeof v.pmPctP === "number" ? v.pmPctP :
      typeof v.plPctT === "number" ? v.plPctT : null;'''
new='''    const pledgePct =
      typeof v.pmPctP === "number" ? v.pmPctP :
      typeof v.plPctT === "number" ? v.plPctT : 0;'''
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 2 ── the measured nil is claimed whatever the record's completeness
run_case "the measured nil is claimed on an incomplete record" py <<'EOF'
import sys
p='src/lib/polycabLive.ts'; s=open(p).read()
old='  return POLYCAB_LIVE.actionsComplete === true && shareCountActions().length === 0;'
new='  return shareCountActions().length === 0;'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
# and make the stored record incomplete, so the claim becomes false
p2='src/data/polycabLive.ts'; t=open(p2).read()
if t.count('"actionsComplete": true')!=1: sys.exit(1)
open(p2,'w').write(t.replace('"actionsComplete": true','"actionsComplete": false'))
EOF

# 3 ── the GROUP pledge fills this demat's own pledge cell
run_case "the promoter-group pledge fills this demat's pledge cell" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='''data-cell="pledge"><AbsentCell reason={PLEDGE_WHY} /></td>'''
new='''data-cell="pledge">{live.promoter?.pledgePct == null ? <AbsentCell reason={PLEDGE_WHY} /> : fmtPct(live.promoter.pledgePct)}</td>'''
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 4 ── the entitlement stops saying it is derived
run_case "the entitlement column stops saying it is derived" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='On this block · derived'
if s.count(old)!=1: sys.exit(1)
s=s.replace(old,'On this block')
old2='DERIVED — the statement reports a balance on one date and this book cannot say what was held on an ex-date either side of it, so this is an entitlement rather than income and is in no total on this page.'
if s.count(old2)!=1: sys.exit(1)
s=s.replace(old2,'The declared amount applied to this holding.')
open(p,'w').write(s)
EOF

# 5 ── the dividend table is truncated
run_case "the declared-actions table is truncated" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='    ...live.entitlements.map((e) => ({ ...e, cash: true })),'
new='    ...live.entitlements.slice(0, 2).map((e) => ({ ...e, cash: true })),'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 6 ── the promoter table stops rendering the store's figures
run_case "the promoter holding renders a different figure" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='                            : fmtPct(q.holdingPct)}'
new='                            : fmtPct(q.holdingPct + 1)}'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 7 ── the sources / refresh line is deleted from both company tables
run_case "the sources and refresh-date line is deleted" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='            {sourcesLine}\n'
if s.count(old)!=2: sys.exit(1)
open(p,'w').write(s.replace(old,''))
EOF

# 8 ── a failed feed blanks the price instead of falling back to the store
run_case "a failed feed blanks the price instead of falling back to the store" py <<'EOF'
import sys
p='src/lib/polycabLive.ts'; s=open(p).read()
old='  return { quote: POLYCAB_LIVE.quote, live: false };'
new='  return { quote: null, live: false };'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 9 ── the identity gate: the store's ISIN diverges from the book's
run_case "the store's ISIN diverges from the book's" py <<'EOF'
import sys
p='src/data/polycabLive.ts'; s=open(p).read()
old='"bookIsin": "INE455K01017"'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'"bookIsin": "INE000A01001"'))
EOF

# 10 ── a KPI tile comes back above the table
run_case "a KPI tile comes back above the table" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='      <Card pad={false} className="flex min-h-0 flex-col"'
new='      <div className="card mb-3 p-4"><div className="label-xs">Shares held</div><div className="mono">{fmtNum(shares ?? 0)}</div></div>\n      <Card pad={false} className="flex min-h-0 flex-col"'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 11 ── all three tables stacked under a toggle that filters nothing
run_case "all three tables are drawn at once" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
for k in ('holding','actions','promoter'):
    old='{view === "%s" && (' % k
    if s.count(old)!=1: sys.exit(1)
    s=s.replace(old,'{(view === "%s" || true) && (' % k)
open(p,'w').write(s)
EOF

# 12 ── the page opens on a company table instead of the holding
run_case "the default table moves off the holding" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='  const [view, setView] = useViewParam(POLYCAB_VIEWS, {}, "view");'
new='  const [rawView, setView] = useViewParam(POLYCAB_VIEWS, {}, "view");\n  const view = (rawView === "holding" ? "actions" : rawView) as PolycabView;'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 13 ── the toggle is deleted outright
run_case "the toggle is deleted" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
i=s.find('        right={\n          <div className="inline-flex shrink-0')
j=s.find('        }>\n', i)
if i<0 or j<0: sys.exit(1)
open(p,'w').write(s[:i]+s[j+len('        }'):])
EOF

# 14 ── a footer drawn over a single row
run_case "the holding footer is drawn over one row" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='              {rows.length > 1 && ('
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'              {rows.length > 0 && ('))
EOF

# 15 ── the Holder column names nobody
run_case "the Holder column names nobody" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='{a?.owner ?? <AbsentCell reason="the statement for this account names no holder the registry resolves" />}'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'<AbsentCell reason="the statement for this account names no holder the registry resolves" />'))
EOF

# 16 ── the cost the depository does not report is printed as ₹0
run_case "the absent cost is printed as a zero" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='<AbsentCell reason={COST_WHY} />'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'money(0)'))
EOF

# 17 ── the market price's basis is dropped from under its heading
run_case "the CMP heading stops saying what its price is" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old=' note={priceBasis} noteTitle={priceWhy}>CMP</SortHeader>'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'>CMP</SortHeader>'))
EOF

# 18 ── the mark's derivation leaves the column it describes
run_case "the mark's derivation hover is removed" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old=' note="statement" noteTitle={MARK_HOW}>Mark</SortHeader>'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,' note="statement">Mark</SortHeader>'))
EOF

# 19 ── a record date the exchange did not publish prints a dash over the window it did
run_case "the book-closure window is dropped for a dash" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='                            : closure ? <span'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'                            : false ? <span'))
EOF

# 20 ── the promoter pledge stops saying it is the group's
run_case "the promoter pledge heading stops saying it is not this demat" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='note="group, not this demat"'
if s.count(old)!=1: sys.exit(1)
s=s.replace(old,'note="group"')
old2="What the promoter group discloses each quarter — not a statement about the family's own demat."
if s.count(old2)!=1: sys.exit(1)
s=s.replace(old2,"What the promoter group discloses each quarter.")
open(p,'w').write(s)
EOF

echo ""
echo "════════ done — the tree is restored by the EXIT trap"
