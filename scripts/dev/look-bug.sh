#!/usr/bin/env bash
# VERIFY THE NEW LOOK'S CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# The family asked for Glow Central Research's fonts and colours (Stage 10cg):
# *"look how good the font is and the ui is of glow-central research - colours
# white etc - can you make this dashboard also with right color pallet and
# fonts."* `check:pages` holds the look on every route by COMPUTED STYLE — the
# faces the page asks for, a white nav and top bar, a gold "you are here" — and
# its light-theme contrast probe and raised-card check hold the two rules the
# new palette must not break. A check nobody has watched fail is a check nobody
# knows can fail, so each bug below is applied on its own, rebuilt, swept over
# a few routes in the light theme, and restored.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and it REBUILDS on the way out:
# restoring the source alone leaves `dist/` at the bugged build for the next run
# to report under the wrong name. A patch that does not apply, or a tree that
# does not build, is reported as NOT A RESULT rather than as a clean run.
#
# DO NOT EDIT ANY FILE IN `FILES` WHILE THIS RUNS: the restore puts the snapshot
# back, silently undoing the edit. `BASE` is passed through to the sweep, so a
# preview on another port can be swept (`BASE=http://127.0.0.1:4180`), and
# `CASES=7,8` runs only those cases — one rebuild and one sweep each, rather
# than all of them to re-check one.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-look-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/index.css"
  "src/components/PageHeader.tsx"
  "src/components/Sidebar.tsx"
  "src/pages/PortfolioMonitor.tsx"
  "src/pages/StockInfo.tsx"
  "tailwind.config.js"
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

ROUTES=cio,monitor,holdings-book,stock

put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }

# run_case <number> <themes> <name> <patch command…>
# (`CASE_ROUTES` sweeps one case over other routes than the default four.)
run_case() {
  local num="$1" themes="$2" name="$3"; shift 3
  if [ -n "${CASES:-}" ] && ! [[ ",$CASES," == *",$num,"* ]]; then return; fi
  echo ""
  echo "════════ BUG $num ($themes): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    THEMES=$themes ONLY=${CASE_ROUTES:-$ROUTES} npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗|contrast=[1-9]|dark-|pale-' | grep -v 'NOT CHECKED' | sed 's/^/   /'
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

echo "════════ CONTROL: no patch, both themes"
npm run build >/dev/null 2>&1 && ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | grep -v 'NOT CHECKED' | sed 's/^/   /'

# ── 1 ── the page title back in the reading face
run_case 1 light "the page title is back in Inter" \
  sub src/components/PageHeader.tsx 'className="font-display text-xl font-bold tracking-tight text-slate-100"' \
    'className="text-xl font-bold tracking-tight text-slate-100"'

# ── 2 ── figures back in the monospace
run_case 2 light "figures are back in JetBrains Mono" \
  sub src/index.css '.mono { font-family: "Inter", ui-monospace, "DejaVu Sans Mono", monospace;' \
    '.mono { font-family: "JetBrains Mono", ui-monospace, monospace;'

# ── 3 ── the nav back to the page's own ivory
run_case 3 light "the nav is ivory again" \
  sub src/index.css 'html:not(.dark) aside.app-sidebar {
  background-color: #ffffff;' 'html:not(.dark) aside.app-sidebar {
  background-color: #efece3;'

# ── 4 ── the top bar back to the page's own ivory
run_case 4 light "the top bar is ivory again" \
  sub src/index.css '  background-color: rgba(255, 255, 255, 0.82);' '  background-color: rgba(239, 236, 227, 0.92);'

# ── 5 ── "you are here" no longer gold
run_case 5 light "the active nav entry is not marked in gold" \
  sub src/components/Sidebar.tsx 'isActive ? "nav-active bg-ink-700/80 text-slate-100"' 'isActive ? "bg-ink-700/80 text-slate-100"'

# ── 6 ── GCR's white type on a gold control, which this page must never print
run_case 6 light "an active toggle carries white type on the gold" \
  sub src/pages/PortfolioMonitor.tsx '${view === m ? "bg-champagne-500 text-ink-950 shadow-glow"' '${view === m ? "bg-champagne-500 text-white shadow-glow"'

# ── 7 ── every card lifted like a button
run_case 7 light "every card carries a hard offset, like a button" \
  sub src/index.css '  box-shadow: 0 1px 2px 0 rgba(26, 24, 48, 0.04), 0 2px 8px 0 rgba(26, 24, 48, 0.035);' \
    '  box-shadow: 0 2px 0 0 #ded8c8, 0 2px 8px 0 rgba(26, 24, 48, 0.035);'

# ── 8 ── the same, in the DARK theme only: each theme has its own raised rule,
# and a restyle of one does not touch the other
run_case 8 dark "every card carries a hard offset in the dark theme" \
  sub tailwind.config.js 'card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 1px 2px 0 rgba(0,0,0,0.5)",' \
    'card: "0 2px 0 0 #14142b, 0 1px 2px 0 rgba(0,0,0,0.5)",'

# ── 9 ── the one cell that may wrap stops wrapping. The semibold headings run
# wider in the fallback face this sweep draws in, and on the Buoyant page that
# pushed Basis 14px behind a sideways scroll until the Managed-by sub-line was
# allowed to give up the width. Since the position page became tabs (Stage
# 10ci) the Basis column is gone and the cell carries a width cap of its own, so
# the anchor is that cell as the tabbed page writes it, and the case also walks
# the holding every mandate carries — its account table prints V.E.C's long
# strategy name, the case the cell's own comment names.
CASE_ROUTES=stock-carried,stock-mandates-many run_case 9 light "the Managed-by cell may no longer wrap, so the position table overflows" \
  sub src/pages/StockInfo.tsx '<td className="max-w-[20rem] whitespace-normal px-4 py-2.5 text-[12px] text-slate-400">' \
    '<td className="px-4 py-2.5 text-[12px] text-slate-400">'
