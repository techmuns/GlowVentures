#!/usr/bin/env bash
#
# Reintroduce one defect at a time and prove the right check fires.
#
# THE SNAPSHOT IS DELETED BY THE TRAP AND NEVER BY `restore`. The first draft
# had `restore()` remove it, so the first explicit restore destroyed the only
# copy and every later one silently did nothing: bugs 2-8 ran on a tree that was
# never cleaned between them and reported each other's failures under the wrong
# name, while the run still exited 0. That is this file's own "a restore that
# cannot restore looks exactly like one that did", and it is why `restore`
# VERIFIES rather than assuming.
#
# It also REBUILDS on the way out — restoring the source alone leaves `dist/` at
# the bugged build for the next sweep to read. A patch that does not apply, or a
# build that fails, is reported as NOT A RESULT rather than as a clean sweep.
set -uo pipefail
cd "$(dirname "$0")/../.."
FILES=("src/pages/StockInfo.tsx" "scripts/check-pages.mjs")
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
restore() {
  for f in "${FILES[@]}"; do
    cp "$SNAP/$f" "$f" || { echo "!!! RESTORE FAILED for $f — every result after this is garbage"; exit 1; }
    cmp -s "$SNAP/$f" "$f" || { echo "!!! RESTORE DID NOT TAKE for $f"; exit 1; }
  done
  npm run build >/dev/null 2>&1 || echo "!!! REBUILD AFTER RESTORE FAILED"
}
trap 'restore; rm -rf "$SNAP"' EXIT

# `stock-cmp-derived` was retired at Stage 10bn; `stock-cmp-agree` carries the
# Total-row claim since the position page became tabs (Stage 10cg), because the
# `stock` holding is held in ONE account and draws no Total row.
ROUTES="stock,stock-cmp-split,stock-cmp-unmarked,stock-cmp-agree,stock-cmp-nav,stock-fund"
run() {
  if ! npm run build >/dev/null 2>&1; then echo "    NOT A RESULT (build failed)"; return; fi
  ONLY=$ROUTES npm run check:pages 2>&1 \
    | grep -E "INVARIANT FAILED|combinations (clean|have)" | sed 's/^ */    /'
}
# patch <file> <old> <new> — refuses unless `old` appears EXACTLY once.
patch() {
  python3 - "$@" <<'PY'
import io,sys
p,old,new=sys.argv[1],sys.argv[2],sys.argv[3]
s=io.open(p,encoding="utf8").read()
if s.count(old)!=1: sys.exit("    NOT A RESULT (anchor matched %d times)"%s.count(old))
io.open(p,"w",encoding="utf8").write(s.replace(old,new,1))
PY
}
bug() { echo; echo "### $1"; }

echo "=== CONTROL — no patch. Anything here is pre-existing."
run

bug "1. the headline picks the first statement's mark (the original defect)"
patch src/pages/StockInfo.tsx \
  'const cmpSplit = cmpMarks.length > 1;' 'const cmpSplit = false;' \
&& patch src/pages/StockInfo.tsx \
  'const cmp = cmpMarks.length === 1 ? cmpMarks[0] : null;' 'const cmp = cmpMarks[0] ?? null;' \
&& run
restore

bug "2a. the column dropped from POS_COLS but left in the markup (footer goes short)"
patch src/pages/StockInfo.tsx \
  '"qty", "avgCost", "cmp", "invested"' '"qty", "avgCost", "invested"' && run
restore

bug "2b. the column removed outright — the family's ask, undone"
patch src/pages/StockInfo.tsx \
  '"qty", "avgCost", "cmp", "invested"' '"qty", "avgCost", "invested"' \
&& patch src/pages/StockInfo.tsx \
  '                    <SortHeader col="cmp" view={posView}' \
  '                    {false && <SortHeader col="cmp" view={posView}' \
&& patch src/pages/StockInfo.tsx \
  'than averages.">CMP</SortHeader>' \
  'than averages.">CMP</SortHeader>}' && run
restore

bug "3. the cell derives mv/qty instead of reading the printed mark"
patch src/pages/StockInfo.tsx \
  'data-cmp={r.currentPrice ?? ""}' 'data-cmp={r.currentPrice ?? ""} data-derived' \
&& patch src/pages/StockInfo.tsx \
  '{price(r.currentPrice)}
                                </span>}' \
  '{price(r.quantity > 0 ? r.marketValue / r.quantity : null)}
                                </span>}' && run
restore

bug "4. every row prints the holding-level figure, not its own statement's"
patch src/pages/StockInfo.tsx \
  '{price(r.currentPrice)}
                                </span>}' \
  '{cmpMarks[0] ?? price(r.currentPrice)}
                                </span>}' && run
restore

bug "5. the refusal swallows the book — a dash on every holding"
patch src/pages/StockInfo.tsx \
  'const cmp = cmpMarks.length === 1 ? cmpMarks[0] : null;' 'const cmp = null;' && run
restore

bug "6. the Total row prints a quantity-weighted blend of the marks"
python3 - <<'EOF' || echo "    NOT A RESULT (anchor)"
import io,re
p="src/pages/StockInfo.tsx"
s=io.open(p,encoding="utf8").read()
m=re.search(r"\n                              \{cmpSplit\n.*?\n                                : cmp\}", s, re.S)
assert m and s.count(m.group(0))==1
io.open(p,"w",encoding="utf8").write(s.replace(m.group(0), "{price(qty > 0 ? mv / qty : null)}", 1))
EOF
run
restore

bug "7. the unmarked absence borrows the disagreement wording"
patch src/pages/StockInfo.tsx \
  'line: "reported at a total value, not a price per unit",' \
  'line: "the statements reporting this holding do not agree on a mark",' && run
restore

bug "8. the absent mark is price()'s bare dash, with no cause"
patch src/pages/StockInfo.tsx \
  '{r.currentPrice === null
                              ? <AbsentCell reason="this statement reports the holding at a total value, not a price per unit, so there is no mark to show" />' \
  '{r.currentPrice === null
                              ? price(null)' && run
restore

bug "9. the price tile dates the mark to rows[0] rather than the statement that supplied it"
patch src/pages/StockInfo.tsx \
  'const markedRow = rows.find((r) => r.currentPrice != null);' \
  'const markedRow = rows[0];' && run
restore
echo
echo "=== done"
