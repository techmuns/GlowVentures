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
set -uo pipefail
cd "$(dirname "$0")/../.."

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

run_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    ONLY=polycab npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | sed 's/^/   /'
    node scripts/test-family.mjs 2>&1 | grep -E '^FAIL|Polycab live-record checks|FAILED$' | sed 's/^/   SUITE /'
  fi
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
}

py() { python3 - "$@"; }

# A NO-PATCH CONTROL FIRST. Without it a tree that was already failing reports
# every bug below as "fired" — the harness measuring itself rather than the
# checks. Measured in this very session: the first run of this file reported all
# nine cases as NOT A RESULT because `tsc` was failing on an unrelated missing
# declaration, and only the control makes that legible.
echo "════════ CONTROL: no patch — this must be CLEAN"
npm run build >/dev/null 2>&1 && ONLY=polycab npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | sed 's/^/   /' || echo "   !! the UNPATCHED tree does not build — nothing below is a result"

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

# 3 ── the GROUP pledge fills the statement card's own dash
run_case "the promoter-group pledge fills the statement card's pledge dash" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='''                <td className="px-4 py-2.5 text-right mono text-slate-400">
                  <AbsentCell reason="the NSDL holding statement behind this row prints no pledge, lock-in, earmark or freeze column, so neither an encumbrance nor its absence is reported" />
                </td>'''
new='''                <td className="px-4 py-2.5 text-right mono text-slate-400">
                  {live.promoter?.pledgePct == null
                    ? <AbsentCell reason="the NSDL holding statement behind this row prints no pledge, lock-in, earmark or freeze column, so neither an encumbrance nor its absence is reported" />
                    : fmtPct(live.promoter.pledgePct)}
                </td>'''
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 4 ── the entitlement stops saying it is derived
run_case "the entitlement column stops saying it is derived" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='                    On this block · derived'
new='                    On this block'
if s.count(old)!=1: sys.exit(1)
s=s.replace(old,new)
old2='DERIVED — the statement reports a balance on one date and this book cannot say what was held on an ex-date either side of it, so this is an entitlement rather than income and is in no total on this page.'
if s.count(old2)!=1: sys.exit(1)
s=s.replace(old2,'The declared amount applied to this holding.')
open(p,'w').write(s)
EOF

# 5 ── the dividend table is truncated
run_case "the dividend table is truncated" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='              {live.entitlements.map((e, i) => ('
new='              {live.entitlements.slice(0, 2).map((e, i) => ('
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 6 ── the promoter tiles stop rendering the store's figures
run_case "the promoter holding tile renders a different figure" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='                : fmtPct(live.promoter.holdingPct)}'
new='                : fmtPct(live.promoter.holdingPct + 1)}'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 7 ── the sources / refresh footer is deleted
run_case "the sources and refresh-date footer is deleted" py <<'EOF'
import sys
p='src/pages/Polycab.tsx'; s=open(p).read()
old='          The holding is carried by two independent sources and a quarter where they differ by more than 0.05pp publishes'
if s.count(old)!=1: sys.exit(1)
i=s.index(old); j=s.index('</div>', s.index('Last refreshed'))
open(p,'w').write(s[:i]+'          '+s[j:])
EOF

# 8 ── the live layer is allowed to move more than the price
run_case "a failed feed blanks the mark instead of falling back to the store" py <<'EOF'
import sys
p='src/lib/polycabLive.ts'; s=open(p).read()
old='  return { quote: POLYCAB_LIVE.quote, live: false };'
new='  return { quote: null, live: false };'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,new))
EOF

# 9 ── the identity gate is dropped from the builder's own store
run_case "the store's ISIN diverges from the book's" py <<'EOF'
import sys
p='src/data/polycabLive.ts'; s=open(p).read()
old='"bookIsin": "INE455K01017"'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'"bookIsin": "INE000A01001"'))
EOF

echo ""
echo "════════ done — the tree is restored by the EXIT trap"
