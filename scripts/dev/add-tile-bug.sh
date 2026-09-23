#!/usr/bin/env bash
# VERIFY STAGE 10cg's CHECKS BY REINTRODUCING EACH BUG.
#
# *"Add another tile. It should be a big empty tile with bold written: ADD TILE.
# When I click on the ADD TILE button, I should be able to choose what I want to
# see in that tile."* and *"We need to keep the ability for the customer to add
# a date in this Capital Call column, which is empty right now."*
#
# Both changes are mostly GEOMETRY and BEHAVIOUR — where a card sits, how big
# and how bold it is, what a click opens — and a page renders the same words
# whether any of that works. So a check nobody has watched fail here may be
# asserting nothing. Each bug is applied on its own, rebuilt, swept and restored.
#
# The card is on BOTH strips — Private Market's and Morning CIO's, which are one
# component since Stage 10cb — so the tile cases walk both pages. Morning CIO's
# route comes with `private-market-tiles`, whose address is read off the
# Private Market picker on the walk before it, so the two are always swept
# together.
#
# Same three rules as `nav-bench-bug.sh` and `sectors-bug.sh`: restore by COPY on
# a trap, rebuild on the way out, and report a patch that does not apply or a
# build that fails as NOT A RESULT rather than as a clean run. Needs a
# `vite preview` on :4173, like `check:pages` — or on the address `BASE=` names,
# which is how it runs in a `git worktree` of its own while the working copy
# stays clean (Stage 10cg). `CASES=3,7` runs a subset.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-add-tile-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/components/SelectableTiles.tsx"
  "src/components/EnteredCalls.tsx"
  "src/lib/enteredCalls.ts"
  "src/lib/privateBook.ts"
  "src/lib/fundReturns.ts"
  "src/pages/PrivateMarket.tsx"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
put_back() {
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; cmp -s "$SNAP/$f" "$f" || echo "!! $f did NOT restore"; done
}
restore() {
  put_back
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

TILES=private-market,private-market-tiles,cio
CALLS=private-market,private-market-calls-off,private-market-calls-signedout
RETURNS=private-market,private-market-returns

CASE_N=0
want_case() {
  CASE_N=$((CASE_N + 1))
  [ -z "${CASES:-}" ] && return 0
  case ",$CASES," in *",$CASE_N,"*) return 0 ;; esac
  return 1
}

# The invariants run on the first theme, so the light pass is the whole verdict.
# The one evidenced abstention on these routes — every private holding reports a
# cost — is filtered, so a line that DOES appear is this case's.
sweep() {
  ONLY="$1" THEMES=light npm run check:pages 2>&1 | grep -aE 'INVARIANT|^✓|^✗' \
    | grep -av 'no fund row prints a return where its cost is absent' | sed 's/^/   /'
}

run_case() {
  local name="$1" routes="$2"; shift 2
  want_case || return 0
  echo ""
  echo "════════ BUG $CASE_N: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    sweep "$routes"
  fi
  put_back
}

# THE STORE'S OWN SUITE, for bugs that live where the page sweep cannot see
# them. The verdict is the suite's exit status, never a pipeline's, and the
# output's NULs are stripped before grep reads it.
run_suite_case() {
  local name="$1"; shift
  want_case || return 0
  echo ""
  echo "════════ BUG $CASE_N (suite): $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  local out; out=$(mktemp -d node_modules/.glow-bug-XXXX)
  if ! node_modules/.bin/esbuild src/lib/__tests__/enteredCalls.test.ts --bundle --platform=node --format=esm \
       --outfile="$out/t.mjs" --packages=external --alias:@="$PWD/src" --log-level=error; then
    echo "   NOT A RESULT — the suite does not bundle"
  else
    node "$out/t.mjs" > "$out/log" 2>&1; local st=$?
    tr -d '\000' < "$out/log" | grep -a '^FAIL' | sed 's/^/   /'
    [ $st -ne 0 ] && echo "   SUITE FAILED (exit $st)" || echo "   SUITE clean"
  fi
  rm -rf "$out"
  put_back
}

py() { python3 - "$@"; }

echo "════════ CONTROL: no patch — this must be CLEAN"
if npm run build >/dev/null 2>&1; then
  sweep "$TILES,cio-tiles-dense,private-market-calls-off,private-market-calls-signedout,private-market-returns"
else
  echo "   !! the UNPATCHED tree does not build — nothing below is a result"
fi

# ── THE ADD TILE CARD ─────────────────────────────────────────────────────────

# 1 ── the card is not drawn at all (the `+` is simply gone)
run_case "the ADD TILE card is not drawn" "$TILES" py <<'EOF'
import sys
p='src/components/SelectableTiles.tsx'; s=open(p).read()
old='      {showAdd && <AddTile spare={spare} savedWhere={savedWhere} onPick={add} />}'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,''))
EOF

# 2 ── the click ignores the choice and appends the first spare metric — what the `+` did
run_case "the card appends the first spare metric whatever is picked" "$TILES" py <<'EOF'
import sys
p='src/components/SelectableTiles.tsx'; s=open(p).read()
old='<AddTile spare={spare} savedWhere={savedWhere} onPick={add} />'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'<AddTile spare={spare} savedWhere={savedWhere} onPick={() => add(spare[0].id)} />'))
EOF

# 3 ── the menu offers every metric, the ones on screen included
run_case "the menu offers metrics already on screen" "$TILES" py <<'EOF'
import sys
p='src/components/SelectableTiles.tsx'; s=open(p).read()
old='<AddTile spare={spare} savedWhere={savedWhere} onPick={add} />'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'<AddTile spare={metrics} savedWhere={savedWhere} onPick={add} />'))
EOF

# 4 ── the rows are sized to their content, so the card alone on a row is short
run_case "the card is not the size of a tile (no equal rows)" "$TILES" py <<'EOF'
import sys
p='src/components/SelectableTiles.tsx'; s=open(p).read()
old='"grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4"'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'"grid gap-4 sm:grid-cols-2 lg:grid-cols-4"'))
EOF

# 5 ── …and on Morning CIO, where six tiles put the card alone on the next row
run_case "Morning CIO's card is not the size of a tile on a row of its own" "$TILES,cio-tiles-dense" py <<'EOF'
import sys
p='src/components/SelectableTiles.tsx'; s=open(p).read()
old='"kpi-grid grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3"'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'"kpi-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3"'))
EOF

# 6 ── ADD TILE is not bold
run_case "the ADD TILE label is not bold" "$TILES" py <<'EOF'
import sys
p='src/components/SelectableTiles.tsx'; s=open(p).read()
old='className="text-sm font-bold uppercase tracking-[0.14em]">Add tile</span>'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'className="text-sm font-medium uppercase tracking-[0.14em]">Add tile</span>'))
EOF

# 7 ── the card is drawn as one more figure tile
run_case "the card is styled as a figure tile (a .card)" "$TILES" py <<'EOF'
import sys
p='src/components/SelectableTiles.tsx'; s=open(p).read()
old='className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'className="card flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed'))
EOF

# 8 ── the card stays when every metric is on screen, opening an empty menu
run_case "the card is drawn with nothing left to add" "$TILES" py <<'EOF'
import sys
p='src/components/SelectableTiles.tsx'; s=open(p).read()
old='{showAdd && <AddTile'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'{<AddTile'))
EOF

# 9 ── the menu paints under the fund table
run_case "the menu is drawn under the page" "$TILES" py <<'EOF'
import sys
p='src/components/SelectableTiles.tsx'; s=open(p).read()
old='className="absolute inset-x-0 top-0 z-40 rounded-md'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'className="absolute inset-x-0 top-0 -z-10 rounded-md'))
EOF

# 10 ── Escape does not close it
run_case "Escape does not close the menu" "$TILES" py <<'EOF'
import sys
p='src/components/SelectableTiles.tsx'; s=open(p).read()
old='if (e.key === "Escape") close();'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'if (e.key === "Escape-never") close();'))
EOF

# 11 ── Morning CIO's strip stops counting the card, so it takes a row of its own
run_case "the card is not counted in Morning CIO's columns" "$TILES" py <<'EOF'
import sys
p='src/components/SelectableTiles.tsx'; s=open(p).read()
old='Math.min(Math.max(ids.length + (showAdd ? 1 : 0), 1), 6)'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'Math.min(Math.max(ids.length, 1), 6)'))
EOF

# 12 ── the added tile is drawn and never saved — the next visit has lost it
run_case "an added tile is shown but not saved" "$TILES" py <<'EOF'
import sys
p='src/components/SelectableTiles.tsx'; s=open(p).read()
old="""    if (!byId.has(id) || ids.includes(id) || ids.length >= cap) return;
    commit([...ids, id]);"""
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,"""    if (!byId.has(id) || ids.includes(id) || ids.length >= cap) return;
    setLocal({ ids: [...ids, id], synced: false });"""))
EOF

# ── THE CAPITAL CALL CELLS ───────────────────────────────────────────────────

# 13 ── the cell is an em dash nothing can click again — the defect reported
run_case "an unsaveable cell is an unclickable dash again" "$CALLS" py <<'EOF'
import sys
p='src/components/EnteredCalls.tsx'; s=open(p).read()
old='''      <button type="button" onClick={onToggle} aria-expanded={open}
        data-pm-call-state="unavailable" data-pm-call-cause={state.cause}
        title={state.reason}
        className={`${cls} whitespace-nowrap text-slate-500 hover:text-slate-300`}>
        {CAUSE_WORD[state.cause]}
      </button>'''
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'''      <span data-pm-call-state="unavailable" title={state.reason}>—</span>'''))
EOF

# 14 ── the cell offers "Add" though nothing can be saved
run_case "an unsaveable cell says Add" "$CALLS" py <<'EOF'
import sys
p='src/components/EnteredCalls.tsx'; s=open(p).read()
old='''        className={`${cls} whitespace-nowrap text-slate-500 hover:text-slate-300`}>
        {CAUSE_WORD[state.cause]}'''
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'''        className={`${cls} whitespace-nowrap text-slate-500 hover:text-slate-300`}>
        <Plus className="h-3 w-3" /> Add'''))
EOF

# 15 ── the set-up steps are shown whatever the cause
run_case "the Cloudflare steps are shown to a signed-out reader" "$CALLS" py <<'EOF'
import sys
p='src/components/EnteredCalls.tsx'; s=open(p).read()
old='{state.status === "unavailable" && state.cause === "not-configured" && ('
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'{state.status === "unavailable" && ('))
EOF

# 16 ── "Saved for everyone" is printed over an editor that saves nothing
run_case "the editor says 'saved for everyone' while saving is off" "$CALLS" py <<'EOF'
import sys
p='src/components/EnteredCalls.tsx'; s=open(p).read()
old='{writable && <div className="text-[11px] text-slate-500">Saved for everyone'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'{<div className="text-[11px] text-slate-500">Saved for everyone'))
EOF

# 17 ── Save is live while the store cannot save
run_case "Save is not switched off with the store" "$CALLS" py <<'EOF'
import sys
p='src/components/EnteredCalls.tsx'; s=open(p).read()
old='<button type="submit" disabled={!writable || busy} data-pm-call-save'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'<button type="submit" disabled={busy} data-pm-call-save'))
EOF

# 18 ── the header note says "not available" whatever the cause
run_case "the header note stops naming the cause" "$CALLS" py <<'EOF'
import sys
p='src/pages/PrivateMarket.tsx'; s=open(p).read()
old='note={entered.state.status === "unavailable" ? CAUSE_WORD[entered.state.cause].toLowerCase() : "you enter"}'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'note={entered.state.status === "unavailable" ? "not available" : "you enter"}'))
EOF

# 19 ── the steps name a binding the function does not read
run_suite_case "the set-up steps name another binding" py <<'EOF'
import sys
p='src/lib/enteredCalls.ts'; s=open(p).read()
old='Variable name: GLOW_STORE;'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'Variable name: GLOW_KV;'))
EOF

# 20 ── a store nobody connected reads as a generic error
run_suite_case "NOT_CONFIGURED loses its cause" py <<'EOF'
import sys
p='src/lib/enteredCalls.ts'; s=open(p).read()
old='return { ok: false, reason: REASONS.notConfigured, cause: "not-configured" };'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'return { ok: false, reason: REASONS.notConfigured, cause: "error" };'))
EOF

# ── THE CHECKER'S FIFO EXPECTATION, PROVED TO BITE ───────────────────────────

# 21 ── a fund row's HPR back to value ÷ cost held (the pre-FIFO figure)
run_case "a fund's HPR is value against cost held again" "$RETURNS" py <<'EOF'
import sys
p='src/lib/privateBook.ts'; s=open(p).read()
old='      ? fifoTotals(held.map((f) => f.position!)).returnPct : null,'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'      ? ((value - cost) / cost) * 100 : null,'))
EOF

# 22 ── a fund's dated calls held to the cost of the units still held
run_case "a fund's calls must equal the cost held, not every rupee deployed" "$RETURNS" py <<'EOF'
import sys
p='src/lib/fundReturns.ts'; s=open(p).read()
old='      const deployed = p.costBasis == null ? null : p.costBasis + sold;'
if s.count(old)!=1: sys.exit(1)
open(p,'w').write(s.replace(old,'      const deployed = p.costBasis == null ? null : p.costBasis + sold * 0;'))
EOF

echo ""
echo "════════ done"
