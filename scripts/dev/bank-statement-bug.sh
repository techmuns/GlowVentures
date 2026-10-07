#!/usr/bin/env bash
# VERIFY THE BANK-STATEMENT CHECKS BY REINTRODUCING THE BUG EACH EXISTS FOR.
#
# A bank tape is the one document in this corpus whose WHOLE content is dated
# rows: no holding to cross-check, no mark, no second report of the same facts.
# So `tieOut` is the licence to publish anything at all, and every case below
# BREAKS one of its checks, one of the two readers, or the wiring that decides
# the document is a bank statement in the first place. Each must PASS the suite
# as the tree stands and FAIL it with its bug put back.
#
# THE SUBJECT IS THE INGEST, so the suites are the ingest ones rather than
# `check:pages`: the delivery is not in this repository (the family asked for
# `source/october-2026/` to stay out), so nothing renders a bank row and no
# route could see one of these bugs. What that costs is stated rather than
# glossed — see NO SUBJECT at the foot of this file.
#
# THE RESTORE IS BY COPY AND ON A TRAP, verified with `cmp`. A patch that does
# not apply, or a tree that does not build, is reported as NOT A RESULT rather
# than as a clean run. DO NOT EDIT A FILE IN `FILES` WHILE THIS RUNS.
# `CASES=2,5` runs only those; the control runs first unless it is set.
set -uo pipefail
cd "$(dirname "$0")/../.."

exec 9>"${TMPDIR:-/tmp}/glow-bank-statement-bug.lock"
flock -n 9 || { echo "another run of this harness is already going — refusing"; exit 1; }

FILES=(
  "scripts/ingest/providers/bankStatement.mjs"
  "scripts/ingest/lib/classify.mjs"
  "scripts/ingest/lib/document.mjs"
  "scripts/ingest/extract.mjs"
  "scripts/ingest/reconcile.mjs"
)
SNAP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done
restore() {
  for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done
  for f in "${FILES[@]}"; do cmp -s "$SNAP/$f" "$f" || echo "!! restore of $f DID NOT TAKE"; done
  rm -rf "$SNAP"
}
# ON EXIT **AND ON A SIGNAL**. Bash does not run an EXIT trap on SIGTERM unless a
# trap for it exists, so a `timeout` around this harness — or a Ctrl-C — left the
# tree carrying whichever bug was in at the time, with the restore reporting
# nothing. The hazard was met from the OTHER side in this file's own session: a
# `git checkout -- scripts/ingest/extract.mjs` was run against a tree a live
# case had patched, which left that case's result meaningless and is why its
# reported figure was thrown away rather than recorded. A restore that cannot
# restore looks exactly like one that did, so the trap covers the signals a
# `timeout` or a Ctrl-C sends as well as a clean exit, and the rule above — do
# not touch a file in `FILES` while this runs — covers the rest.
trap restore EXIT INT TERM
put_back() { for f in "${FILES[@]}"; do cp "$SNAP/$f" "$f"; done; }

# The suite this change is about: every claim is named, so a case can be pointed
# at the checks it must fire rather than at a count.
bank() {
  node scripts/ingest/__tests__/bankStatement.test.mjs 2>&1 \
    | grep -aE '^  FAIL|passed,' | sed 's/^/   /'
}
# The whole ingest run, for a case that could reach another reader's suite.
ingest() {
  npm run test:ingest 2>&1 | grep -aE '^  (PASS|FAIL)|^  FAIL ' | sed 's/^/   ingest: /'
  echo "   ingest exit: ${PIPESTATUS[0]}"
}

run_case() {
  local num="$1" withIngest="$2" name="$3"; shift 3
  if [ -n "${CASES:-}" ] && ! [[ ",$CASES," == *",$num,"* ]]; then return; fi
  echo ""
  echo "════════ BUG $num: $name"
  if ! "$@"; then echo "   NOT A RESULT — the patch did not apply"; put_back; return; fi
  if ! node --check scripts/ingest/providers/bankStatement.mjs >/dev/null 2>&1 \
    || ! node --check scripts/ingest/lib/classify.mjs >/dev/null 2>&1; then
    echo "   NOT A RESULT — the bugged tree does not parse"
  else
    bank
    [ "$withIngest" = yes ] && ingest
  fi
  put_back
}
sub() {
  python3 -I - "$1" "$2" "$3" <<'PY'
import sys
p, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p, encoding="utf-8").read()
if s.count(old) != 1: sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PY
}
# A substitution inside one named function, for a pattern that occurs in several.
subIn() {
  python3 -I - "$1" "$2" "$3" "$4" <<'PY'
import sys
p, fn, old, new = sys.argv[1:5]
s = open(p, encoding="utf-8").read()
i = s.find(fn)
if i < 0: sys.exit(1)
j = s.find(old, i)
if j < 0: sys.exit(1)
open(p, "w", encoding="utf-8").write(s[:j] + new + s[j + len(old):])
PY
}

READER=scripts/ingest/providers/bankStatement.mjs
CLASSIFY=scripts/ingest/lib/classify.mjs

if [ -z "${CASES:-}" ]; then
  echo "════════ CONTROL: no patch"
  bank
fi

# ── THE GATE ────────────────────────────────────────────────────────────────

# ── 1 ── the gate is not the licence to publish
run_case 1 no "a tape that does not reconcile is published anyway" \
  sub $READER \
    '  if (!gate.ok) {' \
    '  if (false) {'

# ── 2 ── the running balance is not checked
run_case 2 no "the running balance is not struck against the printed opening" \
  sub $READER \
    '    note(openingDerived ? "running balance (opening derived)" : "running balance", !broke, broke ?? "");' \
    '    void broke;'

# ── 3 ── the printed totals are not checked
run_case 3 no "the printed debit and credit totals are not struck against the rows" \
  sub $READER \
    '    note(`${label} total`, got === printed[label], `Σ ${inr(got)} against a printed ${inr(printed[label])}`);' \
    '    void got;'

# ── 4 ── the printed counts are not checked
run_case 4 no "the printed Dr/Cr counts are not struck against the rows that moved money" \
  sub $READER \
    '    note(label, got === printed[label], `${got} rows against a printed ${printed[label]}`);' \
    '    void got;'

# ── 5 ── the closing balance is counted as a pass without being checked
run_case 5 no "the closing balance is counted as a pass rather than compared" \
  sub $READER \
    '  else note("closing balance", last.balance === printed.closing,
    `last row ${inr(last.balance)} against a printed ${inr(printed.closing)}`);' \
    '  else passed.push("closing balance");'

# ── 6 ── a row carrying two amount sides is accepted
run_case 6 no "a row carrying both a withdrawal and a deposit is accepted" \
  sub $READER \
    '    if (nonZero.length === 1) { sided.push(nonZero[0][0]); continue; }' \
    '    if (nonZero.length >= 1) { sided.push(nonZero[0][0]); continue; }'

# ── 7 ── ICICI's serial sequence is not checked
run_case 7 no "a gap in ICICI's serials is not a failure" \
  sub $READER \
    '    note("serial numbers run 1..N", bad < 0,
      bad < 0 ? "" : `row ${bad + 1} is numbered ${got[bad] ?? "nothing"}`);' \
    '    void bad;'

# ── 8 ── a check the statement cannot support is counted as a pass
run_case 8 no "a not-applicable check is counted among the ones that passed" \
  sub $READER \
    '    notApplicable.push("running balance: the statement prints no opening balance and none could be derived");' \
    '    passed.push("running balance: the statement prints no opening balance and none could be derived");'

# ── 9 ── the arithmetic is floats rather than paise integers
#
# THIS CAME BACK CLEAN THE FIRST TIME IT WAS RUN, and the fixtures were why:
# every amount on them has .00, .50 or .25 paise, each exactly representable, so
# `× 100` is exact with or without the round. Section 1 carries a figure that
# drifts (`2,01,25,887.08` → 2012588707.9999998) for exactly that reason, and
# this case fires on it.
run_case 9 no "the tie-out is struck in floating-point rupees rather than paise integers" \
  sub $READER \
    '  return Math.round(info.value * 100);' \
    '  return info.value * 100;'

# ── 9b ── a figure printed with three decimals is rounded into shape
run_case 9b no "a money column printing three decimals is rounded rather than refused" \
  sub $READER \
    '    if (frac && frac[1].length > 2) return null;' \
    '    if (false) return null;'

# ── THE READERS ─────────────────────────────────────────────────────────────

# ── 10 ── the tape runs on into the summary block
run_case 10 no "the HDFC tape is not bounded before the summary block" \
  sub $READER \
    'stopRe: HDFC_TAPE_END, ...LAYOUT }' \
    '...LAYOUT }'

# ── 11 ── ICICI's derived opening reads as one the bank printed
run_case 11 no "ICICI's derived opening is carried into the flows as a printed figure" \
  sub $READER \
    '    openingBalance: read.openingDerived ? null : rupees(read.printed.opening),' \
    '    openingBalance: rupees(read.printed.opening),'

# ── 12 ── half a narration
#
# The row is still skipped rather than becoming a movement — the gate's own
# check 0 is what makes that impossible now (case 28) — so what this drops is
# the continuation's TEXT, and the archive carries half a narration against a
# row whose figures all tie.
run_case 12 no "a continuation line's own text never reaches the row above it" \
  sub $READER \
    '        if (prev && narration) {
          const lead = leadX(chunks);
          prev.narration += (lead !== null && startsWord(lead, left) ? " " : "") + narration;
          prev.chunkLines += 1;
        }' \
    '        if (prev && narration) {
          prev.chunkLines += 1;
        }'

# ── 13 ── HDFC's wrap joins with a space, mid-word
run_case 13 no "HDFC's mid-word wrap joins with a space rather than nothing" \
  sub $READER \
    '    else out += startsWord(p.x, edge) ? ` ${text}` : text;' \
    '    else out += ` ${text}`;'

# ── 14 ── ICICI's pixel wrap is joined by HDFC's fixed-width rule
run_case 14 no "ICICI's word wrap is joined by the fixed-width rule" \
  sub $READER \
    '    if (wrap === "pixel") out += /-$/.test(out) ? text : ` ${text}`;' \
    '    if (false) out += /-$/.test(out) ? text : ` ${text}`;'

# ── 15 ── ICICI gains a value date its statement does not print
run_case 15 no "ICICI's value date is repeated from the transaction date" \
  subIn $READER 'function readIcici' \
    'valueDate: null,' \
    'valueDate: date,'

# ── 16 ── the two readings of which bank this is need not agree
run_case 16 no "the letterhead and the column labels are not required to name the same bank" \
  sub $READER \
    '  if (meta.provider && PROVIDER.includes(meta.provider) && meta.provider !== layout) {' \
    '  if (false) {'

# ── 17 ── a page naming neither layout is read anyway
# The anchor deliberately stops short of the refusal's own sentence: that
# sentence carries an apostrophe, and a literal anchor inside single quotes
# cannot. This is why the first run of this case reported NOT A RESULT.
run_case 17 no "a page whose header labels name neither bank is read rather than refused" \
  sub $READER \
    '  if (!layout) {
    return refusal(meta, [' \
    '  if (false) {
    return refusal(meta, ['

# ── 18 ── the balance is counted as Cash after all
run_case 18 no "the closing balance stops being excluded from the book" \
  sub $READER \
    'const EXCLUDED_REASON =
  "a savings-account statement:' \
    'const EXCLUDED_REASON = null;
const UNUSED_REASON =
  "a savings-account statement:'

# ── THE WIRING ──────────────────────────────────────────────────────────────

# ── 19 ── the narration names the provider
run_case 19 yes "a savings statement is filed under the manager its narration names" \
  python3 -I -c '
import io, sys
p = "scripts/ingest/lib/classify.mjs"
s = io.open(p, encoding="utf-8").read()
a = "  const bank = matchBankStatement(t, name);\n  if (bank) return bank;"
b = "  const bank = bankStatementProvider(text);\n  if (bank) return bank;"
if s.count(a) != 1 or s.count(b) != 1: sys.exit(1)
s = s.replace(a, "  const bank = null;\n  if (bank) return bank;", 1)
s = s.replace(b, "  const bank = null;\n  if (bank) return bank;", 1)
io.open(p, "w", encoding="utf-8").write(s)
'

# ── 20 ── the PMS house matcher claims it
run_case 20 yes "the PMS house matcher claims a savings statement whose narration names its manager" \
  python3 -I -c '
import io, sys
p = "scripts/ingest/lib/classify.mjs"
s = io.open(p, encoding="utf-8").read()
a = "  const bank = matchBankStatement(t, name);\n  if (bank) return bank;"
if s.count(a) != 1: sys.exit(1)
s = s.replace(a, "  const bank = null;\n  if (bank) return bank;", 1)
i = s.index("function matchGoldstandard")
g = "if (isBankStatement(text)) { bankGuardHits.matchGoldstandard += 1; return null; }"
j = s.index(g, i)
s = s[:j] + "if (false) { bankGuardHits.matchGoldstandard += 1; return null; }" + s[j + len(g):]
io.open(p, "w", encoding="utf-8").write(s)
'

# ── 21 ── the reader is registered under neither name
run_case 21 yes "the reader is registered for neither bank's name" \
  sub scripts/ingest/extract.mjs \
    '  ...bankStatement.PROVIDER.map((name) => [name, bankStatement]),' \
    ''

# ── 22 ── the reader is not registered for the report type
run_case 22 yes "the reader is not registered for the report type, so a third bank's layout reaches none" \
  sub scripts/ingest/extract.mjs \
    '  [bankStatement.REPORT_TYPE]: bankStatement,' \
    ''

# ── 23 ── the type the classifier assigns is not one the pipeline knows
run_case 23 yes "the report type is not one the pipeline declares" \
  sub $CLASSIFY \
    '  "bank-statement",' \
    ''

# ── 24 ── the two columns only a bank statement prints are dropped at the
#          document boundary
#
# THIS CASE'S FIRST PREMISE WAS WRONG and is recorded rather than quietly
# replaced: it patched a `kind === "bank-statement"` test in `makeCashFlow` that
# does not exist. A bank row's debit, credit and balance go through fields the
# PMS BANK BOOK and the capital register already needed, so nothing had to be
# added for them. What this change did add is the two fields nothing else
# prints — HDFC's Value Dt and the row's own cheque or reference number — and
# they are added CONDITIONALLY, so every document from every other reader
# serializes byte-for-byte as it did.
run_case 24 yes "the value date and reference a bank row prints reach no archived row" \
  sub scripts/ingest/lib/document.mjs \
    '    ...(input.valueDate ? { valueDate: input.valueDate } : {}),
    ...(input.reference ? { reference: String(input.reference) } : {}),' \
    ''

# ── 25 ── the same two fields, added to every cash flow in the book
#
# The pair above is CONDITIONAL because only this reader sets either, and the
# comment at `makeCashFlow` says so. That is a claim about every OTHER reader's
# output, so it is measured here rather than asserted: added unconditionally,
# four committed documents stop matching what their own readers write —
# `askArf` on both ASK Absolute Return Fund folios and `buoyantSnap` on both
# Buoyant folios, each failing "the archive holds exactly the dated record the
# reader writes now". Nothing in the bank suite moves, which is the point: the
# cost of getting this wrong lands on documents this change never touches.
run_case 25 yes "the bank's two fields are added to every cash flow in the book" \
  sub scripts/ingest/lib/document.mjs \
    '    ...(input.valueDate ? { valueDate: input.valueDate } : {}),
    ...(input.reference ? { reference: String(input.reference) } : {}),' \
    '    valueDate: input.valueDate ?? null,
    reference: input.reference ? String(input.reference) : null,'

# ── 26 ── the guard counts are read by nothing
#
# The two house matchers refuse a savings statement before they read it, and
# `classify()` resolves one before either matcher is reached — so on a correct
# run both counts are ZERO and stay zero. That is exactly the shape of guard
# this repository keeps finding deleted with nobody the wiser, so the run PRINTS
# them, and the suite holds the run to printing them.
run_case 26 no "the bank-statement guard counts are read by nothing, so a zero is never on screen" \
  python3 -I -c '
import io, sys
p = "scripts/ingest/extract.mjs"
s = io.open(p, encoding="utf-8").read()
i = s.find("    const guards = bankGuardCounts();")
j = s.find(");", s.find("console.log(", i)) + 2
if i < 0 or j < 2: sys.exit(1)
io.open(p, "w", encoding="utf-8").write(s[:i] + s[j + 1:])
'

# ── 27 ── the counts reported only when they are not zero
#
# Which is the failure the counter exists to prevent, one layer up: on every run
# while the order in `classify()` holds, the honest count IS zero, so a line
# behind an `if` says nothing on exactly the runs that matter and a deleted
# guard reads the same as a held one.
run_case 27 no "the guard counts are reported only when one of them fired" \
  sub scripts/ingest/extract.mjs \
    '    const guards = bankGuardCounts();
    console.log(' \
    '    const guards = bankGuardCounts();
    if (guards.match360One || guards.matchGoldstandard) console.log('

# ── A ROW WITH MONEY AND NO DATE ────────────────────────────────────────────
#
# The five cases below are one defect seen from five places. A dateless row is
# a CONTINUATION — the rest of the row above it, wrapped — and the readers
# appended its narration to that row and moved on. A dateless row CARRYING A
# WITHDRAWAL, A DEPOSIT OR A BALANCE is not a continuation: it is a movement
# whose date the reader failed to read, and appending it loses the amount while
# leaving the running balance, the printed totals, the counts and ICICI's own
# serials all reconciling. A tape that is short and agrees with itself.

# ── 28 ── the gate never names them
run_case 28 no "the orphan check is removed, so a row the reader could not read reaches nothing" \
  sub $READER \
    '  if (orphans.length) {
    failures.push(`every row with an amount carries a date: ${orphans.length} row(s) carry an amount `
      + "and no readable date — "
      + orphans.map((o) => `[${(o.carried ?? []).join(", ")}] in [${(o.cells ?? []).join(" | ")}]`).join("; "));
  } else passed.push("every row with an amount carries a date");' \
    '  void orphans;'

# ── 29 ── HDFC appends it anyway (the original defect)
run_case 29 no "HDFC folds a dateless row carrying a deposit into the narration above it" \
  sub $READER \
    '        const carried = AMOUNT_FIELDS
          .map((f) => [f, cellOf(f)])
          .filter(([, t]) => parseNumInfo(t).status === "ok");
        if (carried.length) {
          orphans.push({ cells: rowText(row), carried: carried.map(([f, t]) => `${f} ${t}`) });
          continue;
        }
        const prev = rows[rows.length - 1];
        if (prev && narration) {
          const lead = leadX(chunks);' \
    '        const prev = rows[rows.length - 1];
        if (prev && narration) {
          const lead = leadX(chunks);'

# ── 30 ── and ICICI likewise. The two branches are byte-identical, so this one
#          is scoped to its own function rather than matched across the file.
run_case 30 no "ICICI folds a dateless row carrying a deposit into the narration above it" \
  subIn $READER 'function readIcici' \
    '        const carried = AMOUNT_FIELDS
          .map((f) => [f, cellOf(f)])
          .filter(([, t]) => parseNumInfo(t).status === "ok");
        if (carried.length) {
          orphans.push({ cells: rowText(row), carried: carried.map(([f, t]) => `${f} ${t}`) });
          continue;
        }
' \
    ''

# ── 31 ── the reader collects them and the gate is never told
#
# Which is the half a reader of either branch alone cannot see: both readers do
# the right thing, `extract` drops the field on the way to `tieOut`, and the
# document publishes.
run_case 31 no "the orphans are collected and never handed to the gate" \
  sub $READER \
    '    { openingDerived: read.openingDerived, serials: read.serials, orphans: read.orphans });' \
    '    { openingDerived: read.openingDerived, serials: read.serials });'

# ── 32 ── a wrap that is a new word is joined with no space
#
# HDFC wraps on CHARACTER WIDTH, so a chunk starting at the column's own left
# edge is the middle of a word and joins with nothing. A chunk INDENTED from
# that edge is a space the grid trimmed, and joining it with nothing runs two
# words together — `TESTUPITHIRD PARTY TRANSFER`.
run_case 32 no "an indented continuation is joined with no space, running two words together" \
  sub $READER \
    '          prev.narration += (lead !== null && startsWord(lead, left) ? " " : "") + narration;' \
    '          void lead;
          prev.narration += narration;'

# ── 33 ── the serial check turns itself off on the document that needs it
#
# `serials` is whether the LAYOUT matched a serial column. Gated on the CELLS
# instead, one unreadable serial makes the check not-applicable — and a serial
# that does not parse is a column the reader lost its grip on, which is exactly
# when the only check that can see a dropped row must not stand down.
run_case 33 no "the serial check is gated on the cells, so one unreadable serial switches it off" \
  sub $READER \
    '    serials: serialSeen && rows.length > 0,' \
    '    serials: rows.length > 0 && rows.every((r) => r.serial !== null),'

# ── 34 ── two summary labels take one printed figure
#
# The summary block's labels are nowhere near their own columns, so each is
# bound to the value whose CENTRE is nearest. Decided independently per label,
# a block printing six labels over five values binds the nearest value twice:
# `Debits` (centre 360) takes the Cr count's "2" at 269, 91pt away against the
# credit total's 96, and one printed figure reaches the archive as two printed
# primitives — so the debits check fails against a COUNT OF TRANSACTIONS rather
# than standing down. Assigned greedily and consuming each value, the unmatched
# label reads as not printed, which is what it is.
run_case 34 no "two summary labels take one printed figure, so a count is read as a total" \
  sub $READER \
    '      const pairs = [];
      for (const [key, label] of found) {
        if (key in out) continue;
        const centre = (label.x ?? 0) + (label.width ?? 0) / 2;
        for (const [vi, v] of values.entries()) pairs.push({ key, vi, d: Math.abs(v.centre - centre) });
      }
      pairs.sort((a, b) => a.d - b.d || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || a.vi - b.vi);
      const taken = new Set();
      for (const p of pairs) {
        if (p.key in out || taken.has(p.vi)) continue;
        out[p.key] = values[p.vi].text;
        taken.add(p.vi);
      }' \
    '      for (const [key, label] of found) {
        if (key in out) continue;
        const centre = (label.x ?? 0) + (label.width ?? 0) / 2;
        let best = null;
        for (const v of values) {
          const d = Math.abs(v.centre - centre);
          if (!best || d < best.d) best = { d, text: v.text };
        }
        if (best) out[key] = best.text;
      }'

# ── NO SUBJECT ON THIS TREE, AND SAID SO RATHER THAN SHIPPED AS A CLEAN CASE ──
#
# Three more bugs are available and NOTHING IN THIS REPOSITORY WOULD FIRE ON
# THEM, because they are only reachable once the archive carries a bank tape and
# the delivery is deliberately out of the tree:
#
#   * `bank-statement` added to `CAPITAL_KINDS` in `build-book.mjs` — the book
#     would read a household transfer as money into a mandate. No archived
#     document carries the kind, so `build-book` regenerates byte-identically
#     either way.
#   * `NOT_A_DEFAULT_DOCUMENT` dropped from `DataAudit.tsx` — `/audit` would open
#     on a bank tape, whose narrations name a counterparty on every row. No
#     `check:pages` route can see it: the manifest the harness serves has no bank
#     document in it.
#   * `reconcile.mjs`'s running-balance check over `cashFlows` — a SECOND path,
#     struck on the archive rather than on the reader, so a merge or a hand-edit
#     that moved a row after extraction is what it catches. It has nothing to
#     walk until the tape lands.
#   * `build-book`'s excluded-accounts intro back to one blanket sentence — "they
#     belong to somebody else", "each one becomes part of the book with a single
#     entry in `shared/owners.mjs`". Both are TRUE of every row in that table on
#     this tree, because the only rows in it are another taxpayer's folios; both
#     go false the moment a savings account joins them, which is for what it IS
#     rather than for whose it is and which no owner entry would ever bring in.
#     So the defect's subject arrives with the delivery. It was verified by
#     RENDERING both branches against a synthetic archive rather than reasoned
#     about, which is also what caught a plural verb against a count of one.
#
# Each becomes reachable on the run that lands the delivery, and each is named
# here so the next session does not read a clean case as a verified one.
