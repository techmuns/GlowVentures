/**
 * REGENERATES the data-model section's one-row-per-account table in CLAUDE.md,
 * from `src/data/glowData.ts` alone.
 *
 *   npm run accounts-table            # print the table
 *   npm run accounts-table -- --write # splice it into CLAUDE.md in place
 *
 * THE RULE THIS ENFORCES IS CLAUDE.md'S OWN: "The column is regenerated from
 * `BOOK_POSITIONS` now, and it is regenerated EVERY TIME rather than patched:
 * hand-merging rows to keep it short is what let eight accounts go unlisted, and
 * a row added by hand is a figure copied into prose." That rule had been
 * aspirational — there was nothing to run — and the merge that brought six
 * review accounts into the book left the table at 58 rows. A generator is what
 * makes it enforceable.
 *
 * SO NOTHING HERE IS TYPED. Every money figure is summed off the account's own
 * positions; the right-hand words for an account with no position are ROUTED
 * from `Account.noPositionsReason`, so an account that changes WHY it is empty
 * changes this table on the next run; and both footnote markers are routed from
 * the one table each is about. It REFUSES to emit if a reason routes nowhere or
 * if the column does not tie to `BOOK_SUMMARY.totalValue`, because a table whose
 * printed cells add to a different answer than the figure below it is the
 * contradiction the footer rule already names.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { SEPARATE_INVESTMENTS } from "../../shared/separateInvestments.mjs";

const WRITE = process.argv.includes("--write");
const DOC = "CLAUDE.md";

const src = readFileSync("src/data/glowData.ts", "utf8");
// `indexOf("[")` alone finds the `[` in the TYPE ANNOTATION (`Account[]`), so
// both readers anchor on the assignment — the same slice `bookArray` in
// `scripts/check-pages.mjs` takes.
const arr = (name) => {
  const i = src.indexOf(`export const ${name}`);
  const s = src.indexOf("= [", i), e = src.indexOf("\n];", s);
  return JSON.parse(src.slice(s + 2, e + 2));
};
const obj = (name) => {
  const i = src.indexOf(`export const ${name}`);
  const s = src.indexOf("= {", i), e = src.indexOf("\n};", s);
  return JSON.parse(src.slice(s + 2, e + 2));
};

const accounts = arr("BOOK_ACCOUNTS");
const polycab = arr("BOOK_POLYCAB");
const positions = arr("BOOK_POSITIONS");
const summary = obj("BOOK_SUMMARY");

// `NEGLIGIBLE_VALUE_FLOOR` in `src/lib/analytics.ts` — a value under it is a
// residue the display layer drops, so the cell prints it in RUPEES rather than
// as ₹0.00 Cr, which would read as a measured zero it is not.
const FLOOR = 1000;
const CR = 1e7;
const money = (v) =>
  Math.abs(v) < FLOOR
    ? `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `₹${(v / CR).toFixed(2)} Cr`;

// THE TWO FOOTNOTE MARKERS ARE ROUTED TOO, from the one table each is about:
// `\*` from the family's own answer on which pairs are two investments, and
// `\*\*` from the ring-fenced rows' own account, so a pair the family answers
// about or a fence the family moves changes this column on the next run.
const starred = new Set(
  SEPARATE_INVESTMENTS.flatMap((e) => e.accounts.map((a) => `${a.provider}|${a.accountNo}`)),
);
const fenced = new Set(polycab.map((p) => p.accountId));

const byAcct = new Map();
for (const p of positions) {
  if (!byAcct.has(p.accountId)) byAcct.set(p.accountId, []);
  byAcct.get(p.accountId).push(p);
}

/** The unit a fund's own statement names a redeemed row by. A SERIES IS NOT A
 *  CLASS, and the series is tested first: ASK's Absolute Return Fund names a row
 *  by both (`Class A6 Series 31/01/2025`) and it is the SERIES its statement
 *  redeems. */
const unitWord = (names) => {
  if (names.some((n) => /\bseries\b/i.test(n))) return ["series", "series"];
  if (names.some((n) => /\bclass\b/i.test(n))) return ["class", "classes"];
  return ["scheme", "schemes"];
};

/** A MEASURED ZERO's own words, from the rows that are at nil. */
const measuredZero = (ps) => {
  const [one, many] = unitWord(ps.map((p) => p.security));
  const quantifier = ps.length === 2 ? "both" : "every";
  const noun = quantifier === "both" ? many : one;
  return `₹0 (a MEASURED zero — ${quantifier} ${noun} redeemed to nil)`;
};

/**
 * THE RIGHT-HAND CELL FOR AN ACCOUNT WITH NO POSITION, routed from the reason
 * the book generated. A reason's DOMINANT clause decides the phrase and a
 * trailing one is a suffix — matched in whatever order the clauses appear, the
 * review clause at the END of a last-movement reason read as the whole and
 * mis-described the account.
 */
const emptyCell = (reason) => {
  if (!reason) return { cell: "—", unmatched: true };
  // A balance the statement itself reports as nil is a MEASUREMENT, not an absence.
  if (/has been redeemed — the balance is nil/.test(reason))
    return { cell: "₹0 (a MEASURED zero — the statement's balance is nil)" };
  if (/report income and distributions only/.test(reason))
    return { cell: "— (income-only folio; the units are marked elsewhere)" };
  if (/^the private-market holding this statement records is counted under the family's consolidated review/.test(reason))
    return { cell: "— (**its private holding is counted under the review**, Stage 10dh)" };
  if (/include no holding statement/.test(reason))
    return { cell: "— (**no holdings statement** in the drop — its dated statements only)" };
  if (/only its demat-transactions statement/.test(reason))
    return { cell: "— (**transaction statement only**, no holdings)" };
  if (/with the price of their last depository movement/.test(reason)) {
    const n = /(\d+) of these are private-market holdings, counted under the family's consolidated review/.exec(reason);
    const tail = n ? `; ${n[1]} of its lines are private and counted under the review, Stage 10dh` : "";
    return { cell: `— (**quantity only** — the Rate column is the last movement's price, Stage 10cz${tail})` };
  }
  if (/only price is the FACE VALUE/.test(reason))
    return { cell: "— (**quantity only** — the rate printed is face value)" };
  return { cell: "—", unmatched: true };
};

const rows = [];
const unmatched = [];
let printed = 0;
for (const a of accounts) {
  const ps = byAcct.get(a.accountId) ?? [];
  const mv = ps.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  // THE HOLD-NOTHING TEST IS `=== 0`, NEVER `Number(x) === 0`: the review
  // carries `quantity: null` on 72 positions and never 0, so a loose comparison
  // made four review accounts look like accounts holding nothing.
  const allZero = ps.length > 0 && ps.every((p) => (p.marketValue ?? null) === 0);
  let cell;
  if (ps.length === 0) {
    const r = emptyCell(a.noPositionsReason);
    cell = r.cell;
    if (r.unmatched) unmatched.push(`${a.provider} ${a.accountNo}: ${a.noPositionsReason ?? "(no reason)"}`);
  } else if (allZero) {
    cell = measuredZero(ps);
  } else if (Math.abs(mv) < FLOOR) {
    // A MEASURED RESIDUE: the mandate is closed and what is left is under the
    // display floor, so the figure is real and in no total on any page.
    cell = `${money(mv)} (a MEASURED residue — the mandate is closed; its bank balance is under the ₹1,000 floor)`;
  } else {
    cell = money(mv);
  }
  const mark = fenced.has(a.accountId) ? "\\*\\*" : starred.has(`${a.provider}|${a.accountNo}`) ? "\\*" : "";
  printed += mv;
  rows.push({ a, mv, cell: mark ? cell.replace(/^(₹[^ ]+(?: Cr)?)/, `$1${mark}`) : cell });
}

rows.sort((x, y) => y.mv - x.mv
  || x.a.provider.localeCompare(y.a.provider)
  || x.a.accountNo.localeCompare(y.a.accountNo));

const HEAD = "| Provider | Account | Owner | As of | Market value |";
const RULE = "| --- | --- | --- | --- | ---: |";
const table = [
  HEAD,
  RULE,
  ...rows.map(({ a, cell }) => `| ${a.provider} | ${a.accountNo} | ${a.owner} | ${a.asOf} | ${cell} |`),
].join("\n");

const gap = printed - summary.totalValue;
const note = `${rows.length} accounts, printed Σ ₹${printed.toLocaleString("en-IN")} vs BOOK_SUMMARY.totalValue ₹${summary.totalValue.toLocaleString("en-IN")} (delta ${gap})`;

// IT REFUSES RATHER THAN EMITTING A TABLE NOBODY CAN CHECK. A reason that routes
// nowhere would print a bare em dash saying nothing; a column that does not tie
// is the contradiction a reader finds by adding the cells up.
if (unmatched.length) {
  process.stderr.write(`-- ${note}\n-- ROUTED NOWHERE (${unmatched.length}):\n${unmatched.map((u) => `   ${u}`).join("\n")}\n`);
  process.exit(1);
}
if (Math.abs(gap) > 0.01) {
  process.stderr.write(`-- ${note}\n-- THE COLUMN DOES NOT TIE TO THE BOOK'S OWN TOTAL\n`);
  process.exit(1);
}

if (!WRITE) {
  console.log(table);
  process.stderr.write(`\n-- ${note}\n`);
  process.exit(0);
}

// THE SPLICE IS GUARDED ON BOTH ENDS, and on the header row occurring ONCE:
// CLAUDE.md carries many tables, and a splice that found the wrong one would
// overwrite a different passage while reporting success.
const doc = readFileSync(DOC, "utf8");
const lines = doc.split("\n");
const at = lines.reduce((acc, l, i) => (l === HEAD ? [...acc, i] : acc), []);
if (at.length !== 1) {
  process.stderr.write(`-- the accounts table's header row occurs ${at.length} times in ${DOC}, expected once\n`);
  process.exit(1);
}
const start = at[0];
if (lines[start + 1] !== RULE) {
  process.stderr.write(`-- ${DOC}:${start + 2} is not the accounts table's separator row\n`);
  process.exit(1);
}
let end = start + 2;
while (end < lines.length && lines[end].startsWith("|")) end += 1;
const next = [...lines.slice(0, start), ...table.split("\n"), ...lines.slice(end)].join("\n");
if (next === doc) {
  process.stderr.write(`-- ${note}\n-- ${DOC} already carries this table (${end - start} lines), unchanged\n`);
  process.exit(0);
}
writeFileSync(DOC, next);
process.stderr.write(`-- ${note}\n-- ${DOC}: ${end - start} lines replaced with ${rows.length + 2}\n`);
