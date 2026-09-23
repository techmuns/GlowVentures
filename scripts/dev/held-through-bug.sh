#!/usr/bin/env bash
# VERIFY THE "EVERY WAY IT'S HELD" CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# The company page's Position by account table has a tab per route — Direct,
# PMS managers, Mutual funds — and a company held only inside the family's
# funds has a page of its own (Stage 10ca). Each bug below is applied on its
# own, rebuilt, run against the checks that should catch it, and restored — the
# discipline `carried-cost-bug.sh` and `txn-merge-bug.sh` already follow:
#
#   * THE RESTORE IS BY COPY AND ON A TRAP, verified with `cmp`.
#   * IT REBUILDS ON THE WAY OUT, or `dist/` is left at the last bugged build.
#   * A PATCH THAT DOES NOT APPLY, OR A TREE THAT DOES NOT BUILD, IS "NOT A
#     RESULT" — never a clean run.
#   * THE SUITE VERDICT IS THE SUITE'S OWN EXIT STATUS, never a grep over its
#     output.
#   * COMMIT FIRST. This rewrites the files under test.
#
# Two kinds of case: `model` bugs live in `src/lib/heldThrough.ts` and must fire
# BOTH the arithmetic suite and the page sweep; `page` bugs live in the page and
# must fire the sweep. Needs a `vite preview` on :4173.
#
#   CASES="3 7" scripts/dev/held-through-bug.sh    # run only some
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-held-through-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/pages/StockInfo.tsx"
  "src/lib/heldThrough.ts"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
put_back() {
  for f in "${FILES[@]}"; do
    cp "$SNAP/$f" "$f"
    cmp -s "$SNAP/$f" "$f" || echo "!! $f did not restore"
  done
}
restore() {
  put_back
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

ROUTES=stock-held,stock-held-managers,stock-held-funds,stock-funds-only
N=0
want() { [ -z "${CASES:-}" ] || [[ " $CASES " == *" $N "* ]]; }

sweep() {
  ONLY=$ROUTES npm run check:pages 2>&1 | tr -d '\000' | grep -aE 'INVARIANT|NOT CHECKED|^✓|^✗' | sed 's/^/   /'
}
suite() {
  local dir out r
  dir=$(mktemp -d -p node_modules)
  ./node_modules/.bin/esbuild src/lib/__tests__/heldThrough.test.ts --bundle --platform=node --format=esm \
    --outfile="$dir/h.mjs" --packages=external "--alias:@=$PWD/src" --log-level=error || { rm -rf "$dir"; echo "   SUITE did not bundle"; return; }
  out=$(GLOW_FIXTURES="$PWD/src/lib/__tests__/fixtures" node "$dir/h.mjs" 2>&1); r=$?
  if [ $r -eq 0 ]; then echo "   SUITE heldThrough clean"; else
    printf '%s\n' "$out" | tr -d '\000' | grep -aE '^FAIL' | head -8 | sed 's/^/   SUITE /'
  fi
  rm -rf "$dir"
}

run_case() {
  local kind="$1" name="$2"; shift 2
  N=$((N + 1))
  want || { cat >/dev/null; return; }
  echo ""
  echo "════════ BUG $N ($kind): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    [ "$kind" = model ] && suite
    sweep
  fi
  put_back
}

py() { python3 - "$@"; }

if [ -z "${CASES:-}" ]; then
  echo "════════ CONTROL: no patch"
  npm run build >/dev/null 2>&1 && suite && sweep
fi

# ── the model ───────────────────────────────────────────────────────────────
run_case model "the average cost is struck over every unit again" py <<'PY'
import sys
p = "src/lib/heldThrough.ts"
s = open(p, encoding="utf-8").read()
old = "    avgCost: cost !== null && costedQty > 0 ? cost / costedQty : null,"
new = "    avgCost: cost !== null && costedQty > 0 ? cost / sum(d.map((p) => p.quantity)) : null,"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_case model "the derived half leaks into the book's own figure" py <<'PY'
import sys
p = "src/lib/heldThrough.ts"
s = open(p, encoding="utf-8").read()
old = "  const measured = measuredTotals(rows);\n"
new = "  const measured = measuredTotals(rows);\n  if (derived !== null) measured.mv += derived;\n"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_case model "one line per fund, not per family member holding it" py <<'PY'
import sys
p = "src/lib/heldThrough.ts"
s = open(p, encoding="utf-8").read()
old = "    for (const p of ps) {\n      lines.push({"
new = "    for (const p of ps.slice(0, 1)) {\n      lines.push({"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_case model "an own account is filed under the managers, and a mandate under Direct" py <<'PY'
import sys
p = "src/lib/heldThrough.ts"
s = open(p, encoding="utf-8").read()
old = '  return route === "own" ? "direct" : route === "mandate" ? "manager" : "other";'
new = '  return route === "own" ? "manager" : route === "mandate" ? "direct" : "other";'
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_case model "the funds band reads first" py <<'PY'
import sys
p = "src/lib/heldThrough.ts"
s = open(p, encoding="utf-8").read()
old = 'export const HELD_ROUTES: readonly HeldRoute[] = ["direct", "manager", "fund", "other"];'
new = 'export const HELD_ROUTES: readonly HeldRoute[] = ["fund", "direct", "manager", "other"];'
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── the page ────────────────────────────────────────────────────────────────
run_case page "the sub-tabs are never drawn" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = "  const tabsShown = isCompanyPage;"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "  const tabsShown = isCompanyPage && rows.length < 0;", 1))
PY

run_case page "the address's tab is ignored — every visit opens on All" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '    : heldTabParam === "other" && ht.sections.other.lines === 0 ? "all" : heldTabParam;'
new = '    : heldTabParam === "other" && ht.sections.other.lines === 0 ? "all" : heldTabParam.length > 0 ? "all" : heldTabParam;'
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_case page "the PMS managers tab draws the direct rows" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = 'const TAB_ROUTE: Record<Exclude<HeldTab, "all">, HeldRoute> = { direct: "direct", managers: "manager",'
new = 'const TAB_ROUTE: Record<Exclude<HeldTab, "all">, HeldRoute> = { direct: "direct", managers: "direct",'
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_case page "the All tab leaves the fund lines out" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = "                          {fl.status === \"ok\" && sortedFunds(fl.lines).map(fundRow)}\n"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

run_case page "a fund line stops saying whether the fund holds shares or debt" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = "              {heldAs && <> · <span data-fund-line-held={heldAs}>{heldAs}</span></>} · {weight} of the fund</span>"
new = "              {\" · \"}{weight} of the fund</span>"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_case page "a fund line prints the fund holding under Invested" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = ('<td className="px-4 py-2.5 text-right mono text-slate-400"><AbsentCell reason={FUND_LINE_WHY.cmp} /></td>\n'
       '        <td className="px-4 py-2.5 text-right mono text-slate-400"><AbsentCell reason={FUND_LINE_WHY.cost} /></td>')
new = ('<td className="px-4 py-2.5 text-right mono text-slate-400"><AbsentCell reason={FUND_LINE_WHY.cmp} /></td>\n'
       '        <td className="px-4 py-2.5 text-right mono text-slate-400">{money(l.fundValue)}</td>')
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_case page "the Total exposure line forgets the derived half" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = "ht.total !== null && derivedFoot(ht.total,"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "ht.total !== null && derivedFoot(ht.measured.mv,", 1))
PY

run_case page "the Total row stops saying which units the cost covers" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = "        label={partial\n"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "        label={partial && t.qty < 0\n", 1))
PY

run_case page "the AIF holdings that disclose nothing are dropped from the note" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = "{fl.aif.length > 0 && <span data-held-aif={fl.aif.length}>"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "{fl.aif.length < 0 && <span data-held-aif={fl.aif.length}>", 1))
PY

run_case page "the header counts fund lines where it says funds" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = "data-stock-held-funds={ht.fundLines.funds}"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "data-stock-held-funds={ht.fundLines.lines.length}", 1))
PY

run_case page "a company held only inside funds reads 'Position closed' again" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = "  const fundOnly = noBookRows && !!fundHit && fundHit.total > 0;"
new = "  const fundOnly = noBookRows && !!fundHit && fundHit.total < 0;"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_case page "the tax card stands over a company held only inside funds" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = "          {!fundOnly && (\n          <Card className=\"mt-5\" title=\"Tax basis & holding\""
new = "          {(!fundOnly || rows.length === 0) && (\n          <Card className=\"mt-5\" title=\"Tax basis & holding\""
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

run_case page "four empty research panels come back on a funds-only company" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = "  const researchHeld = noBookRows && !sym && (fundOnly || resolving);"
new = "  const researchHeld = noBookRows && !sym && resolving;"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

echo ""
echo "════════ done — $N cases"
