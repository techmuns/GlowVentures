// SINGLE-SCHEME ACCOUNT STATEMENTS — the AIF and mutual-fund folios the client's
// August 2026 drop introduced, and which nothing here could read.
//
// ₹123.55 Cr OF THE FAMILY'S MONEY WAS OUTSIDE THE BOOK. Eight documents came in
// classified but with `no-extractor`, so they contributed nothing while the
// coverage table named them. Four of them carry a valuation:
//
//   Buoyant Opportunities Strategy — Cat III, Class A4   Ajay    ₹49.30 Cr
//   Helios Flexi Cap Fund — Direct Growth                Ajay    ₹31.00 Cr
//   Motilal Oswal Founders Fund Series II — Class G1     Ajay    ₹21.83 Cr
//   Motilal Oswal Active Momentum Fund — Direct Growth   Ankita  ₹21.42 Cr
//
// ── ONE READER, SIX DECLARED LAYOUTS ────────────────────────────────────────
//
// These share a shape — one investor, one scheme, a summary row and a
// transaction ledger — and share no layout beyond it. Rather than six files for six
// near-identical jobs, each layout declares the header text that identifies it
// and the columns it prints, in the order they appear. A document matching no
// layout is NOT guessed at: it returns null and stays in the coverage report as
// unread, which is the same outcome it has today and an honest one.
//
// ── WHAT IS A PRIMITIVE HERE ────────────────────────────────────────────────
//
// UNITS and NAV. Every one of these statements prints a valuation too, and on
// all four it equals units × NAV to the rupee — so the printed figure is kept in
// `printed.marketValue` as the CHECK it is, and the book uses the derived one.
// That is the same rule the appraisals follow, and it is what makes the
// reconciler able to say these documents are internally consistent rather than
// simply assumed to be.
//
// ── AND TWO STATEMENTS THAT VALUE NOTHING ───────────────────────────────────
//
// **India SME Investments Fund II** (three folios, one per member) prints a
// commitment, the contributions drawn against it and the units those bought —
// and NO NAV and NO valuation, on any of the three. Contributions are not a
// market value: carrying ₹8.1 Cr of drawn capital as if it were what the stake
// is worth would be inventing a valuation the fund has not published. So the
// holding is carried with its units and its cost, its market value stays NULL,
// and the undrawn commitment goes to the commitment register beside Transition
// Venture's — which is exactly where a drawdown fund's uncalled capital belongs.
//
// **Sky Capital Rising Titans Fund I** is a Category I AIF (Angel Fund) with a
// drawdown structure and NO valuation of any kind — see its layout below.
//
// **3P India Equity Fund 1** prints three classes, all standing at 0.000 units
// and ₹0.000. That is a MEASURED ZERO and it keeps its zero.
//
// AND WHERE THE UNITS WENT *IS* ON THIS STATEMENT — page 2, all along. This
// paragraph read "where the units went is not on this statement and is not
// guessed at" while the fund's own `Financial Transaction(s)` table printed the
// whole history: six Subscriptions totalling ₹28.50 Cr, B1 and B2 reclassified
// into B3 on 31-03-2026, and B3 a `Full Units Redemption` on 31-07-2026 for
// ₹31,05,82,835.17 — the exact figure on the ICICI payment advice this book
// already carries and already refuses to attribute on a file name alone. The
// family reported the fund "missing" from the transactions page; it was missing
// because the reader took only the ACCOUNT SUMMARY and never the table beneath
// it. An absence declared against a premise nobody rechecked, for the sixth
// time in this book — see `flowsFrom` below for what it takes to read it.
import { parseNum } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals, makeCashFlow } from "../lib/document.mjs";
import { toIso, trimPersonName } from "../lib/classify.mjs";
import { panHolderType } from "../../../shared/owners.mjs";

export const PROVIDERS = {
  buoyant: "Buoyant Capital",
  helios: "Helios Mutual Fund",
  founders: "Motilal Oswal Founders Fund",
  activeMomentum: "Motilal Oswal Active Momentum Fund",
  threeP: "3P Investment Managers",
  indiaSme: "India SME Investments",
  skyCapital: "Sky Capital Rising Titans Fund",
  neoInfra: "Neo Infra Income Opportunities Fund",
  baringPe: "Baring Private Equity India Fund",
  amritkaal: "Carnelian Bharat Amritkaal Fund",
  delphi: "Motilal Oswal Delphi Equity Fund",
  hedgedEquity: "Motilal Oswal Hedged Equity Multi Factor Strategy",
};

const warn = (warnings, code, detail) => warnings.push({ code, detail });
const n = (s) => parseNum(s);
const isNumLocal = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Every layout this reader claims, each identified by text only its own issuer
 * prints.
 *
 * `match` is deliberately the FUND'S OWN NAME rather than the letterhead: four
 * of these arrive on Motilal Oswal stationery because Motilal Oswal is the
 * DISTRIBUTOR or the depository participant, not the manager. Filing Buoyant's
 * Category III AIF under Motilal Oswal would put two different managers' money
 * in one account — the same mistake as reading WhiteOak's disclosure as a
 * 360 ONE client report, one layer down.
 */
// ── 3P'S `Financial Transaction(s)` TABLE ───────────────────────────────────
//
// The one dated record in this reader, and the only place in the corpus that
// says what happened to ₹28.50 Cr of the family's money. It is read under FOUR
// checks the statement itself supplies, and it emits NOTHING unless all four
// pass — the same licence `hdfcNsdl.mjs` needs to publish a figure read off a
// rendered page. A dated table nobody can check is worse than no dated table:
// the tape a reader acts on is the one they cannot verify by opening the PDF.
//
//   1. gross − setup expense − stamp duty = the printed `Amount Invested`,
//      TO THE PAISA, on every subscription. A running balance has no per-row
//      charge to be net of, so this is also what says the amount column is a
//      MOVEMENT — see `netAmount` in `lib/document.mjs`.
//   2. |amount| = |units| × NAV, within the precision the statement PRINTS
//      those two to (units 3dp, NAV 4dp). Reproduced, never a tolerance widened
//      until it fits.
//   3. the running unit total reproduces the printed `Balance Units` on every
//      row of every class, which is what ties the redemption's 20,53,614.026 to
//      the four subscriptions and two reclassifications that built it.
//   4. `Reclassification In` and `Reclassification Out` NET TO ZERO IN RUPEES —
//      and DELIBERATELY NOT IN UNITS, which is a premise this check refuted on
//      its first run. 12,48,630.217 units left B1 and B2 and 12,85,998.281
//      arrived in B3: a gain of 37,368.064, because each side is struck at its
//      own class NAV (142.7354 and 143.7190 out, 138.8041 in — B3 carries a
//      0.70% management fee against B1's 1.00% and B2's 1.20%, so the same
//      money buys more of it). The MONEY is the invariant; the unit counts are
//      each verified against their own NAV by check 2.
//   5. and page 3's own `Reclassification` table is an INDEPENDENT WITNESS to
//      that: it prints the three balances as at 31 March and the single
//      20,53,614.026 with effect from 1 April, a gain of exactly the same
//      37,368.064. Where that line is printed it must equal the running balance
//      check 3 reaches from the transaction table, which is two separately
//      printed tables agreeing rather than one table agreeing with itself.
//
// CHECK 4 IS WHY A RECLASSIFICATION IS NOT A CAPITAL MOVE. B1 and B2 were
// folded into B3 on 31-03-2026: ₹17.85 Cr left two classes and the same
// ₹17.85 Cr arrived in a third, on one day, inside one folio. No money moved.
// Carried as a withdrawal and a contribution it would put ₹17.85 Cr of
// fictitious money out and back into this family's dated record — so it gets
// its own `kind`, is archived because it is what the statement prints, and is
// deliberately outside `CAPITAL_KINDS` in `build-book.mjs`.
const P3_MONEY = String.raw`(?:-|\(?[\d,]+(?:\.\d+)?\)?)`;
const P3_CLASS = /^(3P\s+India\s+Equity\s+Fund\s+\d+\s*-\s*Class\s+[A-Z]\d?)\s*$/i;
const P3_ROW = new RegExp(
  String.raw`^(\d{2}-\d{2}-\d{4})\s+` +                         // 1 date
  String.raw`(Subscription|Reclassification\s+(?:In|Out)|` +
  String.raw`(?:Full|Partial)\s+Units?\s+Redemption|Redemption)\s+` +  // 2 type, DECLARED
  String.raw`(${P3_MONEY})\s+` +                                // 3 contribution amount
  String.raw`(${P3_MONEY})\s+` +                                // 4 setup expense incl GST
  String.raw`(${P3_MONEY})\s+` +                                // 5 stamp duty
  String.raw`(${P3_MONEY})\s+` +                                // 6 amount invested / redemption
  String.raw`([\d,]+\.\d+)\s+` +                                // 7 post-tax allotment NAV
  String.raw`(${P3_MONEY})\s+` +                                // 8 no. of units
  String.raw`([\d,]+\.\d+)$`,                                   // 9 balance units
  "i",
);
/** A dated line under a class heading that the declared types do not cover. */
const P3_DATED = /^\d{2}-\d{2}-\d{4}\s+\S/;
/** Page 3's Reclassification table — the independent witness of check 5. */
const P3_EFFECTIVE = /With Effect From\s+\d{1,2}\s+\w+\s+\d{4}\s+([\d,]+\.\d+)\s+([A-Z]\d?)\b/gi;
/** The date the classes merged, as the transaction rows themselves print it. */
const RECLASS_ASOF = (rows) =>
  rows.filter((r) => /^Reclassification/i.test(r.type)).map((r) => r.date).sort().at(-1) ?? "9999-12-31";
const p3n = (v) => (v == null || String(v).trim() === "-" ? null : parseNum(v));

/** Exported for `__tests__/altFund.test.mjs`, which mutates a synthetic
 *  statement to prove each of the five checks above can actually fail. */
export function threePFlows(text, warn) {
  const rows = [];
  let cls = null;
  let unmatched = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const head = P3_CLASS.exec(line);
    if (head) { cls = head[1].replace(/\s+/g, " ").trim(); continue; }
    if (!cls) continue;
    const m = P3_ROW.exec(line);
    if (!m) { if (P3_DATED.test(line)) unmatched += 1; continue; }
    rows.push({
      cls, date: toIso(m[1].replace(/-/g, "/")), type: m[2].replace(/\s+/g, " ").trim(),
      gross: p3n(m[3]), setup: p3n(m[4]), stamp: p3n(m[5]),
      net: p3n(m[6]), nav: p3n(m[7]), units: p3n(m[8]), balance: p3n(m[9]),
    });
  }
  if (!rows.length) return [];
  // A DATED ROW THIS READER DOES NOT RECOGNISE IS NAMED, NEVER DROPPED. The
  // transaction types are declared rather than matched loosely, so a fund event
  // this book has not met — a switch, a distribution — fails to match instead of
  // being filed under whichever type it happens to resemble. That is only safe
  // if the miss is reported.
  if (unmatched) {
    warn("transaction-type-not-declared",
      `${unmatched} dated row(s) in the Financial Transaction(s) table carry a transaction type this reader does `
      + "not declare; the dated record is withheld rather than published with rows missing from it");
    return [];
  }

  const fails = [];
  const money = (v) => Math.round((v ?? 0) * 100) / 100;
  for (const r of rows) {
    if (r.net === null || r.nav === null || r.units === null) {
      fails.push(`${r.date} ${r.type} (${r.cls}) does not print an amount, a NAV and a unit count`);
      continue;
    }
    // (1) the row's own arithmetic, on the rows that carry a gross figure.
    if (r.gross !== null) {
      const derived = money(r.gross - (r.setup ?? 0) - (r.stamp ?? 0));
      if (Math.abs(derived - money(r.net)) > 0.01) {
        fails.push(`${r.date} ${r.type}: ${r.gross} less charges is ${derived}, against a printed ${r.net}`);
      }
    }
    // (2) amount = units x NAV, to the precision the statement prints them to.
    //     Half of the last decimal of each, carried through its own multiplier —
    //     the statement's own printing precision reproduced, never widened.
    const bound = Math.abs(r.units) * 5e-5 + r.nav * 5e-4;
    if (Math.abs(Math.abs(r.net) - Math.abs(r.units) * r.nav) > bound + 0.01) {
      fails.push(`${r.date} ${r.type}: ${r.units} units at ${r.nav} is not the printed ${r.net}`);
    }
  }
  // (3) the running unit total reproduces the printed Balance Units, per class.
  for (const cls of [...new Set(rows.map((r) => r.cls))]) {
    let run = 0;
    for (const r of rows.filter((x) => x.cls === cls)) {
      run = Math.round((run + (r.units ?? 0)) * 1e3) / 1e3;
      if (r.balance !== null && Math.abs(run - r.balance) > 0.0005) {
        fails.push(`${cls}: after ${r.date} the units run to ${run} against a printed balance of ${r.balance}`);
      }
    }
  }
  // (4) the reclassifications net to zero IN RUPEES. Never in units — each side
  //     is struck at its own class NAV, so a transfer that moves no money
  //     legitimately changes the unit count. Check 2 is what holds each side to
  //     its own NAV.
  const recl = rows.filter((r) => /^Reclassification/i.test(r.type));
  if (recl.length) {
    const dRs = money(recl.reduce((t, r) => t + (r.net ?? 0), 0));
    if (Math.abs(dRs) > 0.01) {
      fails.push(`the reclassifications net to ${dRs} rather than to nothing, `
        + "so they are not a transfer between classes of one folio");
    }
    // (5) the statement's OWN Reclassification table, printed on another page,
    //     against the balance the transaction table runs to. Two separately
    //     printed tables agreeing is evidence; one table agreeing with itself is
    //     not — this book's own rule about a check that compares a figure with
    //     its own copy.
    for (const w of text.matchAll(P3_EFFECTIVE)) {
      const units = parseNum(w[1]);
      const sub = w[2].toUpperCase();
      const forClass = rows.filter((r) => new RegExp(`Class\\s+${sub}$`, "i").test(r.cls));
      if (!forClass.length || units === null) continue;
      const run = Math.round(forClass.reduce((t, r) => t + (r.units ?? 0), 0) * 1e3) / 1e3;
      // The transaction table runs on to the redemption; the reclassification
      // table is drawn the day the classes merged. So the witness is the balance
      // AT THAT DATE — the running total up to and including the last
      // reclassification row — rather than the closing one.
      const upTo = forClass.filter((r) => r.date <= RECLASS_ASOF(forClass));
      const at = Math.round(upTo.reduce((t, r) => t + (r.units ?? 0), 0) * 1e3) / 1e3;
      if (Math.abs(at - units) > 0.0005 && Math.abs(run - units) > 0.0005) {
        fails.push(`the Reclassification table prints ${units} unit(s) in Class ${sub} with effect from the `
          + `merge, against ${at} run from the transaction table`);
      }
    }
  }

  if (fails.length) {
    warn("dated-table-does-not-tie",
      "the Financial Transaction(s) table is not published for this account: " + fails.join("; "));
    return [];
  }

  return rows.map((r) => makeCashFlow({
    date: r.date,
    // WHAT THE STATEMENT CALLED IT, never our word for it — the label reaches
    // the family's own transactions table verbatim.
    description: r.type,
    security: r.cls,
    kind: /^Reclassification/i.test(r.type) ? "reclassification"
      : /Redemption/i.test(r.type) ? "withdrawal"
      : "contribution",
    // The GROSS is what left the bank; the net is what bought units after the
    // fund's own charges. A redemption and a reclassification print no gross
    // column at all, so the amount is the figure in the Amount Invested /
    // Redemption column — SIGNED AS THE STATEMENT PRINTS IT, parenthesised
    // negatives included, because the archive is the faithful record and
    // `capitalMovesFrom` takes the magnitude it needs for itself.
    amount: r.gross ?? r.net,
    netAmount: r.gross === null ? null : r.net,
    units: r.units,
    // The printed running unit balance — carried as the CHECK it is.
    balance: r.balance,
    notes: `post-tax allotment/redemption NAV ${r.nav}`,
  }));
}

// ── BUOYANT AND NEO INFRA: THE UNIT TABLES A FIFO RETURN NEEDS ───────────────
//
// *"match the number of units being sold and purchased, and use the methodology
// of FIFO to calculate returns."* Two statements in this drop print exactly the
// dated unit record that takes, and nothing read it — which is why two of the
// book's returns were wrong in ways no figure on screen could reveal:
//
//   BUOYANT prints every allotment and redemption per CLASS, and the A1 → A4
//   switch as a "Unit Redemption" beside a same-day "Units Allotment" for the
//   same rupees. Its own Cost column restamps the switched units at the switch
//   NAV, so the book carried Ajay's folio at ₹47.54 Cr of cost against the
//   ₹46.00 Cr the family actually paid in — and a +3.71% return where the fund's
//   own fact sheet says +7.17%.
//
//   NEO INFRA prints a Capital Redemption of 14,162.80 units for ₹14,16,280 on
//   5 Jan 2026. The book carried the Gross Capital Contribution — ₹5,00,00,000,
//   the cost of 5,00,000 units — against the 4,85,837 still held. A cost that
//   includes units the family no longer owns is the failure FIFO exists to stop.
//
// Both readers follow `threePFlows`' licence: the dated table is published only
// if the statement's own arithmetic witnesses it, and a dated row of a type
// neither declares withholds the WHOLE table rather than publishing it with a
// row missing.

/** `01/06/2026 Units Allotment 139.1284 17,96,901.6155 25,00,00,000.00` */
const BY_ROW = /^(\d{2}\/\d{2}\/\d{4})\s+(Cash Deposits|Units Allotment|Unit Redemption|Gain Distr\.)\s+(.*)$/i;
const BY_DATED = /^\d{2}\/\d{2}\/\d{4}\s+\S/;
const BY_UNIT_ROW = /^([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d{2})$/;
const BY_CASH_ROW = /^([\d,]+\.\d{2})$/;
/** `Transactions : BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III - CLASS A4` */
const BY_CLASS = /^Transactions\s*:\s*BUOYANT OPPORTUNITIES STRATEGY.*CLASS\s+([A-Z]\d?)\s*$/i;
const BY_OTHER = /^Transactions\s*:\s*Other Liabilities and Assets\s*$/i;
const BY_DEPOSITS = /^Date\s+Transactions\s+Amount\s*\(INR\)\s*$/i;
/** The class the ACCOUNT SUMMARY prints, with its own unit balance. */
const BY_SUMMARY = /BUOYANT OPPORTUNITIES\s+\d{2}\/\d{2}\/\d{4}\s+([\d,]+\.\d+)\s+[\d,]+\.\d+\s+[\d,]+\.\d+\s+[\d,]+\.\d+[\s\S]{0,120}?CLASS\s+([A-Z]\d?)/i;
const byClassName = (k) => `Buoyant Opportunities Strategy — Category III — Class ${k}`;
/** Half of the last decimal a unit count is printed to — the book's own tie. */
const UNIT_TIE_FLOWS = 0.0005;

/**
 * Buoyant's dated record: the cash the family deposited, every unit allotted
 * and redeemed per class, and any gain the fund distributed.
 *
 * A CLASS SWITCH IS DECLARED AS ONE, never inferred later. A redemption whose
 * proceeds buy a same-day allotment in another class for the same rupees (±₹1,
 * the book's settlement tolerance — Ankita's pair differs by six paise) is
 * emitted as two `reclassification` rows, the kind 3P's merge already uses, so
 * the book's FIFO carries the lots across rather than booking a sale. Check 3
 * below is what licenses that reading: the deposits tie ONLY when the switched
 * rupees are taken out of the allotments.
 *
 * Exported for `__tests__/altFund.test.mjs`.
 */
export function buoyantFlows(text, warn) {
  const rows = [];
  let section = null;          // null · "deposits" · "A1" · "A4" · "other"
  let unmatched = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^Note:/i.test(line)) break;
    if (BY_DEPOSITS.test(line)) { section = "deposits"; continue; }
    const cls = BY_CLASS.exec(line);
    if (cls) { section = cls[1].toUpperCase(); continue; }
    if (BY_OTHER.test(line)) { section = "other"; continue; }
    if (!section || !BY_DATED.test(line)) continue;
    const m = BY_ROW.exec(line);
    if (!m) { unmatched += 1; continue; }
    const type = m[2].replace(/\s+/g, " ").trim();
    const date = toIso(m[1]);
    if (/^Cash Deposits$/i.test(type)) {
      const c = BY_CASH_ROW.exec(m[3].trim());
      if (!c || section !== "deposits") { unmatched += 1; continue; }
      rows.push({ date, type, cls: null, amount: n(c[1]) });
      continue;
    }
    const u = BY_UNIT_ROW.exec(m[3].trim());
    if (!u) { unmatched += 1; continue; }
    const isGain = /^Gain Distr/i.test(type);
    if (isGain !== (section === "other")) { unmatched += 1; continue; }
    rows.push({ date, type, cls: isGain ? null : section, nav: n(u[1]), units: n(u[2]), amount: n(u[3]) });
  }
  if (!rows.length) return [];
  if (unmatched) {
    warn("transaction-type-not-declared",
      `${unmatched} dated row(s) in the account statement's transaction tables carry a type or a shape this reader `
      + "does not declare; the dated record is withheld rather than published with rows missing from it");
    return [];
  }

  const fails = [];
  const money = (v) => Math.round((v ?? 0) * 100) / 100;
  const units = rows.filter((r) => r.units != null);
  // (1) amount = units × NAV, to the precision each is printed to (NAV 4dp, units 4dp).
  for (const r of units) {
    const bound = r.units * 5e-5 + r.nav * 5e-5 + 0.01;
    if (Math.abs(r.units * r.nav - r.amount) > bound) {
      fails.push(`${r.date} ${r.type} (${r.cls ?? "other"}): ${r.units} units at ${r.nav} is not the printed ${r.amount}`);
    }
  }
  // Switch pairing: a redemption and a same-day allotment in ANOTHER class for
  // the same rupees. Each allotment pairs at most once.
  const redemptions = rows.filter((r) => /Redemption/i.test(r.type));
  const allotments = rows.filter((r) => /Allotment/i.test(r.type));
  const pairedIn = new Set();
  const pairs = [];
  for (const out of redemptions) {
    const inRow = allotments.find((a) => !pairedIn.has(a) && a.date === out.date && a.cls !== out.cls
      && Math.abs(a.amount - out.amount) <= 1);
    if (inRow) { pairedIn.add(inRow); pairs.push([out, inRow]); }
  }
  const switchedOut = new Set(pairs.map((p) => p[0]));
  // (2) every class runs to the balance the Account Summary prints for it, and a
  //     class the summary does not list runs to zero — the fund lists what is held.
  const held = new Map();
  for (const m of text.matchAll(new RegExp(BY_SUMMARY.source, "gi"))) held.set(m[2].toUpperCase(), n(m[1]));
  if (!held.size) fails.push("the Account Summary prints no class with a unit balance to run the table against");
  for (const cls of new Set(units.filter((r) => r.cls).map((r) => r.cls))) {
    const run = units.filter((r) => r.cls === cls)
      .reduce((t, r) => t + (/Redemption/i.test(r.type) ? -r.units : r.units), 0);
    const want = held.get(cls) ?? 0;
    if (Math.abs(run - want) > UNIT_TIE_FLOWS) fails.push(`Class ${cls} runs to ${money(run * 1e2) / 1e2} units against ${want} printed`);
  }
  // (3) the family's cash in = what bought units, less what a switch or a
  //     distribution bought. The tolerance is the ₹1 each switch is paired to.
  const deposits = money(rows.filter((r) => r.cls === null && /Deposit/i.test(r.type)).reduce((t, r) => t + r.amount, 0));
  const bought = money(allotments.filter((a) => !pairedIn.has(a)).reduce((t, r) => t + r.amount, 0));
  const distributed = money(rows.filter((r) => /Gain Distr/i.test(r.type)).reduce((t, r) => t + r.amount, 0));
  if (Math.abs(bought - distributed - deposits) > pairs.length + 0.01) {
    fails.push(`the cash deposits sum to ${deposits} but the allotments not funded by a switch or a distribution `
      + `sum to ${money(bought - distributed)}`);
  }
  // A redemption that is NOT a switch paid money out — which this statement
  // would print as a withdrawal it does not carry. Not declared, so not read.
  const unpaired = redemptions.filter((r) => !switchedOut.has(r));
  if (unpaired.length) fails.push(`${unpaired.length} redemption(s) fund no same-day allotment in another class`);

  if (fails.length) {
    warn("dated-table-does-not-tie", "the account statement's transaction tables are not published for this account: "
      + fails.join("; "));
    return [];
  }

  return rows.map((r) => {
    const out = /Redemption/i.test(r.type);
    const switched = switchedOut.has(r) || pairedIn.has(r);
    return makeCashFlow({
      date: r.date,
      description: r.type,
      security: r.cls ? byClassName(r.cls) : null,
      kind: /Deposit/i.test(r.type) ? "contribution"
        : switched ? "reclassification"
        : /Gain Distr/i.test(r.type) ? "distribution"
        : "allotment",
      amount: out ? -r.amount : r.amount,
      units: r.units == null ? null : out ? -r.units : r.units,
      notes: r.nav == null ? null : `allotment/redemption NAV ${r.nav}`,
    });
  });
}

/**
 * Neo Infra's capital columns: each drawdown's units and rupees, and the
 * capital redemption. The income columns beside them are distributions of
 * income and are not read here — this is the UNIT record.
 *
 *   `04-Oct-23 Initial Contribution 25,000.00 25,00,000 - - -`
 *   `05-Jan-26 Capital Redemption -14,162.80 -14,16,280 - - -`
 */
const NEO_CAP_ROW = /^(\d{2}-[A-Za-z]{3}-\d{2})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+(?:\.\d{2})?)\s+-\s+-\s+-\s*$/;
const NEO_CAP_WORD = /Contribution|Drawdown|Redemption/i;
const NEO_DATED = /^\d{2}-[A-Za-z]{3}-\d{2}\s+\S/;

export function neoFlows(text, warn) {
  const security = (() => {
    const k = (/Class:\s*([A-Z]\d?)/i.exec(text) ?? [])[1];
    return k ? `Neo Infra Income Opportunities Fund I — Class ${k}` : "Neo Infra Income Opportunities Fund I";
  })();
  const rows = [];
  let unmatched = 0;
  let inTable = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^Transaction Details/i.test(line)) { inTable = true; continue; }
    if (/^Other Transaction Details/i.test(line)) { inTable = false; continue; }
    if (!inTable || !NEO_DATED.test(line)) continue;
    const m = NEO_CAP_ROW.exec(line);
    if (m) {
      rows.push({ date: toIso(m[1]), type: m[2].replace(/\s+/g, " ").trim(), units: n(m[3]), amount: n(m[4]) });
      continue;
    }
    // An income row prints dashes in the capital columns. A dated row naming
    // capital that did not parse is a row this reader would otherwise drop.
    if (NEO_CAP_WORD.test(line)) unmatched += 1;
  }
  if (!rows.length) return [];
  if (unmatched) {
    warn("transaction-type-not-declared",
      `${unmatched} dated capital row(s) in Transaction Details did not match the declared columns; `
      + "the unit record is withheld rather than published with rows missing from it");
    return [];
  }
  const fails = [];
  const at = (re, i) => { const m = re.exec(text); return m ? n(m[i]) : null; };
  const face = at(NEO_ROWS.undrawn, 3);
  // (1) every capital row is its units at face value, to the rupee.
  if (!(face > 0)) fails.push("the statement prints no face value to hold the unit rows to");
  else for (const r of rows) {
    if (Math.abs(r.units * face - r.amount) > 1) fails.push(`${r.date} ${r.type}: ${r.units} units at ${face} is not ${r.amount}`);
  }
  // (2) the units run to the balance the Investment Summary prints (a whole
  //     number there, so the tie is half a unit).
  const printedUnits = at(NEO_ROWS.pending, 3);
  const run = rows.reduce((t, r) => t + r.units, 0);
  if (printedUnits == null || Math.abs(run - printedUnits) > 0.5) fails.push(`the unit rows run to ${run} against ${printedUnits} printed`);
  // (3) contributions tie to Gross Capital Contribution; redemptions to Principal Payout.
  const gross = at(NEO_ROWS.contribution, 1);
  const principal = at(NEO_ROWS.capital, 2);
  const paidIn = rows.filter((r) => r.amount > 0).reduce((t, r) => t + r.amount, 0);
  const paidOut = -rows.filter((r) => r.amount < 0).reduce((t, r) => t + r.amount, 0);
  if (gross == null || Math.abs(paidIn - gross) > 1) fails.push(`contributions sum to ${paidIn} against a Gross Capital Contribution of ${gross}`);
  if (principal == null || Math.abs(paidOut - principal) > 1) fails.push(`redemptions sum to ${paidOut} against a Principal Payout of ${principal}`);
  if (fails.length) {
    warn("dated-table-does-not-tie", "the Transaction Details capital columns are not published for this account: " + fails.join("; "));
    return [];
  }
  return rows.map((r) => makeCashFlow({
    date: r.date,
    description: r.type,
    security,
    kind: r.amount < 0 ? "withdrawal" : "contribution",
    amount: r.amount,
    // ONE LINE, ITS OWN NET: the fund paid the stamp duty (its own disclaimer),
    // so the rupees on the row are what bought the units — a self-contained row
    // in `capitalMovesFrom`'s sense, never a running balance.
    netAmount: r.amount > 0 ? r.amount : null,
    units: r.units,
    notes: face ? `units at face value ${face}` : null,
  }));
}

// ── THE CAPITAL CALL SCHEDULE — WHAT A DRAWDOWN FUND ASKED FOR, AND WHEN ─────
//
// *"What is capital committed versus invested? … I would commit 10 crores, but
//  I may have only invested so far 5 crores, and 5 crores is remaining to be
//  drawn."* and *"is there something which is due in the next one month, three
//  months, six months?"* — the family, on the Private Market page.
//
// Both questions needed a fact this reader was throwing away. Every drawdown
// statement in this corpus prints its calls DATED, one row each, with the
// fund's own total under them — and nothing read past the summary block, so a
// register of ₹97.73 Cr of commitments carried four numbers and not one date.
// That is an absence recorded against a premise nobody rechecked, and the
// second (after 3P's redemption on page 2) where the missing table was on a
// page this reader had already opened.
//
// ── COMMITTED, CALLED AND CONTRIBUTED ARE THREE FIGURES, NOT TWO ────────────
//
// The statements supply the vocabulary themselves, and Baring prints the whole
// identity as labelled algebra on one block:
//
//     Capital Commitment    A                  what the family PROMISED
//     Capital Call          B                  what the fund has DEMANDED
//     Capital Contribution  C                  what the family has PAID
//     Pending Contribution  D = B − C          called and not yet paid — DUE NOW
//     Undrawn Capital       G = A − B + E      not yet called (E recallable)
//
// Motilal Oswal prints the same five under its own names (`Called Capital (B)`,
// `Uncalled Capital (A)-(B)`, `Received Capital (C)`, `Outstanding Capital
// (B)-(C)`), and Carnelian prints `Capital Called` beside `Amount Contributed`.
//
// `commitment.contributed` USED TO CARRY WHICHEVER OF B AND C ITS LAYOUT
// HAPPENED TO MATCH, and the two are not the same quantity: Carnelian's reader
// took B (15,00,00,000.00) where India SME's, Baring's and Neo Infra's took C.
// On this drop the gap is ₹2,925.10 — Carnelian's contributed runs ABOVE its
// called, being fund income reinvested — so nothing on screen was visibly
// wrong, which is exactly the condition under which one field quietly means two
// things for a drop and a half. `called` and `contributed` are separate now,
// each filled ONLY from the line its own statement labels, and null where a
// statement prints one and not the other.
//
// ── A DATED TABLE IS PUBLISHED ONLY IF THE STATEMENT'S OWN TOTAL AGREES ─────
//
// `callsIfTheyTie` is the whole licence for any of this reaching a screen. A
// dated tape a reader acts on is the one they cannot check by opening the PDF,
// so the rows are emitted only where they reproduce the figure the statement
// itself prints for them, to the rupee — the gate `threePFlows` runs four of
// and `hdfcNsdl.mjs` needs before it may publish anything read off a rendered
// page. On a mismatch NOTHING is emitted and the reason is warned: a schedule
// one call short understates what the family has paid and looks on screen
// exactly like a complete one.

/**
 * Dated call rows, published only where they reproduce their own printed total.
 *
 * @param calls  {date,label,amount}[] read off the statement's dated table
 * @param total  the figure the SAME statement prints for those rows
 * @param what   what that printed figure is called, for the warning
 */
function callsIfTheyTie(calls, total, what, warn) {
  const rows = calls.filter((c) => c.date && isNumLocal(c.amount));
  if (!rows.length) return [];
  if (total == null) {
    // Nothing to check against. The rows may be perfect and there is no way to
    // say so, and this book does not publish a dated figure on that footing.
    warn?.("capital-calls-unchecked",
      `${rows.length} dated capital calls were read and this statement prints no ${what} to reconcile them against; they are not carried`);
    return [];
  }
  const sum = Math.round(rows.reduce((t, c) => t + c.amount, 0) * 100) / 100;
  if (Math.abs(sum - total) > 1) {
    warn?.("capital-calls-do-not-tie",
      `${rows.length} dated capital calls sum to ${sum} against a printed ${what} of ${total}; none is carried, because a schedule short a call understates what the family has paid and looks exactly like a complete one`);
    return [];
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Every match of `re` over `text`, mapped to a call row by the caller.
 *
 * The mapping is the CALLER's because no two of these tables print their
 * columns in the same order, and a shared positional reader over six layouts is
 * the "match on the column index" failure `lib/table.mjs` exists to refuse.
 */
const callRows = (text, re, map) => [...text.matchAll(re)].map(map);

const LAYOUTS = [
  {
    key: "buoyant",
    engagement: "AIF",
    providerEngagement: "Category III AIF - the statement titles the class CATEGORY III",
    provider: PROVIDERS.buoyant,
    match: /Buoyant\s+Opportunities\s+Strategy/i,
    assetClass: "AIF",
    /**
     * `BUOYANT OPPORTUNITIES 31/07/2026 34,16,657.4167 47,53,53,990.90 144.2878
     *  49,29,81,982.01 3.71 24.80` — the scheme name wraps across three lines
     * around the figures, so the row is matched on the FIGURES and the name is
     * taken from the summary heading rather than reassembled from the wrap.
     */
    row: new RegExp(
      String.raw`(\d{2}\/\d{2}\/\d{4})\s+` +      // 1 NAV date
      String.raw`([\d,]+\.\d+)\s+` +              // 2 units
      String.raw`([\d,]+\.\d+)\s+` +              // 3 cost
      String.raw`([\d,]+\.\d+)\s+` +              // 4 NAV
      String.raw`([\d,]+\.\d+)\s+` +              // 5 value
      String.raw`(-?[\d,]+\.\d+)\s+` +            // 6 absolute %
      String.raw`(-?[\d,]+\.\d+)`,                // 7 annualised %
    ),
    read: (m) => ({
      navDate: toIso(m[1]), quantity: n(m[2]), totalCost: n(m[3]),
      marketPrice: n(m[4]), printedValue: n(m[5]),
      absoluteYieldPct: n(m[6]), annualizedYieldPct: n(m[7]),
    }),
    security: (text) => (/CLASS\s+([A-Z]\d?)/i.exec(text)
      ? `Buoyant Opportunities Strategy — Category III — Class ${/CLASS\s+([A-Z]\d?)/i.exec(text)[1]}`
      : "Buoyant Opportunities Strategy — Category III"),
    account: (text) => FIELD(text, "Account", String.raw`(\d{4,})`),
    folio: (text) => FIELD(text, "Folio", String.raw`([A-Z0-9]{4,})`),
    asOf: (text) => toIso((/As of\s+(\d{2}\/\d{2}\/\d{4})/i.exec(text) ?? [])[1]),
    // `Account : 103473 AJAY THAKURDAS JAISINGHANI` — the holder is on the
    // title line, after the account number and with no label of its own.
    holder: (text) => (/Account\s*:\s*\d{4,}\s+([A-Z][A-Z\s]{6,44}?)\s*(?:\n|Buoyant)/i.exec(text) ?? [])[1],
    // The dated unit record, switches declared — see `buoyantFlows`.
    flowsFrom: buoyantFlows,
  },
  {
    key: "founders",
    engagement: "AIF",
    providerEngagement: "Category II AIF - drawdown, with a commitment and called capital",
    provider: PROVIDERS.founders,
    match: /Motilal\s+Oswal\s+Founders\s+Fund/i,
    assetClass: "AIF",
    /** `CLASS G1 31-07-2026 11.5502 1,88,95,852.360 20,00,00,000.00 20,00,00,000.00 21,82,50,873.93` */
    row: new RegExp(
      String.raw`CLASS\s+([A-Z]\d?)\s+` +          // 1 class
      String.raw`(\d{2}-\d{2}-\d{4})\s+` +         // 2 NAV date
      String.raw`([\d,]+\.\d+)\s+` +               // 3 post-tax NAV
      String.raw`([\d,]+\.\d+)\s+` +               // 4 units
      String.raw`([\d,]+\.\d+)\s+` +               // 5 commitment
      String.raw`([\d,]+\.\d+)\s+` +               // 6 contribution
      String.raw`([\d,]+\.\d+)`,                   // 7 valuation
    ),
    read: (m) => ({
      klass: m[1], navDate: toIso(m[2]), marketPrice: n(m[3]), quantity: n(m[4]),
      commitment: n(m[5]), totalCost: n(m[6]), printedValue: n(m[7]),
    }),
    security: (_t, r) => `Motilal Oswal Founders Fund Series II — Class ${r.klass}`,
    account: (text) => FIELD(text, "Account No", String.raw`(\d{6,})`),
    asOf: (text) => toIso((/As on\s*:?\s*(\d{2}\s+\w{3}\s+\d{4})/i.exec(text) ?? [])[1]),
    holder: (text) => FIELD(text, "Name"),
    // THE NAV IS POST-TAX AND THE STATEMENT SAYS WHAT THAT MEANS: tax on
    // realised gains only, nothing for unrealised. Recorded rather than
    // adjusted — we do not know the unrealised position or the rate.
    capitalFrom: moCapitalFrom,
    note: "the NAV on this statement is POST-TAX on REALISED gains only; the fund states that tax on unrealised gains is not in it and appears only in the redemption NAV",
  },
  {
    key: "activeMomentum",
    engagement: "Direct",
    providerEngagement: "mutual-fund folio, Direct Plan as the statement states",
    provider: PROVIDERS.activeMomentum,
    match: /Active\s+Momentum\s+Fund/i,
    assetClass: "Mutual Fund",
    /** `Motilal Oswal Active Momentum Fund - Direct Plan Growth Option 1,52,45,765.959 21,42,00,000.00 14.0491 21,41,89,290.53` */
    row: new RegExp(
      String.raw`(Motilal\s+Oswal\s+Active\s+Momentum\s+Fund[^\n]*?)\s+` +  // 1 scheme
      String.raw`([\d,]+\.\d+)\s+` +               // 2 units
      String.raw`([\d,]+\.\d+)\s+` +               // 3 cost
      String.raw`([\d,]+\.\d+)\s+` +               // 4 NAV
      String.raw`([\d,]+\.\d+)`,                   // 5 value
    ),
    read: (m) => ({
      scheme: m[1].trim(), quantity: n(m[2]), totalCost: n(m[3]),
      marketPrice: n(m[4]), printedValue: n(m[5]),
    }),
    security: (_t, r) => r.scheme,
    folio: (text) => FIELD(text, "FOLIO", String.raw`(\d{6,})`),
    asOf: (text) => toIso((/Portfolio Summary as on\s+(\d{2}\/\d{2}\/\d{4})/i.exec(text) ?? [])[1]),
    holder: (text) => FIELD(text, "Name"),
  },
  {
    key: "helios",
    engagement: "Direct",
    providerEngagement: "mutual-fund folio, Direct plan as the statement states",
    provider: PROVIDERS.helios,
    match: /HELIOS\s+MUTUAL\s+FUND|Helios\s+Flexi\s+Cap/i,
    assetClass: "Mutual Fund",
    /**
     * `Helios Flexi Cap Fund - Direct Lump sum 06-Aug-2026 16.21 19,123,041.380
     *  310,000,000.00 309,984,500.77` — the scheme name wraps ("Growth" lands on
     * the next line), so the row is matched from the NAV DATE onward and the
     * scheme is named from the ISIN line, which does not wrap.
     */
    row: new RegExp(
      String.raw`(\d{2}-\w{3}-\d{4})\s+` +         // 1 NAV date
      String.raw`([\d,]+\.\d+)\s+` +               // 2 NAV
      String.raw`([\d,]+\.\d+)\s+` +               // 3 units
      String.raw`([\d,]+\.\d+)\s+` +               // 4 cost
      String.raw`([\d,]+\.\d+)`,                   // 5 market value
    ),
    read: (m) => ({
      navDate: toIso(m[1]), marketPrice: n(m[2]), quantity: n(m[3]),
      totalCost: n(m[4]), printedValue: n(m[5]),
    }),
    security: (text) => {
      const m = /\/\s*(Helios[^\n]*?)\s*-\s*(INF[0-9A-Z]{9})/i.exec(text);
      return m ? m[1].replace(/\s*\*\s*/g, " ").replace(/\s+/g, " ").trim() : "Helios Flexi Cap Fund - Direct Growth";
    },
    isin: (text) => (/(INF[0-9A-Z]{9})/.exec(text) ?? [])[1] ?? null,
    folio: (text) => (/Folio No\.?\s*:\s*(\d+)\s*\/\s*(\d+)/i.exec(text) ?? [])[1] ?? null,
    asOf: (text) => toIso((/Account Summary as on\s+(\d{2}-\w{3}-\d{4})/i.exec(text) ?? [])[1]),
    // CAMS prints the holder on its own line, immediately before the address,
    // with `Joint Holder 2 :` trailing it on the same printed row.
    holder: (text) => (/\n\s*([A-Z][A-Za-z]+(?:\s+[A-Z]\.?[A-Za-z]*){1,3})\s+Joint Holder 2/i.exec(text) ?? [])[1],
  },
  {
    key: "threeP",
    engagement: "AIF",
    providerEngagement: "Category III AIF - unit classes B1/B2/B3",
    provider: PROVIDERS.threeP,
    match: /3P\s+India\s+Equity\s+Fund/i,
    assetClass: "AIF",
    /**
     * `3P India Equity Fund 1 - Class B1 169.2210 155.2142 - 0.000 0.000` —
     * pre-tax NAV, post-tax NAV, pledged units, free units, current value.
     * ALL THREE CLASSES stand at zero: every one was reclassified out on
     * 31-03-2026 and the fund prints the zero explicitly. `allRows` because a
     * position that has gone to nil is still a position this book should show.
     */
    allRows: true,
    row: new RegExp(
      String.raw`(3P\s+India\s+Equity\s+Fund\s+\d+\s*-\s*Class\s+[A-Z]\d?)\s+` +  // 1 scheme+class
      String.raw`([\d,]+\.\d+)\s+` +               // 2 pre-tax NAV
      String.raw`([\d,]+\.\d+)\s+` +               // 3 post-tax NAV
      String.raw`(-|[\d,]+\.\d+)\s+` +             // 4 pledged units
      String.raw`([\d,]+\.\d+)\s+` +               // 5 free units
      String.raw`([\d,]+\.\d+)`,                   // 6 current value
      "g",
    ),
    read: (m) => ({
      scheme: m[1].replace(/\s+/g, " ").trim(), marketPrice: n(m[2]),
      postTaxNav: n(m[3]), quantity: n(m[5]), printedValue: n(m[6]),
    }),
    security: (_t, r) => r.scheme,
    folio: (text) => (/Folio No\.?\s*:\s*(\d{4,})/i.exec(text) ?? [])[1] ?? null,
    asOf: (text) => toIso((/Account Summary as on\s+(\d{2}-\d{2}-\d{4})/i.exec(text) ?? [])[1]),
    // `AJAY JAISINGHANI Mode of Holding : SINGLE` — the holder shares its
    // printed line with the next label, so it is cut at that label.
    holder: (text) => (/\n\s*([A-Z][A-Z\s]{6,44}?)\s+Mode of Holding/i.exec(text) ?? [])[1],
    flowsFrom: threePFlows,
    note: "every class on this statement stands at zero units, and the statement's own Financial Transaction(s) table says why: B1 and B2 were reclassified into B3 on 31-03-2026, and B3 was a Full Units Redemption on 31-07-2026 for 31,05,82,835.17. The zero is measured and the account is closed",
  },
  {
    key: "indiaSme",
    engagement: "AIF",
    providerEngagement: "Category II AIF - drawdown, with a commitment and uncalled capital",
    provider: PROVIDERS.indiaSme,
    match: /India\s+SME\s+Investments\s+Fund/i,
    assetClass: "AIF",
    /**
     * THIS STATEMENT VALUES NOTHING. It prints the commitment, what has been
     * drawn against it, and the units that bought — and no NAV and no valuation
     * anywhere on the page. The units are read, the drawn capital is read as
     * COST, and market value stays null. Carrying contributions as a value
     * would publish a valuation the fund never struck.
     */
    valuesNothing: true,
    row: new RegExp(String.raw`Total\s+([\d,]+)\s+([\d,]+)\s+\(([\d,]+)\)\s+([\d,]+)`),
    read: (m) => ({
      totalCost: n(m[1]), deemedIncome: n(m[2]), tds: -Math.abs(n(m[3]) ?? 0), quantity: n(m[4]),
    }),
    security: (text) => {
      const k = (/Class of Unit\s*:\s*([A-Z]\d?)/i.exec(text) ?? [])[1];
      return k ? `India SME Investments Fund II — Class ${k}` : "India SME Investments Fund II";
    },
    folio: (text) => FIELD(text, "Folio Number", String.raw`(\d{4,})`),
    holder: (text) => FIELD(text, "Investor Name"),
    asOf: (text) => toIso((/Statement of Account as on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i.exec(text) ?? [])[1]),
    commitmentFrom: (text) => ({
      committed: n((/Commitment Amount\s*\(a\)\s*:\s*INR\s*([\d,]+)/i.exec(text) ?? [])[1]),
      drawn: n((/Cumulative Contribution\s*\(b\)\s*:\s*INR\s*([\d,]+)/i.exec(text) ?? [])[1]),
      undrawn: n((/Undrawn Amount[^:]*:\s*INR\s*([\d,]+)/i.exec(text) ?? [])[1]),
    }),
    /**
     * `Undrawn Amount (c) = a - b` is this fund's OWN algebra, and it leaves no
     * room between called and contributed: the uncalled balance is struck on
     * the contribution, so on this statement B and C are the same figure and
     * both are reported as that one line. Saying so explicitly is what stops
     * the page printing a `—` for Called against a fund that has told us.
     *
     * The dated table is one row per ORDINAL contribution (`First`, `Second`,
     * …) and the fund prints its own `Total` under it, which is the gate. The
     * `Deemed Capital Gain` rows in the same table are deliberately not calls:
     * they carry no contribution amount, and the fund's own Total excludes
     * them, so a reader that swept every dated row would fail the tie.
     */
    capitalFrom: (text, warn) => {
      const paid = n((/Cumulative Contribution\s*\(b\)\s*:\s*INR\s*([\d,]+)/i.exec(text) ?? [])[1]);
      return {
        called: paid,
        paid,
        calls: callsIfTheyTie(
          callRows(text, /(\d{2}\/\d{2}\/\d{4})\s+\d{4}-\d{4}\s+([A-Z][a-z]+)\s+Contribution\s+([\d,]+)/g,
            (m) => ({ date: toIso(m[1]), label: `${m[2]} Contribution`, amount: n(m[3]) })),
          paid, "Cumulative Contribution", warn),
      };
    },
    note: "this statement carries NO NAV and NO valuation — only the commitment, the capital drawn against it and the units that bought. Market value is null rather than the contributions, which are what was paid and not what it is worth",
  },
  {
    key: "skyCapital",
    engagement: "AIF",
    providerEngagement: "Category I Alternative Investment Fund – Angel Fund",
    provider: PROVIDERS.skyCapital,
    /**
     * THE FUND'S OWN NAME, AGAIN, AND THIS ONE PROVES THE RULE TWICE OVER.
     *
     * These statements print `HDFC Bank Ltd` in the investor's bank block and
     * `Motilal Oswal Financial Servies Ltd` as the DEPOSITORY PARTICIPANT — and
     * the classifier duly filed two folios under HDFC and two under Motilal
     * Oswal before this rule existed. Neither house issued them; Sky Impact
     * Capital Advisors LLP does, for Sky Capital Rising Titans Fund I.
     */
    match: /Sky\s+Capital\s+Rising\s+Titans\s+Fund/i,
    assetClass: "AIF",
    /**
     * ANOTHER STATEMENT THAT VALUES NOTHING. An angel fund holding unlisted
     * startups strikes no periodic NAV, and this one prints none: commitment,
     * drawdowns, units and face value, and not one valuation figure anywhere on
     * either page. Units and cost are read; market value stays null.
     */
    valuesNothing: true,
    /**
     * ONE HOLDING PER SERIES, NOT PER ALLOTMENT AND NOT PER FOLIO.
     *
     * The statement prints one line per ALLOTMENT — Bharat's folio has four
     * Hudle lines and one TED line — and each line names the series, its class
     * and its own ISIN. Per allotment would put five rows on one folio for one
     * position; per folio would merge two different startups into one row, and
     * merge them differently again across folios, because SKY022, SKY023 and
     * SKY024 all hold the SAME Oncare series and should share a securityKey
     * while Bharat's Hudle and TED must not.
     *
     * COST IS DERIVED, NOT INVENTED. Every unit is issued at the face value the
     * row prints (₹1,000), so a series' cost is its units × that face value —
     * and `verify` ties the sum of them to the printed Total Drawdown on every
     * folio. Two printed columns and a printed total, not an allocation nobody
     * published.
     */
    rowsFrom: (text) => {
      const bySeries = new Map();
      for (const m of text.matchAll(ALLOTMENT)) {
        const [, scheme, unitClass, series, isin, faceRaw, unitsRaw] = m;
        const e = bySeries.get(series) ?? {
          scheme: scheme.trim(), unitClass, series, isin,
          face: n(faceRaw), quantity: 0, allotments: 0,
        };
        e.quantity += n(unitsRaw) ?? 0;
        e.allotments += 1;
        bySeries.set(series, e);
      }
      return [...bySeries.values()].map((e) => ({
        ...e,
        totalCost: e.face == null ? null : Math.round(e.quantity * e.face * 100) / 100,
      }));
    },
    read: (r) => r,
    security: (_text, r) => `Sky Capital Rising Titans Fund — ${r.scheme} — Class ${r.series}`,
    folio: (text) => (/Folio No\.?\s*([A-Z]{2,4}\d{3,})/i.exec(text) ?? [])[1] ?? null,
    /**
     * The holder is on its own `Name` line, and the anchor is LOAD-BEARING.
     *
     * `\bName` matches the "Name" inside `Fund Name Sky Capital Rising Titans
     * Fund I` two lines above it, so every folio came back owned by the fund
     * itself. The two trusts survived it — `resolveOwner` tries the PAN before
     * any name — and Bharat's folio did not, because his PAN is deliberately
     * withheld from the registry (it is a document password), leaving the name
     * as the only evidence and the name wrong. A fallback masked the bug on
     * three folios out of four.
     *
     * `^Name` at a line start matches only the investor block: `Fund Name`,
     * `Bank Name` and `DP Name` are all preceded by their own word, and the
     * NOMINEE's `Name` line comes after the investor's, so the first match is
     * the holder. For two of these folios that holder is a TRUST; `investor()`
     * takes it verbatim on a trust PAN — see the note there.
     */
    holder: (text) => (/^Name\s+([^\n]{3,60})/m.exec(text) ?? [])[1]?.trim() ?? null,
    asOf: (text) => toIso((/\bDate\s+([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/.exec(text) ?? [])[1]),
    commitmentFrom: (text) => ({
      committed: n((/Total Capital Contribution Commitment\s+₹?\s*([\d,]+)/i.exec(text) ?? [])[1]),
      drawn: n((/Total Drawdown\s+₹?\s*([\d,]+)/i.exec(text) ?? [])[1]),
      /**
       * `Uncalled Commitment NIL` is a MEASURED ZERO — the fund stating that
       * nothing more will be called — and it keeps its zero. `parseNum("NIL")`
       * is null, which would read as "not reported" and put this fund's dry
       * powder beyond measurement when the statement measured it at nothing.
       */
      undrawn: /Uncalled Commitment\s+NIL\b/i.test(text)
        ? 0
        : n((/Uncalled Commitment\s+₹?\s*([\d,]+)/i.exec(text) ?? [])[1]),
    }),
    /**
     * The one statement here that dates BOTH sides. `Drawdown Details` is one
     * row per call with its own date, under a printed `Total Drawdown`; the
     * block above it dates each COMMITMENT the family added (an angel fund
     * takes a fresh commitment per startup), under `Total Capital Contribution
     * Commitment`. Only the drawdowns are calls — a commitment is a promise,
     * not a demand — so the sweep is CUT to the drawdown table.
     *
     * That cut is load-bearing rather than tidy: both blocks print the same
     * `₹ <amount> <date>` shape, so a sweep over the whole page would read the
     * commitment rows as calls. It is a SLICE and not a filter, which has a
     * consequence worth naming — without the `Drawdown Details` anchor the
     * reader finds no rows at all rather than the wrong ones. That is the safe
     * failure and it would be a SILENT one, because `callsIfTheyTie` cannot
     * tell "no table on this statement" from "the table moved". So the anchor
     * is checked explicitly against the total: a statement that prints a
     * `Total Drawdown` and yields no rows has a table this reader can no longer
     * find, and says so.
     *
     * (This comment first claimed the gate would catch a merged sweep. The test
     * that exists to prove that refuted it — the slice never produces the
     * merged rows to be caught — which is the point of writing the mutation
     * rather than reasoning about it.)
     *
     * A drawdown this fund has allotted units against has been PAID, which its
     * own `Uncalled Commitment NIL` line confirms, so called and contributed
     * are the one printed total.
     */
    capitalFrom: (text, warn) => {
      const paid = n((/Total Drawdown\s+₹?\s*([\d,]+)/i.exec(text) ?? [])[1]);
      const block = (/Drawdown Details([\s\S]*?)Total Drawdown/i.exec(text) ?? [])[1] ?? "";
      const rows = callRows(block, /₹\s*([\d,]+)\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/g,
        (m) => ({ date: toIso(m[2]), label: "Drawdown", amount: n(m[1]) }));
      if (!rows.length && paid != null) {
        warn?.("drawdown-table-not-found",
          `this statement prints a Total Drawdown of ${paid} and no dated rows under a "Drawdown Details" heading; the table is there on every issue of this layout, so it has moved rather than gone`);
      }
      return { called: paid, paid, calls: callsIfTheyTie(rows, paid, "Total Drawdown", warn) };
    },
    /** Per-series cost must reconstruct the drawdown the statement prints. */
    verify: (text, holdings, warn) => {
      const drawn = n((/Total Drawdown\s+₹?\s*([\d,]+)/i.exec(text) ?? [])[1]);
      const derived = holdings.reduce((t, h) => t + (h.totalCost ?? 0), 0);
      if (drawn != null && Math.abs(derived - drawn) > 1) {
        warn("cost-does-not-tie-to-drawdown",
          `per-series cost (units × face value) sums to ${derived} against a printed Total Drawdown of ${drawn}; the cost on these rows is derived and no longer reconciles`);
      }
      const printedUnits = n((/\bTotal\s+([\d,]+\.\d{5})/.exec(text) ?? [])[1]);
      const derivedUnits = holdings.reduce((t, h) => t + (h.quantity ?? 0), 0);
      if (printedUnits != null && Math.abs(derivedUnits - printedUnits) > 0.00001) {
        warn("units-do-not-tie",
          `allotment rows sum to ${derivedUnits} units against a printed Total of ${printedUnits}`);
      }
    },
    note: "an angel fund holding unlisted startups: this statement prints the commitment, the drawdowns against it, the units they bought and their face value, and NO NAV and NO valuation. Market value is null rather than the capital drawn, which is what was paid and not what it is worth",
  },
  {
    key: "neoInfra",
    engagement: "AIF",
    providerEngagement: "drawdown fund — the statement prints a capital commitment, dated drawdowns and a quarterly NAV",
    provider: PROVIDERS.neoInfra,
    match: /Neo\s+Infra\s+Income\s+Opportunities\s+Fund/i,
    /**
     * AIF by LEGAL FORM, which is the axis `assetClass` answers. The family's
     * consolidated review files this fund under **Debt → High Yield Fund**,
     * which is its EXPOSURE, and the two are different questions: `isFundVehicle`
     * has to keep treating it as a wrapper so it stays out of every
     * company-level view. The review's classification is recorded in the warning
     * below rather than overwriting the legal one.
     */
    assetClass: "AIF",
    /**
     * THIS FUND VALUES ITSELF, and it prints the valuation rather than a price
     * that reproduces it. 4,85,837 units at the printed NAV of ₹114.24 derive
     * ₹5,55,02,019 against a printed valuation of ₹5,54,98,303.25 — ₹3,716
     * apart, which is more than a two-decimal NAV can explain (±₹2,429 on this
     * unit count). The valuation is the fund's own primitive and is taken as the
     * market value; the NAV is carried as a CHECK and named in a warning,
     * exactly as 360 ONE's AIF units are.
     */
    rowsFrom: (text) => {
      const at = (re, i) => { const m = re.exec(text); return m ? n(m[i]) : null; };
      const units = at(NEO_ROWS.pending, 3);
      const valuation = at(NEO_ROWS.contribution, 3);
      if (units == null && valuation == null) return [];
      return [{
        quantity: units,
        printedValue: valuation,
        totalCost: at(NEO_ROWS.contribution, 1),
        nav: at(NEO_ROWS.capital, 3),
        faceValue: at(NEO_ROWS.undrawn, 3),
      }];
    },
    read: (r) => r,
    security: (text) => {
      const k = (/Class:\s*([A-Z]\d?)/i.exec(text) ?? [])[1];
      return k ? `Neo Infra Income Opportunities Fund I — Class ${k}` : "Neo Infra Income Opportunities Fund I";
    },
    folio: (text) => (/Folio No:\s*(\d{4,})/i.exec(text) ?? [])[1] ?? null,
    holder: (text) => (/Statement of Account As of:[^\n]*\n\s*([A-Z][^\n]{2,60})/.exec(text) ?? [])[1]?.trim() ?? null,
    /**
     * THE AS-OF IS THE VALUATION DATE, NOT THE STATEMENT DATE. The header reads
     * "As of: 31 Jul-26" and the note under it says the NAV and valuation are as
     * of 30-Jun-2026 and are struck quarterly. `asOf` governs what the figure is
     * worth, so it takes the date the figure was struck — and a contribution
     * made after it is, in the fund's own words, not in the valuation.
     */
    asOf: (text) => toIso((/NAV\/unit and Valuation is as of\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i.exec(text) ?? [])[1])
      ?? toIso((/Statement of Account As of:\s*(\d{1,2}\s*[A-Za-z]{3}-\d{2,4})/i.exec(text) ?? [])[1]),
    // The capital columns of Transaction Details — every drawdown's units and the
    // capital redemption that took 14,162.80 of them back. See `neoFlows`.
    flowsFrom: neoFlows,
    commitmentFrom: (text) => {
      const at = (re, i) => { const m = re.exec(text); return m ? n(m[i]) : null; };
      return {
        committed: at(NEO_ROWS.capital, 1),
        drawn: at(NEO_ROWS.contribution, 1),
        undrawn: at(NEO_ROWS.undrawn, 1),
        distributed: at(NEO_ROWS.pending, 2),
      };
    },
    /**
     * `Pending Drawdown ₹ 0 (0%)` IS THE CALLED-BUT-UNPAID LINE — this fund's
     * own name for Baring's `Pending Contribution D = B - C`, and a MEASURED
     * zero rather than an absent one: the statement prints the figure and the
     * percentage of commitment beside it.
     *
     * So called = contributed + pending, derived from two figures this
     * statement prints under their own labels rather than assumed equal. Today
     * pending is nil and the two coincide; on the day a call goes unpaid they
     * will not, and that is the whole reason this page separates them.
     */
    capitalFrom: (text, warn) => {
      const at = (re, i) => { const m = re.exec(text); return m ? n(m[i]) : null; };
      const paid = at(NEO_ROWS.contribution, 1);
      const pending = at(NEO_ROWS.pending, 1);
      return {
        called: paid != null && pending != null ? paid + pending : null,
        paid,
        pending,
        calls: callsIfTheyTie(
          callRows(text, /(\d{2}-[A-Za-z]{3}-\d{2})\s+((?:Initial|First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth)\s+(?:Contribution|Drawdown))\s+[\d,]+\.\d{2}\s+([\d,]+)/g,
            (m) => ({ date: toIso(m[1]), label: m[2], amount: n(m[3]) })),
          paid, "Gross Capital Contribution", warn),
      };
    },
    verify: (text, holdings, warn) => {
      const at = (re, i) => { const m = re.exec(text); return m ? n(m[i]) : null; };
      const committed = at(NEO_ROWS.capital, 1), drawn = at(NEO_ROWS.contribution, 1), undrawn = at(NEO_ROWS.undrawn, 1);
      if ([committed, drawn, undrawn].every((v) => v != null) && Math.abs(committed - drawn - undrawn) > 1) {
        warn("commitment-does-not-tie",
          `commitment ${committed} less drawn ${drawn} is not the printed undrawn ${undrawn}`);
      }
      const h = holdings[0];
      const nav = at(NEO_ROWS.capital, 3);
      if (h && nav != null && isNumLocal(h.quantity) && isNumLocal(h.printed?.marketValue)) {
        const derived = Math.round(h.quantity * nav * 100) / 100;
        const delta = Math.round((derived - h.printed.marketValue) * 100) / 100;
        if (Math.abs(delta) > Math.max(1, h.quantity * 0.005)) {
          warn("nav-does-not-reproduce-valuation",
            `${h.quantity} units at the printed NAV of ${nav} derive ${derived} against a printed valuation of ${h.printed.marketValue} (${delta}). The valuation is used; the NAV is not a price this reader can multiply.`);
        }
      }
    },
    note: "the fund's own quarterly valuation is the primitive: market value is the printed Valuation (Net), not units x the printed NAV, which does not reproduce it. The family's consolidated review classifies this fund under Debt / High Yield Fund — its EXPOSURE, where `assetClass` records its legal form",
  },
  {
    key: "baringPe",
    engagement: "AIF",
    providerEngagement: "Category II AIF — drawdown private equity fund",
    provider: PROVIDERS.baringPe,
    match: /Baring\s+Private\s+Equity\s+India\s+Fund/i,
    assetClass: "AIF",
    /**
     * A DRAWDOWN PE FUND THAT STRIKES ITS OWN NAV, so unlike Sky Capital and
     * India SME this one HAS a value: 202.50 units at ₹93,047.9444.
     *
     * The statement lays its commitment block out as labelled algebra —
     * `Capital Commitment A`, `Capital Contribution C`, `Undrawn Capital
     * G = A - B + E` — and each figure is read off its OWN label rather than by
     * position, so a row inserted between them cannot shift a column.
     */
    rowsFrom: (text) => {
      const units = n((/Balance Units I = H \/ Face Value\s*-\s*([\d,]+\.?\d*)/i.exec(text) ?? [])[1]);
      const nav = n((/NAV per unit\s*-\s*([\d,]+\.\d+)/i.exec(text) ?? [])[1]);
      if (units == null && nav == null) return [];
      return [{
        quantity: units,
        marketPrice: nav,
        totalCost: n((/Capital Contribution C\s+([\d,]+)/i.exec(text) ?? [])[1]),
        isin: (/Class\s+[A-Z]\d?\s*\/\s*(INF[A-Z0-9]{9})/i.exec(text) ?? [])[1] ?? null,
      }];
    },
    read: (r) => r,
    security: (text) => {
      const k = (/Class of Units\s*\/[\s\S]{0,40}?Class\s+([A-Z]\d?)\s*\//i.exec(text) ?? [])[1];
      return k ? `Baring Private Equity India Fund 6 — Class ${k}` : "Baring Private Equity India Fund 6";
    },
    folio: (text) => (/Folio\s*#\s*([A-Za-z0-9_]+)\s*:/i.exec(text) ?? [])[1] ?? null,
    holder: (text) => (/Folio\s*#\s*[A-Za-z0-9_]+\s*:\s*([^\n]+)/i.exec(text) ?? [])[1]?.trim() ?? null,
    asOf: (text) => toIso((/Statement of Account as on\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i.exec(text) ?? [])[1]),
    commitmentFrom: (text) => ({
      committed: n((/Capital Commitment A\s+([\d,]+)/i.exec(text) ?? [])[1]),
      drawn: n((/Capital Contribution C\s+([\d,]+)/i.exec(text) ?? [])[1]),
      undrawn: n((/Undrawn Capital G[^\n]*?\s([\d,]+)\s/i.exec(text) ?? [])[1]),
    }),
    /**
     * THE STATEMENT THAT SUPPLIES THE VOCABULARY. It prints B, C and D = B − C
     * under their own labels, so this is the one folio where called, paid and
     * pending are three separately measured figures rather than one figure
     * reported three ways. Today D is a dash — nothing called is unpaid — and
     * that dash is read as NULL and not as a measured nil, because the column
     * carries `-` for "not applicable" in the two rows above it as well.
     *
     * `DRAWDOWN n` prints TWO dates: the call and the allotment. The FIRST is
     * the call date and the one carried; the second is when units were issued
     * against it, which is not when the money was asked for.
     */
    capitalFrom: (text, warn) => ({
      called: n((/Capital Call B\s+([\d,]+)/i.exec(text) ?? [])[1]),
      paid: n((/Capital Contribution C\s+([\d,]+)/i.exec(text) ?? [])[1]),
      pending: n((/Pending Contribution D = B - C\s+([\d,]+)/i.exec(text) ?? [])[1]),
      calls: callsIfTheyTie(
        callRows(text, /DRAWDOWN\s+(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+[\d,]+\s+[\d.,]+\s+([\d,]+)/g,
          (m) => ({ date: toIso(m[2]), label: `Drawdown ${m[1]}`, amount: n(m[3]) })),
        n((/Capital Call B\s+([\d,]+)/i.exec(text) ?? [])[1]), "Capital Call B", warn),
    }),
    /** The statement's own algebra: A − B + E = G, with B = C where nothing is pending. */
    verify: (text, holdings, warn) => {
      const a = n((/Capital Commitment A\s+([\d,]+)/i.exec(text) ?? [])[1]);
      const c = n((/Capital Contribution C\s+([\d,]+)/i.exec(text) ?? [])[1]);
      const g = n((/Undrawn Capital G[^\n]*?\s([\d,]+)\s/i.exec(text) ?? [])[1]);
      if ([a, c, g].every((v) => v != null) && Math.abs(a - c - g) > 1) {
        warn("commitment-does-not-tie", `commitment ${a} less contribution ${c} is not the printed undrawn ${g}`);
      }
    },
    note: "the family's consolidated review files this fund under Alternate / PE Funds — its EXPOSURE, where `assetClass` records its legal form as a Category II AIF",
  },
  {
    key: "amritkaal",
    engagement: "AIF",
    providerEngagement: "Category III AIF Scheme",
    provider: PROVIDERS.amritkaal,
    /**
     * A DIFFERENT VEHICLE FROM THE CARNELIAN PMS MANDATE, and the classifier has
     * to test this name before `CARNELIAN ASSET MANAGEMENT` or the fund lands in
     * the discretionary account. Same manager, same family member, two products.
     */
    match: /CARNELIAN\s+BHARAT\s+AMRITKAAL\s+FUND/i,
    assetClass: "AIF",
    rowsFrom: (text) => {
      const units = n((/Closing Unit Balance\s*:[\s\S]{0,200}?\n\s*([\d,]+\.\d+)/i.exec(text) ?? [])[1]);
      const nav = n((/Pre tax NAV\s*:\s*([\d,]+\.\d+)/i.exec(text) ?? [])[1]);
      if (units == null && nav == null) return [];
      return [{
        quantity: units,
        marketPrice: nav,
        // AMOUNT CONTRIBUTED, not the capital called: they differ by ₹2,925.10
        // of mutual-fund income the scheme reinvested, and the contributed
        // figure is what the units actually cost.
        totalCost: n((/Capital Commitment \(INR\)[\s\S]{0,140}?\n\s*[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})/i.exec(text) ?? [])[1]),
        printedValue: n((/Closing Value\s*:\s*([\d,]+\.\d+)/i.exec(text) ?? [])[1]),
      }];
    },
    read: (r) => r,
    security: "Carnelian Bharat Amritkaal Fund",
    folio: (text) => (/Folio No\s*:\s*(\d+)/i.exec(text) ?? [])[1] ?? null,
    /**
     * The holder sits on the line under the Personal Information header, with
     * the NEXT column's label running straight on after it — `ANKITA BHARAT
     * JAISINGHANI Bank Account Details`. Cut at that label, not at whitespace:
     * the flat text collapses runs of spaces, so a `\s{2,}` cut took one letter
     * of "Bank" with the name and produced "ANKITA BHARAT JAISINGHANI B".
     */
    holder: (text) => (/Personal Information Folio No[^\n]*\n\s*([A-Z][A-Z .]*?)(?=\s+(?:Bank|Address|Email|Mobile|Telephone|Joint|Nominee|DP|Client|Distributor)\b|\s*$)/m
      .exec(text) ?? [])[1]?.trim() ?? null,
    /**
     * THE SUMMARY DATE, NOT THE STATEMENT DATE. It is printed 06-Aug-2026 and
     * its closing balance is struck `as on 31-Jul-2026`; `asOf` follows the
     * figure, the same rule NEO's valuation date follows.
     */
    asOf: (text) => toIso((/Summary as on\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i.exec(text) ?? [])[1])
      ?? toIso((/Statement Date\s*:\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i.exec(text) ?? [])[1]),
    commitmentFrom: (text) => ({
      committed: n((/Capital Commitment \(INR\)[\s\S]{0,140}?\n\s*([\d,]+\.\d{2})/i.exec(text) ?? [])[1]),
      drawn: n((/Capital Commitment \(INR\)[\s\S]{0,140}?\n\s*[\d,]+\.\d{2}\s+([\d,]+\.\d{2})/i.exec(text) ?? [])[1]),
      undrawn: n((/Balance Uncalled Capital \(INR\)[\s\S]{0,120}?\n\s*([\d,]+\.\d{2})/i.exec(text) ?? [])[1]),
    }),
    /**
     * THE FOLIO THAT PROVED `contributed` WAS TWO FIELDS. Its header row is
     * `Capital Commitment | Capital Called | Amount Contributed | Net
     * Contribution`, and the third of those runs ₹2,925.10 ABOVE the second —
     * fund income from MF investments reinvested rather than paid out, which
     * the transaction table shows as its own dated row. `commitmentFrom` above
     * takes the SECOND figure, so what this book has always carried under
     * "drawn" for this fund is the CALL and not the cheque.
     *
     * Both are read here under their own labels and neither is preferred: the
     * called figure is what the uncalled balance is struck against, and the
     * contributed figure is what the family has actually put in.
     */
    capitalFrom: (text, warn) => {
      const summary = /Capital Commitment \(INR\)[\s\S]{0,140}?\n\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i.exec(text);
      const called = n(summary?.[2]);
      return {
        called,
        paid: n(summary?.[3]),
        calls: callsIfTheyTie(
          callRows(text, /(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(Contribution Amount|DRAWDOWN Transaction)\s+CLASS\s+\S+\s+-\s+([\d,]+\.\d{2})/gi,
            (m) => ({ date: toIso(m[1]), label: /DRAWDOWN/i.test(m[2]) ? "Drawdown" : "Contribution", amount: n(m[3]) })),
          called, "Capital Called", warn),
      };
    },
    note: "the family's consolidated review files this fund under Equity / Thematic-Tactical — its EXPOSURE, where `assetClass` records its legal form as a Category III AIF. Its units stay whole either way; it is never spread across the sectors it invests in",
  },
  motilalAccountSummary({
    key: "delphi",
    provider: PROVIDERS.delphi,
    match: /Motilal\s+Oswal\s+Wealth\s+Delphi\s+Equity\s+Fund|Delphi\s+Emerging\s+Equity\s+Fund/i,
    security: "Motilal Oswal Wealth Delphi Equity Fund",
    note: "the family's consolidated review carries this holding under the name of what it OWNS — `Fund of Funds (VEC + Carnelian + Girik Cap + Insightful)` — and files it under Equity / Multi Cap. Same units (99,995) and same NAV; its closing value differs by ₹100 only because the review rounds the NAV to two decimals. It is a FUND OF FUNDS, so the family holds V.E.C and Carnelian both directly and through this; nothing is looked through and nothing is counted twice",
  }),
  motilalAccountSummary({
    key: "hedgedEquity",
    provider: PROVIDERS.hedgedEquity,
    match: /Motilal\s+Oswal\s+Hedged\s+Equity\s+Multi\s+Factor/i,
    security: "Motilal Oswal Hedged Equity Multi Factor Strategy",
    note: "both classes are REDEEMED TO NIL: Class B2's units were switched out on 31-07-2024 and Class F1's were paid out on 31-07-2025, and the Account Summary prints a dash for units and for valuation on each. The account is carried with no holding rather than a zero-valued one, and the family's consolidated review — struck 30 June 2026 — does not list this fund at all, which agrees",
  }),
];

/**
 * MOTILAL OSWAL'S ACCOUNT SUMMARY — one table, two funds, and a DASH is not a
 * zero.
 *
 * Both statements print the same block: one row per unit class, reading
 * `Class | NAV Date | Post Tax NAV | Unit | Commitment | Contribution |
 * Valuation`. Delphi's row is complete. The Hedged Equity strategy's is not —
 * its Unit and Valuation columns are `-`, because both of its classes were
 * redeemed to nil and the statement has nothing left to value.
 *
 * A dash is read as NULL, never as 0. The account is then carried with no
 * holding and the reason printed, which is the India SME mechanism: a fund that
 * publishes no valuation does not get one invented, and a redeemed position
 * carried at its CONTRIBUTION with a zero value would book a ₹13 Cr unrealised
 * loss against money the fund has already paid back.
 */
const MO_DASH = String.raw`(?:-|[\d,]+(?:\.\d+)?)`;
const MO_SUMMARY_ROW = new RegExp(
  String.raw`(?:^|\n)\s*(Class\s+[A-Z]\d?|CLASS\s+[A-Z]\d?)\s+` +   // 1 class
  String.raw`(\d{2}-\d{2}-\d{4})\s+` +                                // 2 NAV date
  String.raw`([\d,]+\.\d+)\s+` +                                      // 3 post-tax NAV
  String.raw`(${MO_DASH})\s+` +                                         // 4 units, or "-"
  String.raw`([\d,]+\.\d{2})\s+` +                                    // 5 commitment
  String.raw`([\d,]+\.\d{2})\s+` +                                    // 6 contribution
  String.raw`(${MO_DASH})`,                                             // 7 valuation, or "-"
  "g",
);
const moDash = (v) => (v == null || String(v).trim() === "-" ? null : n(v));

/** One `LAYOUTS` entry for a fund on Motilal Oswal's Account Summary layout. */
/**
 * The Motilal Oswal ACCOUNT SUMMARY family's `Investment Summary` block and its
 * `Transaction Details` table — Founders, Delphi and Hedged Equity.
 *
 * The block is labelled algebra like Baring's, in this house's own words:
 *
 *     Class Details | Commitment Amount (A) | Called Capital (B) |
 *                     Uncalled Capital (A)-(B) | Received Capital (C) |
 *                     Outstanding Capital (B)-(C)
 *
 * SUMMED ACROSS THE CLASSES THE BLOCK PRINTS, because a folio's commitment is
 * per class and the family holds several. `moDash` reads a printed `-` as NULL
 * rather than zero, so a class whose uncalled column is a dash leaves the total
 * null and does not quietly assert the fund has nothing left to call — the same
 * reading the Unit and Valuation columns already get one block up.
 */
function moCapitalFrom(text, warn) {
  const rows = [...text.matchAll(
    /(?:CLASS|Class)\s+([A-Z]\d?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(-|[\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(-|[\d,]+\.\d{2})/g)];
  const tot = (i) => {
    const v = rows.map((m) => moDash(m[i])).filter((x) => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  };
  const called = tot(3);
  /**
   * DELPHI PRINTS NO `Investment Summary` BLOCK AT ALL — only the Account
   * Summary, whose columns are `Commitment | Contribution | Valuation`. So its
   * `called` is genuinely unknown and stays null, and its PAID figure comes off
   * the Contribution column instead. Falling back for `called` as well would
   * assert the fund has called everything it has received, which is true of
   * this folio and is not a thing its statement says.
   */
  const paid = tot(5) ?? (() => {
    const v = [...text.matchAll(/(?:CLASS|Class)\s+[A-Z]\d?\s+\d{2}-\d{2}-\d{4}\s+[\d,]+\.\d+\s+[\d,]+\.\d+\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})/g)]
      .map((m) => n(m[1])).filter((x) => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  })();
  return {
    called,
    paid,
    pending: tot(6),
    /**
     * One row per `Contribution` in the per-class transaction table. Stamp duty
     * and unit-allotment rows share the shape and are NOT calls: the duty is
     * the fund's charge against the money, not a demand for more of it, and the
     * allotment is what the call bought. Both are excluded by name, and the tie
     * against Called Capital is what says the exclusion is right.
     */
    calls: callsIfTheyTie(
      callRows(text, /(\d{2}-\d{2}-\d{4})\s+Contribution(?:\s+Amount)?\s+-\s+-\s+([\d,]+\.\d{2})/g,
        (m) => ({ date: toIso(m[1]), label: "Contribution", amount: n(m[2]) })),
      called ?? paid, called != null ? "Called Capital (B)" : "Contribution", warn),
  };
}

function motilalAccountSummary({ key, provider, match, security, note }) {
  const rows = (text) => [...text.matchAll(MO_SUMMARY_ROW)];
  // A class with neither units nor a valuation is CLOSED and contributes
  // nothing — not a holding, not a commitment. A dash is null, never zero.
  const liveRows = (text) => rows(text).filter((m) => moDash(m[4]) != null || moDash(m[7]) != null);
  return {
    key, provider, match, security,
    engagement: "AIF",
    providerEngagement: "AIF — the statement prints a commitment, a called/received split and a post-tax NAV per class",
    assetClass: "AIF",
    /**
     * `commitmentAmount`, NOT `commitment`. The driver treats a row-level
     * `commitment` as the account's own and overwrites whatever
     * `commitmentFrom` computed — which here would drop the undrawn figure this
     * statement actually states.
     */
    capitalFrom: moCapitalFrom,
    rowsFrom: (text) => liveRows(text)
      .map((m) => ({
        unitClass: m[1].replace(/\s+/g, " ").trim(),
        navDate: toIso(m[2]),
        marketPrice: n(m[3]),
        quantity: moDash(m[4]),
        commitmentAmount: n(m[5]),
        totalCost: n(m[6]),
        printedValue: moDash(m[7]),
      })),
    read: (r) => r,
    /**
     * WHY THE ACCOUNT IS EMPTY, in the statement's own terms. Without this the
     * driver reports `summary-row-not-matched` — "the columns did not line up" —
     * for a document whose columns lined up perfectly and printed a dash in
     * both of them. A wrong diagnosis sends the next reader to fix a regex.
     */
    emptyReason: (text) => {
      const closed = rows(text).map((m) => m[1].trim());
      return closed.length
        ? `every class on this statement (${closed.join(", ")}) prints a dash for Unit and for Valuation — the account is redeemed to nil. It carries no holding rather than a zero-valued one: its contribution against a zero value would book the whole of it as an unrealised loss against money the fund has already paid back.`
        : null;
    },
    folio: (text) => (/Account No\s*:\s*(\d{4,})/i.exec(text) ?? [])[1] ?? null,
    holder: (text) => (/\bName\s*:\s*([A-Z][A-Za-z .]{2,60}?)\s*(?=Bank|Address|$)/m.exec(text) ?? [])[1]?.trim() ?? null,
    /**
     * AS-OF FOLLOWS THE FIGURE: the NAV date the valued row carries, not the
     * "As on" in the header. Delphi is headed 1 Jul 2026 and its class is struck
     * 30-06-2026, which is also the date the family's review works to.
     */
    asOf: (text) => {
      const valued = rows(text).filter((m) => moDash(m[7]) != null).map((m) => toIso(m[2])).filter(Boolean).sort();
      return valued[valued.length - 1]
        ?? toIso((/As on\s*:\s*(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/i.exec(text) ?? [])[1]);
    },
    /**
     * ONLY THE CLASSES THAT STILL HOLD UNITS. Summing every row here would put
     * ₹26.11 Cr of commitment on the Hedged Equity account for ₹13 Cr of real
     * money: its Class F1 was SWITCHED IN from Class B2, so the same
     * contribution is printed twice under two class names. A closed class can
     * call nothing, so it commits nothing.
     */
    commitmentFrom: (text) => {
      const rs = liveRows(text);
      const sum = (i) => { const v = rs.map((m) => n(m[i])).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
      const committed = sum(5), drawn = sum(6);
      return { committed, drawn, undrawn: committed != null && drawn != null ? Math.round((committed - drawn) * 100) / 100 : null };
    },
    verify: (text, holdings, warn) => {
      const closed = rows(text).filter((m) => moDash(m[4]) == null && moDash(m[7]) == null);
      if (closed.length) {
        warn("class-redeemed-to-nil",
          `${closed.map((m) => m[1].trim()).join(", ")} print no units and no valuation — the class holds nothing. Its contribution is NOT carried as a cost against a zero value, which would book the whole of it as a loss against money the fund has already returned.`);
      }
      for (const h of holdings) {
        if (!isNumLocal(h.quantity) || !isNumLocal(h.marketPrice) || !isNumLocal(h.printed?.marketValue)) continue;
        const derived = Math.round(h.quantity * h.marketPrice * 100) / 100;
        if (Math.abs(derived - h.printed.marketValue) > Math.max(1, h.quantity * 0.00005)) {
          warn("valuation-does-not-tie",
            `${h.quantity} units at ${h.marketPrice} derive ${derived} against a printed valuation of ${h.printed.marketValue}`);
        }
      }
    },
    note,
  };
}

/** Local numeric guard — `verify` runs before the document layer is involved. */

/**
 * NEO INFRA's summary block is a THREE-COLUMN GRID: a line of three labels, then
 * a line of the three values under them.
 *
 * Each row is matched with ALL THREE of its labels in order, so a column that
 * moves fails to match instead of quietly handing back its neighbour's figure —
 * the same rule `lib/table.mjs` applies to the statement PDFs, written out by
 * hand because this block is prose-shaped rather than a table.
 */
const NEO_VALUE = String.raw`(?:₹\s*)?(-?[\d,]+(?:\.\d+)?)(?:\s*\(\s*[\d.]+%\s*\))?`;
const neoTrio = (a, b, c) =>
  new RegExp(`${a}\\s+${b}\\s+${c}\\s*\\n\\s*${NEO_VALUE}\\s+${NEO_VALUE}\\s+${NEO_VALUE}`);
const NEO_ROWS = {
  capital: neoTrio("Capital Commitment", "Principal Payout", String.raw`NAV \(Net\)`),
  contribution: neoTrio("Gross Capital Contribution", String.raw`Income Payout \(Gross\)`, String.raw`Valuation \(Net\)`),
  pending: neoTrio("Pending Drawdown", "Total Payout", "Units"),
  undrawn: neoTrio("Undrawn Commitment", "Net Equalisation", "Face Value"),
};

/**
 * One UNIT ALLOTMENT line: scheme, class, series, ISIN, face value, units, date.
 *
 * `\s+` between the scheme and the class deliberately crosses a NEWLINE — where
 * a folio holds one series the fund puts the scheme name on its own line and the
 * figures on the next, and where it holds several they sit on one line each.
 * The en-dash is the character the statement actually prints; the hyphen is
 * allowed because a reissue that changes it should not silently read zero rows.
 */
const ALLOTMENT = new RegExp(
  String.raw`Sky Capital Rising Titans Fund\s*[–-]\s*` +
  String.raw`([A-Za-z][A-Za-z0-9 ]*?)\s+` +      // 1 scheme (the startup)
  String.raw`([A-Z])\s+` +                       // 2 class of unit
  String.raw`([A-Z]\d)\s+` +                     // 3 series
  String.raw`(INF[A-Z0-9]{9})\s+` +              // 4 ISIN
  String.raw`₹?\s*([\d,]+\.\d{2})\s+` +        // 5 face value
  String.raw`([\d,]+\.\d{5})\s+` +             // 6 units
  String.raw`(\d{2}-\d{2}-\d{4})`,              // 7 allotment date
  "g",
);

/**
 * A labelled field, cut at the first token that begins another label.
 *
 * The capture is GREEDY TO END OF LINE and then cut, not lazy. These pages put
 * two columns on one printed line — `Investor Name : Ajay Jaisinghani Branch
 * Address : Imperial Mahal…` — and a lazy `([^\n]{1,80}?)` with nothing
 * anchoring its right edge matches the shortest thing that satisfies the
 * pattern, which is one character. It failed silently on every layout that
 * labels its holder, which is most of them.
 */
const NEXT_LABEL = /\s+(?:Bank|Address|Date|Tel|Mobile|Email|Nominee|POA|Distributor|Joint|Mode|PAN|Status|Folio|Investor|IFSC|MICR|Class|Statement|Other|Branch|Payout|Multiple|CAN|BOID|UMRN|Phone)\b/i;
function FIELD(text, label, pattern = String.raw`([^\n]{1,90})`) {
  const m = new RegExp(label + String.raw`\s*:?\s*` + pattern, "i").exec(text);
  if (!m) return null;
  return String(m[1]).split(NEXT_LABEL)[0].trim() || null;
}

/**
 * The investor, by the name and the PAN the statement prints — both, because
 * the PAN is what settles who a name belongs to.
 *
 * Each issuer labels the holder differently and two of them do not label it at
 * all: Buoyant prints `Account : 103473 AJAY THAKURDAS JAISINGHANI` on the
 * title line, and Helios puts the name on its own line above the address. The
 * labels are tried in order and the bare-line fallback is LAST, so a labelled
 * name always wins over a guess at the layout.
 */
function investor(text, layout) {
  const pan = (/\b([A-Z]{5}\d{4}[A-Z])\b/.exec(text) ?? [])[1] ?? null;
  const labelled = layout?.holder?.(text)
    ?? FIELD(text, "Investor Name") ?? FIELD(text, "Name")
    ?? (/Account\s*:?\s*\d{4,}\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,3})/.exec(text) ?? [])[1]
    ?? (/Folio\s*No\.?\s*:[^\n]*\n(?:[^\n]*\n){0,2}?\s*([A-Z][A-Za-z]+(?:\s+[A-Z]\.?[A-Za-z]*){1,3})\s*(?:Joint|$)/m.exec(text) ?? [])[1]
    ?? null;
  /**
   * A TRUST IS NOT A PERSON, AND `trimPersonName` DOES NOT KNOW THAT.
   *
   * It strips trailing name-ish words, which is right for `Ajay Thakurdas
   * Jaisinghani` and destroys `Bharat Jaisinghani Family Trust 2` — both trusts
   * came back as plain "Bharat Jaisinghani", folding two separate taxpayers into
   * the man they are named after AND into his own folio. Three PANs, one owner,
   * every per-entity total wrong.
   *
   * The statement settles it in a character: the FOURTH letter of a PAN is the
   * holder type the Income Tax Department assigned, `T` for trust and `P` for
   * individual. So a non-individual holder's name is taken VERBATIM. A document
   * printing no PAN keeps the old behaviour exactly, which is every layout that
   * was here before this one. `transitionVenture.mjs` reached the same
   * conclusion for the same two trusts and hard-coded it; this derives it.
   */
  const kind = panHolderType(pan);
  const owner = labelled == null ? null
    : kind && kind !== "individual" ? labelled.trim()
    : trimPersonName(labelled);
  return { owner, pan };
}

/** Which layout is this? Null when none claims it — never a guess. */
export function layoutFor(text) {
  return LAYOUTS.find((l) => l.match.test(text)) ?? null;
}

export function extract({ grid, meta = {} }) {
  const warnings = [];
  // The page text, whitespace-collapsed: every figure this reader wants sits on
  // one printed line, and the layouts are matched on that line's own order.
  const text = (grid?.pages ?? []).map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");
  const layout = layoutFor(text);
  if (!layout) return null;

  const { owner, pan } = investor(text, layout);
  const holdings = [];
  let commitment = null;

  // `rowsFrom` builds the rows itself, for a statement whose holdings are not
  // one regex match each: Sky Capital prints one line per ALLOTMENT and the
  // family holds several in the same series, so the rows are aggregated by
  // series before they become holdings. Everything else keeps the regex path.
  const rows = layout.rowsFrom
    ? layout.rowsFrom(text)
    : layout.allRows
    ? [...text.matchAll(layout.row)]
    : [layout.row.exec(text)].filter(Boolean);

  if (!rows.length) {
    // A layout that KNOWS why it has no rows says so. Everything else falls
    // back to the column diagnosis, which is the only honest answer when the
    // reason is genuinely unknown.
    const reason = layout.emptyReason?.(text) ?? null;
    if (reason) warn(warnings, "account-holds-nothing", reason);
    else {
      warn(warnings, "summary-row-not-matched",
        `this document is a ${layout.provider} statement but its summary row did not match the declared column order; nothing is read from it rather than reading the wrong columns`);
    }
    if (layout.note) warn(warnings, "statement-basis", layout.note);
    return {
      provider: layout.provider, owner, pan,
      accountNo: layout.account?.(text) ?? layout.folio?.(text) ?? null,
      asOf: layout.asOf?.(text) ?? null,
      reportType: "holdings",
      engagement: layout.engagement ?? "unknown",
      providerEngagement: layout.providerEngagement ?? undefined,
      holdings: [], totals: null, commitment: null,
      // A STATEMENT WITH NO HOLDINGS CAN STILL CARRY ITS OWN DATED RECORD, and
      // an account that holds nothing is exactly where that record is the whole
      // of what the document has to say.
      cashFlows: layout.flowsFrom
        ? layout.flowsFrom(text, (code, detail) => warn(warnings, code, detail))
        : [],
      warnings,
      status: reason ? "ok" : undefined,
    };
  }

  for (const m of rows) {
    const r = layout.read(m);
    const security = typeof layout.security === "function" ? layout.security(text, r) : layout.security;
    holdings.push(makeHolding({
      security,
      // A row may carry its own ISIN — Sky Capital prints one per series, and
      // they differ within a folio. The document-level hook stays for the
      // layouts where one ISIN covers the statement.
      isin: r.isin ?? layout.isin?.(text) ?? null,
      assetClass: layout.assetClass,
      quantity: r.quantity ?? null,
      // A fund that publishes no NAV publishes no price. The contributions are
      // carried as COST, which is what they are.
      marketPrice: layout.valuesNothing ? null : r.marketPrice ?? null,
      totalCost: r.totalCost ?? null,
      absoluteYieldPct: r.absoluteYieldPct ?? null,
      annualizedYieldPct: r.annualizedYieldPct ?? null,
      priceAsOn: r.navDate ?? null,
      // makeHolding files the statement's own figures under `printed.*` itself;
      // `marketValue` here is the PRINTED one, and the book uses units × NAV.
      marketValue: layout.valuesNothing ? null : r.printedValue ?? null,
    }));
  }

  // A layout may check its own arithmetic against a figure the statement prints
  // elsewhere. Sky Capital derives each series' cost from units x face value and
  // ties the sum to the printed Total Drawdown; a mismatch is reported, never
  // absorbed.
  if (layout.verify) layout.verify(text, holdings, (code, detail) => warn(warnings, code, detail));

  // A layout may also carry a DATED table. It is separate from `verify` because
  // it produces rows rather than a verdict — and separate from `row`/`rowsFrom`
  // because those build HOLDINGS, which is a snapshot. A statement can hold
  // nothing and still be the only record of how the money got there and left.
  const cashFlows = layout.flowsFrom
    ? layout.flowsFrom(text, (code, detail) => warn(warnings, code, detail))
    : [];

  if (layout.commitmentFrom) {
    const c = layout.commitmentFrom(text);
    if (c.committed) commitment = c;
  }
  if (rows[0] && layout.read(rows[0]).commitment) {
    commitment = { committed: layout.read(rows[0]).commitment, drawn: layout.read(rows[0]).totalCost, undrawn: null };
  }
  /**
   * THE CALLED/CONTRIBUTED SPLIT AND THE DATED CALLS, merged LAST and
   * deliberately never overwriting the four figures above.
   *
   * This runs after both branches because the second of them REPLACES whatever
   * `commitmentFrom` produced (see its own note), so a schedule merged earlier
   * would be dropped on exactly the layouts — Founders and Delphi — that carry
   * one. Merging rather than replacing is also what keeps this change unable to
   * move a figure already in the book: `committed`, `drawn`, `undrawn` and
   * `distributed` come out of this block untouched.
   */
  if (commitment && layout.capitalFrom) {
    commitment = { ...commitment, ...layout.capitalFrom(text, (code, detail) => warn(warnings, code, detail)) };
  }
  if (layout.note) warn(warnings, "statement-basis", layout.note);
  if (layout.valuesNothing) {
    warn(warnings, "no-valuation-published",
      `${layout.provider} publishes no NAV on this statement, so this holding has units and cost and NO market value. It is not counted in the consolidated total.`);
  }

  return {
    provider: layout.provider,
    owner, pan,
    accountNo: layout.account?.(text) ?? layout.folio?.(text) ?? null,
    asOf: layout.asOf?.(text) ?? null,
    // These ARE holdings statements — one scheme, its units and its NAV. Left
    // as `unknown` the docKey reads `…-unknown` and precedence has nothing to
    // key on.
    reportType: "holdings",
    // WHAT THE VEHICLE IS, in the fund's own words. Left unset these accounts
    // came out `engagement: "unknown"` with a null providerEngagement, which
    // section 5 of CLAUDE.md warns is never to be defaulted - and null is not
    // even in the contract, so the typecheck refused the book outright.
    engagement: layout.engagement ?? "unknown",
    providerEngagement: layout.providerEngagement ?? undefined,
    holdings,
    cashFlows,
    // BROWSABLE PROVENANCE, so a reader who sees a redemption on the dashboard
    // can open the rows it was read from. A dated table archived only inside
    // `document.json` is provenance the Data Audit page cannot show.
    sections: cashFlows.length
      ? {
        transactions: {
          name: "transactions",
          rows: [["date", "class", "description", "kind", "amount", "net", "units", "balanceUnits"],
            ...cashFlows.map((c) => [c.date, c.security ?? "", c.description, c.kind,
              c.amount ?? "", c.netAmount ?? "", c.units ?? "", c.balance ?? ""])],
        },
      }
      : undefined,
    commitment,
    totals: makeTotals({
      totalMarketValue: layout.valuesNothing ? null : holdings.reduce((t, h) => t + (h.printed?.marketValue ?? 0), 0) || null,
      totalCost: holdings.reduce((t, h) => t + (h.totalCost ?? 0), 0) || null,
      positionCount: holdings.length,
    }),
    warnings,
  };
}

export const PROVIDER = Object.values(PROVIDERS);
