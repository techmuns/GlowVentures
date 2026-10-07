#!/usr/bin/env bash
# BUOYANT'S DISCLOSURE AS THE LOOK-THROUGH FIELD — each defect put back, one at
# a time. Run: bash scripts/dev/snap-lookthrough-bug.sh   (CASES=1,3 for a subset)
#
# `buoyantSnapSchemeHoldings` is the one path a company held INSIDE an AIF takes
# to a screen: page 3's `Current Holdings` → `document.json` → the disclosure
# read model → the Daily Movers card's AIF & PMS scope. So each of the suite's
# look-through claims is a defect this reader could have, and a claim that
# cannot fail is worth nothing. The control runs FIRST and must be clean: a case
# is read as *these claims fire and the others do not*, which says nothing at
# all if the unpatched tree already fails them (Stage 10dh's own finding).
#
# The provider is restored BY COPY on a trap and the restore is VERIFIED with
# `cmp` — a restore that cannot restore looks exactly like one that did
# (Stage 10bm). A patch whose anchor does not occur exactly once is reported as
# NOT A RESULT rather than as a clean run.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
F=scripts/ingest/providers/altFundStatements.mjs
SUITE=scripts/ingest/__tests__/buoyantSnap.test.mjs
SNAP=$(mktemp)
cp "$F" "$SNAP"
restore() { cp "$SNAP" "$F"; cmp -s "$SNAP" "$F" || { echo "RESTORE FAILED"; exit 2; }; }
trap 'restore; rm -f "$SNAP"' EXIT

WANT=${CASES:-1,2,3,4,5}
wants() { [[ ",$WANT," == *",$1,"* ]]; }

run() {
  local out rc
  out=$(node "$SUITE" 2>&1); rc=$?
  echo "── $1 (rc=$rc)"
  echo "$out" | grep -E '^  FAIL|passed, ' | sed 's/^/   /'
  restore
}

patch() { python3 - "$@" <<'PY'
import sys
p = "scripts/ingest/providers/altFundStatements.mjs"
s = open(p, encoding="utf-8").read()
frm, to = sys.argv[1], sys.argv[2]
n = s.count(frm)
if n != 1:
    print(f"   NOT A RESULT: the anchor occurs {n} time(s)"); sys.exit(3)
open(p, "w", encoding="utf-8").write(s.replace(frm, to))
PY
}

echo "=== CONTROL (no patch) — must be clean ==="
run "control"

# 1. `Others` IS NOT A COMPANY. The fund's own unnamed residual, published as a
#    7.13% security, is the fabricated classification this book refuses — and it
#    would be ranked on the card beside real companies.
if wants 1; then echo; echo "=== 1. the unnamed residual becomes a company ==="
patch '    .filter((h) => !/^others?$/i.test(h.security.trim()))
' '' && run "Others kept as a holding"; fi

# 2. The snap prints a NAME and a WEIGHT and nothing else. A zero where it
#    printed nothing states a holding of nothing — §2, at the field.
if wants 2; then echo; echo "=== 2. an unprinted figure becomes a zero ==="
patch '      quantity: null, marketValue: null, pctNetAssets: h.pct,' \
      '      quantity: 0, marketValue: 0, pctNetAssets: h.pct,' && run "quantity and value zero"; fi

# 3. THE GATE. A table that does not read whole must yield NO holding: on a
#    ranking card a half-read table is a company drawn at a weight the fund
#    never published.
if wants 3; then echo; echo "=== 3. the gate is dropped — a half-read table is published ==="
patch '  if (buoyantSnapFails(p, held).length || !buoyantSnapHoldingsTie(p)) return [];' \
      '  if (false) return [];' && run "gate dropped"; fi

# 4. The name is carried AS PRINTED. Repairing the extraction's `n` for `&`
#    would be this reader inventing a name; the company that cannot then be
#    joined is NAMED on screen instead (Stage 10cy).
if wants 4; then echo; echo "=== 4. the printed name is repaired ==="
patch '      security: h.security, isin: null, industry: null,' \
      '      security: h.security.replace(/\bLnT\b/, "L&T"), isin: null, industry: null,' && run "name repaired"; fi

# 5. A weight the fund PRINTED as 0.00% is a MEASURED zero and is still a
#    holding. Skipping it as empty drops a disclosed company.
if wants 5; then echo; echo "=== 5. a line the fund printed at 0.00% is skipped as empty ==="
# A chained `.filter` rather than one predicate, because a `&&` inside a quoted
# heredoc reaches node as `\&\&` and crashes the suite — which the harness would
# report as a case firing nothing rather than as a bug it never applied.
patch '    .filter((h) => !/^others?$/i.test(h.security.trim()))' \
      '    .filter((h) => !/^others?$/i.test(h.security.trim())).filter((h) => h.pct > 0)' && run "zero-weight line dropped"; fi
