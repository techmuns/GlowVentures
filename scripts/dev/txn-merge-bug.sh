#!/usr/bin/env bash
# VERIFY THE MERGED-TRANSACTIONS CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# A check nobody has watched fail is a check nobody knows can fail, and this
# repo has found more defects IN ITS CHECKS this way than in the pages they
# guard. Each bug below is applied on its own, rebuilt, swept, and restored.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and both halves are load-bearing:
# `src/lib/txnLedger.ts` and its suite are NEW and therefore UNTRACKED, where
# `git checkout -- <file>` silently does nothing and leaves the bug in place for
# the next run to report under the wrong name. Measured in this repo twice.
#
# AND IT REBUILDS ON THE WAY OUT. Restoring the source alone leaves `dist/` at
# the bugged build, so the next sweep reads it and reports the previous bug's
# failures under the next one's name.
#
# A PATCH THAT DOES NOT APPLY, OR A BUILD THAT FAILS, IS REPORTED AS NOT A
# RESULT rather than as a clean run. A sweep that cannot build is not a sweep
# that passed.
set -uo pipefail
cd "$(dirname "$0")/../.."

# ONE AT A TIME, ENFORCED. Four copies of this ran at once in the session that
# wrote it, fighting over one `dist/` and one snapshot — so the restore put back
# another instance's tree and the sweeps reported each other's builds. A racing
# harness is worse than no harness: every result it prints is about a tree
# nobody chose.
exec 9>"${TMPDIR:-/tmp}/glow-txn-merge-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/pages/PortfolioMonitor.tsx"
  "src/lib/txnLedger.ts"
  "src/lib/txnRollup.ts"
  "src/lib/tranches.ts"
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

# ALL EIGHT TRANSACTIONS ROUTES. `txnMergedCore()` claims to run on every one of
# them, and a harness walking five cannot tell that from a factory that reaches
# five — which is the defect this pass found in the first place.
ROUTES=monitor-txns,monitor-txn-manager,monitor-txn-drill,monitor-txn-direct,monitor-txn-basket,monitor-txn-in,monitor-txn-out,monitor-txn-secaxis

run_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | sed 's/^/   /'
  fi
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
}

# ...and the suite-only cases, where this book cannot produce the input on screen.
run_suite_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG (suite): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; return; fi
  # THE VERDICT IS THE SUITE'S OWN EXIT STATUS, never grep's. Piped, this read
  # BACKWARDS on every case: the suite's output carries ~1,700 NUL bytes, so grep
  # suppresses its matching lines as binary and prints a warning instead, and
  # `pipefail` turns a FAILING suite's non-zero exit into the `||` branch. Both
  # halves printed "SUITE clean" — a check that can only ever report a pass.
  local out rc
  out=$(node scripts/test-family.mjs 2>&1); rc=$?
  if [ $rc -eq 0 ]; then
    echo "   SUITE CLEAN — THE BUG DID NOT FIRE"
  else
    printf '%s\n' "$out" | tr -d '\000' | grep -aE '^FAIL|failure\(s\)' | sed 's/^/   SUITE /'
  fi
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
}

py() { python3 - "$@"; }

# A NO-PATCH CONTROL FIRST. Without it a tree that was already failing reports
# every bug below as "fired" — the harness measuring itself rather than the
# checks.
echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | sed 's/^/   /'

# ── 1 ───────────────────────────────────────────────────────────────────────
run_case "the capital/trades toggle comes back" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = '''      <Card pad={false} title="Transactions"'''
new = '''      <Card pad={false} title="Capital in and out"
        right={
          <div className="inline-flex" data-txn-record="capital" data-txn-record-options="capital,trades">
            <button type="button" data-txn-record-option="capital" data-txn-record-rows={11} aria-selected>Capital in and out</button>
            <button type="button" data-txn-record-option="trades" data-txn-record-rows={26}>Trades</button>
          </div>
        }'''
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 2 ───────────────────────────────────────────────────────────────────────
run_case "Capital in and Bought are summed into one column" py <<'PY'
import sys
p = "src/lib/txnLedger.ts"
s = open(p, encoding="utf-8").read()
old = "    paidIn: c.paidIn,"
new = "    paidIn: c.paidIn + (t.bought ?? 0),"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 3 ───────────────────────────────────────────────────────────────────────
run_case "the two halves are keyed apart, so a mandate draws two rows" py <<'PY'
import sys
p = "src/lib/txnLedger.ts"
s = open(p, encoding="utf-8").read()
old = "    const key = `${section}\\u0000acct:${acctKey(g.provider, g.accountNo)}`;"
new = "    const key = `${section}\\u0000cap:${g.accountId}`;"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 4 ───────────────────────────────────────────────────────────────────────
run_case "the four untotalled footer columns go blank again" py <<'PY'
import sys, re
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
start = s.find('                    investedOn: <td key="investedOn"')
end = s.find('                  }} />', start)
if start < 0 or end < 0: sys.exit(1)
open(p, "w", encoding="utf-8").write(s[:start] + s[end:])
PY

# ── 5 ───────────────────────────────────────────────────────────────────────
run_case "the Gain column is dropped from the merge" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = '"traded", "value", "gain", "return", "entity"] as const;'
new = '"traded", "value", "return", "entity"] as const;'
if old not in s: sys.exit(1)
s = s.replace(old, new, 1)
# ...and the header and body cell go with it, or the columns misalign rather
# than the figure going missing.
h0 = s.find('                <SortHeader col="gain" view={dv}')
h1 = s.find('                <SortHeader col="return" view={dv}', h0)
if h0 < 0 or h1 < 0: sys.exit(1)
s = s[:h0] + s[h1:]
b0 = s.find('                          <td className={`px-3 py-2.5 text-right mono whitespace-nowrap ${cap?.gain == null')
b1 = s.find('                          <td className={`px-3 py-2.5 text-right mono whitespace-nowrap ${cap?.returnPct == null', b0)
if b0 < 0 or b1 < 0: sys.exit(1)
s = s[:b0] + s[b1:]
s = s.replace("                    gain: (r) => r.capital?.gain ?? null,\n", "", 1)
open(p, "w", encoding="utf-8").write(s)
PY

# ── 6 ───────────────────────────────────────────────────────────────────────
run_case "a row's trades half stops opening" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = "                              {trd && (\n"
# NOT `trd && false`: TS folds that to a constant and refuses the build, so the
# case reports NOT A RESULT rather than exercising the check. A comparison on a
# real string is always false at runtime and typechecks.
new = "                              {trd && r.key === \"__never__\" && (\n"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 7 ───────────────────────────────────────────────────────────────────────
run_case "the footer's trade count loses its handle" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = "                  data-foot-trades={totals.trades} data-foot-sells={totals.sells}"
new = "                  data-foot-sells={totals.sells}"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 8 ───────────────────────────────────────────────────────────────────────
run_case "a row that carries both halves stops saying it carries the capital one" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = "                          data-mine-row={cap ? r.accountId : undefined}"
new = "                          data-mine-row={cap && !trd ? r.accountId : undefined}"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 9 ── SUITE ONLY. This book contains no account whose two halves disagree
#         about the section, so only a constructed input can exercise it.
run_suite_case "a section disagreement is resolved by dropping the section from the key" py <<'PY'
import sys
p = "src/lib/txnLedger.ts"
s = open(p, encoding="utf-8").read()
old = "    const key = `${section}\\u0000acct:${acctKey(g.provider, g.accountNo)}`;"
new = "    const key = `acct:${acctKey(g.provider, g.accountNo)}`;"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 10 ── SUITE ONLY. Every row in this book that has a trades half reports at
#          least one settled amount, so an absent half read as zero renders the
#          same ₹0 nothing on screen contradicts.
run_suite_case "an absent trades half is summed as zero" py <<'PY'
import sys
# IN `rollupTotals`, because `datedTotals` DELEGATES the trades half to it
# rather than reimplementing it — the line this case used to target never
# existed, so it reported NOT A RESULT.
p = "src/lib/txnRollup.ts"
s = open(p, encoding="utf-8").read()
old = "    bought: sumOrNull(groups.map((g) => g.bought)),"
new = "    bought: sumOrNull(groups.map((g) => g.bought)) ?? 0,"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 11 ── SUITE ONLY. Every account row in this book is worth something, so a
#          security row given an account value renders a figure rather than a
#          dash and no total on the page moves.
run_suite_case "a security row is given an account value" py <<'PY'
import sys
p = "src/lib/txnLedger.ts"
s = open(p, encoding="utf-8").read()
old = "      value: isAccount && t.accountId ? valueOfAccount(t.accountId) : null,"
new = "      value: valueOfAccount(t.accountId ?? \"\"),"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 12 ── ...AND THE FIFTH UNTOTALLED COLUMN, which the old check could not see.
#          It required four footer cells to NAME a reason and there were exactly
#          four, so `gain` sat BLANK and satisfied it. Blanking it again is what
#          proves the replacement — which is struck on EVERY cell — really bites.
run_case "a summable footer column goes blank again" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
start = s.find('                    gain: <td key="gain"')
end = s.find('                    investedOn: <td key="investedOn"', start)
if start < 0 or end < 0: sys.exit(1)
open(p, "w", encoding="utf-8").write(s[:start] + s[end:])
PY

# ── 13 ── ...AND THE MONEY TIE, from the ROWS' side rather than the footer's.
#          Bug 2 moves the FOOTER away from its rows; this moves a ROW away from
#          the footer, so the reconciliation is shown to bite from both ends
#          rather than only where the bug it was written for happens to sit.
run_case "a row's Capital in cell stops rendering its own figure" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = """                                ? <AbsentCell reason="no contribution is in view — the movements are filtered to what came back out, and this account's paid-in figure is not struck over that" />
                                : money(cap.paidIn)}"""
new = """                                ? <AbsentCell reason="no contribution is in view — the movements are filtered to what came back out, and this account's paid-in figure is not struck over that" />
                                : money(cap.paidIn * 0.5)}"""
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

echo ""
echo "════════ done"
