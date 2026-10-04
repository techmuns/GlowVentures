// A VALUE BRIDGE IS DRAWN ONLY WHERE ITS PARTS MAKE ITS TOTAL (A-12, XA-21, XA-23).
//
// `/performance` drew every column of `BOOK_ACCOUNT_BRIDGES` as opening →
// capital → gains → costs → closing, and on this book not one financial-year
// column added up: nine since-inception columns printed an opening EQUAL to
// their closing, the five Sanshi columns closed on their contributions, the
// "Fees & expenses" row read the fees alone, and there was no row for accrued
// income. Every figure was a real one; every column taught a reader wrong
// arithmetic. The book now ties each column on its own lines and WITHHOLDS the
// ones that do not, with the reason.
//
// Every expectation here is read off the ARCHIVE (`public/audit/<docKey>/
// document.json`) and re-expressed, never imported from the builder: each
// column's figures are its source document's printed lines, its window is
// named by its own dates, and whether it adds up is struck here by the test's
// own arithmetic. So a builder that stopped tying, tied on the wrong lines, or
// drew a column that does not add up fails by name.
import fs from "node:fs";
import path from "node:path";
import { BOOK_ACCOUNTS, BOOK_ACCOUNT_BRIDGES, BOOK_ACCOUNT_CASH_FLOWS } from "@/data/glowData";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

type Row = Record<string, any>;
type Doc = { docKey: string; provider: string; accountNo: string; reportType: string; status?: string;
  inceptionDate?: string | null; flows?: Row | null; cashFlows?: Row[] };
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const r2 = (v: number) => Math.round(v * 100) / 100;

const AUDIT = path.resolve("public/audit");
const docs: Doc[] = fs.readdirSync(AUDIT).sort()
  .map((dir) => path.join(AUDIT, dir, "document.json"))
  .filter((f) => fs.existsSync(f))
  .map((f) => JSON.parse(fs.readFileSync(f, "utf8")) as Doc)
  .filter((d) => d.status !== "failed" && d.accountNo);
const byKey = new Map(docs.map((d) => [d.docKey, d]));
const acct = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));

// ── 1. EVERY FIGURE IS THE SOURCE DOCUMENT'S OWN LINE ────────────────────────
// The page draws what the book carries; the book must carry what the report
// prints — including the lines the page used to leave off (expenses, accrued
// income, profit / loss).
const FIELDS: [string, string][] = [
  ["opening", "openingCorpus"], ["contribution", "contribution"], ["withdrawal", "withdrawal"],
  ["netCapitalInOut", "netCapitalInOut"], ["realized", "realized"], ["unrealized", "unrealized"],
  ["income", "income"], ["fees", "fees"], ["expenses", "expenses"], ["profit", "profit"], ["closing", "corpus"],
  ["accruedIncome", "accruedIncome"], ["changeInAccruals", "changeInAccruals"],
  ["otherExpenses", "otherExpenses"], ["gainPriorToTakeover", "gainPriorToTakeover"],
];
// The lines a reader sets only where it reads them. Undefined on the document
// means NO READER LOOKED — which is different from `null`, a reader that looked
// and found the report prints none — and the book must say which.
const OPTIONAL = ["accruedIncome", "changeInAccruals", "otherExpenses", "gainPriorToTakeover"];
const SIGN: Record<string, number> = {
  realized: 1, unrealized: 1, gainPriorToTakeover: 1, income: 1, profit: 1,
  fees: -1, expenses: -1, otherExpenses: -1, accruedIncome: 1, changeInAccruals: 1,
};

type Col = Row & { accountId: string };
const cols: Col[] = Object.entries(BOOK_ACCOUNT_BRIDGES).flatMap(([accountId, bs]) =>
  (bs as Row[]).map((b) => ({ ...b, accountId })));
ok("the book carries value bridge columns to check", cols.length > 0, `${cols.length} columns`);

let figureMismatches = 0, unreadMismatches = 0, missingSource = 0;
for (const b of cols) {
  const d = byKey.get(b.source);
  if (!d || !d.flows) { missingSource++; console.log(`  no archived flows for ${b.source}`); continue; }
  for (const [bk, dk] of FIELDS) {
    const want = num(d.flows[dk]) ? d.flows[dk] : null;
    const have = num(b[bk]) ? b[bk] : null;
    if (want !== have) { figureMismatches++; console.log(`  ${b.source} ${bk}: book ${have} vs document ${want}`); }
  }
  const wantUnread = OPTIONAL.filter((k) => d.flows![k] === undefined).sort().join(",");
  const haveUnread = [...(b.unread ?? [])].sort().join(",");
  if (wantUnread !== haveUnread) { unreadMismatches++; console.log(`  ${b.source} unread: ${haveUnread} vs ${wantUnread}`); }
}
ok("every column's source document is in the archive", missingSource === 0, `${missingSource} missing`);
ok("every figure in every column is its report's own printed line", figureMismatches === 0, `${figureMismatches} differ`);
ok("every column names the lines no reader looked for, and only those", unreadMismatches === 0, `${unreadMismatches} differ`);

// ── 2. THE WINDOW IS NAMED BY ITS OWN DATES (XA-21) ──────────────────────────
// "FY to date" was printed over SVAN's one-month report and over five Sanshi
// windows that begin on a first contribution — because every window that was
// not since-inception was called one. Since inception where it starts on or
// before the account's inception; a financial year to date only where it opens
// on 1 April and closes inside that year; anything else is a window.
//
// ON OR BEFORE: ASK's profit and loss account opens on 1 April 2019, the start
// of the financial year its two mandates opened in, and a window that opens
// before an account existed covers its whole life. That is only true if
// nothing happened before inception, so it is checked below, off the archive.
const inceptionOf = (b: Col) => {
  const a = acct.get(b.accountId);
  const mine = docs.filter((d) => d.provider === a?.provider && d.accountNo === a?.accountNo);
  return mine.map((d) => d.inceptionDate).find(Boolean) ?? null;
};
const basisOf = (b: Col) => {
  const inc = inceptionOf(b);
  if (inc && b.periodFrom <= inc) return "since-inception";
  const fy = /^(\d{4})-04-01$/.exec(b.periodFrom);
  if (fy && b.periodTo >= b.periodFrom && b.periodTo <= `${Number(fy[1]) + 1}-03-31`) return "financial-year-to-date";
  return "window";
};
const basisWrong = cols.filter((b) => b.basis !== basisOf(b));
for (const b of basisWrong.slice(0, 5)) console.log(`  ${b.source}: book ${b.basis}, dates say ${basisOf(b)}`);
ok("every column's window is named by its own dates", basisWrong.length === 0, `${basisWrong.length} misnamed`);
// A column called since-inception although it opens BEFORE inception: the
// account must have nothing dated before its inception on any of its archived
// documents, or the window covers more than the account's life.
const early = cols.filter((b) => basisOf(b) === "since-inception" && b.periodFrom < (inceptionOf(b) ?? ""));
let datedSeen = 0;
const beforeLife = early.flatMap((b) => {
  const a = acct.get(b.accountId);
  const inc = inceptionOf(b)!;
  return docs.filter((d) => d.provider === a?.provider && d.accountNo === a?.accountNo)
    .flatMap((d) => (d.cashFlows ?? []).filter((f) => typeof f.date === "string" && (datedSeen++, f.date < inc))
      .map((f) => `${d.docKey} ${f.date}`));
});
// Over dated rows actually read: an account with none would pass vacuously.
ok("a column that opens before its account's inception has nothing dated before it",
  beforeLife.length === 0 && (early.length === 0 || datedSeen > 0),
  beforeLife.slice(0, 3).join(", ") || `${early.length} such column(s), ${datedSeen} dated row(s) read`);
ok("…and this book HAS such columns, so the widened rule has a subject",
  early.length > 0, early.map((b) => `${b.accountId} ${b.periodFrom}→${b.periodTo}`).join(", "));
const windows = cols.filter((b) => basisOf(b) === "window");
ok("…and this book HAS columns that are neither since inception nor a financial year (the rule is load-bearing)",
  windows.length > 0, windows.map((b) => `${b.periodFrom}→${b.periodTo}`).slice(0, 3).join(", "));

// ── 3. A COLUMN TIES ON ITS OWN LINES, OR IT IS WITHHELD ─────────────────────
// Struck here, off the book's own figures, by the rule the page states:
// closing = opening + capital + gains + income − fees − expenses + accruals,
// where a since-inception column the report prints no opening for opens at a
// computed nil (nothing is held before inception) and capital is the report's
// net capital line where it prints one, else contributions less withdrawals.
// The bound is the statement's own printing precision over the lines added —
// half of its last printed digit per figure — never a tolerance widened to fit.
type Tie = { ties: boolean; residual: number | null; openingNil: boolean };
const tieOf = (b: Row): Tie => {
  const openingNil = b.basis === "since-inception" && b.opening == null;
  const opening = openingNil ? 0 : b.opening;
  if (!num(b.closing) || !num(opening)) return { ties: false, residual: null, openingNil };
  const capital = num(b.netCapitalInOut) ? b.netCapitalInOut
    : num(b.contribution) || num(b.withdrawal) ? (b.contribution ?? 0) - (b.withdrawal ?? 0) : null;
  const signed = [opening, capital, ...Object.entries(SIGN).map(([k, s]) => (num(b[k]) ? s * b[k] : null))].filter(num);
  const residual = r2(b.closing - signed.reduce((t, v) => t + v, 0));
  const figures = [...signed, b.closing];
  const unit = figures.some((v) => Math.abs(v - Math.round(v)) > 0.004) ? 0.01 : 1;
  return { ties: Math.abs(residual) <= (figures.length * unit) / 2 + 1e-9, residual, openingNil };
};
let tieWrong = 0, residualWrong = 0, nilWrong = 0;
for (const b of cols) {
  const t = tieOf(b);
  if (b.ties !== t.ties) { tieWrong++; console.log(`  ${b.source}: book ties=${b.ties}, its lines say ${t.ties} (residual ${t.residual})`); }
  if ((b.residual ?? null) !== t.residual) { residualWrong++; console.log(`  ${b.source}: book residual ${b.residual} vs ${t.residual}`); }
  if (b.openingNil !== t.openingNil) nilWrong++;
}
ok("every column's `ties` is what its own lines give", tieWrong === 0, `${tieWrong} differ`);
ok("…and its residual is the gap its own lines leave", residualWrong === 0, `${residualWrong} differ`);
ok("a since-inception column with no printed opening is marked as opening at a computed nil, and no other", nilWrong === 0);
const tied = cols.filter((b) => b.ties === true);
const held = cols.filter((b) => b.ties !== true);
ok("a withheld column says why, in words", held.every((b) => typeof b.withheldReason === "string" && b.withheldReason.length > 20),
  `${held.length} withheld`);
ok("a column that adds up carries no reason to be withheld", tied.every((b) => b.withheldReason == null), `${tied.length} tie`);
ok("every column carries the tie decision (none is left undecided)", cols.every((b) => typeof b.ties === "boolean"));
// Load-bearing, in both directions: on this book some columns tie — a builder
// that withheld everything would pass the checks above — and some do not.
ok("on this book some columns add up, from a computed nil opening", tied.some((b) => b.openingNil === true),
  `${tied.filter((b) => b.openingNil).length} since-inception columns tie from nil`);
ok("…and some are withheld, so the page's withheld state has a subject", held.length > 0);
// The reason names what is actually missing: a since-inception column whose
// opening equals its closing says THAT, and an unread line is named as unread.
const sameEnds = held.filter((b) => b.basis === "since-inception" && num(b.opening) && num(b.closing)
  && Math.abs(b.opening - b.closing) < 0.005);
ok("a column whose opening was read as its closing says so",
  sameEnds.every((b) => /opening value is read as its closing value/.test(b.withheldReason)), `${sameEnds.length} such`);
const unreadHeld = held.filter((b) => (b.unread ?? []).length && num(b.closing));
ok("a withheld column names the lines no reader looked for",
  unreadHeld.every((b) => /Not read from this report/.test(b.withheldReason)), `${unreadHeld.length} such`);

// And the rule itself detects a dropped line: in every column that adds up,
// take away its largest printed line and it must stop adding up. Otherwise the
// comparison above could agree with a builder that ignored a line — the very
// defect A-12 was (the expenses, and the accrued income, left off).
const LINES = ["contribution", "withdrawal", "netCapitalInOut", ...Object.keys(SIGN)];
const dropped = tied.map((b) => {
  const k = LINES.filter((x) => num(b[x])).sort((x, y) => Math.abs(b[y]) - Math.abs(b[x]))[0];
  return { b, k, still: k ? tieOf({ ...b, [k]: null, ...(k === "contribution" || k === "withdrawal" ? { netCapitalInOut: null } : {}) }).ties : true };
});
ok("the tie rule catches a dropped line, in every column that adds up",
  dropped.length > 0 && dropped.every((x) => x.k && !x.still),
  dropped.filter((x) => !x.k || x.still).map((x) => `${x.b.source}:${x.k}`).join(", ") || `${dropped.length} columns`);

// ── 4. A CLASS SWITCH IS NOT A FLOW (XA-23) ──────────────────────────────────
// Buoyant 103473's capital register prints its 1 June switch as "Security in"
// and "Security out" of ₹22.53 Cr; the page counted "Dated flows 4" where two
// payments were made. The witness is the fund's OWN reclassification record —
// same account, same date, the same rupees — read off the archive here.
let legsFound = 0, legsInFlows = 0;
for (const [accountId, flows] of Object.entries(BOOK_ACCOUNT_CASH_FLOWS)) {
  const a = acct.get(accountId);
  const mine = docs.filter((d) => d.provider === a?.provider && d.accountNo === a?.accountNo);
  const legs = mine.flatMap((d) => (d.cashFlows ?? []).filter((c) => c.kind === "reclassification" && c.date && num(c.amount)));
  const registerLegs = mine.filter((d) => d.reportType === "capital-register").flatMap((d) => (d.cashFlows ?? [])
    .filter((c) => c.date && num(c.amount) && legs.some((l) => l.date === c.date && Math.abs(Math.abs(l.amount) - Math.abs(c.amount)) <= 1)));
  legsFound += registerLegs.length;
  for (const f of flows as Row[]) {
    if (legs.some((l) => l.date === f.date && Math.abs(Math.abs(l.amount) - Math.abs(f.amount)) <= 1)) {
      legsInFlows++; console.log(`  ${accountId}: ${f.date} ${f.amount} "${f.description}" is a class-switch leg`);
    }
  }
}
ok("no dated flow is the leg of a class switch", legsInFlows === 0, `${legsInFlows} found`);
ok("…and this book's registers DO print such legs, so the check has a subject", legsFound > 0, `${legsFound} register rows`);

console.log(fails ? `\n${fails} FAILED` : "\nall value-bridge checks pass");
if (fails) process.exit(1);
