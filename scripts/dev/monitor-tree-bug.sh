#!/usr/bin/env bash
# VERIFY THE PORTFOLIO MONITOR TREE'S CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# The Monitor's holdings table opens a row into ROWS OF THE SAME TABLE — a
# mandate's shares, a holding's statement lines, the dated contributions behind
# a line — on the standard `src/components/TreeTable.tsx` sets. A check nobody
# has watched fail is a check nobody knows can fail, so each bug below is
# applied on its own, rebuilt, swept over the Monitor routes that walk the tree,
# and restored.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and it REBUILDS on the way out:
# restoring the source alone leaves `dist/` at the bugged build for the next run
# to report under the wrong name. A patch that does not apply, or a tree that
# does not build, is reported as NOT A RESULT rather than as a clean run.
#
# DO NOT EDIT ANY FILE IN `FILES` WHILE THIS RUNS: the restore puts the snapshot
# back, silently undoing the edit. `BASE` is passed through to the sweep, so a
# preview on another port can be swept (`BASE=http://127.0.0.1:4175`).
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-monitor-tree-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/pages/PortfolioMonitor.tsx"
  "src/components/TreeTable.tsx"
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

ROUTES=monitor,monitor-open-all,monitor-section-closed,monitor-category-drill,monitor-fund-drill,monitor-tranche,monitor-entity,monitor-security-drill

put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }

run_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | grep -v 'NOT CHECKED' | sed 's/^/   /'
  fi
  put_back
}

# ONE substitution in the Monitor page, which must match exactly once — a patch
# that matched nothing (or twice) is not a result, and says so.
sub() {
  python3 - "$1" "$2" <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
old, new = sys.argv[1], sys.argv[2]
s = open(p, encoding="utf-8").read()
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY
}

echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | grep -v 'NOT CHECKED' | sed 's/^/   /'

# ── 1 ── the family's own complaint: a table drawn inside the row it opens
run_case "a statement line opens into a table inside a cell again" sub \
  '        out.push(...trancheRows(r.key, fk, v.cls, v.assetClass, t, 2, lastLine, !switchNoted));' \
  '        out.push(...trancheRows(r.key, fk, v.cls, v.assetClass, t, 2, lastLine, !switchNoted));
        out.push(treeLine(`${r.key}>${fk}>panel`, "panel", false, <table><tbody><tr><td>panel</td></tr></tbody></table>));'

# ── 2 ── Expand all wired to nothing
run_case "Expand all opens nothing" sub \
  '<ExpandAllButton allOpen={allOpen} onClick={toggleAll} />' \
  '<ExpandAllButton allOpen={allOpen} onClick={() => { /* wired to nothing */ }} />'

# ── 3 ── a child row that stops being in the table's columns
run_case "a statement line drops a column" sub \
  '    <td key="pnl" className={CHILD_NUM}>{c.pnl}</td>,
' ''

# ── 4 ── the arithmetic line that makes the lines add to the row
run_case "the Counted once row is dropped" sub \
  '    if (overlap) {' \
  '    if (overlap && vs.length > 99) {'

# ── 5 ── the lines built from the DEDUPED set (a per-account figure never is)
run_case "a holding's lines are the deduped set, not every statement" sub \
  '          venues: venuesOf(ps, accIdx),' \
  '          venues: venuesOf(dps, accIdx),'

# ── 6 ── a contribution hung from someone else's statement
run_case "every line's contributions hang from the first line" sub \
  '        out.push(...trancheRows(r.key, fk, v.cls, v.assetClass, t, 2, lastLine, !switchNoted));' \
  '        out.push(...trancheRows(r.key, venueKeyOf(vs[0]), v.cls, v.assetClass, t, 2, lastLine, !switchNoted));'

# ── 7 ── a section band that no longer folds
run_case "a section band stops folding" sub \
  '    setClosedSections((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });' \
  '    void k;'

# ── 8 ── a folded section loses its totals with its rows
run_case "a folded section hides its totals too" sub \
  '{showBucketSections && (() => {' \
  '{showBucketSections && secOpen && (() => {'

# ── 9 ── the look-through line drawn while it has nothing to say
run_case "the look-through line is drawn empty" sub \
  'const lookThrough = canLookThrough(r) && exposure.status !== "loading";' \
  'const lookThrough = canLookThrough(r);'

# ── 10 ── a mandate that opens onto some of its shares
run_case "a mandate opens onto three of its shares" sub \
  'm.holdings.forEach((h, i) => out.push(childRow(' \
  'm.holdings.slice(0, 3).forEach((h, i) => out.push(childRow('

# ── 11 ── a line's share of the holding struck over the wrong total
run_case "a line's share is divided by the largest line, not the lines' sum" sub \
  'for (const v of built) v.share = raw > 0 ? v.marketValue / raw : 0;' \
  'for (const v of built) v.share = raw > 0 ? v.marketValue / (built[0].marketValue || raw) : 0;'

# ── 12 ── a clubbed fund's lines stop being its classes
run_case "a clubbed fund's lines are not named for their class" sub \
  'const asClass = r.fundClasses.length > 0 && !!v.cls;' \
  'const asClass = false;'

# ── 13 ── a contribution's entry NAV left out of Avg cost
run_case "a contribution prints no entry NAV" sub \
  '{fmtFromBase(x.navAtEntry)}</span>,' \
  '{null}</span>,'

# ── 14 ── a return that stops saying which basis it is on
run_case "a line's return is untagged" sub \
  'const off = measure === "auto" || res.tag !== returnMeasureDef(measure).tag;' \
  'const off = false;'

echo ""
echo "════════ done"
