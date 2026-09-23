#!/usr/bin/env bash
# VERIFY THE CAPITAL-BASIS CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# *"According to the client the return on this AIF is a lot higher than what we
# are showing … we need to make sure that the root cause of this is fixed."*
# Every return was struck on the cost of the units held today. The checks that
# hold the fix are only worth something if each one has been watched to fail,
# so each bug below is applied on its own, rebuilt, swept or suite-run, and
# restored.
#
# THE RESTORE IS BY COPY, ON A TRAP, AND IT REBUILDS ON THE WAY OUT — the three
# lessons this repo's earlier harnesses paid for. `git checkout --` on an
# untracked file silently does nothing; restoring the source alone leaves
# `dist/` at the bugged build for the next sweep to report under the wrong name.
#
# A PATCH THAT DOES NOT APPLY, OR A BUILD THAT FAILS, IS REPORTED AS NOT A
# RESULT rather than as a clean run.
set -uo pipefail
cd "$(dirname "$0")/../.."

# ONE AT A TIME, ENFORCED — two copies racing one `dist/` and one snapshot report
# each other's builds.
exec 9>"${TMPDIR:-/tmp}/glow-capital-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/lib/capital.ts"
  "src/lib/analytics.ts"
  "src/lib/chatContext.ts"
  "src/lib/exportPortfolioExcel.ts"
  "src/pages/PortfolioMonitor.tsx"
  "src/pages/StockInfo.tsx"
  "src/pages/ReturnAnalysis.tsx"
  "scripts/check-pages.mjs"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
put_back() {
  for f in "${FILES[@]}"; do
    cp "$SNAP/$f" "$f"
    cmp -s "$SNAP/$f" "$f" || echo "!! $f did NOT restore — the tree is dirty"
  done
}
# THE SNAPSHOT IS REMOVED BY THE TRAP AND NEVER BY A RESTORE: a restore that
# deleted its own source made every later restore a silent no-op once already.
restore() {
  put_back
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

ROUTES=monitor,stock-capital,returns

run_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|NOT CHECKED|^✓|^✗' | sed 's/^/   /'
  fi
  put_back
}

# ...and the suite-only cases. THE VERDICT IS THE SUITE'S OWN EXIT STATUS, never
# grep's: its output carries NUL bytes, grep reads it as binary, and `pipefail`
# once turned a failing suite into a printed "clean".
run_suite_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG (suite): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  local out rc
  out=$(node scripts/test-family.mjs 2>&1); rc=$?
  if [ $rc -eq 0 ]; then
    echo "   SUITE CLEAN — THE BUG DID NOT FIRE"
  else
    printf '%s\n' "$out" | tr -d '\000' | grep -aE '^FAIL|failed' | head -12 | sed 's/^/   SUITE /'
  fi
  put_back
}

py() { python3 - "$@"; }

echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|NOT CHECKED|^✓|^✗' | sed 's/^/   /'

# ── 1 ── the model stops standing any account on its capital ───────────────
run_case "no account is ever measured on its capital" py <<'PY'
import sys
p = "src/lib/capital.ts"
s = open(p, encoding="utf-8").read()
old = "      const cap = capital.get(accountId);"
new = "      const cap = undefined as AccountCapital | undefined;"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 2 ── the Monitor keeps the capital markers and prints the units' cost ───
run_case "a row on capital prints what its units cost as Invested" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = "        costBasis: c.invested, unrealizedPnL: c.gain,"
new = "        costBasis: unitCost ?? c.invested, unrealizedPnL: c.gain,"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 3 ── P&L on cost beside an Invested on capital ─────────────────────────
run_case "a row on capital strikes its P&L on the units' cost" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = "        costBasis: c.invested, unrealizedPnL: c.gain,"
new = "        costBasis: c.invested, unrealizedPnL: unitCost == null ? c.gain : c.value - unitCost,"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 4 ── a dated record that stops short of the account's date is trusted ──
run_case "a dated record that ends before the account's as-of is used anyway" py <<'PY'
import sys
p = "src/lib/capital.ts"
s = open(p, encoding="utf-8").read()
old = "  const reachesAsOf = recordShortfall(account) === null;"
new = "  const reachesAsOf = true || recordShortfall(account) === null;"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 5 ── the manager's statement outranks the dated payments ───────────────
run_case "the statement is preferred to the dated record" py <<'PY'
import sys
p = "src/lib/capital.ts"
s = open(p, encoding="utf-8").read()
old = "  if (moves.length && reachesAsOf && moves.every((m) => isNum(m.amount))"
new = "  if (!input.bridges.some((b) => b.basis === \"since-inception\" && b.periodTo === asOf) && moves.length && reachesAsOf && moves.every((m) => isNum(m.amount))"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 6 ── the company page's account rows fall back to cost ─────────────────
run_case "the company page strikes each account row on cost" py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"
s = open(p, encoding="utf-8").read()
old = "      if (onCapitalBasis(c)) m.set(r, c);"
new = "      if ((false as boolean) && onCapitalBasis(c)) m.set(r, c);"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 7 ── Return & Drawdown's per-account table stays on cost ───────────────
run_case "the per-account return table is struck on cost" py <<'PY'
import sys
p = "src/pages/ReturnAnalysis.tsx"
s = open(p, encoding="utf-8").read()
old = "      const onCap = onCapitalBasis(acct) ? acct : null;"
new = "      const onCap = (false as boolean) && onCapitalBasis(acct) ? acct : null;"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 8 ── (suite) a partial set is treated as a whole account ───────────────
run_suite_case "any set carrying part of an account is treated as the whole of it" py <<'PY'
import sys
p = "src/lib/capital.ts"
s = open(p, encoding="utf-8").read()
old = "Math.abs(inSet - (accountValue.get(accountId) ?? 0)) <= 0.5"
new = "Math.abs(inSet - (accountValue.get(accountId) ?? 0)) <= 1e15"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 9 ── (suite) the export stays on the units' cost ───────────────────────
run_suite_case "the Excel export strikes every row on the units' cost" py <<'PY'
import sys
p = "src/lib/exportPortfolioExcel.ts"
s = open(p, encoding="utf-8").read()
old = "      const b = capital.behind(ps);"
new = "      const b = capital.behind(ps.map((x) => ({ ...x })));"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 10 ── (suite) the chat context hands the model the units' cost ─────────
run_suite_case "the chat context reports the units' cost as the capital put in" py <<'PY'
import sys
p = "src/lib/chatContext.ts"
s = open(p, encoding="utf-8").read()
old = "          capitalPutInCr: onCap ? cr(inv.invested) : null,"
new = "          capitalPutInCr: onCap ? cr(held.reduce((t, p) => t + (p.costBasis ?? 0), 0)) : null,"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 11 ── (suite) a sub-year window is annualised after all ────────────────
run_suite_case "a capital row annualises a window shorter than a year" py <<'PY'
import sys
p = "src/lib/analytics.ts"
s = open(p, encoding="utf-8").read()
old = "  const annual = xirr && xirr.pct !== null && xirr.annualised ? xirr.pct : null;"
new = "  const annual = xirr && xirr.pct !== null ? xirr.pct : null;"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

echo ""
echo "════════ DONE"
