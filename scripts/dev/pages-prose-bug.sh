#!/usr/bin/env bash
# VERIFY THE "NO EXPLAINER LINE ON ANY PAGE" CHECKS BY REINTRODUCING EACH BUG,
# ONE AT A TIME (Stage 10cp).
#
#   "We have such random one-liners, two-liners, and footnotes everywhere across
#    the product. Please go hunt and remove all of this … The customer is
#    literally looking at the table and seeing the values inside it."
#
# Every page lost its card subtitles, its page subtitle, the paragraph under an
# absence and the line under a tile, and each fact a reader acts on moved into a
# hover on the figure it describes. Three kinds of bug to put back, and each
# must fire its own check: a removed line RETURNING (the route-wide check), a
# re-homed fact GOING MISSING from its hover, and a GUARD that had to stay on
# the face — "not annualised", the missing-data band — leaving it.
#
# Restored BY COPY on a trap, VERIFIED byte for byte, and REBUILT on the way
# out — restoring the source alone leaves `dist/` at the bugged build, and the
# next sweep reports the previous bug's failures under the next one's name. A
# patch that does not apply, or a build that fails, is reported as NOT A
# RESULT, never as clean. Invariants run on the first theme only, so THEMES is
# light and no screenshots are taken.
#
# Needs `vite preview` on BASE (default :4173), like `check:pages`. COMMIT
# FIRST: this rewrites the files it patches, and a restore that failed would
# leave them so.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-pages-prose-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "src/components/Card.tsx"
  "src/components/StatTile.tsx"
  "src/components/PageHeader.tsx"
  "src/components/Absent.tsx"
  "src/components/TodaysMovers.tsx"
  "src/components/NavMovers.tsx"
  "src/pages/CapitalGains.tsx"
  "src/pages/Performance.tsx"
  "src/pages/Polycab.tsx"
  "src/components/ReturnsTable.tsx"
  "src/components/CorporateActionReturns.tsx"
  "src/pages/SectorComposition.tsx"
  "src/pages/UploadHistory.tsx"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
put_back() {
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
  for f in "${FILES[@]}"; do cmp -s "$SNAP/$f" "$f" || echo "!! RESTORE FAILED for $f"; done
}
restore() {
  put_back
  npm run build >/dev/null 2>&1 || echo "!! restore build FAILED — the tree is dirty"
  rm -rf "$SNAP"
}
trap restore EXIT

# The evidenced abstentions this book always has — not findings, and printed
# once in the control rather than under every case.
QUIET='NOT CHECKED  (no fund row prints a return where its cost is absent|a redeemed account shows a measured ₹0|every KPI tile)'

sweep() {
  THEMES=light SHOTS=0 ONLY="$1" npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | grep -Ev "$QUIET" | sed 's/^/   /'
}

# `CASES="name|name"` re-runs only the cases whose name contains one of them —
# the control always runs, so a re-run is never read against a stale baseline.
run_case() {
  local routes="$1" name="$2"; shift 2
  if [ -n "${CASES:-}" ] && ! printf '%s' "$name" | grep -qiE "$CASES"; then return; fi
  echo ""
  echo "════════ BUG: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! npm run build >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not build"
  else
    sweep "$routes"
  fi
  put_back
}

# One exact substitution, or the case is not a result.
sub() { python3 - "$@" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path, encoding="utf8").read()
if s.count(old) != 1:
    print(f"   patch target found {s.count(old)} times"); sys.exit(1)
open(path, "w", encoding="utf8").write(s.replace(old, new))
PY
}
CARD=src/components/Card.tsx
TILE=src/components/StatTile.tsx
HEAD=src/components/PageHeader.tsx
ABS=src/components/Absent.tsx
TM=src/components/TodaysMovers.tsx
NM=src/components/NavMovers.tsx
CG=src/pages/CapitalGains.tsx
PERF=src/pages/Performance.tsx
PC=src/pages/Polycab.tsx
RT=src/components/ReturnsTable.tsx
CAR=src/components/CorporateActionReturns.tsx
SC=src/pages/SectorComposition.tsx
UH=src/pages/UploadHistory.tsx

ALL="performance,capital-gains,capital-gains-missing,family,sectors,sectors-direct,ledger,history,upload,polycab,cio,cio-allocation,cio-nav,stock-market,corporate-actions"

echo "════════ CONTROL: no patch"
npm run build >/dev/null 2>&1 && THEMES=light SHOTS=0 ONLY="$ALL,cio-live,cio-movers-funds,stock-funds-only-market,stock-funds-only-research" npm run check:pages 2>&1 | grep -E 'INVARIANT|^✓|^✗' | sed 's/^/   /'

# ── LINES COMING BACK, ON EVERY ROUTE ──────────────────────────────────────
run_case "$ALL" "a card draws its subtitle as a line again" sub $CARD \
  '              data-card-title-hint={subtitle ? "" : undefined}>{title}</div>}' \
  '              data-card-title-hint={subtitle ? "" : undefined}>{title}</div>}
            {subtitle && <div className="mt-1 text-xs text-slate-400" data-card-subtitle="">{subtitle}</div>}'

run_case "$ALL" "a tile draws its hint as a line again" sub $TILE \
  '      {/* NO LINE UNDER THE SUB (Stage 10cp).' \
  '      {hint && <p className="mt-1.5 text-[12.5px] leading-snug text-slate-400" data-stat-hint>{hint}</p>}
      {/* NO LINE UNDER THE SUB (Stage 10cp).'

run_case "$ALL" "the page subtitle is a line under the headline again" sub $HEAD \
  '      {right}
    </div>
  );' \
  '      {right}
      {subtitle && <p className="w-full max-w-2xl text-sm text-slate-400">{subtitle}</p>}
    </div>
  );'

run_case "capital-gains,cio-nav,performance" "an absence prints what would fill it as a paragraph again" sub $ABS \
  '      <div className="text-sm font-medium text-slate-300">{what}</div>' \
  '      <div className="text-sm font-medium text-slate-300">{what}</div>
      <p className="max-w-xl text-xs leading-relaxed text-slate-500">{needs}</p>'

# ── A GUARD LEAVING THE FACE ───────────────────────────────────────────────
run_case "performance" "the money-weighted tile stops saying it is not annualised" sub $PERF \
  'sub={`to date · not annualised${' 'sub={`to date${'

run_case "performance" "the per-account card stops saying it is not annualised" sub $PERF \
  'title="Money-weighted return to date, per account · not annualised"' \
  'title="Money-weighted return to date, per account"'

run_case "capital-gains" "the missing-data band opens itself on arrival" sub $CG \
  'const [missingOpen, setMissingOpen] = useState(false);' 'const [missingOpen, setMissingOpen] = useState(true);'

run_case "capital-gains-missing" "the band's chevron is wired to nothing" sub $CG \
  'open={missingOpen} onToggle={() => setMissingOpen((o) => !o)}' 'open={missingOpen} onToggle={() => {}}'

run_case "capital-gains" "the accounts with no statement are rows again, one each" sub $CG \
  '              {acctReported.map((c) => (' '              {acctRowsShown.map((c) => ('

run_case "capital-gains" "the band loses its hover" sub $CG \
  'excluded from the total, never counted as zero.`}' 'excluded from the total.`}'

run_case "capital-gains-missing" "an account in the band loses its reason" sub $CG \
  '<AbsentCell reason={c.absent ?? undefined} />' '<AbsentCell />'

# ── RE-HOMED FACTS GOING MISSING, OR THE SENTENCE BACK ON THE FACE ─────────
run_case "cio-live" "the movers coverage sentence is back on the tile's face" sub $TM \
  '                {" "}· {model.pricedNames} of {model.distinct} names{clock ? ` · ${clock}` : ""}' \
  '                {" "}· {model.pricedNames} of {model.distinct} names{clock ? ` · ${clock}` : ""} — across {model.pricedNames} of {model.distinct} {SCOPE.noun} names'

run_case "cio-live" "the movers coverage loses its hover" sub $TM \
  'held, across ${model.pricedNames} of ${model.distinct} ${SCOPE.noun} names — the rest carry no live quote and are not counted either way.`}>' \
  'held.`}>'

run_case "cio-live" "the excluded line forgets whose scope it is" sub $TM \
  'title={`${SCOPE.subject} only — these also moved today and are in none of the figures above.`}>' \
  'title="Also moved today.">'

run_case "cio-movers-funds" "the NAV movers coverage loses its hover" sub $NM \
  'title={`The move is struck on ${fmtFromBase(model.coveredValue' 'title={`Struck on ${fmtFromBase(model.coveredValue'

run_case "cio-movers-funds" "the drastic bound leaves the Move heading" sub $NM \
  'a move of ${DRASTIC_PCT}% or more in one published day is chipped drastic.`}>Move</SortHeader>' \
  'ranked.`}>Move</SortHeader>'

run_case "polycab" "the Polycab card's sentence leaves its title's hover" sub $PC \
  '? <span data-polycab-card-sub title={cardSub}>{active.cardTitle}</span>' \
  '? <span data-polycab-card-sub>{active.cardTitle}</span>'

# ── AN ABSENCE THAT STOPS NAMING ITS CAUSE ─────────────────────────────────
# `needs` is the box's hover since Stage 10cp, so where a SERVICE failed the
# headline itself must say so.
run_case "cio" "the movers failure headline stops naming the feed" sub $TM \
  '            ? `No ${SCOPE.noun} move today — the quote feed did not respond`' \
  '            ? `No ${SCOPE.noun} holding carries a day change right now`'

run_case "stock-market" "the price-history absence blames the security when the service is down" sub $RT \
  '      : serviceDown ? "The price service did not answer"' '      : serviceDown ? "No price history for this security"'

# ── MORE LINES COMING BACK ─────────────────────────────────────────────────
run_case "corporate-actions,stock-market" "the corporate-actions notes are back above the table" sub $CAR \
  '      <p data-action-coverage title={captured}>' \
  '      <p><strong className="text-slate-200">Since each statement date, not since purchase.</strong> Includes gross declared dividends and split/bonus adjustments, assuming no later trades or transfers.</p>
      <p data-action-coverage title={captured}>'

run_case "sectors-direct" "the excluded card's sentence is back on its face" sub $SC \
  '          ))}
        </span>
      </Figure>' \
  '          ))}
          {" "}· excluded rather than folded in — a fund holds many companies, so none has a sector of its own
        </span>
      </Figure>'

run_case "history" "the history page stops showing its coverage" sub $UH \
  '          {nav.length > 0 && <Pill>{covered} of {accounts} accounts</Pill>}' '          {null}'

echo ""
echo "════════ DONE"
