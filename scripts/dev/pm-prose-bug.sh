#!/usr/bin/env bash
# VERIFY THE "NO EXPLAINER TEXT" AND "WHOLE-COLUMN DRAG" CHECKS BY
# REINTRODUCING EACH BUG, ONE AT A TIME.
#
#   "Why do i need all this garbage written please remove its obvious from the
#    table what it is"
#   "it should lift up the whole column instead of just lifting up the header"
#
# Private Market lost its card subtitles, the band and total sub-lines, the
# "How the capital totals are worked out" drop-down and the sides line, and
# each fact a reader acts on moved into a hover on the figure it describes.
# So there are three kinds of bug to put back, and each must fire its own
# check: a removed line RETURNING, a re-homed fact GOING MISSING from its
# hover, and the column drag carrying less than the whole column.
#
# Restored BY COPY on a trap, VERIFIED byte for byte, and REBUILT on the way
# out — restoring the source alone leaves `dist/` at the bugged build, and the
# next sweep reports the previous bug's failures under the next one's name. A
# patch that does not apply, or a build that fails, is reported as NOT A
# RESULT, never as clean. Invariants run on the first theme only, so THEMES is
# light and no screenshots are taken.
#
# Needs `vite preview` on :4173, like `check:pages`. COMMIT FIRST: this
# rewrites the files it patches, and a restore that failed would leave them so.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-pm-prose-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/pages/PrivateMarket.tsx"
  "src/lib/columnDrag.ts"
  "scripts/check-pages.mjs"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
put_back() {
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
  for f in "${FILES[@]}"; do cmp -s "$SNAP/$f" "$f" || echo "!! RESTORE FAILED for $f"; done
}
restore() {
  put_back
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

PM_ROUTES="private-market,private-market-tiles,private-market-folios,private-market-owners,private-market-returns,private-market-transactions,private-market-calls-off"
DRAG_ROUTES="monitor-arrange"

# The evidenced abstentions this book always has — not findings, and printed
# once in the control rather than under every case.
QUIET='NOT CHECKED  (no fund row prints a return where its cost is absent|a redeemed account shows a measured ₹0)'

sweep() {
  THEMES=light SHOTS=0 ONLY="$1" npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | grep -Ev "$QUIET" | sed 's/^/   /'
}

# `CASES="name|name"` re-runs only the cases whose name contains one of them —
# the control always runs, so a re-run is never read against a stale baseline.
run_case() {
  local routes="$1" name="$2"; shift 2
  if [ -n "${CASES:-}" ] && ! printf '%s' "$name" | grep -qiE "$CASES"; then return; fi
  echo ""
  echo "════════ BUG: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    sweep "$routes"
  fi
  put_back
}

# One exact substitution, or the case is not a result.
sub() { python3 - "$@" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path, encoding="utf8").read()
if s.count(old) != 1:
    print(f"   patch target found {s.count(old)} times"); sys.exit(1)
open(path, "w", encoding="utf8").write(s.replace(old, new))
PY
}
P=src/pages/PrivateMarket.tsx
D=src/lib/columnDrag.ts

echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && THEMES=light SHOTS=0 ONLY="$PM_ROUTES,$DRAG_ROUTES" npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | sed 's/^/   /'

# ── LINES COMING BACK ───────────────────────────────────────────────────────
run_case "$PM_ROUTES" "a card subtitle comes back" sub $P \
  '<Card className="mt-5" pad={false} title={active.cardTitle}' \
  '<Card className="mt-5" pad={false} title={active.cardTitle} subtitle="One row per fund, each holding counted once. Click a row to see each family member'"'"'s folio in the same columns."'

run_case "private-market,private-market-tiles" "the Marks span line comes back" sub $P \
  '<SelectableTiles page="private-market" storageKey={PM_TILES_KEY} defaults={PM_DEFAULT_TILES} metrics={tileMetrics} />' \
  '<p className="mb-4 text-[11.5px] text-slate-500">Marks span 30 Jun 2026 → 31 Jul 2026. Each fund is valued on its own statement'"'"'s date, shown on every row below.</p>
      <SelectableTiles page="private-market" storageKey={PM_TILES_KEY} defaults={PM_DEFAULT_TILES} metrics={tileMetrics} />'

run_case "private-market,private-market-transactions" "the sides line comes back" sub $P \
  '{/* THE DROP-DOWN "How the capital totals are worked out" AND THE LINE' \
  '<p className="border-t px-4 py-2.5 text-[11px] text-slate-500" data-pm-sides>This page is the private side of the book: Listed ₹699.8 Cr · Private ₹10.6 Cr · Total ₹710.4 Cr.</p>
        {/* THE DROP-DOWN "How the capital totals are worked out" AND THE LINE'

run_case "private-market" "the working drop-down comes back, folded" sub $P \
  '{/* THE DROP-DOWN "How the capital totals are worked out" AND THE LINE' \
  '<details className="border-t px-4 py-2.5 text-[11.5px] text-slate-500" data-pm-working><summary>How the capital totals are worked out</summary><ul><li>Still to call is summed exactly as each fund prints it.</li></ul></details>
        {/* THE DROP-DOWN "How the capital totals are worked out" AND THE LINE'

run_case "private-market,private-market-owners" "the band's basis is back on its face" sub $P \
  'const sub = `${s.groups.length} ${noun} · ${s.folios} folios`;' \
  'const sub = `${s.groups.length} ${noun} · ${s.folios} folios · ${grouping === "fund" ? "each holding counted once" : "each statement as printed"}`;'

run_case "private-market" "the line under the total's label comes back" sub $P \
  '{totalRow(book.privateTotal, "Private market total", {' \
  '{totalRow(book.privateTotal, <div><div>Private market total</div><div className="text-[11px] font-normal text-slate-500" data-pm-total-sub>each holding counted once · 11 capital accounts — what the capital tiles add to</div></div>, {'

run_case "private-market-folios,private-market-owners" "the Counted once sentence is back on its face" sub $P \
  '        hint={grouping === "fund"' \
  '        sub={grouping === "fund"'

run_case "private-market-transactions" "the Transactions band's sentence comes back" sub $P \
  'sub={`${m.history.length} calls`}' \
  'sub={`${m.history.length} calls, newest first — each fund'"'"'s rows reproduce the total its own statement prints, or none of them are shown`}'

run_case "private-market-returns" "a return-column count is a visible line again" sub $P \
  'coverage={meta?.note}>' 'note={meta?.note}>'

run_case "private-market-transactions" "the Transactions tab's hover promises the removed windows again" sub $P \
  'title: "Every capital call the funds have made, newest first.",' \
  'title: "What can still be called, and every capital call the funds have made.",'

# ── RE-HOMED FACTS GOING MISSING ────────────────────────────────────────────
run_case "private-market" "the working leaves the Still to call total's hover" sub $P \
  'Summed exactly as each fund prints it — ' 'Summed — '

run_case "private-market" "the second path leaves the hover" sub $P \
  '? `The same figure the other way: committed' '? `Committed'

run_case "private-market" "the floor sentence leaves the hover" sub $P \
  'is the floor of what the funds can still call, never the ceiling.' 'is what the funds can still call.'

run_case "private-market" "the account sentence leaves the hover" sub $P \
  '`${m.cc.count - m.capOutside} of this page’s ${m.scope.accounts.length} private accounts send a capital-account statement, and ' \
  '`Some accounts send no capital-account statement, and '

run_case "private-market" "the public-market clause leaves the Committed total's hover" sub $P \
  '      capElsewhereClause,
    ].filter(Boolean).join(" "),' \
  '    ].filter(Boolean).join(" "),'

run_case "private-market" "the clause's handle goes from the total row" sub $P \
  'attrs: m.capElsewhere.length ? {' 'attrs: m.capElsewhere.length < 0 ? {'

run_case "private-market,private-market-tiles" "the subtract warning is shown where the two cover one set" sub $P \
  'called: m.calledPaidSameSet
      ? ' 'called: !m.calledPaidSameSet
      ? '

run_case "private-market,private-market-tiles" "a fund row dated forward to the book's newest date" sub $P \
  ': r.asOf.length === 1 ? fmtDate(first)' ': r.asOf.length === 1 ? fmtDate("2026-08-29")'

run_case "private-market,private-market-calls-off" "the call header stops saying why the store cannot be read" sub $P \
  'noteTitle={entered.state.status === "unavailable" ? entered.state.reason : undefined}' 'noteTitle={undefined}'

run_case "private-market" "the private band's basis leaves its hover" sub $P \
  '"Each holding counted once. Where two statements' '"Where two statements'

run_case "private-market-folios" "the Counted once line's hover stops saying what it does" sub $P \
  'the row above counts it once, and this line takes the overlap out so the folios add to the row.' \
  'this line takes the overlap out.'

# ── THE DRAG CARRYING LESS THAN THE WHOLE COLUMN ───────────────────────────
run_case "$DRAG_ROUTES" "the drag lifts the heading alone" sub $D \
  'for (const c of shown) ghost.appendChild(copyCell(c, top, z));' 'void shown;'

run_case "$DRAG_ROUTES" "the column it came from is not dimmed" sub $D \
  'for (const c of cells) c.setAttribute("data-col-lifted", "");' '/* not dimmed */'

run_case "$DRAG_ROUTES" "Escape does not cancel the drag" sub $D \
  'if (ev.key !== "Escape" || state !== "dragging") return;' \
  'if (ev.key !== "Escape" || state !== "dragging" || col) return;'

run_case "$DRAG_ROUTES" "a drag that comes home sorts the column" sub $D \
  '    swallowNextClick();
    if (was === "dragging" && drag) {' '    if (was === "dragging" && drag) {'

run_case "$DRAG_ROUTES" "the copy is left on the page after the drop" sub $D \
  '    ghost.remove();
' '    void ghost;
'

run_case "$DRAG_ROUTES" "the copy is drawn at 100% over a zoomed table" sub $D \
  'zoom: String(z),' 'zoom: "1",'

echo ""
echo "════════ DONE"
