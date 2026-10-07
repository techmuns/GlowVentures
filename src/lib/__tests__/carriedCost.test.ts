// A COST CARRIED THROUGH A FUND'S CLASS SWITCH, CHECKED AGAINST THE DOCUMENTS.
//   npm run test:family
//
// *"The user does not believe this data."* Buoyant read Invested ₹72.5 Cr and a
// gain of ₹4.51 Cr. The fund had moved both folios from Class A1 into Class A4
// and restated the units' cost at the switch-day NAV, and the book took that
// restatement as money paid in. `carryCostThroughSwitches` now carries what the
// family actually paid through the switch.
//
// ── WHY THIS SUITE READS FIVE DOCUMENTS RATHER THAN THE BOOK ALONE ──────────
//
// The new cost is the sum of the holding's own tranches, so comparing the two is
// a figure checked against its own copy. Every assertion below is struck on a
// figure produced somewhere ELSE:
//
//   the performance appraisal   Realized Gain = the gap the switch restated,
//                               Realized + Unrealized = the gain on its own date
//   the portfolio snap          Profit / Loss less Income Distributed = the
//                               book's gain on the date the book is valued
//   the fact sheet              Contribution = the cash the tranches paid
//   the account statement       every tranche's entry NAV is printed on it
//   the family's own review     Investment at Cost = the book's cost
//
// and the load-bearing gate is an INEQUALITY: the statement's own cost must sit
// materially apart from the carried one, or a book in which no switch restated
// anything would pass every equality here while checking nothing.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_CAPITAL_MOVES, BOOK_POSITION_TRANCHES, BOOK_ACCOUNT_BRIDGES,
} from "@/data/glowData";
import { trancheTable, trancheKey } from "@/lib/tranches";
import { FAMILY_TAXONOMY } from "@/lib/familyTaxonomy";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (name: string, got: number | null | undefined, want: number, tol: number) => {
  const pass = got != null && Math.abs(got - want) <= tol;
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${got} want ${want} (tol ${tol})`); }
  else console.log(`ok   ${name} = ${got}`);
};

// (The tranche windows end on each account's own statement date — see `trancheTable`.)
const ROOT = process.env.GLOW_FIXTURES ? path.resolve(process.env.GLOW_FIXTURES, "../../../..") : process.cwd();
const AUDIT = path.join(ROOT, "public", "audit");

const carried = BOOK_POSITIONS.filter((p) => p.costBasisSource === "carried-through-switch");

/** A folio's portfolio snap, as it prints its Investment Summary. */
const snapSummary = (accountId: string) => {
  const acctNo = accountId.split("-").at(-1)!;
  const dir = fs.readdirSync(AUDIT).find((d) => d.includes(`-${acctNo}-`) && d.endsWith("-portfolio-snap"));
  if (!dir) return null;
  const text = (JSON.parse(fs.readFileSync(path.join(AUDIT, dir, "pages.json"), "utf8")).pages as { text: string }[])
    .map((x) => x.text).join("\n");
  const num = (x: string) => Number(x.replace(/,/g, ""));
  const asOf = /Account Summary : As of (\d\d)\/(\d\d)\/(\d{4})/.exec(text);
  const value = /Current Value\(\d\d\/\d\d\/\d{4}\)\s+(-?[\d,]+)/.exec(text);
  const profit = /Profit \/ Loss\s+(-?[\d,]+)/.exec(text);
  const income = /Income Distributed\s+(-?[\d,]+)/.exec(text);
  if (!asOf || !value || !profit || !income) return null;
  return { date: `${asOf[3]}-${asOf[2]}-${asOf[1]}`, value: num(value[1]), profit: num(profit[1]), income: num(income[1]) };
};

console.log("\n── the book carries a cost through a switch, and says so ──");
// A suite that passes over no input claims nothing — golden.mjs's rule.
ok("some position's cost is carried through a class switch", carried.length > 0, `${carried.length} position(s)`);
ok("...and every one keeps the statement's own figure beside it",
  carried.every((p) => typeof p.printedCostBasis === "number" && p.printedCostBasis !== p.costBasis));
// Three things restate a statement's cost, and the printed figure rides beside
// each: a class switch carried (above), FIFO where units LEFT a holding
// (`shared/fifo.mjs` — Neo Infra's capital redemption), and a contribution whose
// statement prints stamp duty against it, costed at what was PAID
// (`grossPaid.test.ts`, VD-24). Nothing else may.
ok("the statement's figure appears ONLY where the book's cost differs from it",
  BOOK_POSITIONS.filter((p) => p.printedCostBasis !== undefined).every((p) =>
    (p.costBasisSource === "carried-through-switch" || p.costBasisSource === "fifo"
      || p.costBasisSource === "gross-paid")
    && p.printedCostBasis !== p.costBasis));
ok("the dated record itself keeps the class each payment BOUGHT",
  BOOK_CAPITAL_MOVES.every((m) => !("carriedFrom" in m)));

/**
 * LOAD-BEARING. The carried cost must sit materially apart from the printed one
 * — ₹1.62 Cr on this book. If the switch restated nothing, every equality below
 * would hold on the printed figure too and the suite would pass while checking
 * nothing.
 */
const restated = carried.reduce((t, p) => t + ((p.printedCostBasis ?? 0) - (p.costBasis ?? 0)), 0);
ok("the switch restated real money, not rounding", restated > 1e7, `₹${Math.round(restated).toLocaleString("en-IN")}`);

for (const p of carried) {
  const tag = `${p.accountId}`;
  const acct = BOOK_ACCOUNTS.find((a) => a.accountId === p.accountId);
  const tr = BOOK_POSITION_TRANCHES[trancheKey(p.accountId, p.securityKey)];
  console.log(`\n── ${p.security} · ${tag} ──`);
  ok(`a per-contribution breakdown exists — ${tag}`, !!tr);
  if (!tr) continue;
  const t = trancheTable([p], BOOK_POSITION_TRANCHES, "cagr", (x) => BOOK_ACCOUNTS.find((a) => a.accountId === x.accountId)?.asOf ?? null);
  ok(`the breakdown builds — ${tag}`, !!t);
  if (!t) continue;

  // The tranches ARE the licence: they account for every unit and every rupee.
  near(`units tie to the quantity held — ${tag}`, t.units, p.quantity!, 0.0005);
  near(`value ties to the market value — ${tag}`, t.value, p.marketValue, 1);
  near(`the cost is what the tranches paid — ${tag}`, t.invested, p.costBasis ?? NaN, 0.01);
  ok(`some tranche came through the switch — ${tag}`, tr.moves.some((m) => m.carriedFrom));

  // Derived figures follow the cost, never the market value.
  near(`unrealised = value − cost — ${tag}`, p.unrealizedPnL, p.marketValue - (p.costBasis ?? 0), 0.01);
  near(`return = unrealised ÷ cost — ${tag}`, p.returnPct, ((p.marketValue - (p.costBasis ?? 0)) / (p.costBasis ?? 1)) * 100, 0.01);

  // ── the account's own reports, which this book never used to reach the cost ──
  const bridges = BOOK_ACCOUNT_BRIDGES[p.accountId] ?? [];
  const perf = bridges.find((b) => b.basis === "since-inception" && b.realized != null);
  const fact = bridges.find((b) => b.basis === "since-inception" && b.contribution != null);
  ok(`the performance appraisal is there to witness — ${tag}`, !!perf);
  ok(`the fact sheet is there to witness — ${tag}`, !!fact);
  if (perf) {
    // The gap the switch restated is what the fund itself calls realised.
    near(`printed − carried = the appraisal's Realized Gain — ${tag}`,
      (p.printedCostBasis ?? 0) - (p.costBasis ?? 0), perf.realized!, 1);
    // And on the appraisal's OWN date the whole gain over the carried cost is the
    // fund's realised plus unrealised — no money left the fund, so nothing of it
    // is realised in the family's hands. Struck on the appraisal's own closing
    // value rather than the book's: since the September 2026 delivery each folio
    // is valued on its 31 Aug portfolio snap, a month after this appraisal, and
    // a gain struck a month later is a different measurement.
    near(`on the appraisal's own date, value − carried cost = its Realized + Unrealized — ${tag}`,
      (perf.closing ?? NaN) - (p.costBasis ?? 0), (perf.realized ?? 0) + (perf.unrealized ?? 0), 1);
  }

  // ── the book's own date: the portfolio snap it is valued on ──
  // The snap prints its Investment Summary as text the reader does not take —
  // Capital Invested, Income Distributed, Profit / Loss and Current Value — so
  // it stands as a witness the book never read. Its Profit / Loss is struck on
  // the CASH invested; the book's cost also carries the distribution the fund
  // reinvested into units, so the book's gain is the snap's Profit / Loss less
  // its Income Distributed. Every figure is printed to the rupee.
  const sn = snapSummary(p.accountId);
  ok(`the portfolio snap the book is valued on is there to witness — ${tag}`,
    !!sn && sn.date === acct?.asOf, `${sn?.date} vs the account's ${acct?.asOf}`);
  if (sn) {
    near(`the book's value = the snap's Current Value — ${tag}`, p.marketValue, sn.value, 1);
    near(`the book's gain = the snap's Profit / Loss less the income reinvested — ${tag}`,
      p.unrealizedPnL, sn.profit - sn.income, 1);
  }
  if (fact && perf) {
    // What left the family's bank is the fact sheet's Contribution; the cost is
    // that plus any distribution the fund reinvested (the appraisal's income).
    const cash = tr.moves.reduce((s, m) => s + (m.amount ?? 0), 0);
    near(`the tranches' cash = the fact sheet's Contribution — ${tag}`, cash, fact.contribution!, 1);
    near(`cost = Contribution + income reinvested — ${tag}`,
      p.costBasis, (fact.contribution ?? 0) + (perf.income ?? 0), 1);
  }

  // The record reaches inception: the first payment is the statement's own
  // printed inception date, so the cost is not a partial one.
  const first = [...tr.moves].map((m) => m.date).sort()[0];
  ok(`the first contribution is the account's printed inception — ${tag}`,
    !!acct?.inceptionDate && first === acct.inceptionDate, `${first} vs ${acct?.inceptionDate}`);

  // ── the archive as the witness for every entry NAV ──
  // Each tranche's entry NAV AS BOUGHT — invested ÷ the units the statement
  // allotted in the class it was bought in — must be printed on one of this
  // account's own documents, to the 4 decimals the statement prints.
  const acctNo = p.accountId.split("-").at(-1)!;
  const texts = fs.readdirSync(AUDIT)
    .filter((d) => d.includes(`-${acctNo}-`) && fs.existsSync(path.join(AUDIT, d, "pages.json")))
    .map((d) => fs.readFileSync(path.join(AUDIT, d, "pages.json"), "utf8"));
  for (const m of tr.moves) {
    const units = m.carriedFrom?.units ?? m.units ?? NaN;
    const nav = ((m.invested ?? NaN) / units).toFixed(4);
    ok(`${m.date} entry NAV ${nav} ${m.carriedFrom ? "(as bought, before the switch) " : ""}is printed — ${tag}`,
      texts.some((x) => x.includes(nav)));
  }
}

console.log("\n── and the family's own review agrees with the book, not with the old figure ──");
// For a listed fund like Buoyant the review is not a source — it is the book's
// source for private-market lines alone (Stage 10dh). It is here as the independent
// witness it has always been allowed to be: the family's own record of what
// they paid, product by product, cited through the taxonomy map rather than
// typed.
const WB = path.join(ROOT, "source/august-2026-d",
  "Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx");
ok("the family's consolidated review is on disk to check against", fs.existsSync(WB), WB);
if (fs.existsSync(WB)) {
  const wb = XLSX.readFile(WB);
  const products = new Map<string, number>();
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: "" }) as unknown[][];
    const head = (rows[0] ?? []).map((c) => String(c).trim());
    const col = head.findIndex((h) => /^Investment at Cost \(in crores\)$/i.test(h));
    if (col < 0) continue;
    for (const r of rows.slice(1)) {
      const product = String(r[0] ?? "").replace(/\s+/g, " ").trim();
      if (product && typeof r[col] === "number" && !products.has(product)) products.set(product, r[col] as number);
    }
  }
  const bySecurity = new Map<string, typeof carried>();
  for (const p of carried) bySecurity.set(p.securityKey, [...(bySecurity.get(p.securityKey) ?? []), p]);
  let compared = 0;
  for (const [key, ps] of bySecurity) {
    const product = FAMILY_TAXONOMY[`sec:${key}`]?.reviewProduct ?? null;
    const reviewCr = product ? products.get(product.replace(/\s+/g, " ").trim()) : undefined;
    ok(`the review carries ${product ?? key} at a cost`, reviewCr !== undefined, product ?? "no citation");
    if (reviewCr === undefined) continue;
    compared++;
    const review = reviewCr * 1e7;
    const book = ps.reduce((t, p) => t + (p.costBasis ?? 0), 0);
    const printed = ps.reduce((t, p) => t + (p.printedCostBasis ?? 0), 0);
    near(`the book's carried cost = the family's own Investment at Cost — ${product}`, book, review, 1);
    ok(`...and the statement's restated cost does NOT — ${product}`, Math.abs(printed - review) > 1e7,
      `₹${Math.round(printed).toLocaleString("en-IN")} vs ₹${Math.round(review).toLocaleString("en-IN")}`);
  }
  ok("the review was actually compared against", compared > 0, `${compared} product(s)`);
}

console.log(fails ? `\n${fails} check(s) FAILED` : "\nall carried-cost checks passed");
process.exit(fails ? 1 : 0);
