#!/usr/bin/env bash
# VERIFY THE ASK MUNS REMOVAL'S CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# The family paused the Muns chat (Stage 10bz): *"Remove Ask muns from here,
# dont want this right now."* Two doors led to it — a button beside the search
# box and an "Ask Muns" row at the end of every search — and both are gone.
# `check:pages` asserts the removal on the `chat` and `search` routes. A check
# nobody has watched fail is a check nobody knows can fail, so each bug below is
# applied on its own, rebuilt, swept over those two routes, and restored.
#
# THE RESTORE IS BY COPY AND ON A TRAP, and it REBUILDS on the way out:
# restoring the source alone leaves `dist/` at the bugged build for the next run
# to report under the wrong name. A patch that does not apply, or a tree that
# does not build, is reported as NOT A RESULT rather than as a clean run.
#
# DO NOT EDIT ANY FILE IN `FILES` WHILE THIS RUNS: the restore puts the snapshot
# back, silently undoing the edit. `BASE` is passed through to the sweep, so a
# preview on another port can be swept (`BASE=http://127.0.0.1:4179`).
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-ask-muns-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/components/TopBar.tsx"
  "src/components/SmartSearch.tsx"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
restore() {
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
  for f in "${FILES[@]}"; do cmp -s "$SNAP/$f" "$f" || echo "!! restore of $f DID NOT TAKE"; done
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

ROUTES=chat,search

put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }

run_case() {
  local name="$1"; shift
  echo ""
  echo "════════ BUG: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | grep -v 'NOT CHECKED' | sed 's/^/   /'
  fi
  put_back
}

# ONE substitution in one file, which must match exactly once — a patch that
# matched nothing (or twice) is not a result, and says so.
sub() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys
p, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p, encoding="utf-8").read()
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY
}

echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | grep -v 'NOT CHECKED' | sed 's/^/   /'

# ── 1 ── the family's own complaint: the button back beside the search box
button_back() {
  sub src/components/TopBar.tsx 'import { SmartSearch } from "@/components/SmartSearch";' \
    'import { SmartSearch } from "@/components/SmartSearch";
import { MunsChat } from "@/components/MunsChat";' \
  && sub src/components/TopBar.tsx '        <SmartSearch />
      </div>' '        <SmartSearch />
        <MunsChat />
      </div>'
}
run_case "the Ask Muns button is back beside the search box" button_back

# ── 2 ── the same button, under a handle the check does not know
run_case "a button reading Ask Muns is back under another handle" \
  sub src/components/TopBar.tsx '        <SmartSearch />
      </div>' '        <SmartSearch />
        <button type="button" className="btn-ghost h-9 px-2.5">Ask Muns</button>
      </div>'

# ── 3 ── the search list's Ask row back, on every query, with its handle
ANCHOR='          {/* The keys only mean something where there are rows to move through. */}'
run_case "the search list offers Ask Muns on every query again" \
  sub src/components/SmartSearch.tsx "$ANCHOR" '          {query && (
            <div data-search-result="ask" data-search-kind="ask" data-search-href="" className="px-3 py-2 text-sm text-slate-200">
              Ask Muns &ldquo;{query}&rdquo;
            </div>
          )}
'"$ANCHOR"

# ── 4 ── …and the same row with no handle at all, which only the words can see
run_case "an Ask Muns row is back with no handle" \
  sub src/components/SmartSearch.tsx "$ANCHOR" '          {query && <div className="px-3 py-2 text-sm text-slate-200">Ask Muns about &ldquo;{query}&rdquo;</div>}
'"$ANCHOR"

# ── 5 ── the list closes whenever it has no rows, so a query that finds nothing
#          loses its empty line and the note saying why a name is on no statement
run_case "a query that finds nothing no longer opens the list" \
  sub src/components/SmartSearch.tsx '      {open && (rows.length > 0 || query !== "") && (' '      {open && rows.length > 0 && ('

# ── 6 ── the empty line still offers Muns
run_case "the empty line still offers Muns the question" \
  sub src/components/SmartSearch.tsx 'matches &ldquo;{query}&rdquo;.' 'matches &ldquo;{query}&rdquo;. Muns can still take the question.'
