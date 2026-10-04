// EVERY CAPITAL-GAIN LOT REACHES ITS HOLDING, AND A ZERO IS A MEASUREMENT (DL-1, DL-2).
//
// DL-1: Green Lantern's capital gain statements print `Axis Liquid Fund - Direct
// Plan - Growth` where the same account's sales and appraisal print `… - Growth
// Option`. Keyed on the lot's own spelling, the book wrote a MEASURED ₹0 realised
// on both Axis Liquid holdings while their statements carry ₹8.62 L of it.
// DL-2: LKP's holdings are dated 31 March and every lot for five of its names was
// sold after — ₹0 there was struck over no sale of theirs at all.
//
// Every expectation is read off the ARCHIVE. The join is RE-EXPRESSED here rather
// than imported from `shared/lotSettlement.mjs` (the builder's rule): a lot group
// belongs to the security of the sale that settled it — by identity, else the
// same account and date with the lots' proceeds equal to the day's settled sale
// within ₹1, else equal to the day's CONSIDERATION LESS BROKERAGE within ₹1 (what
// ASK's and Marathon's capital gain statements strike a sale at: before STT,
// which s.48 does not deduct) — and the suite then asserts, for every position on
// an account with a capital gain statement, that its realised half is exactly
// what those lots give it: their gain summed where any were sold on or before its
// statement date, NULL where every one came after, and a measured 0 only where
// none exists.
//
// A lot whose sale proceeds are ₹0 is not a sale — ASK prints the fractions a
// demerger or a bonus left that way — so no trade can settle it. Those are
// counted apart and NAMED, never passed off as settled.
import fs from "node:fs";
import path from "node:path";
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

type Row = Record<string, any>;
type Doc = { docKey: string; provider: string; accountNo: string; reportType: string; asOf: string | null; status?: string;
  periodFrom?: string | null; capitalGains?: Row[]; transactions?: Row[] };
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const AUDIT = path.resolve("public/audit");
const docs: Doc[] = fs.readdirSync(AUDIT).sort()
  .map((dir) => path.join(AUDIT, dir, "document.json"))
  .filter((f) => fs.existsSync(f))
  .map((f) => JSON.parse(fs.readFileSync(f, "utf8")) as Doc)
  .filter((d) => d.status !== "failed" && d.accountNo);

/** A lot's gain and the cost of the units it sold — proceeds less purchase, else the printed ST+LT. */
const lotGain = (l: Row): { gain: number; cost: number } | null => {
  if (num(l.saleAmount) && num(l.purchaseAmount)) return { gain: l.saleAmount - l.purchaseAmount, cost: l.purchaseAmount };
  if (!num(l.shortTerm) && !num(l.longTerm)) return null;
  const g = (num(l.shortTerm) ? l.shortTerm : 0) + (num(l.longTerm) ? l.longTerm : 0);
  if (num(l.purchaseAmount)) return { gain: g, cost: l.purchaseAmount };
  if (num(l.saleAmount)) return { gain: g, cost: l.saleAmount - g };
  return null;
};

let groupsChecked = 0;
const unsettled: string[] = [];
const notASale: string[] = [];
let byConsideration = 0;
const wrong: string[] = [];
let positionsChecked = 0;
let aliased = 0;
const axis: string[] = [];
let withheldNull = 0;
let isinJoins = 0;
for (const a of BOOK_ACCOUNTS) {
  const mine = docs.filter((d) => d.provider === a.provider && d.accountNo === a.accountNo);
  // Lots printed on two issues of one statement are one lot.
  const seen = new Set<string>();
  const lots: Row[] = [];
  for (const d of mine) for (const l of d.capitalGains ?? []) {
    const k = JSON.stringify([l.securityKey, l.saleDate, l.purchaseDate, l.quantity, l.saleAmount, l.purchaseAmount, l.shortTerm, l.longTerm]);
    if (!l.securityKey || seen.has(k)) continue;
    seen.add(k); lots.push(l);
  }
  if (!lots.length) continue;
  // The day's sales, from the first authoritative trade record the account publishes.
  const rt = ["transaction-statement", "investor-report"].find((r) => mine.some((d) => d.reportType === r && (d.transactions ?? []).length));
  const tseen = new Set<string>();
  const sales = new Map<string, { key: string; date: string; amount: number | null; consideration: number | null }>();
  for (const d of mine.filter((x) => x.reportType === rt)) for (const t of d.transactions ?? []) {
    if (t.side !== "sell" || !t.date || !t.securityKey) continue;
    const k = JSON.stringify([t.date, t.securityKey, t.quantity, t.gross, t.net, t.printed?.settlementAmount]);
    if (tseen.has(k)) continue;
    tseen.add(k);
    const amt = t.printed?.settlementAmount ?? t.net ?? t.gross ?? null;
    // The consideration less brokerage — the row's own gross and brokerage, both
    // printed or derived from what it prints; null where either is missing.
    const cons = num(t.gross) && num(t.brokerage) ? t.gross - t.brokerage : null;
    const sk = `${t.securityKey}@${t.date}`;
    const cur = sales.get(sk) ?? { key: t.securityKey, date: t.date, amount: 0 as number | null, consideration: 0 as number | null };
    cur.amount = cur.amount === null || !num(amt) ? null : cur.amount + amt;
    cur.consideration = cur.consideration === null || !num(cons) ? null : cur.consideration + cons;
    sales.set(sk, cur);
  }
  // Group the lots per (security, sale date) and settle each against a sale.
  const groups = new Map<string, { key: string; date: string; proceeds: number | null; lots: Row[] }>();
  for (const l of lots) {
    if (!l.saleDate) continue;
    const gk = `${l.securityKey}@${l.saleDate}`;
    const g = groups.get(gk) ?? { key: l.securityKey, date: l.saleDate, proceeds: 0 as number | null, lots: [] as Row[] };
    g.proceeds = g.proceeds === null || !num(l.saleAmount) ? null : g.proceeds + l.saleAmount;
    g.lots.push(l);
    groups.set(gk, g);
  }
  const holdingOf = new Map<string, string>(); // lot group → the security it belongs to
  const used = new Set<string>();
  // Identity first, for every group, so a figure match can never take a sale
  // its own security's lots would have met by name.
  for (const [gk] of groups) if (sales.has(gk)) used.add(gk);
  for (const [gk, g] of groups) {
    groupsChecked++;
    if (sales.has(gk)) { holdingOf.set(gk, g.key); continue; }
    const byFigure = (pick: (s: { amount: number | null; consideration: number | null }) => number | null) =>
      [...sales.entries()].filter(([sk, s]) => {
        const v = pick(s);
        return !used.has(sk) && s.date === g.date && num(v) && num(g.proceeds) && Math.abs(v - g.proceeds) <= 1;
      });
    let cands = byFigure((s) => s.amount);
    if (cands.length === 1) { holdingOf.set(gk, cands[0][1].key); used.add(cands[0][0]); if (cands[0][1].key !== g.key) aliased++; continue; }
    if (cands.length === 0) {
      cands = byFigure((s) => s.consideration);
      if (cands.length === 1) {
        holdingOf.set(gk, cands[0][1].key); used.add(cands[0][0]); byConsideration++;
        if (cands[0][1].key !== g.key) aliased++;
        continue;
      }
    }
    // Neither: the lot reaches a holding only if the account holds its own key.
    if (BOOK_POSITIONS.some((p) => p.accountId === a.accountId && p.securityKey === g.key)) { holdingOf.set(gk, g.key); continue; }
    // A group whose every lot sold for ₹0 is no sale at all — counted apart.
    if (g.lots.every((l) => l.saleAmount === 0)) { notASale.push(`${a.accountId} ${gk}`); continue; }
    unsettled.push(`${a.accountId} ${gk}`);
  }
  // Where the settled spelling is still not a holding's, the same-account ISIN
  // decides — an identifier, and only where exactly one holding prints it.
  const rows = [...BOOK_POSITIONS, ...BOOK_UNVALUED_HOLDINGS].filter((x) => x.accountId === a.accountId);
  let byIsin = 0;
  for (const [gk, g] of groups) {
    const k = holdingOf.get(gk);
    if (!k || rows.some((x) => x.securityKey === k)) continue;
    const isin = g.lots.map((l) => l.isin).find(Boolean);
    const hits = [...new Set(rows.filter((x) => isin && x.isin === isin).map((x) => x.securityKey))];
    if (hits.length === 1) { holdingOf.set(gk, hits[0]); byIsin++; }
  }
  isinJoins += byIsin;
  // What each position on this account must carry.
  const opens = mine.filter((d) => (d.capitalGains ?? []).length).map((d) => d.periodFrom).filter(Boolean).sort()[0] ?? null;
  for (const p of BOOK_POSITIONS.filter((x) => x.accountId === a.accountId)) {
    // A fund whose own dated unit record is matched first-in, first-out answers
    // its realised half from that record — not from a capital gain statement.
    if (p.costBasisSource === "fifo" || p.costBasisSource === "carried-through-switch") continue;
    positionsChecked++;
    const mineLots = [...groups].filter(([gk]) => holdingOf.get(gk) === p.securityKey).flatMap(([, g]) => g.lots);
    const before = mineLots.filter((l) => !a.asOf || !l.saleDate || l.saleDate <= a.asOf);
    const after = mineLots.length - before.length;
    let want: { realised: number | null; sold: number | null };
    if (before.length) {
      const gs = before.map(lotGain).filter((x): x is { gain: number; cost: number } => x !== null);
      want = { realised: gs.reduce((s, x) => s + x.gain, 0), sold: gs.reduce((s, x) => s + x.cost, 0) };
    } else if (after || !opens || !a.asOf || opens > a.asOf) {
      want = { realised: null, sold: null };
      withheldNull++;
    } else {
      want = { realised: 0, sold: 0 };
    }
    const close = (x: number | null | undefined, y: number | null) => (y === null ? x === null : num(x) && Math.abs(x - y) <= 0.01);
    if (!close(p.realizedPnL, want.realised) || !close(p.costOfUnitsSold, want.sold)) {
      wrong.push(`${a.accountId} ${p.security}: realised ${p.realizedPnL} / sold ${p.costOfUnitsSold}, the lots give ${want.realised} / ${want.sold}`);
    }
    if (/axis liquid/i.test(p.security)) axis.push(`${a.accountId}: realised ${p.realizedPnL} on ${p.costOfUnitsSold} of cost sold`);
  }
}
ok("every capital-gain lot that sold something settles a sale or names a holding its account carries", groupsChecked > 0 && unsettled.length === 0,
  unsettled.slice(0, 6).join("; ") || `${groupsChecked} lot group(s)`);
// The lots that are not sales must be NAMED by the builder, not merely set apart
// here: `docs/BOOK-REPORT.md` lists every lot group that settles no sale and
// names no holding, per account. That list must be exactly this suite's set of
// groups that sold for ₹0 — a builder whose own join broke would list real sales
// there too (the set grows), and one that stopped naming them would list none
// (the set shrinks). Each side is derived independently: this suite's from the
// archive, the report's from the builder.
const reportNamed = new Set<string>();
for (const line of fs.readFileSync(path.resolve("docs/BOOK-REPORT.md"), "utf8").split("\n")) {
  const m = line.match(/^- account (\S+): \d+ capital-gain lot group\(s\) settle no sale on this account's .*? — (.*)$/);
  if (!m) continue;
  for (const part of m[2].split("; ")) {
    const g = part.match(/^(\S+) sold (\d{4}-\d{2}-\d{2})$/);
    if (g) reportNamed.add(`${m[1]} ${g[1]}@${g[2]}`);
  }
}
const suiteNamed = new Set(notASale.map((x) => {
  const [accountId, gk] = x.split(" ");
  const a = BOOK_ACCOUNTS.find((y) => y.accountId === accountId);
  return `${a?.accountNo} ${gk}`;
}));
const onlyReport = [...reportNamed].filter((x) => !suiteNamed.has(x));
const onlySuite = [...suiteNamed].filter((x) => !reportNamed.has(x));
ok("the lot groups no sale settles are the ones that sold for ₹0, and the book report names exactly those",
  onlyReport.length === 0 && onlySuite.length === 0,
  onlyReport.length || onlySuite.length
    ? `report only: ${onlyReport.join("; ") || "none"} · suite only: ${onlySuite.join("; ") || "none"}`
    : `${notASale.length} named: ${notASale.join("; ") || "none on this book"}`);
ok("every position on an account with a capital gain statement carries exactly the realised its own lots give it",
  positionsChecked > 0 && wrong.length === 0, wrong.slice(0, 6).join("; ") || `${positionsChecked} position(s)`);
// LOAD-BEARING, both halves. Some lot group must settle a sale under ANOTHER key
// (or the alias rule is exercised by nothing and a key join would pass), and some
// position must be withheld as null (or DL-2's rule is exercised by nothing).
ok("some lots settle a sale printed under another spelling of the security", aliased > 0, `${aliased} lot group(s)`);
// …and the third basis is exercised: a capital gain statement that strikes its
// sale before STT settles some sale only on the consideration less brokerage, or
// that join is checked by nothing on this book.
ok("some lots settle their sale only on the consideration less brokerage", byConsideration > 0, `${byConsideration} lot group(s)`);
ok("some holding's realised half is withheld as null, not written as a zero", withheldNull > 0, `${withheldNull} position(s)`);
ok("a lot whose sale is spelled unlike any holding reaches the holding printing its ISIN", isinJoins > 0, `${isinJoins} lot group(s)`);
ok("both Axis Liquid holdings carry the realised gain their own lots give them", axis.length === 2
  && axis.every((x) => !/realised (0|null) /.test(x)), axis.join("; "));

console.log(`\n${fails ? `${fails} FAILED` : "all passed"}`);
process.exit(fails ? 1 : 0);
