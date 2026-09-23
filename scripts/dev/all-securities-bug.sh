#!/usr/bin/env bash
# VERIFY THE ALL SECURITIES CHANGE'S CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# Stage 10cf: *"Make this view as All Securities and make it first in portfolio
# monitor and default open and put the all holding and all entities selectors to
# the right end of after return selector."* `check:pages` holds the default, the
# filter row's order and right end, the pick-list's panel, the picked-fund line,
# the empty footer and the three "in full" links; `check:family` drives the axis
# control. A check nobody has watched fail is a check nobody knows can fail, so
# each bug below is applied on its own, rebuilt, swept, and restored.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and it REBUILDS on the way out:
# restoring the source alone leaves `dist/` at the bugged build for the next run
# to report under the wrong name. A patch that does not apply, or a tree that
# does not build, is reported as NOT A RESULT rather than as a clean run.
#
# DO NOT EDIT ANY FILE IN `FILES` WHILE THIS RUNS: the restore puts the snapshot
# back, silently undoing the edit. It needs a `vite preview` on :4173 serving
# `dist/` (or `BASE=…`), which is what both sweeps read.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-all-securities-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/lib/groupAxis.ts"
  "src/pages/PortfolioMonitor.tsx"
  "src/components/MultiSelectFilter.tsx"
  "src/pages/MandateHoldings.tsx"
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

ROUTES=monitor,monitor-security,monitor-pick-fund,monitor-txns,mandate-fund,holdings-book,stock-mf-lookthrough

put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }

sweep() { ONLY=$ROUTES THEMES=light npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | grep -v 'NOT CHECKED' | sed 's/^/   /'; }
family() { npm run check:family 2>&1 | grep -E '^\s*✗|FAIL|passed|failed' | sed 's/^/   family: /'; }

run_case() {
  local name="$1" withFamily="$2"; shift 2
  echo ""
  echo "════════ BUG: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    sweep
    [ "$withFamily" = "family" ] && family
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
npm run build >/dev/null 2>&1 && sweep && family

# ── 1 ── the default back to Category: the security segment last again
default_back() {
  python3 - <<'PY'
p = "src/lib/groupAxis.ts"
s = open(p, encoding="utf-8").read()
head = "export const MONITOR_GROUP_VIEWS: readonly { key: MonitorAxis; label: string; title: string }[] = [\n"
i = s.index(head) + len(head)
j = s.index("  ...GROUP_VIEWS,\n];\n", i)
entry = s[i:j]
assert entry.startswith("  { key: SECURITY_AXIS"), entry[:40]
s = s[:i] + "  ...GROUP_VIEWS,\n" + entry + "];\n" + s[j + len("  ...GROUP_VIEWS,\n];\n"):]
open(p, "w", encoding="utf-8").write(s)
PY
}
run_case "the Monitor opens on Category again, All Securities last" family default_back

# ── 2 ── the old label back on the first segment
run_case "the first segment reads 'Security' again" family \
  sub src/lib/groupAxis.ts '{ key: SECURITY_AXIS, label: "All Securities",' '{ key: SECURITY_AXIS, label: "Security",'

# ── 3 ── the two selectors back at the head of the row
selectors_first() {
  python3 - <<'PY'
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
start = s.index('        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5" data-monitor-filters-right>\n')
end = s.index("\n        </div>\n", start) + len("\n        </div>\n")
block = s[start:end].replace("ml-auto ", "")
s = s[:start] + s[end:]
row = '      <div className="mb-2 flex flex-wrap items-center gap-1.5" data-monitor-filter-row>\n'
assert s.count(row) == 1
s = s.replace(row, row + block)
open(p, "w", encoding="utf-8").write(s)
PY
}
run_case "All holdings and All entities back at the head of the row" nofamily selectors_first

# ── 4 ── the pair still last, but no longer pushed to the right end
run_case "the selectors' group loses ml-auto" nofamily \
  sub src/pages/PortfolioMonitor.tsx '<div className="ml-auto flex flex-wrap items-center justify-end gap-1.5" data-monitor-filters-right>' \
    '<div className="flex flex-wrap items-center justify-end gap-1.5" data-monitor-filters-right>'

# ── 5 ── the Monitor stops asking for a leftward panel
run_case "the pick-list's panel opens rightward from the row's end" nofamily \
  sub src/pages/PortfolioMonitor.tsx 'onChange={setSelected} dense align="right"' 'onChange={setSelected} dense'

# ── 6 ── the attribute says right, the class does not — only geometry sees it
run_case "the panel claims right alignment and is drawn from the left" nofamily \
  sub src/components/MultiSelectFilter.tsx '${align === "right" ? "right-0" : "left-0"}' 'left-0'

# ── 7 ── the family's defect: a picked fund draws the generic empty line again
notice_gone() {
  sub src/pages/PortfolioMonitor.tsx '{pickedNotRows.length > 0 && (' '{pickedNotRows.length > 99999 && (' \
  && sub src/pages/PortfolioMonitor.tsx '{rows.length === 0 && pickedNotRows.length === 0 && <tr>' '{rows.length === 0 && <tr>'
}
run_case "a picked fund reads 'No positions match your filters' again" nofamily notice_gone

# ── 8 ── a footer summed over no rows
run_case "the ₹0 footer is drawn over an empty table again" nofamily \
  sub src/pages/PortfolioMonitor.tsx '              {rows.length > 0 && (
              <tfoot' '              {rows.length >= 0 && (
              <tfoot'

# ── 9 ── the button that fixes it does nothing
run_case "'Show it on Category' does nothing" nofamily \
  sub src/pages/PortfolioMonitor.tsx 'data-show-on-category onClick={() => setGroupAxis("category")}' 'data-show-on-category onClick={() => {}}'

# ── 10 ── …or moves the axis and throws the pick away
run_case "'Show it on Category' clears the pick" nofamily \
  sub src/pages/PortfolioMonitor.tsx 'data-show-on-category onClick={() => setGroupAxis("category")}' \
    'data-show-on-category onClick={() => { setSelected(new Set()); setGroupAxis("category"); }}'

# ── 11 ── an "in full" link back at the bare /monitor, which is All Securities now
run_case "a mandate page's 'carries this account in full' opens All Securities" nofamily \
  sub src/pages/MandateHoldings.tsx '<Link to="/monitor?group=category" data-monitor-in-full' '<Link to="/monitor" data-monitor-in-full'

# ── 12 ── the line promises Category for a CLOSED fund too, which Category does not draw
run_case "a closed fund picked on All Securities is promised on Category" nofamily \
  sub src/pages/PortfolioMonitor.tsx 'for (const p of currentHoldings(positions)) {' 'for (const p of positions) {'
