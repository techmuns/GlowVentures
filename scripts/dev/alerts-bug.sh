#!/usr/bin/env bash
# VERIFY THE PRICE-ALERT CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR
# (Stage 10bz).
#
# A check nobody has watched fail is a check nobody knows can fail. Each bug
# below is applied on its own, rebuilt, run through the layer that should
# catch it — the page sweep, the browser suite or the unit suite — and
# restored. Two of the bugs ARE the defects the family reported: the Buy level
# that never fired, and an alert that "fired" on a weeks-old statement mark.
#
# THE RESTORE IS BY COPY AND ON A TRAP, because five of these files are NEW
# and `git checkout -- <file>` on an untracked file silently does nothing. And
# it REBUILDS on the way out: restoring the source alone leaves `dist/` at the
# bugged build for the next run to report under the wrong name.
#
# A PATCH THAT DOES NOT APPLY, OR A BUILD THAT FAILS, IS REPORTED AS NOT A
# RESULT rather than as a clean run.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-alerts-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/lib/priceAlerts.ts"
  "src/lib/usePriceAlerts.ts"
  "src/lib/watchlist.ts"
  "src/components/AllAlerts.tsx"
  "src/components/AlertBits.tsx"
  "src/components/InvestmentTools.tsx"
  "src/pages/MorningCIO.tsx"
  "src/lib/__tests__/priceAlerts.test.ts"
  "scripts/check-pages.mjs"
  "scripts/dev/check-family-inputs.mjs"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
put_back() {
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
  for f in "${FILES[@]}"; do cmp -s "$SNAP/$f" "$f" || echo "!! $f did not restore"; done
}
restore() {
  put_back
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

ROUTES=cio,cio-alerts,cio-alerts-nofeed,cio-alerts-empty,cio-alerts-badge

sweep() { ONLY=$ROUTES npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | sed 's/^/   /'; }
family() {
  local out; out=$(npm run check:family 2>&1 | tr -d '\000')
  printf '%s\n' "$out" | grep -aE '^FAIL|passed, [0-9]+ failed' | sed 's/^/   FAMILY /'
}
# THE VERDICT IS THE SUITE'S OWN EXIT STATUS, never grep's — see
# `absent-name-bug.sh` for the run where piping read every case backwards.
suite() {
  local d out rc; d=$(mktemp -d -p node_modules)
  ./node_modules/.bin/esbuild src/lib/__tests__/priceAlerts.test.ts --bundle --platform=node --format=esm \
    --outfile="$d/pa.mjs" --packages=external --alias:@="$(pwd)/src" --log-level=error || { echo "   SUITE did not bundle"; rm -rf "$d"; return; }
  out=$(node "$d/pa.mjs" 2>&1 | tr -d '\000'); rc=${PIPESTATUS[0]}
  rm -rf "$d"
  if [ $rc -eq 0 ]; then echo "   SUITE CLEAN — THE BUG DID NOT FIRE"
  else printf '%s\n' "$out" | grep -aE '^FAIL' | sed 's/^/   SUITE /'; fi
}

# layers: any of "pages", "family", "suite"
run_case() {
  local name="$1" layers="$2"; shift 2
  echo ""
  echo "════════ BUG: $name  [$layers]"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if [[ "$layers" == *suite* ]]; then suite; fi
  if [[ "$layers" == *pages* || "$layers" == *family* ]]; then
    if ! npm run build >/dev/null 2>&1; then
      echo "   NOT A RESULT — the bugged tree does not build"; put_back; return
    fi
    if [[ "$layers" == *pages* ]]; then sweep; fi
    if [[ "$layers" == *family* ]]; then family; fi
  fi
  put_back
}

# Replace ONE exact string in ONE file, or refuse — a patch that silently
# matched nothing would run the checks over an unchanged tree.
patch() {
  python3 - "$@" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path, encoding="utf-8").read()
if s.count(old) != 1:
    print(f"   (anchor found {s.count(old)} times in {path})"); sys.exit(1)
open(path, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY
}
patch_all() {
  python3 - "$@" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path, encoding="utf-8").read()
if old not in s: sys.exit(1)
open(path, "w", encoding="utf-8").write(s.replace(old, new))
PY
}

# A NO-PATCH CONTROL FIRST. Without it a tree that was already failing reports
# every bug below as "fired".
echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && sweep && family && suite

PA=src/lib/priceAlerts.ts
CIO=src/pages/MorningCIO.tsx
AA=src/components/AllAlerts.tsx
AB=src/components/AlertBits.tsx
IT=src/components/InvestmentTools.tsx
WL=src/lib/watchlist.ts

# ── THE TWO DEFECTS THE FAMILY REPORTED ─────────────────────────────────────
run_case "the Buy level never fires — the old check left it out" "pages suite" \
  patch $PA '    const levels = ALERT_DEFS.filter((d) => isLevel(entry[d.field]));' \
            '    const levels = ALERT_DEFS.filter((d) => d.kind !== "entry" && isLevel(entry[d.field]));'

run_case "an alert with no live price is checked against the statement mark" "pages suite" \
  patch $PA '  if (!rows.length) return { state: "none", reason: "not held in this book, so no price is fetched for it" };' \
            '  if (!rows.length) return { state: "none", reason: "not held in this book, so no price is fetched for it" };
  const stale = rows.find(hasPrice);
  if (stale) return { state: "live", price: stale.currentPrice as number };'

# ── WHICH WAY, AND HOW FAR ──────────────────────────────────────────────────
run_case "a Stop loss fires on the way UP" "pages suite" \
  patch $PA '  { kind: "below", field: "alertBelow", label: "Stop loss", dir: "down",' \
            '  { kind: "below", field: "alertBelow", label: "Stop loss", dir: "up",'

run_case "the distance still to go is struck against the level, not the price now" "pages suite" \
  patch $PA '    : { status: "watching", toGoPct: (Math.abs(level - p) / p) * 100, pastPct: null };' \
            '    : { status: "watching", toGoPct: (Math.abs(level - p) / level) * 100, pastPct: null };'

run_case "fired alerts sort nearest-first instead of furthest past" "pages suite" \
  patch $PA '    const d = (b.pastPct ?? 0) - (a.pastPct ?? 0);' \
            '    const d = (a.pastPct ?? 0) - (b.pastPct ?? 0);'

run_case "an alert on a sold holding loses the name saved with it" "pages suite" \
  patch $PA '    const name = rows[0]?.security || entry.name || prettyKey(key);' \
            '    const name = rows[0]?.security || prettyKey(key);'

# ── WHAT THE TAB LOOKS LIKE ─────────────────────────────────────────────────
run_case "a fired alert carries no bell" "pages" \
  patch $AB '<Bell className="h-3.5 w-3.5" aria-hidden />{ALERT_DEF[kind].reached}' '{ALERT_DEF[kind].reached}'

run_case "every row is tinted, fired or not" "pages" \
  patch $AA 'data-alert-source={r.now.state} className={reached ? tone.tint : undefined}>' \
            'data-alert-source={r.now.state} className={tone.tint}>'

run_case "the pencil opens the holding's page but not its alert boxes" "pages family" \
  patch $AA '                const href = `/stock/${encodeURIComponent(r.securityKey)}#alerts`;' \
            '                const href = `/stock/${encodeURIComponent(r.securityKey)}`;'

run_case "the note under the table says live prices whatever the feed did" "pages" \
  patch $AA '  const feedLine = quotesStatus === "live"' '  const feedLine = true'

run_case "the empty tab draws an empty table instead of saying there are no alerts" "pages family" \
  patch $AA '      {rows.length === 0 ? (' '      {rows.length < 0 ? ('

# ── THE BADGE AND THE CONTROL ───────────────────────────────────────────────
run_case "the badge counts every alert, not the ones that have fired" "pages" \
  patch_all $CIO 'alerts.counts.reached' 'alerts.counts.total'

run_case "a quiet day shows a 0 badge" "pages" \
  patch $CIO '{v.key === "alerts" && alerts.counts.reached > 0 && (' '{v.key === "alerts" && ('

run_case "the badge shows only while the alerts tab is already open" "pages" \
  patch $CIO '{v.key === "alerts" && alerts.counts.reached > 0 && (' '{v.key === "alerts" && tab === "alerts" && alerts.counts.reached > 0 && ('

run_case "All alerts is added FIRST, moving the default panel" "pages" python3 - <<'PY'
import sys
p = "src/pages/MorningCIO.tsx"
s = open(p, encoding="utf-8").read()
line = '  { key: "alerts", label: "All alerts", title: "Every price alert you have set, and which have been reached" },\n'
if s.count(line) != 1 or s.count("const CIO_TABS = [\n") != 1: sys.exit(1)
s = s.replace(line, "", 1).replace("const CIO_TABS = [\n", "const CIO_TABS = [\n" + line, 1)
open(p, "w", encoding="utf-8").write(s)
PY

# ── THE STORE AND THE FORM (driven end to end) ──────────────────────────────
run_case "a save tells nobody — the boxes and the tab go stale" "family suite" \
  patch $WL '  snapshot = w;
  notify();' '  snapshot = w;'

run_case "a saved name alone keeps an empty entry alive" "family suite" \
  patch $WL '  const empty = !next.watching && !next.note.trim()' '  const empty = !next.name && !next.watching && !next.note.trim()'

run_case "a typed 'abc' is read as blank and erases the level" "family suite" \
  patch $PA '  return Number.isFinite(n) && n > 0 ? { ok: true, value: n } : { ok: false };' \
            '  return Number.isFinite(n) && n > 0 ? { ok: true, value: n } : { ok: true, value: null };'

run_case "the Target box writes to the Alert above field" "family" \
  patch $IT '    if (r.value !== entry[field]) save({ [field]: r.value } as Partial<WatchEntry>);' \
            '    if (r.value !== entry[field]) save({ [field === "targetPrice" ? "alertAbove" : field]: r.value } as Partial<WatchEntry>);'

run_case "one click on the cross removes the alert" "family" \
  patch $AA '<button type="button" data-alert-remove onClick={() => setConfirming(r.id)}' \
            '<button type="button" data-alert-remove onClick={() => remove(r)}'

# Both places it is decided: the first paint, and the effect that re-decides it
# when the holding changes (which also runs on mount, so patching one alone
# changes nothing a reader could see).
run_case "More never opens by itself, hiding what was typed under it" "family" python3 - <<'PY'
import sys
p = "src/components/InvestmentTools.tsx"
s = open(p, encoding="utf-8").read()
a = "  const [moreOpen, setMoreOpen] = useState(() => moreFieldsSet(readEntry(securityKey)) > 0);"
b = "    setMoreOpen(moreFieldsSet(readEntry(securityKey)) > 0);"
if s.count(a) != 1 or s.count(b) != 1: sys.exit(1)
s = s.replace(a, "  const [moreOpen, setMoreOpen] = useState(false);", 1).replace(b, "    setMoreOpen(false);", 1)
open(p, "w", encoding="utf-8").write(s)
PY

run_case "the New alert finder offers holdings an alert can never be checked on" "family" \
  patch $AA '      if (!symbolFor(p) && !fundNavFor(p)?.usableForValue) continue;' '      if (p.marketValue <= 0) continue;'

echo ""
echo "════════ done"
