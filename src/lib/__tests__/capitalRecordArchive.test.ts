// THE FAMILY'S DATED CAPITAL IS ONE RECORD — held to the archive (A-06).
//
// The record the Transactions card, the mandate page and the contribution
// history read is `capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS,
// BOOK_ACCOUNTS)`: the rows a statement TYPES as a contribution or a withdrawal,
// the capital register's movements the book builder merges onto them, and — at
// display time, for an account with no record of its own — the drawdown fund's
// dated CALLS (Stage 10cd). It used to carry only the typed rows, so a drawdown
// fund's calls (India SME, Sky Capital, Baring, Carnelian Bharat Amritkaal,
// Delphi, both Founders folios) and a capital register's DEPOSITS (V.E.C 128005's
// ₹10.65 Cr and ₹59 L) reached no row while the archive printed every one of them
// with a date.
//
// The page's own guard derives its expectation FROM the record, so it agreed
// with the defect by construction. Every expectation here is read off the
// ARCHIVE — the documents' own typed rows, call tables and registers — and joined
// to the book only through the account registry (provider + account number), so
// a book that dropped a record cannot satisfy it by dropping the expectation too.
// The SUBJECT is the combined record, built by the one function the pages call.
//
// The rules are re-expressed here, not imported:
//   · a payment two documents both print is ONE payment (same account, date and
//     direction, amount within ₹1);
//   · a class switch's two legs are not capital (the archive's own
//     reclassification rows name the day and the rupees);
//   · a register whose only movements are withdrawals, for an account with no
//     other dated capital, is not listed — and the suite asserts it is ABSENT,
//     because listed alone it presents a funded account as one nothing was paid
//     into.
import fs from "node:fs";
import path from "node:path";
import { BOOK_ACCOUNTS, BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_POSITIONS } from "@/data/glowData";
import { capitalMovesWithCalls } from "@/lib/tranches";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

type Row = Record<string, any>;
type Doc = { docKey: string; provider: string; accountNo: string; reportType: string; asOf: string | null; status?: string;
  cashFlows?: Row[]; commitment?: { calls?: Row[] } | null };

const AUDIT = path.resolve("public/audit");
const docs: Doc[] = fs.readdirSync(AUDIT).sort()
  .map((dir) => path.join(AUDIT, dir, "document.json"))
  .filter((f) => fs.existsSync(f))
  .map((f) => JSON.parse(fs.readFileSync(f, "utf8")) as Doc)
  .filter((d) => d.status !== "failed" && d.accountNo);

// The registry is the only join to the book: provider + the account number the
// statement prints. An archive account the book excludes (an unresolved holder,
// the HOPE INDIA TRUST folios) has no registry row and is not expected.
const byPA = new Map(BOOK_ACCOUNTS.map((a) => [`${a.provider}::${a.accountNo}`, a.accountId]));
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const within = (a: number, b: number) => Math.abs(a - b) <= 1;

type Archive = { typed: Row[]; calls: Row[]; register: Row[]; switches: Row[] };
const archive = new Map<string, Archive>();
for (const d of docs) {
  const accountId = byPA.get(`${d.provider}::${d.accountNo}`);
  if (!accountId) continue;
  const a = archive.get(accountId) ?? { typed: [], calls: [], register: [], switches: [] };
  for (const c of d.cashFlows ?? []) {
    if (!c.date) continue;
    if ((c.kind === "contribution" || c.kind === "withdrawal") && num(c.amount)) a.typed.push(c);
    if (c.kind === "reclassification") a.switches.push(c);
    if (d.reportType === "capital-register" && c.kind === "capital-register" && num(c.amount) && c.amount !== 0
      && !/^opening balance/i.test(c.description ?? "")) a.register.push(c);
  }
  for (const k of d.commitment?.calls ?? []) if (k.date && num(k.amount)) a.calls.push(k);
  archive.set(accountId, a);
}
// A call or a register row printed on two issues of one statement is one row.
const dedupe = (rows: Row[], key: (r: Row) => string) => {
  const seen = new Set<string>();
  return rows.filter((r) => { const k = key(r); if (seen.has(k)) return false; seen.add(k); return true; });
};
for (const a of archive.values()) {
  a.calls = dedupe(a.calls, (k) => `${k.date}|${k.amount}|${k.label ?? ""}`);
  a.register = dedupe(a.register, (c) => `${c.date}|${c.description ?? ""}|${c.amount}|${c.balance ?? ""}`);
}
const isSwitchLeg = (a: Archive, c: Row) => a.switches.some((s) => s.date === c.date && num(s.amount) && within(Math.abs(s.amount), Math.abs(c.amount)));

// ── WHICH ACCOUNTS THE ARCHIVE SAYS HAVE A DATED CAPITAL RECORD ────────────
const expected = new Set<string>();
const withdrawalsOnly: string[] = [];
for (const [accountId, a] of archive) {
  const money = a.register.filter((c) => !isSwitchLeg(a, c));
  if (a.typed.length || a.calls.length) { expected.add(accountId); continue; }
  if (!money.length) continue;
  if (money.some((c) => c.amount > 0)) expected.add(accountId);
  else withdrawalsOnly.push(accountId);
}
const RECORD = capitalMovesWithCalls([...BOOK_CAPITAL_MOVES], [...BOOK_COMMITMENTS], BOOK_ACCOUNTS);
const listed = new Set(RECORD.map((m) => m.accountId));
const missing = [...expected].filter((a) => !listed.has(a)).sort();
const extra = [...listed].filter((a) => !expected.has(a)).sort();
ok("every account with a dated capital record in the archive is on the record", missing.length === 0,
  missing.join(", ") || `${expected.size} account(s)`);
ok("…and no account is there without one", extra.length === 0, extra.join(", ") || "none");
ok("a register holding nothing but withdrawals, for an account with no other dated capital, is NOT listed",
  withdrawalsOnly.every((a) => !listed.has(a)),
  withdrawalsOnly.length ? `${withdrawalsOnly.length} held back: ${withdrawalsOnly.join(", ")}` : "none in this archive");

// LOAD-BEARING. The typed rows alone must NOT account for every listed account,
// or the merge did no work and every check above passes on the defect.
const typedOnly = new Set([...archive].filter(([, a]) => a.typed.length).map(([id]) => id));
const viaMerge = [...expected].filter((a) => !typedOnly.has(a)).sort();
ok("the dated calls and registers reach accounts the typed rows alone do not", viaMerge.length > 0,
  `${typedOnly.size} account(s) from typed rows, ${viaMerge.length} more from calls or a register: ${viaMerge.join(", ")}`);

// ── EVERY DATED CALL IS ONE ROW ────────────────────────────────────────────
// Grouped per (account, date, amount), because two calls of one size on one day
// would be two rows; each group must be matched by exactly as many `in` moves.
const movesOf = (accountId: string, date: string, direction: "in" | "out") =>
  RECORD.filter((m) => m.accountId === accountId && m.date === date && m.direction === direction && m.payoutKind == null);
let callsChecked = 0;
const callProblems: string[] = [];
for (const [accountId, a] of archive) {
  const groups = new Map<string, { date: string; amount: number; n: number }>();
  for (const k of a.calls) {
    const g = groups.get(`${k.date}|${k.amount}`) ?? { date: k.date, amount: k.amount, n: 0 };
    g.n++;
    groups.set(`${k.date}|${k.amount}`, g);
  }
  for (const g of groups.values()) {
    callsChecked += g.n;
    const hit = movesOf(accountId, g.date, "in").filter((m) => num(m.amount) && within(m.amount, g.amount));
    if (hit.length !== g.n) callProblems.push(`${accountId} ${g.date} ${g.amount}: ${hit.length} row(s) for ${g.n} call(s)`);
  }
}
ok("every dated call the archive prints is exactly one capital row, on its own date and for its own amount",
  callsChecked > 0 && callProblems.length === 0, callProblems.slice(0, 6).join("; ") || `${callsChecked} call(s)`);

// ── EVERY REGISTER DAY IS ONE ROW, AND A SWITCH LEG IS NONE ────────────────
let regChecked = 0;
const regProblems: string[] = [];
const legProblems: string[] = [];
for (const [accountId, a] of archive) {
  if (!listed.has(accountId)) continue;
  const byDay = new Map<string, { date: string; direction: "in" | "out"; amount: number }>();
  for (const c of a.register) {
    if (isSwitchLeg(a, c)) {
      const leg = RECORD.find((m) => m.accountId === accountId && m.date === c.date && num(m.amount) && within(m.amount, Math.abs(c.amount)));
      if (leg) legProblems.push(`${accountId} ${c.date} ${c.description}`);
      continue;
    }
    const direction = c.amount > 0 ? "in" : "out";
    const k = `${c.date}|${direction}`;
    const cur = byDay.get(k) ?? { date: c.date, direction, amount: 0 };
    cur.amount += Math.abs(c.amount);
    byDay.set(k, cur);
  }
  for (const g of byDay.values()) {
    regChecked++;
    const hit = movesOf(accountId, g.date, g.direction);
    // A day another statement ALSO prints stays that statement's row — the
    // typed record outranks the register — so the check is that the day is
    // represented once, at the register's own figure or the typed one's.
    if (hit.length !== 1) regProblems.push(`${accountId} ${g.date} ${g.direction}: ${hit.length} row(s)`);
  }
}
ok("every register day on a listed account is exactly one capital row", regChecked > 0 && regProblems.length === 0,
  regProblems.slice(0, 6).join("; ") || `${regChecked} register day(s)`);
ok("no leg of a class switch is listed as money moving", legProblems.length === 0, legProblems.join("; ") || "none");

// The deposit the audit found missing: the largest register deposit on an
// account whose statements type NO contribution — the case the merge exists for
// (V.E.C 128005's Fund Deposit on this archive) — derived, not typed, so a later
// drop moves it with the book.
const biggest = [...archive].filter(([accountId]) => !typedOnly.has(accountId))
  .flatMap(([accountId, a]) => a.register.filter((c) => c.amount > 0 && !isSwitchLeg(a, c)).map((c) => ({ accountId, c })))
  .sort((x, y) => y.c.amount - x.c.amount)[0];
ok("the largest register deposit in the archive is on the record at its own date and amount",
  !!biggest && movesOf(biggest.accountId, biggest.c.date, "in").some((m) => num(m.amount) && m.amount >= biggest.c.amount - 1),
  biggest ? `${biggest.accountId} ${biggest.c.date} ${biggest.c.amount}` : "no register deposit in the archive");

// ── AN ACCOUNT NO STATEMENT VALUES IS HELD TO ITS OWN PRINTED CALLS ────────
// The tranche suite's ceiling (paid ≤ 3 × what the account is worth) has no
// value to set against India SME or Sky Capital, so it names them and moves on.
// Their own statements print what was called; the rows must add to exactly that
// — the running-balance trap doubles it, and so would a call counted twice.
const held = new Set(BOOK_POSITIONS.map((p) => p.accountId));
const unvaluedFunded = [...listed].filter((a) => !held.has(a)).sort();
const ceilingProblems: string[] = [];
for (const accountId of unvaluedFunded) {
  const c = BOOK_COMMITMENTS.find((x) => x.accountId === accountId);
  const printed = [c?.called, c?.paid].find(num);
  const paid = RECORD.filter((m) => m.accountId === accountId && m.direction === "in" && m.payoutKind == null)
    .reduce((s, m) => s + (m.amount ?? 0), 0);
  if (!num(printed) || !within(paid, printed)) ceilingProblems.push(`${accountId}: ${paid} in against a printed ${printed ?? "nothing"}`);
}
ok("an account no statement values carries exactly the calls its own statement prints", unvaluedFunded.length > 0
  && ceilingProblems.length === 0, ceilingProblems.join("; ") || `${unvaluedFunded.length} account(s): ${unvaluedFunded.join(", ")}`);

// ── THE CALLS ARE JOINED ONCE, AND IN ONE PLACE ────────────────────────────
// `capitalMovesWithCalls` adds a fund's calls only where the account publishes
// no record of its own, and marks them `fromCall` — which is what keeps
// `recordShortfall` and the typed-record rules off them. A call copied into
// BOOK_CAPITAL_MOVES at build time would make the account a "record" account:
// the call would then appear once (the display join skips it) but lose that
// mark, and the page would refuse the fund's return against a record-end no
// capital document states. So: no account whose only dated capital is its calls
// has a row in BOOK_CAPITAL_MOVES, and each of its rows on the record is a call.
const callOnly = [...archive].filter(([, a]) => a.calls.length && !a.typed.length
  && !a.register.some((c) => !isSwitchLeg(a, c))).map(([id]) => id).sort();
const builtIn = callOnly.filter((a) => BOOK_CAPITAL_MOVES.some((m) => m.accountId === a));
ok("a fund's dated calls are not copied into BOOK_CAPITAL_MOVES", callOnly.length > 0 && builtIn.length === 0,
  builtIn.join(", ") || `${callOnly.length} call-only account(s)`);
ok("…and on the record every purchase of a call-only account is marked as a call",
  callOnly.every((a) => RECORD.filter((m) => m.accountId === a && m.direction === "in" && m.payoutKind == null).every((m) => m.fromCall === true)));

// ── THE RECORD RUNS AS FAR AS THE REGISTER THAT WITNESSES IT ───────────────
// A register whose movements carry its own Opening Balance to its own last
// printed balance says nothing else moved through its date. Where it is merged
// onto an account's record — and its window meets the typed record's — the
// account's `capitalRecordTo` must reach its date: short of it, `recordShortfall`
// would refuse a return the record in fact supports (Green Lantern 510861's July
// TDS, ₹6,350, was the whole of that gap). Re-expressed off the archive.
const regDocs = docs.filter((d) => d.reportType === "capital-register" && d.asOf);
const typedReach = new Map<string, string>();
for (const d of docs) {
  const accountId = byPA.get(`${d.provider}::${d.accountNo}`);
  if (!accountId) continue;
  const typed = (d.cashFlows ?? []).some((c) => c.date && (c.kind === "contribution" || c.kind === "withdrawal"));
  const to = (d as Row).periodTo ?? d.asOf;
  if (typed && to && (!typedReach.has(accountId) || to > typedReach.get(accountId)!)) typedReach.set(accountId, to);
}
const reachProblems: string[] = [];
let reachChecked = 0;
for (const d of regDocs) {
  const accountId = byPA.get(`${d.provider}::${d.accountNo}`);
  if (!accountId || !BOOK_CAPITAL_MOVES.some((m) => m.accountId === accountId)) continue;
  const reg = (d.cashFlows ?? []).filter((c) => c.kind === "capital-register" && c.date);
  const open = reg.find((c) => /^opening balance/i.test(c.description ?? "") && num(c.balance));
  const last = [...reg].reverse().find((c) => num(c.balance));
  const moves = reg.filter((c) => c !== open && num(c.amount) && c.amount !== 0);
  if (!open || !last || !moves.length) continue;
  if (!within(last.balance - open.balance, moves.reduce((s, c) => s + c.amount, 0))) continue;
  const tr = typedReach.get(accountId);
  const dayBefore = new Date(Date.parse(`${open.date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  if (tr && tr < dayBefore) continue;
  reachChecked++;
  const acct = BOOK_ACCOUNTS.find((a) => a.accountId === accountId);
  if (!acct?.capitalRecordTo || acct.capitalRecordTo < d.asOf!) reachProblems.push(`${accountId}: runs to ${acct?.capitalRecordTo ?? "nothing"}, its register ties to ${d.asOf}`);
}
ok("an account's dated record runs at least as far as the register whose balances tie", reachChecked > 0 && reachProblems.length === 0,
  reachProblems.join("; ") || `${reachChecked} register issue(s)`);
// LOAD-BEARING: some register must reach past what the typed rows reach on their
// own, or the check above is satisfied by records that were already long enough.
const extended = regDocs.filter((d) => {
  const accountId = byPA.get(`${d.provider}::${d.accountNo}`);
  const tr = accountId ? typedReach.get(accountId) : undefined;
  return !!accountId && BOOK_CAPITAL_MOVES.some((m) => m.accountId === accountId) && (!tr || tr < d.asOf!);
}).map((d) => `${d.provider} ${d.accountNo} ${d.asOf}`);
ok("…and a register does carry some record past where its typed rows stop", extended.length > 0, extended.join("; "));

console.log(`\n${fails ? `${fails} FAILED` : "all passed"}`);
process.exit(fails ? 1 : 0);
