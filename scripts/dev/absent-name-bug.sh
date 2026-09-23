#!/usr/bin/env bash
# VERIFY THE "A SEARCH THAT FINDS NOTHING SAYS WHY" CHECKS BY REINTRODUCING THE
# BUG EACH EXISTS FOR.
#
# A check nobody has watched fail is a check nobody knows can fail, and this
# repo has found more defects IN ITS CHECKS this way than in the pages they
# guard. Each bug below is applied on its own, rebuilt, swept, and restored.
#
# THE RESTORE IS BY COPY AND ON A TRAP. `src/lib/reviewGaps.ts`,
# `src/data/reviewGaps.ts` and the suite are NEW and therefore UNTRACKED, where
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

exec 9>"${TMPDIR:-/tmp}/glow-absent-name-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/components/Absent.tsx"
  "src/components/MultiSelectFilter.tsx"
  "src/pages/PortfolioMonitor.tsx"
  "src/pages/FamilyEntities.tsx"
  "src/pages/HoldingsBehind.tsx"
  "src/lib/reviewGaps.ts"
  "src/data/reviewGaps.ts"
  "src/lib/__tests__/reviewGaps.test.ts"
  "scripts/review-reconcile.mjs"
  "docs/REVIEW-RECONCILIATION.md"
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

ROUTES=monitor-absent-name

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

# ...and the cases whose subject is the GENERATED module, which the sweep reads
# but does not produce. Each patches the generator and re-runs it.
run_gen_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG (generated): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; return; fi
  if ! npm run reconcile:review >/dev/null 2>&1; then
    echo "   NOT A RESULT — the generator refused (which may itself be the guard firing)"
    node scripts/review-reconcile.mjs 2>&1 | tail -2 | sed 's/^/   /'
    for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; return
  fi
  run_suite_body
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | sed 's/^/   /'
  fi
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
}

# THE VERDICT IS THE SUITE'S OWN EXIT STATUS, never grep's. Piped, this once read
# BACKWARDS on every case: the suite's output carries NUL bytes, so grep
# suppresses its matching lines as binary and prints a warning instead, and
# `pipefail` turns a FAILING suite's non-zero exit into the `||` branch. Both
# halves printed "SUITE clean" — a check that can only ever report a pass.
run_suite_body() {
  local out rc
  out=$(node scripts/test-family.mjs 2>&1 | tr -d "\000"); rc=${PIPESTATUS[0]}
  if [ $rc -eq 0 ]; then
    echo "   SUITE CLEAN — THE BUG DID NOT FIRE"
  else
    printf '%s\n' "$out" | tr -d '\000' | grep -aE '^FAIL' | sed 's/^/   SUITE /'
  fi
}

run_suite_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG (suite): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; return; fi
  run_suite_body
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
}

py() { python3 - "$@"; }

# A NO-PATCH CONTROL FIRST. Without it a tree that was already failing reports
# every bug below as "fired" — the harness measuring itself rather than the
# checks.
echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | sed 's/^/   /'

# ── 1. THE ORIGINAL DEFECT ──────────────────────────────────────────────────
# The empty state says only "No holdings match", which is what the family saw.
run_case "the holdings search stops explaining itself" py <<'PY'
import sys
p = "src/pages/PortfolioMonitor.tsx"
s = open(p, encoding="utf-8").read()
old = '\n          emptyNote={(q) => <AbsentFromBook query={q} className="mt-2" />} />'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, " />", 1))
PY

# ── 2. THE FENCE ────────────────────────────────────────────────────────────
# The review's own valuation printed beside figures that all trace to the
# institution that struck them.
run_case "the note quotes the review's valuation" py <<'PY'
import sys
p = "src/components/Absent.tsx"
s = open(p, encoding="utf-8").read()
old = '            {g.custodian && <span className="text-slate-400"> · {g.custodian}</span>}'
if old not in s: sys.exit(1)
new = old + '\n            <span className="text-slate-400"> · ₹15.46 Cr</span>'
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 3. THE NOTE UNDER EVERY TYPO ────────────────────────────────────────────
# A note that renders whatever was typed satisfies every check above it and puts
# a paragraph about the review under every search in the app.
run_case "the note renders whether or not a gap answers the search" py <<'PY'
import sys
p = "src/components/Absent.tsx"
s = open(p, encoding="utf-8").read()
old = "  const gaps = reviewGapsFor(query);\n  if (!gaps.length) return null;"
if old not in s: sys.exit(1)
new = "  const gaps = reviewGapsFor(query);\n  if (!query.trim()) return null;"
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 4. THE FAMILY'S OWN SPELLING ────────────────────────────────────────────
# "It is named either Bombay Stock Exchange or BSE" — the review prints one of
# the two, so without the alias the reader typing the other is where they began.
run_gen_case "the family's own spelling is dropped from the generator" py <<'PY'
import sys
p = "scripts/review-reconcile.mjs"
s = open(p, encoding="utf-8").read()
old = '  ["BSE Ltd.", ["Bombay Stock Exchange"]],'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

# ── 5. A FUZZY TIER ─────────────────────────────────────────────────────────
# What `shared/nameMatch.mjs` already measured on this corpus, arriving in a
# search box: a token-overlap rule answers a reader with the wrong company.
run_suite_case "the matcher grows a token-overlap tier" py <<'PY'
import sys
p = "src/lib/reviewGaps.ts"
s = open(p, encoding="utf-8").read()
old = "      const rank = n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) || q.includes(n) ? 2 : Infinity;"
if old not in s: sys.exit(1)
new = ("      const shared = q.split(\" \").filter((w) => w.length > 3 && n.split(\" \").includes(w));\n"
       "      const rank = n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) || q.includes(n) ? 2 : shared.length ? 3 : Infinity;")
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 6. A GAP THE BOOK ACTUALLY CARRIES ──────────────────────────────────────
# Worse than the silence this replaces: a false statement rather than none.
run_suite_case "a gap names a holding the book carries" py <<'PY'
import sys, json, re
p = "src/data/reviewGaps.ts"
s = open(p, encoding="utf-8").read()
b = open("src/data/glowData.ts", encoding="utf-8").read()
name = re.search(r'"security": "([^"]+)"', b).group(1)
i = s.index("REVIEW_GAPS: ReviewGap[] = ") + len("REVIEW_GAPS: ReviewGap[] = ")
arr = json.loads(s[i:].rsplit(";", 1)[0])
arr.append({"name": name, "aliases": [], "custodian": "MOPWM",
            "why": "held at Motilal Oswal; the drop carries a holding statement for three of its demat accounts",
            "ask": "Motilal Oswal holding statements for the demat and PWM accounts not in the drop"})
open(p, "w", encoding="utf-8").write(s[:i] + json.dumps(arr, indent=2, ensure_ascii=False) + ";\n")
PY

# ── 7. AN AGGREGATE ON THE ASK LIST ─────────────────────────────────────────
# `Private Equity ₹136.16 Cr` is a block the review itemises on another tab and
# no custodian issues a statement for — so it is not a document to ask for.
run_gen_case "aggregates are admitted to the gap list" py <<'PY'
import sys
p = "scripts/review-reconcile.mjs"
s = open(p, encoding="utf-8").read()
old = "    .filter((l) => !l.aggregate)\n"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

# ── 8. THE SENTENCES DRIFT FROM THE REPORT ──────────────────────────────────
# The whole reason `custodianNote` and `askFor` were hoisted: the ask list and
# the dashboard must never name different documents for one line.
run_gen_case "the module rewrites the sentences instead of sharing them" py <<'PY'
import sys
p = "scripts/review-reconcile.mjs"
s = open(p, encoding="utf-8").read()
old = "      why: plain(custodianNote(l)),\n      ask: plain(askFor(l)),"
if old not in s: sys.exit(1)
new = ('      why: "no statement in this drop reports this holding, so the book carries nothing for it",\n'
       '      ask: "a holding statement from whichever institution custodies it today",')
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY

# ── 9. THE ONE-CHARACTER FLOOR ──────────────────────────────────────────────
# At that length a substring rule names half the list, which is noise.
run_suite_case "the one-character floor is removed" py <<'PY'
import sys
p = "src/lib/reviewGaps.ts"
s = open(p, encoding="utf-8").read()
old = "  if (q.length < 2) return [];"
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "  if (q.length < 1) return [];", 1))
PY

# ── 10. A CALLER QUIETLY DROPS THE WIRING ───────────────────────────────────
# The two surfaces the sweep does not drive — see §7 of the suite.
run_suite_case "Family & Entities stops rendering the absence" py <<'PY'
import sys
p = "src/pages/FamilyEntities.tsx"
s = open(p, encoding="utf-8").read()
old = '                      <AbsentFromBook query={holdingsQ} className="mx-auto mt-3 max-w-xl" />\n'
if old not in s: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY

echo ""
echo "════════ done — the tree is restored and rebuilt by the trap"
