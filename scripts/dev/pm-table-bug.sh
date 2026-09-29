#!/usr/bin/env bash
# VERIFY THE PRIVATE MARKET TABLE'S CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# A check nobody has watched fail is a check nobody knows can fail. Each bug is
# applied on its own, rebuilt, swept over every private-market route and — for
# the ones that live in the model — run through `test:family` too, then
# restored.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and it REBUILDS on the way out:
# `src/lib/privateBook.ts`, `src/components/TreeTable.tsx` and the new suite
# are UNTRACKED, where `git checkout --` silently does nothing, and restoring
# the source alone leaves `dist/` at the bugged build for the next run to report
# under the wrong name. A patch that does not apply, or a tree that does not
# build, is reported as NOT A RESULT rather than as a clean run.
#
# DO NOT EDIT ANY FILE IN `FILES` WHILE THIS RUNS: the restore puts the snapshot
# back, silently undoing the edit.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-pm-table-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/pages/PrivateMarket.tsx"
  "src/lib/privateBook.ts"
  "src/lib/capitalCalls.ts"
  "src/components/TreeTable.tsx"
  "src/components/EnteredCalls.tsx"
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

ROUTES=private-market,private-market-tiles,private-market-folios,private-market-owners,private-market-transactions,private-market-returns,private-market-calls,private-market-calls-off

put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }

run_case() {
  local name="$1" suite="$2"; shift 2
  echo ""
  echo "════════ BUG: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | grep -v 'NOT CHECKED' | sed 's/^/   /'
    if [ "$suite" = "suite" ]; then
      # THE VERDICT IS THE SUITE'S OWN EXIT STATUS, never grep's — the suite's
      # output carries NUL bytes, and piped through grep with `pipefail` a
      # failing suite read as clean on every case in the harness this copies.
      local out rc
      out=$(node scripts/test-family.mjs 2>&1); rc=$?
      if [ $rc -eq 0 ]; then echo "   SUITE CLEAN — THE BUG DID NOT FIRE IN test:family"
      else printf '%s\n' "$out" | tr -d '\000' | grep -aE '^FAIL' | head -6 | sed 's/^/   SUITE /'; fi
    fi
  fi
  put_back
}

py() { python3 - "$@"; }

echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | grep -v 'NOT CHECKED' | sed 's/^/   /'

# ── 1 ── the family's own complaint: a table drawn inside a cell
run_case "a fund's folios open into a table inside a cell again" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = '        {open && grouping === "fund" && g.overlap && overlapRow(g.overlap, g.key, g.overlap.statements, inPrivate)}'
new = old + '\n        {open && <tr><td colSpan={bookView.order.length}><table><tbody><tr><td>panel</td></tr></tbody></table></td></tr>}'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 2 ── "a hidden drop down": the missing-data section opens on arrival
run_case "the missing-data section is open by default" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = '''    marker: <Pill tone="warn" className="whitespace-nowrap">missing data</Pill>,
    defaultOpen: false,'''
new = '''    marker: <Pill tone="warn" className="whitespace-nowrap">missing data</Pill>,
    defaultOpen: true,'''
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 3 ── an absent value summed as ₹0
run_case "a set with no holding sums to ₹0 instead of absent" suite py <<'PY'
import sys
p = "src/lib/privateBook.ts"
s = open(p, encoding="utf-8").read()
old = "  const value = held.length ? sum(held.map((f) => f.value ?? 0)) : null;"
new = "  const value = held.length ? sum(held.map((f) => f.value ?? 0)) : 0;"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 4 ── fund rows on the printed basis
run_case "fund rows stop counting each holding once" suite py <<'PY'
import sys
p = "src/lib/privateBook.ts"
s = open(p, encoding="utf-8").read()
old = '    const consolidated = grouping === "fund";'
new = '    const consolidated = false;'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 5 ── member rows deduped
run_case "member rows dedupe (a per-owner figure never does)" suite py <<'PY'
import sys
p = "src/lib/privateBook.ts"
s = open(p, encoding="utf-8").read()
old = '    const consolidated = grouping === "fund";'
new = '    const consolidated = true;'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 6 ── a capital account attached twice
# Re-anchored at Stage 10cx: since Stage 10ct the line reads `attached.add(accountId)`,
# and until then this case reported NOT A RESULT rather than its bug.
run_case "a capital account is attached twice" suite py <<'PY'
import sys
p = "src/lib/privateBook.ts"
s = open(p, encoding="utf-8").read()
old = "    if (cap) attached.add(accountId);\n"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

# ── 7 ── the Expand all control wired to nothing
run_case "Expand all opens nothing" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = "<ExpandAllButton allOpen={allOpen} onClick={toggleAll} />"
new = "<ExpandAllButton allOpen={allOpen} onClick={() => { /* wired to nothing */ }} />"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 8 ── the calls read oldest first
run_case "the capital calls read oldest first" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = "    m.history.filter((c) => !needle"
new = "    [...m.history].reverse().filter((c) => !needle"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 9 ── a public-market fund back as a row (the family placed it on the listed side)
run_case "a public-market AIF is a row of the private section again" nosuite py <<'PY'
import sys
p = "src/lib/privateBook.ts"
s = open(p, encoding="utf-8").read()
old = '  return isPrivateClass(p) ? "private" : null;'
new = '  return isPrivateClass(p) || p.assetClass === "AIF" ? "private" : null;'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 10 ── the public-market capital accounts counted on the page too
#    (The redeemed-nil case that used to be here has no subject on this book
#    since the family's placing: the only account redeemed to nil, Motilal
#    Oswal's Hedged Equity strategy, is not a private-market fund, so the check
#    ABSTAINS with that evidence and a bug there could not be watched firing.)
run_case "the public-market capital accounts are counted on the page as well as named" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = "    const commitments = cap.onPage;"
new = "    const commitments = portfolio.commitments ?? [];"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 11 ── the crossed-set wording comes back on the uncalled tile
run_case "the uncalled tile counts its accounts as a fraction of this page's" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = "        + `Across ${m.ct.count} capital accounts of private-market funds`"
new = "        + `Across ${m.ct.count} of this page's ${m.scope.accounts.length} private accounts`"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 12 ── a total prints a coverage caveat about nothing ("11 of 11 accounts")
#    (Every private-market capital account prints every line since the family's
#    placing, so the caveat that "drops off" has no subject; the direction that
#    can still go wrong is a caveat where the coverage is full.)
run_case "a total prints a coverage caveat where coverage is full" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = '(k === "total" || k === "section") && of > 0 && n < of'
new = '(k === "total" || k === "section") && of > 0 && n <= of'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 13 ── due-now counted over every account (the `?? 0` shape)
run_case "due-now claims every account prints the line" suite py <<'PY'
import sys
p = "src/lib/capitalCalls.ts"
s = open(p, encoding="utf-8").read()
old = "    dueNowOf: of((r) => r.pending),"
new = "    dueNowOf: rows.length,"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 14 ── the table stops fitting its card
run_case "the fund column grows until a column is cut off" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = 'className="min-w-[15rem]"'
new = 'className="min-w-[36rem]"'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 15 ── THE CAPITAL CALL COLUMN (merged from main): a member row is not a fund
run_case "a call cell is drawn on a member row as well" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = 'const groupCallKey = (g: BookGroup) => (g.kind === "fund" ? callKeyOf(g.key, g.securityKey) : null);'
new = 'const groupCallKey = (g: BookGroup) => callKeyOf(g.key, g.securityKey);'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 16 ── the gap the column shipped with: a fund no statement values gets no cell
run_case "an unvalued fund has no row to type a call against" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = 'securityKey ?? fundKey.replace(/^account:/, "fund-");'
new = 'securityKey ?? "";'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 17 ── what the family typed folded into what the statements print
run_case "an entered call is added into Still to call" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = 'value: <span className="text-amber-400">{money(m.ct.undrawn)}</span>,'
new = 'value: <span className="text-amber-400">{money((m.ct.undrawn ?? 0) + (entered.state.status === "ready" ? entered.state.calls.reduce((a, c) => a + c.amount, 0) : 0))}</span>,'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 18 ── a store that cannot be read drawn as a figure
run_case "the unavailable store renders ₹0 with no reason" nosuite py <<'PY'
import sys
p = "src/components/EnteredCalls.tsx"
s = open(p, encoding="utf-8").read()
old = 'return <span data-pm-call-state="unavailable"><AbsentCell reason={state.reason} /></span>;'
new = 'return <span data-pm-call-state="unavailable">₹0</span>;'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 19 ── the entered call back on one line, the widest thing in the table
run_case "the call cell goes back to one line and pushes a column off" nosuite py <<'PY'
import sys
p = "src/components/EnteredCalls.tsx"
s = open(p, encoding="utf-8").read()
old = 'className={`inline-flex flex-col items-start rounded'
new = 'className={`inline-flex whitespace-nowrap items-start rounded'
if old not in s: sys.exit(1)
s = s.replace(old, new, 1)
# …and widen what it says, the way the one-line cell read
old2 = '<span className="text-[10.5px] text-slate-500">\n        {fmtDate(head.call.date)}'
new2 = '<span className="text-[12px] text-slate-500">&nbsp;·&nbsp;Next call entered&nbsp;{fmtDate(head.call.date)}'
if old2 not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old2, new2, 1))
PY

# ── 20 ── the removed "what can still be called" windows come back
run_case "the timeline windows come back on the Transactions tab" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = '                <tr className={TREE_ROW.section} data-pm-call-section="history">'
new = '                <tr data-call-bucket="1m"><td colSpan={callView.order.length}>Next 1 month — nothing scheduled</td></tr>\n' + old
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 21 ── THE RETURN COLUMNS (merged from main's #72): a pooled rate over part of
#    its set stops saying which part
run_case "the total's pooled XIRR stops saying how many funds it pools" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = '{part && <span className="text-[10.5px] font-normal text-slate-500"> · {part.covers} of {part.of}</span>}'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

# ── 22 ── the total's XIRR pooled over the printed statements, not the funds
run_case "the total's XIRR pools every statement instead of each fund once" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = 'cells={figureCells({ ...fig, ret: aggRet(book.folios, true, "total") }'
new = 'cells={figureCells({ ...fig, ret: aggRet(book.folios, false, "total") }'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 23 ── a set's CAGR printed as its return on cost
run_case "a band and the total print their HPR under CAGR, YTD and CY too" nosuite py <<'PY'
import sys
p = "src/pages/PrivateMarket.tsx"
s = open(p, encoding="utf-8").read()
old = '      if (measure === "auto" || measure === "absolute") {\n        if (fig.returnPct == null) {'
new = '      if (measure !== "xirr") {\n        if (fig.returnPct == null) {'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

echo ""
echo "════════ done"
