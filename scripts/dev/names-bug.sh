#!/usr/bin/env bash
# VERIFY THE ONE-NAME-PER-COMPANY CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
#   "when I am searching Kaynes in the search bar, it is coming up in small cap
#    and large cap both. It should be a single name only… Kaynes Technologies
#    Limited is also a holding… of the family entity Ajay's account."
#
# A check nobody has watched fail is a check nobody knows can fail. Each bug
# below is applied on its own, rebuilt, checked, and restored — by COPY and on a
# TRAP, because `src/lib/securityLabel.ts` and the names suite are NEW and
# therefore untracked, where `git checkout --` silently restores nothing. It
# rebuilds on the way out, because restoring the source alone leaves `dist/` at
# the bugged build for the next run to report under the wrong name.
#
# A PATCH THAT DOES NOT APPLY, OR A TREE THAT DOES NOT BUILD, IS REPORTED AS NOT
# A RESULT rather than as a clean run. And each case says which checks it runs:
# some of these defects cannot reach a rendered page on this book, and a sweep
# reporting clean over one of them would be the harness measuring nothing.
#
# COMMIT BEFORE RUNNING THIS. A pass that rewrites the files under test is not
# something to run against unversioned work, however careful the trap is — that
# cost this repo a day's work once.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-names-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/lib/securityLabel.ts"
  "src/lib/lookthrough.ts"
  "src/lib/format.ts"
  "src/pages/PortfolioMonitor.tsx"
  "src/pages/StockInfo.tsx"
  "src/components/FundExposure.tsx"
  "src/context/PortfolioContext.tsx"
  "shared/securityKey.mjs"
  "scripts/build-book.mjs"
  "src/data/glowData.ts"
  "docs/BOOK-REPORT.md"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }
restore() {
  put_back
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

ROUTES=monitor,monitor-picklist,monitor-security-picklist,stock-sold-elsewhere,monitor-sold-elsewhere,monitor-security-drill,monitor-lookthrough-instruments

sweep() {
  ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|NOT CHECKED|^✓ light|^✗ light' | sed 's/^/   /'
}
# THE VERDICT IS THE SUITE'S OWN EXIT STATUS, never grep's: its output carries
# NUL bytes, grep suppresses matching lines as binary, and `pipefail` would turn
# a failing suite into the branch that prints "clean". Measured here once.
suites() {
  local out rc
  out=$(node scripts/test-family.mjs 2>&1); rc=$?
  if [ $rc -eq 0 ]; then echo "   SUITES CLEAN"
  else printf '%s\n' "$out" | tr -d '\000' | grep -aE '^FAIL' | sed 's/^/   SUITE /'; fi
}

# run_case NAME MODE — MODE is sweep | suite | both | book (rebuild the book first)
run_case() {
  local name="$1" mode="$2"; shift 2
  echo ""
  echo "════════ BUG ($mode): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if [ "$mode" = book ]; then
    if ! npm run build-book >/dev/null 2>&1; then echo "   NOT A RESULT — the book did not build"; put_back; return; fi
  fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    case "$mode" in
      sweep) sweep ;;
      suite) suites ;;
      both|book) suites; sweep ;;
    esac
  fi
  put_back
}

py() { python3 - "$@"; }

echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && { suites; sweep; }

run_case "a key renders under whichever spelling its statement printed" both py <<'PY'
import sys
p = "src/lib/securityLabel.ts"; s = open(p, encoding="utf-8").read()
old = "  return CANONICAL.get(securityKey) ?? holdingLabel(securityKey, printedName);"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "  return holdingLabel(securityKey, printedName);", 1))
PY

run_case "the search list offers a fund's name for a company the book holds" sweep py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"; s = open(p, encoding="utf-8").read()
old = "        if (bookKeys.has(e.key)) continue;\n"
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

run_case "no listing ISIN for a company its statements print none for" both py <<'PY'
import sys
p = "src/lib/lookthrough.ts"; s = open(p, encoding="utf-8").read()
old = "    const sym = KEY_TO_SYMBOL[p.securityKey];"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "    const sym = KEY_TO_SYMBOL[\"\"] as string | undefined;", 1))
PY

run_case "an issuer the book holds a share of is not seeded from the book" both py <<'PY'
import sys
p = "src/lib/lookthrough.ts"; s = open(p, encoding="utf-8").read()
old = "      if (pick) bookIssuer.set(pre, pick);"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "      if (pick && pre === \"\") bookIssuer.set(pre, pick);", 1))
PY

run_case "an issuer row keeps its instrument's coupon and maturity" both py <<'PY'
import sys
p = "src/lib/lookthrough.ts"; s = open(p, encoding="utf-8").read()
old = "  return out || raw;"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "  return raw || out;", 1))
PY

run_case "treasury bills and GOI are not read as the Government of India" suite py <<'PY'
import sys
p = "src/lib/lookthrough.ts"; s = open(p, encoding="utf-8").read()
old = '''  if (/^(?:GOI|GOI\\s+STRIPS|Government\\s+of\\s+India)$/i.test(bare)
    || /\\b(?:T-?\\s?BILLS?|TBILLS?|TREASURY\\s+BILLS?)\\b/i.test(bare)) return "government-of-india";'''
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

run_case "a filer's lowercase slip reaches the screen" both py <<'PY'
import sys
p = "src/lib/format.ts"; s = open(p, encoding="utf-8").read()
old = "      && (first || !FILED_LOWER_WORDS.has(letters))) {"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "      && (first || !FILED_LOWER_WORDS.has(letters)) && letters === \"\") {", 1))
PY

run_case "a filer's footnote mark stays on the name" suite py <<'PY'
import sys
p = "src/lib/format.ts"; s = open(p, encoding="utf-8").read()
old = "  const bare = stripFilingMarks(name);"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "  const bare = name;", 1))
PY

run_case "the Monitor's row does not name the account that sold out" sweep py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"; s = open(p, encoding="utf-8").read()
old = "                              <DematElsewhere movements={movementsFor(r.securityKey)} securityKey={r.securityKey}"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "                              <DematElsewhere movements={[]} securityKey={r.securityKey}", 1))
PY

run_case "the company page does not mark the account that sold out" sweep py <<'PY'
import sys
p = "src/pages/StockInfo.tsx"; s = open(p, encoding="utf-8").read()
old = "        held={new Set(rows.map((p) => p.accountId))} />"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, " />", 1))
PY

run_case "the look-through card counts the AIFs and names none" sweep py <<'PY'
import sys
p = "src/components/FundExposure.tsx"; s = open(p, encoding="utf-8").read()
old = '''data-fund-exposure-aifs={aifFunds.length}>{aifFunds.join(" · ")}</span>'''
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, '''data-fund-exposure-aifs={aifFunds.length}>{aifFunds.slice(0, 1).join(" · ")}</span>''', 1))
PY

run_case "the depository's SBI is not State Bank of India" suite py <<'PY'
import sys
p = "shared/securityKey.mjs"; s = open(p, encoding="utf-8").read()
old = '  "sbi": "state-bank-of-india",\n'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

run_case "a manager's strategy name reaches the screen in capitals" sweep py <<'PY'
import sys
p = "src/context/PortfolioContext.tsx"; s = open(p, encoding="utf-8").read()
old = "    accounts: BOOK_ACCOUNTS.map((a) => (a.strategy ? { ...a, strategy: displaySecurity(a.strategy) } : a)),"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "    accounts: BOOK_ACCOUNTS,", 1))
PY

run_case "a demat window in an account that sold out stays on the depository's spelling" book py <<'PY'
import sys
p = "scripts/build-book.mjs"; s = open(p, encoding="utf-8").read()
old = "          else { key = bookKey; bridged += 1; }"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "          else { bridged += 0; }", 1))
PY

echo ""
echo "════════ done"
