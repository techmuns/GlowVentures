#!/usr/bin/env bash
# VERIFY THE ROW-STRIPE CHECK BY PUTTING EACH BUG BACK IT EXISTS FOR.
#
# Stage 10dn. Every table stripes its plain rows from one variable per theme,
# `--row-alt`, through one zero-specificity rule in `src/index.css`; the check in
# `check-pages.mjs` reads computed colour on every route in BOTH themes. Each
# bug below is applied on its own, rebuilt, swept, and restored: the check must
# pass the page and fail it with the bug put back.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and it REBUILDS on the way out, so the
# next run never reads a bugged `dist/`. A patch that does not apply, or a tree
# that does not build, is reported as NOT A RESULT rather than as a clean run.
# `CASES=2,4` runs only those cases; `BASE=` points the sweep at another preview.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-zebra-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=("src/index.css")
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
restore() {
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
  for f in "${FILES[@]}"; do cmp -s "$SNAP/$f" "$f" || echo "!! restore of $f DID NOT TAKE"; done
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

ROUTES=monitor,stock,capital-gains,audit
put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }
sweep() {
  ONLY="$ROUTES" npm run check:pages 2>&1 | tr -d '\000' | grep -aE 'stripes its rows|alternate shade|second shade|^✓|^✗|combinations' | sed 's/^/   /' | head -20
}
run_case() {
  local num="$1" name="$2"; shift 2
  if [ -n "${CASES:-}" ] && ! [[ ",$CASES," == *",$num,"* ]]; then return; fi
  echo ""
  echo "════════ BUG $num: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then echo "   NOT A RESULT — the bugged tree does not build"; else sweep; fi
  put_back
}
sub() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys
p, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p, encoding="utf-8").read()
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY
}
C=src/index.css
RULE=':where(table > tbody > tr:nth-child(even)) { background-color: var(--row-alt); }'

if [ -z "${CASES:-}" ]; then
  echo "════════ CONTROL: no patch"
  npm run build >/dev/null 2>&1 && sweep
fi

run_case 1 "no stripe at all — the rule is gone" \
  sub "$C" "$RULE" "/* removed */"
run_case 2 "the stripe on the odd rows instead" \
  sub "$C" "$RULE" ':where(table > tbody > tr:nth-child(odd)) { background-color: var(--row-alt); }'
run_case 3 "a hidden row breaks the alternation" \
  sub "$C" "$RULE" "$RULE"$'\n'':where(table > tbody > tr:nth-child(3)) { display: none; }'
run_case 4 "the dark stripe is the card's own colour, so it cannot be seen" \
  sub "$C" "  --row-alt: #1a1740;" "  --row-alt: #151233;"
run_case 5 "the stripe drawn in the dark theme only" \
  sub "$C" "$RULE" ':where(html.dark table > tbody > tr:nth-child(even)) { background-color: var(--row-alt); }'
