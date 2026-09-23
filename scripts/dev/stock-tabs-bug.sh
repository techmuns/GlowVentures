#!/usr/bin/env bash
# VERIFY THE POSITION PAGE'S TAB CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# *"When I come inside a portfolio position it's an unbelievably bad UI
# experience — please fix it all by making top sub tabs like we have done for
# others and not having a long page I have to scroll."* Nearly every claim about
# that is geometry or structure, which no text check can see — so each check is
# watched failing here rather than trusted to be able to.
#
# THE RESTORE IS BY COPY AND ON A TRAP, AND IT REBUILDS ON THE WAY OUT.
# `src/components/InsiderDeals.tsx` was new in this change, and `git checkout --`
# on an untracked file silently does nothing; restoring the source alone leaves
# `dist/` at the bugged build for the next run to report under the wrong name.
# Both are recorded in CLAUDE.md as having cost this repo a result before.
#
# A PATCH THAT DOES NOT APPLY, OR A BUILD THAT FAILS, IS REPORTED AS NOT A
# RESULT rather than as a clean run. A NO-PATCH CONTROL runs first.
#
# Needs a `vite preview` on :4173 serving `dist/`, like `check:pages`.
#   CASES=3,7 scripts/dev/stock-tabs-bug.sh   runs only those cases.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-stock-tabs-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/pages/StockInfo.tsx"
  "src/components/ResearchPanel.tsx"
  "src/components/InvestmentTools.tsx"
  "scripts/check-pages.mjs"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }
restore() {
  put_back
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  for f in "${FILES[@]}"; do cmp -s "$SNAP/$f" "$f" || echo "!! $f did not restore"; done
  rm -rf "$SNAP"
}
trap restore EXIT

ROUTES=stock,stock-activity,stock-market,stock-research,stock-targets,stock-fund,stock-fund-market,stock-mf-lookthrough,stock-mf-holdings,stock-nocost,stock-aif-dual,stock-qty,stock-unmoved,stock-pledge,stock-cagr,stock-carried,stock-cmp-split,stock-cmp-agree,stock-cmp-unmarked,stock-cmp-nav,stock-mandates-many,stock-cash-market
WANT="${CASES:-}"
N=0

sweep() { THEMES=light ONLY=$ROUTES node scripts/check-pages.mjs 2>&1 | grep -E 'INVARIANT FAILED|^✗' | sed 's/^/   /'; }

run_case() {
  local name="$1"; shift
  N=$((N + 1))
  if [ -n "$WANT" ] && ! [[ ",$WANT," == *",$N,"* ]]; then cat >/dev/null; return; fi
  echo ""
  echo "════════ BUG $N: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    local out; out=$(sweep)
    if [ -z "$out" ]; then echo "   SWEEP CLEAN — THE BUG DID NOT FIRE"; else printf '%s\n' "$out"; fi
  fi
  put_back
}

py() { python3 - "$@"; }

if [ -z "$WANT" ]; then
  echo "════════ CONTROL: no patch"
  npm run build >/dev/null 2>&1 && { out=$(sweep); [ -z "$out" ] && echo "   clean" || printf '%s\n' "$out"; }
fi

run_case "every tab's content drawn at once — the long page back" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
n = 0
for k in ["position", "activity", "market", "research", "targets"]:
    old = '        {tab === "%s" && (' % k
    if old not in s: sys.exit(1)
    # A comparison on a real string, never a literal: TS refuses an always-true
    # condition and the case would report NOT A RESULT.
    s = s.replace(old, '        {String(tab) !== "__never__" && (', 1); n += 1
open(p, "w", encoding="utf-8").write(s)
PY

run_case "the tabs moved beside the name instead of to the line's right-hand end" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = 'className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2" data-stock-headline'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, 'className="flex flex-wrap items-center justify-start gap-x-3 gap-y-2" data-stock-headline', 1))
PY

run_case "the panel stops scrolling inside itself, so the page scrolls again" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '<div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto" data-stock-panel={tab}>'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, '<div data-stock-panel={tab}>', 1))
PY

run_case "the tabs are reordered, so the page opens on Research" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
a = s.find('  { key: "position", label: "Position",')
b = s.find('  { key: "research", label: "Research",')
c = s.find('  { key: "targets", label: "My targets",')
if min(a, b, c) < 0: sys.exit(1)
pos = s[a:s.find('  { key: "activity"', a)]
res = s[b:c]
s = s.replace(res, "", 1).replace(pos, res + pos, 1)
open(p, "w", encoding="utf-8").write(s)
PY

run_case "a tile dropped from the strip" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
a = s.find('        <Kpi label="Realised P&L"')
b = s.find('      </div>', a)
if a < 0 or b < 0: sys.exit(1)
open(p, "w", encoding="utf-8").write(s[:a] + s[b:])
PY

run_case "the tax card is drawn nowhere" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '''            {!exited && (
              <Card className="mt-5" title="Holding period & tax"'''
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, old.replace("{!exited && (", "{exited && ("), 1))
PY

run_case "a tax figure's dash loses its reason" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '["Long-term cost", ltCost === null ? <AbsentCell reason="the long/short split needs per-lot purchase dates, and only a lot register carries them — one account in this book issues one" /> : money(ltCost)],'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, '["Long-term cost", ltCost === null ? DASH : money(ltCost)],', 1))
PY

run_case "the Ratios sub-tab is wired to nothing" py <<'PY'
import sys
p = "src/components/ResearchPanel.tsx"
s = open(p, encoding="utf-8").read()
old = 'onClick={() => setTab(k)}'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, 'onClick={() => setTab(k === "ratios" ? tab : k)}', 1))
PY

run_case "the ratio panel draws under every sub-tab" py <<'PY'
import sys
p = "src/components/ResearchPanel.tsx"
s = open(p, encoding="utf-8").read()
old = '{tab === "ratios" && <RatioTable ticker={ticker} name={name} />}'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, '<RatioTable ticker={ticker} name={name} />', 1))
PY

run_case "the stand-alone Trading range card comes back beside the returns table" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '              <ReturnsTable ticker={sym} name={name} />'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, '              <><ReturnsTable ticker={sym} name={name} /><Card className="mt-5" title="Trading range"><p>52-week low and high</p></Card></>', 1))
PY

run_case "every mandate listed under the name, however many" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '            {mandates.length > 2\n'
if old not in s: sys.exit(1)
s = s.replace(old, '            {mandates.length > 99\n', 1)
s = s.replace('<p className="mt-1.5 truncate text-[12px] text-slate-400" data-stock-mandates', '<p className="mt-1.5 text-[12px] text-slate-400" data-stock-mandates', 1)
open(p, "w", encoding="utf-8").write(s)
PY

run_case "a cash line gets its sector chip back" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '    if (rows.length > 0 && rows.every((r) => r.assetClass === "Cash")) return null;\n'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

run_case "a Total row drawn under a single account's row" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '                    {posRows.length > 1 && ('
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, '                    {posRows.length > 0 && (', 1))
PY

run_case "the plan-view sentence comes back on My targets" py <<'PY'
import sys
p = "src/components/InvestmentTools.tsx"
s = open(p, encoding="utf-8").read()
old = "          Plan — your target weight, the year your fair value refers to, and how you valued it\n"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "          Plan — these fill the Target weight and Valuation method columns on Portfolio Monitor's plan view.\n", 1))
PY

run_case "a mutual fund's holdings drawn on its Price & returns tab too" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '              <FundLookthrough part="nav" securityKey={securityKey} name={name} holdingValue={mv} asOfHolding={holdingAsOf} />'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, '              <><FundLookthrough part="nav" securityKey={securityKey} name={name} holdingValue={mv} asOfHolding={holdingAsOf} /><FundLookthrough part="holdings" securityKey={securityKey} name={name} holdingValue={mv} asOfHolding={holdingAsOf} /></>', 1))
PY

run_case "the price tile refuses a mark every statement agrees on" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '{cmp ?? <AbsentValue />}</span>}'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, '{<AbsentValue />}</span>}', 1))
PY

run_case "an AIF folio's price tab draws a returns table instead of stating its absence" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = '            {!notACompany ? (\n              <ReturnsTable ticker={sym} name={name} />'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, '            {(!notACompany || fundVehicle) && !schemeHalves ? (\n              <ReturnsTable ticker={sym} name={name} />', 1))
PY

echo ""
echo "════════ done ($N cases)"
