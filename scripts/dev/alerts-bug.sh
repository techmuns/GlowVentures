#!/usr/bin/env bash
# VERIFY THE PRICE-ALERT CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR
# (Stage 10cm).
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
#
# The cases marked SENDER are the ones for the levels this dashboard sends to
# Glow Central Research. `CASES=<regex>` runs only the cases whose name matches
# (`CASES=SENDER` for those); the no-patch control always runs.
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
  "src/lib/researchLevels.ts"
  "src/lib/researchSync.ts"
  "src/lib/useResearchSync.ts"
  "src/components/ResearchStatus.tsx"
  "src/lib/__tests__/researchLevels.test.ts"
  "src/App.tsx"
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
# THE VERDICT IS EACH SUITE'S OWN EXIT STATUS, never grep's — see
# `absent-name-bug.sh` for the run where piping read every case backwards. The
# output goes to a file and the status is read straight off `node`, so no pipe
# stands between the suite and its verdict.
SUITES=(
  "src/lib/__tests__/priceAlerts.test.ts"
  "src/lib/__tests__/researchLevels.test.ts"
)
suite() {
  local label="${1:-THE BUG DID NOT FIRE}" d f rc fired=0; d=$(mktemp -d -p node_modules)
  for f in "${SUITES[@]}"; do
    if ! ./node_modules/.bin/esbuild "$f" --bundle --platform=node --format=esm \
      --outfile="$d/t.mjs" --packages=external --alias:@="$(pwd)/src" --log-level=error; then
      echo "   SUITE $(basename "$f") did not bundle"; fired=1; continue
    fi
    node "$d/t.mjs" > "$d/out.txt" 2>&1; rc=$?
    if [ $rc -ne 0 ]; then
      fired=1
      tr -d '\000' < "$d/out.txt" | grep -aE '^FAIL' | sed "s/^/   SUITE $(basename "$f" .test.ts) /"
    fi
  done
  rm -rf "$d"
  if [ $fired -eq 0 ]; then echo "   SUITE CLEAN — $label"; fi
}

# layers: any of "pages", "family", "suite"
run_case() {
  local name="$1" layers="$2"; shift 2
  if [ -n "${CASES:-}" ] && ! [[ "$name" =~ $CASES ]]; then return; fi
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
# The control's clean suite is the RESULT it exists for, so it says so rather
# than reading, in a log, like a case that did not fire.
npm run build >/dev/null 2>&1 && sweep && family && suite "as a control should be"

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
  patch $PA '  if (!rows.length) return { state: "none", reason: "not held on any statement in this book, so no price is fetched for it" };' \
            '  if (!rows.length) return { state: "none", reason: "not held on any statement in this book, so no price is fetched for it" };
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

# ── SENDER: THE LEVELS THIS DASHBOARD SENDS TO GLOW CENTRAL RESEARCH ───────
RL=src/lib/researchLevels.ts
RS=src/lib/researchSync.ts
URS=src/lib/useResearchSync.ts
RST=src/components/ResearchStatus.tsx

run_case "SENDER: every level goes as a SET, overwriting another device's newer one" "pages suite" \
  patch $RL '    const op = fresh || l.ticker in sent.acked ? "set" : "seed";' \
            '    const op = fresh || l.ticker in sent.acked || l.ticker.length > 0 ? "set" : "seed";'

run_case "SENDER: a note typed under an old level turns it into a SET" "suite" \
  patch $RL '    const fresh = sent.since !== null && l.changedAt >= sent.since && sent.seeds[l.ticker] !== fp;' \
            '    const fresh = sent.since !== null && l.changedAt >= sent.since;'

run_case "SENDER: the first send records no seeds" "suite" \
  patch $RL '    if (sent.since === null || l.changedAt < since) seeds[l.ticker] = fingerprint(l);' \
            '    if (l.ticker.length < 0) seeds[l.ticker] = fingerprint(l);'

run_case "SENDER: the ISIN is not sent, so the other side cannot check its price" "pages family suite" \
  patch $RL '    const row: ResearchLevel = { ticker, isin, name, levels, changedAt: e.updatedAt || "", securityKey: key };' \
            '    const row: ResearchLevel = { ticker, isin: isin ? null : null, name, levels, changedAt: e.updatedAt || "", securityKey: key };'

run_case "SENDER: the book's ISIN is preferred to the instrument the symbol IS" "suite" \
  patch $RL '    const isin = [resolve.instrumentIsin(ticker), ...rows.map((r) => r.isin)]' \
            '    const isin = [...rows.map((r) => r.isin), resolve.instrumentIsin(ticker)]'

run_case "SENDER: a holding with no NSE symbol is sent under its own slug" "pages family suite" \
  patch $RL '    const ticker = raw ? raw.trim().toUpperCase() : null;' \
            '    const ticker = (raw ?? key).trim().toUpperCase();'

run_case "SENDER: a level the other side reads as a typo sinks the whole batch" "suite" \
  patch $RL '    if (LEVEL_NAMES.some((n) => (levels[n] ?? 0) > RESEARCH_LEVEL_MAX)) {' \
            '    if (LEVEL_NAMES.some((n) => (levels[n] ?? 0) > RESEARCH_LEVEL_MAX * 1e9)) {'

run_case "SENDER: the other side's batch size is ignored" "suite" \
  patch $RL 'export function batchesOf<T>(items: readonly T[], size = RESEARCH_BATCH): T[][] {' \
            'export function batchesOf<T>(items: readonly T[], size = RESEARCH_BATCH * 100): T[][] {'

run_case "SENDER: another device's levels answering a seed are read as ours — saved" "suite" \
  patch $RL '      || (o.outcome === "unchanged" && (intent.op === "set" || holdsExactly(held.get(o.ticker), intent.levels)))) {' \
            '      || (o.outcome === "unchanged" && (intent.op === "set" || holdsExactly(held.get(o.ticker), intent.levels) || o.ticker.length > 0))) {'

run_case "SENDER: what already arrived is sent again every time" "suite" \
  patch $RL '    if (sent.acked[l.ticker] === fp) continue;' \
            '    if (sent.acked[l.ticker] === fp && fp.length < 0) continue;'

run_case "SENDER: removing the last level never clears it there, so it goes on alerting" "family suite" \
  patch $RL 'if (!wanted.has(t)) out.push({ op: "clear", ticker: t });' \
            'if (!wanted.has(t) && t.length < 0) out.push({ op: "clear", ticker: t });'

run_case "SENDER: a level still on its way reads SENT" "family suite" \
  patch $RL '  return { kind: "sending", ticker: l.ticker };' \
            '  return { kind: "sent", ticker: l.ticker };'

run_case "SENDER: the other side not deployed yet reads as an outage" "pages family suite" \
  patch $RS '  if (res.status === 404) return { ok: false, code: "not-ready" };' \
            '  if (res.status === 404) return { ok: false, code: "error" };'

run_case "SENDER: the send carries this dashboard's cookies to another site" "pages suite" \
  patch $RS '      method: "POST", mode: "cors", credentials: "omit", cache: "no-store",' \
            '      method: "POST", mode: "cors", credentials: "include", cache: "no-store",'

run_case "SENDER: a refusal is asked again at once instead of in fifteen minutes" "family suite" \
  patch $RL '    case "not-ready": return 15 * 60_000;' '    case "not-ready": return 1_000;'

run_case "SENDER: a failed send is never tried again on its timer" "family" \
  patch $URS '    if (!ready || !retryAt) return;' '    if (!ready || !retryAt || retryAt.length > 0) return;'

run_case "SENDER: a browser coming back online does not send what was waiting" "family" \
  patch $URS '    window.addEventListener("online", again);' '    window.addEventListener("offline", again);'

# The count lives in `summaryLine` now (`researchLevels.ts`) — the footer's
# words and its hover are decided there, and the component only draws them.
run_case "SENDER: the footer says every company was sent, whatever arrived" "pages suite" \
  patch $RL '    const parts = [`${RESEARCH_NAME}: ${s.sent} of ${s.companies} ${s.companies === 1 ? "company" : "companies"} sent`];' \
            '    const parts = [`${RESEARCH_NAME}: ${s.companies} of ${s.companies} ${s.companies === 1 ? "company" : "companies"} sent`];'

# ── THE FOOTER AS ONE SHORT LINE (main's Stage 10ci rule) ───────────────────
run_case "SENDER: the footer's hover sentences are put back on screen" "pages" \
  patch $RST '      {line.text}' '      {line.text} {line.title}'

run_case "SENDER: the reasons never drop to the hover, so a bad day runs past one line" "suite" \
  patch $RL '  const text = full.length <= FOOTER_LINE_MAX ? full : build(false);' '  const text = full;'

run_case "SENDER: a level kept here as too high is said to have no NSE symbol" "suite" \
  patch $RL '  const stayWhy = s.tooHigh === 0 ? " (no NSE symbol)" : s.tooHigh === s.local ? " (a level too high to send)" : "";' \
            '  const stayWhy = " (no NSE symbol)";'

# ── A COMPANY HELD ONLY INSIDE THE FAMILY'S FUNDS (#88's page) ──────────────
# That page is badged "Held only inside your funds", and the alert card under it
# said the company was "not held in this book" and "has no NSE symbol" — both
# false of a listed company the family reaches through a fund. The first case
# walks that page as well; the second is the same words on the sending side.
ROUTES=$ROUTES,stock-funds-only run_case "a company held only inside funds is said to be not held in this book" "pages" \
  patch $PA '  if (!rows.length) return { state: "none", reason: "not held on any statement in this book, so no price is fetched for it" };' \
            '  if (!rows.length) return { state: "none", reason: "not held in this book, so no price is fetched for it" };'

run_case "SENDER: a holding this dashboard has no symbol for is said to have none" "suite" \
  patch $RL '        why: `${RESEARCH_NAME} follows listed companies by their NSE symbol, and this dashboard has no NSE symbol for this holding`,' \
            '        why: `${RESEARCH_NAME} follows listed companies by their NSE symbol, and this holding has none`,'

run_case "the price line's hover is dropped, taking its reasons with it" "pages" \
  patch $AA '        <p data-alert-feed={quotesStatus} title={feedWhy}>{feedLine}</p>' \
            '        <p data-alert-feed={quotesStatus}>{feedLine}</p>'

run_case "SENDER: nothing is ever sent — the sender is not mounted" "pages family" python3 - <<'PY2'
import sys
p = "src/App.tsx"
s = open(p, encoding="utf-8").read()
a = 'import { ResearchLevelSync } from "@/lib/useResearchSync";\n'
b = "        <ResearchLevelSync />\n"
if s.count(a) != 1 or s.count(b) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(a, "", 1).replace(b, "", 1))
PY2

echo ""
echo "════════ done"
