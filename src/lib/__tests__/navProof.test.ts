// WHAT MOVED BETWEEN TWO MARKS IS WHAT THE STATEMENTS SAY MOVED (A-10, MNT-22).
//
// The NAV series nets external capital out of every step so a deposit is not
// read as a return. It used to take that capital from ONE table — the dated
// flows the XIRR reads, which cover 8 accounts — and booked the whole standing
// VALUE of every other multi-security account as "not proven to be performance":
// ₹28.3 Cr on the card, ten times the ₹2.78 Cr those accounts moved, about
// accounts whose own statements settle every step (SVAN's investor reports,
// Molecule's fact sheets, HDFC MF at nil). SVAN's ₹23,931 of withdrawals went
// un-netted with it, and so did Carnelian's ₹30,690, which no dated row carries.
//
// Every expectation here is read off the ARCHIVE and re-expressed, not imported
// from the builder: for each step between two of a covered account's marks, the
// capital its statements PRINT as having moved (one statement whose window is
// the step, or two of one kind opening on one date and closing at the step's two
// ends), else identical unit counts, else its dated record. Then the book's
// `flowIn` per point, `unreportedFlowValue` per point, each account's
// `flowBasis`, and `BOOK_UNDATED_CAPITAL` must be exactly what that gives.
import fs from "node:fs";
import path from "node:path";
import {
  BOOK_ACCOUNTS, BOOK_ACCOUNT_CASH_FLOWS, BOOK_ACCOUNT_NAV_HISTORY, BOOK_NAV_COVERAGE, BOOK_NAV_HISTORY,
  BOOK_POLYCAB, BOOK_UNDATED_CAPITAL,
} from "@/data/glowData";
// @ts-ignore — precedence.mjs is a plain-JS committed decision table with no
// declaration file; the suite reads the decision itself, not the builder's use of it.
import { sourceFor } from "../../../scripts/ingest/precedence.mjs";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

type Row = Record<string, any>;
type Doc = { docKey: string; provider: string; accountNo: string; reportType: string; asOf: string | null; status?: string;
  flows?: Row | null; holdings?: Row[] };
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const AUDIT = path.resolve("public/audit");
const docs: Doc[] = fs.readdirSync(AUDIT).sort()
  .map((dir) => path.join(AUDIT, dir, "document.json"))
  .filter((f) => fs.existsSync(f))
  .map((f) => JSON.parse(fs.readFileSync(f, "utf8")) as Doc)
  .filter((d) => d.status !== "failed" && d.accountNo);
const FENCED = new Set(BOOK_POLYCAB.map((p) => p.securityKey));
const acct = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
const nextDay = (iso: string) => {
  const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};
const isOpening = (f: { description?: string }) => /^Opening portfolio value/i.test(f.description ?? "");

// ── EACH STEP, SETTLED OFF THE ARCHIVE ───────────────────────────────────────
type Step = { accountId: string; a: string; b: string; how: string; net: number | null; move: number };
const steps: Step[] = [];
const basisOf = new Map<string, "reported" | "units-unchanged" | "unreported">();
for (const c of BOOK_NAV_COVERAGE.covered) {
  const a0 = acct.get(c.accountId)!;
  const mine = docs.filter((d) => d.provider === a0.provider && d.accountNo === a0.accountNo);
  // Every printed capital total, with the window it is struck over and what it says moved in.
  const totals: { rt: string; from: string; to: string; netIn: number }[] = [];
  for (const d of mine) {
    const f = d.flows;
    if (!f?.periodFrom || !f?.periodTo) continue;
    if (num(f.netCapitalInOut)) totals.push({ rt: `${d.reportType}/net`, from: f.periodFrom, to: f.periodTo, netIn: f.netCapitalInOut });
    if (num(f.contribution) && num(f.withdrawal)) {
      totals.push({ rt: `${d.reportType}/cw`, from: f.periodFrom, to: f.periodTo, netIn: f.contribution - f.withdrawal });
    }
  }
  // The authoritative holdings document at a mark — the precedence table's first
  // report type present on that date.
  const rule = sourceFor(a0.provider, "holdings") as { reportTypes: string[] } | null;
  const holdingsAt = (date: string) => {
    for (const rt of rule?.reportTypes ?? []) {
      const d = mine.filter((x) => x.reportType === rt && x.asOf === date).sort((x, y) => x.docKey.localeCompare(y.docKey))[0];
      if (d) return (d.holdings ?? []).filter((h) => h.securityKey && !FENCED.has(h.securityKey) && num(h.marketValue));
    }
    return null;
  };
  const marks = BOOK_ACCOUNT_NAV_HISTORY[c.accountId] ?? [];
  const bases = new Set<string>();
  for (let i = 1; i < marks.length; i++) {
    const a = marks[i - 1].date, b = marks[i].date;
    const move = Math.abs(marks[i].nav - marks[i - 1].nav);
    const cands: number[] = [];
    for (const x of totals) {
      if (x.to !== b) continue;
      if (x.from === nextDay(a)) cands.push(x.netIn);
      else for (const y of totals) if (y.rt === x.rt && y.from === x.from && y.to === a) cands.push(x.netIn - y.netIn);
    }
    let step: Step;
    if (cands.length && Math.max(...cands) - Math.min(...cands) <= 1) {
      step = { accountId: c.accountId, a, b, how: "printed", net: cands[0], move };
    } else if (cands.length) {
      step = { accountId: c.accountId, a, b, how: "unproven", net: null, move };
    } else {
      const h0 = holdingsAt(a), h1 = holdingsAt(b);
      const q = (hs: Row[]) => new Map(hs.map((h) => [h.securityKey, h]));
      const same = !!h0 && !!h1 && h0.length === h1.length && h1.length > 0 && [...q(h1)].every(([k, h]) => {
        const o = q(h0!).get(k);
        return !!o && num(o.quantity) && num(h.quantity) && h.assetClass !== "Cash" && o.assetClass !== "Cash"
          && Math.abs(o.quantity - h.quantity) < 1e-6;
      });
      const dated = BOOK_ACCOUNT_CASH_FLOWS[c.accountId] ?? [];
      if (same) step = { accountId: c.accountId, a, b, how: "units", net: 0, move };
      else if (dated.length) {
        step = { accountId: c.accountId, a, b, how: "dated", move,
          net: -dated.filter((f) => !isOpening(f) && f.date > a && f.date <= b).reduce((s, f) => s + f.amount, 0) };
      } else step = { accountId: c.accountId, a, b, how: "unproven", net: null, move };
    }
    steps.push(step);
    bases.add(step.how);
  }
  basisOf.set(c.accountId, bases.has("unproven") ? "unreported"
    : bases.size === 1 && bases.has("units") ? "units-unchanged" : "reported");
}

// ── THE BOOK'S POINTS ARE EXACTLY WHAT THE STEPS GIVE ─────────────────────────
const lastMark = (id: string, d: string) => {
  let hit: string | null = null;
  for (const m of BOOK_ACCOUNT_NAV_HISTORY[id] ?? []) if (m.date <= d) hit = m.date;
  return hit;
};
const pointProblems: string[] = [];
for (let i = 1; i < BOOK_NAV_HISTORY.length; i++) {
  const p = BOOK_NAV_HISTORY[i], prev = BOOK_NAV_HISTORY[i - 1].date;
  let flowIn = 0, unproven = 0;
  for (const c of BOOK_NAV_COVERAGE.covered) {
    const was = lastMark(c.accountId, prev), now = lastMark(c.accountId, p.date);
    if (!was || !now || was === now) continue;
    const s = steps.find((x) => x.accountId === c.accountId && x.a === was && x.b === now);
    if (!s) { pointProblems.push(`${p.date}: no step for ${c.accountId} ${was} → ${now}`); continue; }
    if (s.net === null) unproven += s.move; else flowIn += s.net;
  }
  if (Math.abs((p.flowIn ?? 0) - flowIn) > 1) pointProblems.push(`${p.date} flowIn ${p.flowIn} against ${flowIn}`);
  if (Math.abs((p.unreportedFlowValue ?? 0) - unproven) > 1) pointProblems.push(`${p.date} unproven ${p.unreportedFlowValue} against ${unproven}`);
}
ok("every point nets exactly the capital its accounts' own statements settle, and carries only unsettled MOVES as unproven",
  BOOK_NAV_HISTORY.length > 2 && pointProblems.length === 0, pointProblems.slice(0, 6).join("; ") || `${BOOK_NAV_HISTORY.length} point(s), ${steps.length} step(s)`);

const basisProblems = BOOK_NAV_COVERAGE.covered.filter((c) => c.flowBasis !== basisOf.get(c.accountId))
  .map((c) => `${c.accountId}: ${c.flowBasis}, the archive says ${basisOf.get(c.accountId)}`);
ok("each covered account's flow basis is what its own steps give", basisProblems.length === 0, basisProblems.join("; ") || "all agree");

// An unproven step is its MOVE, never the account's standing value — the defect
// this suite exists for. Held against the book's OWN unproven accounts, so this
// is a claim about the BASIS of the figure, apart from which steps are proven:
// no point may carry more than those accounts moved over it.
const unprovenIds = BOOK_NAV_COVERAGE.covered.filter((c) => c.flowBasis === "unreported").map((c) => c.accountId);
const overMove: string[] = [];
let unprovenPoints = 0;
for (let i = 1; i < BOOK_NAV_HISTORY.length; i++) {
  const p = BOOK_NAV_HISTORY[i];
  if (!((p.unreportedFlowValue ?? 0) > 0)) continue;
  unprovenPoints++;
  const prev = BOOK_NAV_HISTORY[i - 1].date;
  let moves = 0;
  for (const id of unprovenIds) {
    const hist = BOOK_ACCOUNT_NAV_HISTORY[id] ?? [];
    const was = [...hist].reverse().find((m) => m.date <= prev);
    const now = [...hist].reverse().find((m) => m.date <= p.date);
    if (was && now && was.date !== now.date) moves += Math.abs(now.nav - was.nav);
  }
  if ((p.unreportedFlowValue ?? 0) > moves + 1) overMove.push(`${p.date}: ${p.unreportedFlowValue} against a move of ${Math.round(moves)}`);
}
ok("no point carries more than its unproven accounts moved — a move, never a value", overMove.length === 0,
  overMove.slice(0, 4).join("; ") || (unprovenPoints ? `${unprovenPoints} point(s)` : "no point on this book is unproven"));

// ── LOAD-BEARING ─────────────────────────────────────────────────────────────
// (a) The printed totals must net capital the dated flows alone do not, or the
// proof did no work and every check above passes on the defect.
const datedOnly = (id: string, a: string, b: string) => -(BOOK_ACCOUNT_CASH_FLOWS[id] ?? [])
  .filter((f) => !isOpening(f) && f.date > a && f.date <= b).reduce((s, f) => s + f.amount, 0);
const differs = steps.filter((s) => s.how === "printed" && Math.abs((s.net ?? 0) - datedOnly(s.accountId, s.a, s.b)) > 1);
ok("the statements' printed totals net capital the dated flows alone miss", differs.length > 0,
  differs.map((s) => `${s.accountId} ${s.a}→${s.b} ${s.net}`).join("; "));
// (b) An account the old rule called unproven — no dated flows and more than one
// security — must be settled here, or the page's disclosure would still stand.
const rescued = BOOK_NAV_COVERAGE.covered.filter((c) => !(BOOK_ACCOUNT_CASH_FLOWS[c.accountId] ?? []).length
  && basisOf.get(c.accountId) !== "unreported"
  && steps.some((s) => s.accountId === c.accountId && s.how !== "units"));
ok("accounts with no dated flows are settled by their own statements, not presumed", rescued.length > 0,
  rescued.map((c) => c.accountId).join(", "));

// ── CAPITAL NO DATED ROW CARRIES IS NAMED, NEVER DATED ───────────────────────
const gaps = steps.filter((s) => s.how === "printed" && (BOOK_ACCOUNT_CASH_FLOWS[s.accountId] ?? []).length)
  .map((s) => ({ s, dated: datedOnly(s.accountId, s.a, s.b) }))
  .filter(({ s, dated }) => Math.abs((s.net ?? 0) - dated) > 1);
const gapProblems: string[] = [];
for (const { s, dated } of gaps) {
  const u = BOOK_UNDATED_CAPITAL.find((x) => x.accountId === s.accountId && x.from === s.a && x.to === s.b);
  if (!u || Math.abs(u.undated - ((s.net ?? 0) - dated)) > 1 || Math.abs(u.printedNet - (s.net ?? 0)) > 1) {
    gapProblems.push(`${s.accountId} ${s.a}→${s.b}: ${u ? u.undated : "absent"} against ${(s.net ?? 0) - dated}`);
  }
}
const extraUndated = BOOK_UNDATED_CAPITAL.filter((u) => !gaps.some(({ s }) => s.accountId === u.accountId && s.a === u.from && s.b === u.to));
ok("every step whose printed capital the dated record does not carry is named, with the amount, and nothing else is",
  gaps.length > 0 && gapProblems.length === 0 && extraUndated.length === 0,
  [...gapProblems, ...extraUndated.map((u) => `extra ${u.accountId}`)].join("; ") || gaps.map(({ s, dated }) => `${s.accountId} ${(s.net ?? 0) - dated}`).join("; "));
ok("…and no undated amount is given a day", BOOK_UNDATED_CAPITAL.every((u) => !("date" in u)));

console.log(`\n${fails ? `${fails} FAILED` : "all passed"}`);
process.exit(fails ? 1 : 0);
