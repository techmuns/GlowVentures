#!/usr/bin/env bash
# VERIFY THE NEW LOOK'S CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# The family asked for Glow Central Research's fonts and colours (Stage 10ca):
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
# preview on another port can be swept (`BASE=http://127.0.0.1:4180`).
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-look-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/index.css"
  "src/components/PageHeader.tsx"
  "src/components/Sidebar.tsx"
  "src/pages/PortfolioMonitor.tsx"
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

run_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    THEMES=light ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗|contrast=[1-9]|dark-|pale-' | grep -v 'NOT CHECKED' | sed 's/^/   /'
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
npm run build >/dev/null 2>&1 && THEMES=light ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | grep -v 'NOT CHECKED' | sed 's/^/   /'

# ── 1 ── the page title back in the reading face
run_case "the page title is back in Inter" \
  sub src/components/PageHeader.tsx 'className="font-display text-xl font-bold tracking-tight text-slate-100"' \
    'className="text-xl font-bold tracking-tight text-slate-100"'

# ── 2 ── figures back in the monospace
run_case "figures are back in JetBrains Mono" \
  sub src/index.css '.mono { font-family: "Inter", ui-monospace, "DejaVu Sans Mono", monospace;' \
    '.mono { font-family: "JetBrains Mono", ui-monospace, monospace;'

# ── 3 ── the nav back to the page's own ivory
run_case "the nav is ivory again" \
  sub src/index.css 'html:not(.dark) aside.app-sidebar {
  background-color: #ffffff;' 'html:not(.dark) aside.app-sidebar {
  background-color: #efece3;'

# ── 4 ── the top bar back to the page's own ivory
run_case "the top bar is ivory again" \
  sub src/index.css '  background-color: rgba(255, 255, 255, 0.82);' '  background-color: rgba(239, 236, 227, 0.92);'

# ── 5 ── "you are here" no longer gold
run_case "the active nav entry is not marked in gold" \
  sub src/components/Sidebar.tsx 'isActive ? "nav-active bg-ink-700/80 text-slate-100"' 'isActive ? "bg-ink-700/80 text-slate-100"'

# ── 6 ── GCR's white type on a gold control, which this page must never print
run_case "an active toggle carries white type on the gold" \
  sub src/pages/PortfolioMonitor.tsx '${view === m ? "bg-champagne-500 text-ink-950 shadow-glow"' '${view === m ? "bg-champagne-500 text-white shadow-glow"'

# ── 7 ── every card lifted like a button
run_case "every card carries a hard offset, like a button" \
  sub src/index.css '  box-shadow: 0 1px 2px 0 rgba(26, 24, 48, 0.04), 0 2px 8px 0 rgba(26, 24, 48, 0.035);' \
    '  box-shadow: 0 2px 0 0 #ded8c8, 0 2px 8px 0 rgba(26, 24, 48, 0.035);'
