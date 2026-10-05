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
import { makeHolding, makeTotals, makeCashFlow, makeReturnSeries } from "../lib/document.mjs";
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
  askArf: "ASK Absolute Return Fund",
};

const warn = (warnings, code, detail) => warnings.push({ code, detail });
const n = (s) => parseNum(s);
const isNumLocal = (v) => typeof v === "number" && Number.isFinite(v);
/**
 * WHAT THE VEHICLE IS, in the fund's own words. A layout declares it as a
 * string, or as a function of the statement text where the words are printed
 * on the page and must be READ rather than assumed (Neo Infra's registration).
 */
const engagementOf = (layout, text) =>
  (typeof layout.providerEngagement === "function" ? layout.providerEngagement(text) : layout.providerEngagement) ?? undefined;

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
    // THE CHARGES THE ROW PRINTS — setup expense and stamp duty, the two columns
    // between the gross and the net that check (1) above ties to the paisa. They
    // are the difference between every rupee the family paid (the gross) and
    // what bought units (the net), so a cost struck on what was PAID needs them
    // as the statement prints them rather than as our subtraction. A printed
    // dash is a nil on a row that prints the columns; a redemption and a
    // reclassification print no gross, and carry no charge line at all.
    expenses: r.gross === null ? null : money((r.setup ?? 0) + (r.stamp ?? 0)),
    units: r.units,
    // The printed running unit balance — carried as the CHECK it is.
    balance: r.balance,
    notes: `post-tax allotment/redemption NAV ${r.nav}`,
  }));
}

// ── A MUTUAL-FUND FOLIO'S OWN PURCHASE ROWS (Stage 10cy) ──────────────────────
//
// Helios (CAMS) and Motilal Oswal Active Momentum (KFintech) print each purchase
// as a Gross Purchase, the Stamp Duty taken from it and a dated Net Purchase
// carrying the NAV, the units allotted and the running unit balance. The reader
// took the summary row above them and nothing else, so both funds showed no
// "Invested on" date and no dated record at all while the statement printed it.
//
// FOUR CHECKS, AND A TABLE THAT FAILS ONE IS NOT PUBLISHED:
//   1. gross − stamp duty = the printed net, to the paisa;
//   2. the net = units × NAV, within the precision the two are printed to;
//   3. the running units reproduce the printed Balance Units on every row;
//   4. the last balance is the unit count the Account Summary holds.
// A dated row carrying a figure that is none of the declared types is NAMED and
// withholds the table, because a record with a row missing looks exactly like a
// complete one.
const MF_GROSS = /^(?:(\d{2}\/\d{2}\/\d{4})\s+)?Gross(?:\s+Ongoing)?\s+Purchase\s+([\d,]+\.\d+)$/i;
const MF_STAMP = /^(?:(\d{2}\/\d{2}\/\d{4})\s+)?(?:Less:\s*)?Stamp\s+Duty\s+([\d,]+\.\d+)$/i;
const MF_DATED_FIGURE = /^\d{2}\/\d{2}\/\d{4}\s+.*\d[\d,]*\.\d+/;

/**
 * `net` matches ONE Net Purchase row and returns `{ date, net, nav, units,
 * balance }` from it — the column order is the layout's, so each layout
 * declares its own. `heldUnits` re-reads the Account Summary's unit count, and
 * `security` names the holding exactly as the summary row does, so the dated
 * rows join the position they bought.
 */
export function mfPurchaseFlows({ net, heldUnits, security }) {
  return (text, warn) => {
    const rows = [];
    let pendingGross = null, pendingStamp = null, undeclared = 0;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      let m;
      if ((m = MF_GROSS.exec(line))) { pendingGross = n(m[2]); continue; }
      if ((m = MF_STAMP.exec(line))) { pendingStamp = n(m[2]); continue; }
      const r = net(line);
      if (r) {
        rows.push({ ...r, gross: pendingGross, stamp: pendingStamp });
        pendingGross = null; pendingStamp = null;
        continue;
      }
      if (MF_DATED_FIGURE.test(line)) undeclared += 1;
    }
    if (!rows.length) return [];
    if (undeclared) {
      warn("transaction-type-not-declared",
        `${undeclared} dated row(s) carry a figure and a transaction type this reader does not declare; `
        + "the dated record is withheld rather than published with rows missing from it");
      return [];
    }
    const fails = [];
    const money = (v) => Math.round((v ?? 0) * 100) / 100;
    let run = 0;
    for (const r of rows) {
      if (r.gross !== null && Math.abs(money(r.gross - (r.stamp ?? 0)) - money(r.net)) > 0.01) {
        fails.push(`${r.date}: ${r.gross} less ${r.stamp ?? 0} stamp duty is not the printed ${r.net}`);
      }
      const bound = r.units * 5e-5 + r.nav * 5e-4;
      if (Math.abs(r.net - r.units * r.nav) > bound + 0.01) {
        fails.push(`${r.date}: ${r.units} units at ${r.nav} is not the printed ${r.net}`);
      }
      run = Math.round((run + r.units) * 1e3) / 1e3;
      if (r.balance !== null && Math.abs(run - r.balance) > 0.0005) {
        fails.push(`after ${r.date} the units run to ${run} against a printed balance of ${r.balance}`);
      }
    }
    const held = heldUnits(text);
    if (held === null || Math.abs(run - held) > 0.0005) {
      fails.push(`the purchases allot ${run} units against the ${held ?? "unread"} the Account Summary holds`);
    }
    if (fails.length) {
      warn("dated-table-does-not-tie", "the purchase rows are not published for this folio: " + fails.join("; "));
      return [];
    }
    const name = security(text);
    return rows.map((r) => makeCashFlow({
      date: r.date,
      description: "Purchase",
      security: name,
      kind: "contribution",
      // The GROSS is what left the bank; the net is what bought units after the
      // stamp duty. A row that prints no gross carries its net as the amount.
      amount: r.gross ?? r.net,
      netAmount: r.gross === null ? null : r.net,
      // THE CHARGE THE ROW PRINTS — the Stamp Duty line between the gross and
      // the net, which check (1) above ties to the paisa. It is carried as the
      // statement prints it (VD-24's `expenses`, the field 3P's setup expense
      // and stamp duty ride in), so a cost struck on every rupee PAID reads the
      // printed charge rather than a subtraction of ours. A gross printed with
      // no Stamp Duty line is a measured nil; a row with no gross carries none.
      expenses: r.gross === null ? null : money(r.stamp ?? 0),
      units: r.units,
      balance: r.balance,
      notes: `allotment NAV ${r.nav}`,
    }));
  };
}

// ── BUOYANT'S DATED RECORD — THE DEPOSITS, AND A CLASS SWITCH THAT IS NOT A SALE ─
//
// *"The user does not believe this data."* The Portfolio Monitor put Buoyant at
// Invested ₹72.5 Cr and a gain of ₹4.51 Cr. Every Buoyant document says the
// family paid in ₹70.85 Cr and has made ₹6.14 Cr — this statement's own Cash
// Deposits list, the capital register's closing balance, the performance
// appraisal's Net Capital In, the fact sheet's Contribution — and so does the
// family's own consolidated review, which carries Buoyant at ₹70.86 Cr invested.
//
// THE GAP IS A CLASS SWITCH. Both folios began in Class A1 and were moved into
// Class A4 on the day of a top-up — Ankita's on 01/02/2025 beside a ₹10 Cr
// deposit, Ajay's on 01/06/2026 beside a ₹25 Cr one. The fund books a switch as
// a Unit Redemption of the old class and a Units Allotment of the new one AT
// THAT DAY'S NAV, so the Cost it prints for the Class A4 units restarts at the
// switch-day value: ₹22.54 Cr for A1 units the family paid ₹21.01 Cr for, and
// ₹2.09 Cr for units it paid ₹2.00 Cr for. The appraisal's cost column then
// carries ₹1.62 Cr of gain as if it were money paid in, and the fund's own
// performance appraisal files that same ₹1.62 Cr as "Realized Gain" — on a sale
// that never paid the family a rupee.
//
// THE STATEMENT PRINTS THE WHOLE HISTORY, and this reader took only the summary
// row above it — the seventh absence in this book recorded against a document
// already in hand. Three tables, and the book needs all three:
//
//   Cash Deposits                  what left the family's bank, dated
//   Transactions : <CLASS>         Units Allotment / Unit Redemption — NAV, units, amount
//   Other Liabilities and Assets   a Gain Distr., reinvested in that day's allotment
//
// FIVE CHECKS, AND NOTHING IS PUBLISHED UNLESS ALL FIVE PASS — `threePFlows`'
// licence, applied to the next fund:
//
//   1. units × NAV = the printed amount, within the precision the statement
//      prints those two to (4 dp each), on every class row.
//   2. per class, the running units reach the Account Summary's Unit Balance for
//      each class it prints, and exactly zero for every class it does not.
//   3. every Unit Redemption pairs with a Units Allotment of ANOTHER class on the
//      SAME day for the same rupees (±₹1: each leg is struck at its own class
//      NAV and rounded apart; the observed residual is ₹0.06). That pair is the
//      switch. A redemption with no such partner is money paid OUT, which this
//      reader has no declared row for — so it refuses rather than guessing.
//   4. every Cash Deposit pairs with exactly one remaining allotment on its own
//      day whose amount is the deposit — or the deposit plus that day's Gain
//      Distr., reinvested — to the paisa; every allotment is paired with
//      something; and any distribution the statement prints as PAID OUT refuses.
//   5. where the statement prints its own "Capital Invested" (page 3 of one of
//      the two issues), the deposits sum to it.
//
// A SWITCH IS A RECLASSIFICATION, NOT A CAPITAL MOVE — the rule `threePFlows`
// set for 3P's B1/B2 → B3. It is carried as `kind: "reclassification"`, outside
// `CAPITAL_KINDS`, and `build-book` carries the family's cost and dates THROUGH
// it rather than letting a switch-day value stand in for what was paid.
const BY_CASH_HEAD = /^Date Transactions Amount \(INR\)$/i;
const BY_CLASS_HEAD = /^Transactions\s*:\s*BUOYANT\s+OPPORTUNITIES\s+STRATEGY\s*-\s*CATEGORY\s+III\s*-\s*CLASS\s+([A-Z]\d?)$/i;
const BY_OTHER_HEAD = /^Transactions\s*:\s*Other\s+Liabilities\s+and\s+Assets$/i;
const BY_DATED = /^\d{2}\/\d{2}\/\d{4}\s/;
/** The deposit types this reader declares. Anything else dated in that table refuses. */
const BY_DEPOSIT = /^(\d{2}\/\d{2}\/\d{4}) (Cash Deposits) ([\d,]+\.\d{2})$/i;
const BY_UNITS = /^(\d{2}\/\d{2}\/\d{4}) (Units Allotment|Unit Redemption) ([\d,]+\.\d+) ([\d,]+\.\d+) ([\d,]+\.\d+)$/i;
const BY_GAIN = /^(\d{2}\/\d{2}\/\d{4}) (Gain Distr\.) ([\d,]+\.\d+) ([\d,]+\.\d+) ([\d,]+\.\d+)$/i;
/** The Account Summary's per-class row — units, cost, NAV, value, absolute %, annualised %. */
const BY_SUMMARY_ROW = new RegExp(
  String.raw`(\d{2}\/\d{2}\/\d{4})\s+` +      // 1 NAV date
  String.raw`([\d,]+\.\d+)\s+` +              // 2 units
  String.raw`([\d,]+\.\d+)\s+` +              // 3 cost
  String.raw`([\d,]+\.\d+)\s+` +              // 4 NAV
  String.raw`([\d,]+\.\d+)\s+` +              // 5 value
  String.raw`(-?[\d,]+\.\d+)\s+` +            // 6 absolute %
  String.raw`(-?[\d,]+\.\d+)`,                // 7 annualised %
);
/** The one name every Buoyant class is carried under, so a flow and a holding share a key. */
export const buoyantClassName = (cls) => `Buoyant Opportunities Strategy — Category III — Class ${cls}`;

/** Exported for `__tests__/buoyantFlows.test.mjs`, which breaks a synthetic
 *  statement one check at a time to prove each of the five can fail. */
export function buoyantFlows(text, warn) {
  const deposits = [];
  const rows = [];
  const gains = [];
  let block = null;
  let order = 0;
  let unmatched = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (BY_CASH_HEAD.test(line)) { block = "cash"; continue; }
    const head = BY_CLASS_HEAD.exec(line);
    if (head) { block = { cls: head[1].toUpperCase() }; continue; }
    if (BY_OTHER_HEAD.test(line)) { block = "other"; continue; }
    if (/^Note\s*:/i.test(line)) { block = null; continue; }
    // A page break reprints the title lines and the column header; they carry no
    // date, so the class a table is under carries across them — Ajay's Class A1
    // table runs over pages 1 and 2 on one issue and not on the other.
    if (!block || !BY_DATED.test(line)) continue;
    if (block === "cash") {
      const m = BY_DEPOSIT.exec(line);
      if (!m) { unmatched += 1; continue; }
      deposits.push({ date: toIso(m[1]), amount: n(m[3]), order: order++ });
    } else if (block === "other") {
      const m = BY_GAIN.exec(line);
      if (!m) { unmatched += 1; continue; }
      gains.push({ date: toIso(m[1]), nav: n(m[3]), units: n(m[4]), amount: n(m[5]) });
    } else {
      const m = BY_UNITS.exec(line);
      if (!m) { unmatched += 1; continue; }
      rows.push({
        cls: block.cls, date: toIso(m[1]),
        type: /Redemption/i.test(m[2]) ? "Unit Redemption" : "Units Allotment",
        nav: n(m[3]), units: n(m[4]), amount: n(m[5]), order: order++,
      });
    }
  }
  if (!deposits.length && !rows.length) return [];
  // A DATED ROW THIS READER DOES NOT DECLARE IS NAMED, NEVER DROPPED — the rule
  // `threePFlows` sets, and for the same reason: a redemption for cash or a
  // payout would fail to match instead of being filed under whichever declared
  // type it happens to resemble, which is only safe if the miss refuses.
  if (unmatched) {
    warn("transaction-type-not-declared",
      `${unmatched} dated row(s) in the account statement's transaction tables carry a type this reader does not `
      + "declare; the dated record is withheld rather than published with rows missing from it");
    return [];
  }

  const fails = [];
  const paise = (v) => Math.round((v ?? 0) * 100);
  // (1) the row's own arithmetic, to the precision the statement prints.
  for (const r of rows) {
    if (r.nav === null || r.units === null || r.amount === null) {
      fails.push(`${r.date} ${r.type} (Class ${r.cls}) does not print a NAV, a unit count and an amount`);
      continue;
    }
    const bound = r.units * 5e-5 + r.nav * 5e-5 + 0.01;
    if (Math.abs(r.units * r.nav - r.amount) > bound) {
      fails.push(`${r.date} ${r.type} (Class ${r.cls}): ${r.units} units at ${r.nav} is not the printed ${r.amount}`);
    }
  }

  // (2) the running units against the Account Summary's own Unit Balance.
  const held = new Map();
  const summary = /Account Summary[\s\S]*?\nTotal\s/i.exec(text)?.[0] ?? "";
  const sumRows = [...summary.matchAll(new RegExp(BY_SUMMARY_ROW.source, "g"))];
  const sumClasses = [...summary.matchAll(/CLASS\s+([A-Z]\d?)\b/gi)].map((m) => m[1].toUpperCase());
  if (!sumRows.length || sumRows.length !== sumClasses.length) {
    fails.push(`the Account Summary prints ${sumRows.length} row(s) against ${sumClasses.length} class name(s), `
      + "so which class holds which balance cannot be read");
  } else {
    sumRows.forEach((m, i) => held.set(sumClasses[i], n(m[2])));
  }
  for (const cls of [...new Set([...rows.map((r) => r.cls), ...held.keys()])]) {
    const run = rows.filter((r) => r.cls === cls)
      .reduce((t, r) => t + (r.type === "Unit Redemption" ? -1 : 1) * (r.units ?? 0), 0);
    const want = held.get(cls) ?? 0;
    if (Math.abs(run - want) > 0.0005) {
      fails.push(`Class ${cls}: the allotments and redemptions run to ${Math.round(run * 1e4) / 1e4} units against `
        + `${held.has(cls) ? `the Account Summary's ${want}` : "zero, because the Account Summary prints no balance for it"}`);
    }
  }

  // (3) every redemption is one leg of a switch: another class, the same day,
  //     the same rupees.
  const allot = rows.filter((r) => r.type === "Units Allotment").map((r) => ({ ...r, used: null }));
  const switches = [];
  for (const out of rows.filter((r) => r.type === "Unit Redemption")) {
    const partner = allot.find((a) => !a.used && a.date === out.date && a.cls !== out.cls
      && Math.abs(a.amount - out.amount) <= 1);
    if (!partner) {
      fails.push(`the ${out.date} Unit Redemption of Class ${out.cls} (${out.amount}) has no allotment of another `
        + "class on the same day for the same rupees, so it paid money out — and this reader has no declared row for "
        + "money out");
      continue;
    }
    partner.used = "switch";
    switches.push({ out, in: partner });
  }

  // (4) every deposit buys exactly one allotment on its own day, and every
  //     allotment is bought by something.
  const gainOn = new Map();
  for (const g of gains) gainOn.set(g.date, (gainOn.get(g.date) ?? 0) + (g.amount ?? 0));
  const reinvestedOn = new Set();
  const contributions = [];
  for (const d of deposits) {
    const same = allot.filter((a) => !a.used && a.date === d.date);
    let hit = same.find((a) => paise(a.amount) === paise(d.amount));
    let reinvested = 0;
    if (!hit && gainOn.has(d.date)) {
      hit = same.find((a) => paise(a.amount) === paise(d.amount) + paise(gainOn.get(d.date)));
      if (hit) { reinvested = gainOn.get(d.date); reinvestedOn.add(d.date); }
    }
    if (!hit) {
      fails.push(`the ${d.date} Cash Deposit of ${d.amount} buys no allotment on its own day — neither the deposit `
        + "alone nor the deposit plus that day's Gain Distr.");
      continue;
    }
    hit.used = "deposit";
    contributions.push({ deposit: d, allot: hit, reinvested });
  }
  for (const a of allot.filter((x) => !x.used)) {
    fails.push(`the ${a.date} Units Allotment of Class ${a.cls} (${a.amount}) is bought by no deposit and is no `
      + "switch, so what funded it is not on this statement");
  }
  for (const dt of gainOn.keys()) {
    if (!reinvestedOn.has(dt)) {
      fails.push(`the ${dt} Gain Distr. is reinvested in no allotment that day, so it was paid out — and this reader `
        + "has no declared row for money out");
    }
  }
  const payout = /Total Distribution\s*\n\s*((?:-?[\d,]+\.\d{2}\s+){6}-?[\d,]+\.\d{2})/i.exec(text);
  if (payout && payout[1].trim().split(/\s+/).some((v) => (n(v) ?? 0) !== 0)) {
    fails.push("the Summary of Capital Distribution prints a payout, and this reader has no declared row for money out");
  }

  // (5) the deposits against the statement's own Capital Invested, where it
  //     prints one.
  const invested = /Capital Invested\s+([\d,]+(?:\.\d+)?)/i.exec(text);
  if (invested) {
    const total = deposits.reduce((t, d) => t + (d.amount ?? 0), 0);
    if (Math.abs(total - n(invested[1])) > 1) {
      fails.push(`the Cash Deposits sum to ${Math.round(total * 100) / 100} against the ${n(invested[1])} this `
        + "statement prints as Capital Invested");
    }
  }

  if (fails.length) {
    warn("dated-table-does-not-tie", "the account statement's dated record is not published for this account: "
      + fails.join("; "));
    return [];
  }

  // THE RUNNING UNITS PER CLASS, in the order the money moved. On a switch day
  // the redemption leg is taken first — the units leave one class before they
  // arrive in the other — and within a class the statement's own order stands.
  const events = [
    ...switches.flatMap((s) => [{ leg: "out", r: s.out, s }, { leg: "in", r: s.in, s }]),
    ...contributions.map((c) => ({ leg: "deposit", r: c.allot, c })),
  ].sort((a, b) => a.r.date.localeCompare(b.r.date)
    || (a.leg === "out" ? 0 : 1) - (b.leg === "out" ? 0 : 1)
    || a.r.order - b.r.order);
  const run = new Map();
  const unitsAfter = (cls, du) => {
    const v = Math.round(((run.get(cls) ?? 0) + du) * 1e4) / 1e4;
    run.set(cls, v);
    return v;
  };
  return events.map((e) => {
    if (e.leg === "deposit") {
      const { deposit: d, allot: a, reinvested } = e.c;
      return makeCashFlow({
        date: d.date,
        // The statement's own word for the money, which is what reaches the
        // family's transactions table.
        description: "Cash Deposits",
        security: buoyantClassName(a.cls),
        kind: "contribution",
        // What left the family's bank, beside what bought units. They differ only
        // where a Gain Distr. was reinvested in the same allotment, and a row
        // carrying its own net cannot be a running balance (`netAmount`).
        amount: d.amount,
        netAmount: a.amount,
        units: a.units,
        balance: unitsAfter(a.cls, a.units),
        notes: `Units Allotment at NAV ${a.nav}`
          + (reinvested ? `; includes the ${reinvested} Gain Distr. of the same day, reinvested` : ""),
      });
    }
    const { out, in: inn } = e.s;
    return e.leg === "out"
      ? makeCashFlow({
        date: out.date, description: out.type, security: buoyantClassName(out.cls),
        kind: "reclassification", amount: -out.amount, units: -out.units,
        balance: unitsAfter(out.cls, -out.units),
        notes: `redemption NAV ${out.nav}; switched into Class ${inn.cls} the same day for the same rupees`,
      })
      : makeCashFlow({
        date: inn.date, description: inn.type, security: buoyantClassName(inn.cls),
        kind: "reclassification", amount: inn.amount, units: inn.units,
        balance: unitsAfter(inn.cls, inn.units),
        notes: `allotment NAV ${inn.nav}; switched from Class ${out.cls} the same day for the same rupees`,
      });
  });
}

// ── NEO INFRA: THE UNIT TABLE A FIFO RETURN NEEDS ────────────────────────────
//
// *"match the number of units being sold and purchased, and use the methodology
// of FIFO to calculate returns."* Neo Infra prints a Capital Redemption of
// 14,162.80 units for ₹14,16,280 on 5 Jan 2026, and nothing read it: the book
// carried the Gross Capital Contribution — ₹5,00,00,000, the cost of 5,00,000
// units — against the 4,85,837 still held. A cost that includes units the
// family no longer owns is the failure FIFO exists to stop.
//
// It follows `threePFlows`' licence and `buoyantFlows`' beside it: the dated
// table is published only if the statement's own arithmetic witnesses it, and a
// dated capital row the columns do not match withholds the WHOLE table rather
// than publishing it with a row missing.

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

// ── WHAT THE FUND PAID BACK — DATED, AND ONLY WHERE IT TIES ─────────────────
//
//   "Just like you have this return methodology in portfolio monitor we need to
//    have it in private market table as well."
//
// A money-weighted return is every cash flow at the date it happened, and the
// dated calls above are only HALF of them. Neo Infra has paid the family
// ₹35.32 L of income and returned ₹14.16 L of principal, plus ₹8.69 L of
// equalisation; Baring made a distribution and paid a compensating
// contribution — every one of them DATED on the statement, gross and TDS and
// net, and read by nothing until the Private Market table was asked which
// return it shows. An XIRR struck on the calls alone would report Neo Infra's
// cash coming back as a loss, and would look exactly like a correct one.
//
// THE SAME LICENCE AS THE CALLS, KIND BY KIND. A payout table reaches the book
// only where its rows reproduce the total the SAME statement prints for them —
// income against income, principal against principal, equalisation against
// equalisation — and a row whose own gross − TDS is not its net is a misread,
// which refuses the whole table. Anything short of that is `null`, NEVER an
// empty list: `[]` says the fund paid nothing, and that is a measurement only a
// statement printing a nil may make.
//
// GROSS IS THE AMOUNT. The funds value themselves PRE-TAX (Baring's statement
// says so in as many words), so the cash leaving them is counted on the same
// basis: TDS is the family's own tax withheld at source and credited back to
// them, not a cost of the investment. Both are carried, so a reader who wants
// the cash that reached the bank has it.

/**
 * One cash movement FROM the fund TO the family, as the statement prints it.
 *
 *   income        a distribution of income or gains
 *   capital       principal returned — a redemption of units at their cost
 *   equalisation  a compensating payment from later investors in a later close,
 *                 which the fund passes to the earlier ones outside its NAV
 *
 * `gross` carries a SIGN only for equalisation, whose column the statements
 * head "(paid)/received": a negative figure there is money the family paid.
 */
const payoutRowReads = (r) =>
  !!r.date && isNumLocal(r.gross)
  && (r.net == null || Math.abs(Math.abs(r.gross) - (r.tds ?? 0) - Math.abs(r.net)) <= 1);

/**
 * Dated payouts, published only where each kind reproduces its own printed total.
 *
 * @param rows    {date,kind,label,gross,tds,net}[] read off the statement
 * @param totals  { kind, total, what }[] — one entry per kind the statement can
 *                print. A kind with rows and no printed total is refused unless
 *                `rowsWitness` says every row's own gross − TDS = net is the
 *                only check that table offers (it prints no total at all).
 */
function payoutsIfTheyTie(rows, totals, warn) {
  const misread = rows.filter((r) => !payoutRowReads(r));
  if (misread.length) {
    warn?.("payouts-row-misread",
      `${misread.length} payout row(s) do not reconcile gross − TDS = net on their own figures (${misread.map((r) => `${r.date} ${r.label}`).join("; ")}); no payout is carried`);
    return null;
  }
  const declared = new Set(totals.map((t) => t.kind));
  const stray = rows.filter((r) => !declared.has(r.kind));
  if (stray.length) {
    warn?.("payouts-unchecked", `${stray.length} payout row(s) of a kind this statement prints no total for; no payout is carried`);
    return null;
  }
  for (const t of totals) {
    const mine = rows.filter((r) => r.kind === t.kind);
    if (t.total == null) {
      if (!mine.length) continue;
      if (t.rowsWitness && mine.every((r) => r.tds != null && r.net != null)) continue;
      warn?.("payouts-unchecked",
        `${mine.length} dated ${t.kind} payout(s) were read and this statement prints no ${t.what} to reconcile them against; no payout is carried`);
      return null;
    }
    const sum = Math.round(mine.reduce((s, r) => s + r.gross, 0) * 100) / 100;
    const delta = Math.round((sum - t.total) * 100) / 100;
    if (Math.abs(delta) <= 1) continue;
    // ONE ROW THE SUMMARY DOES NOT COUNT IS EXPLAINED, NOT MATERIAL — the
    // reconciliation report's own distinction. The gate exists to stop a
    // schedule SHORT a payment, which understates what the family received.
    // Rows that EXCEED the printed total by exactly one row's gross, and by no
    // other row's, are the statement's summary omitting a payment its own
    // dated table prints: the row is carried, marked, and named. Short of the
    // total, or over it by anything else, still refuses. A row read twice
    // offers TWO candidates of the same gross, so it cannot slip through here.
    const culprits = delta > 1 ? mine.filter((r) => Math.abs(r.gross - delta) <= 1) : [];
    if (culprits.length === 1) {
      culprits[0].inPrintedTotal = false;
      warn?.("payouts-row-not-in-printed-total",
        `the ${t.kind} rows sum to ${sum} against a printed ${t.what} of ${t.total}; the ${delta} difference is exactly one dated row — ${culprits[0].date} ${culprits[0].label}, gross ${culprits[0].gross}, TDS ${culprits[0].tds ?? "—"}, net ${culprits[0].net ?? "—"} — which the statement's own total does not count. It is carried and marked, not dropped`);
      continue;
    }
    warn?.("payouts-do-not-tie",
      `${mine.length} dated ${t.kind} payout(s) sum to ${sum} against a printed ${t.what} of ${t.total}; no payout is carried, because a schedule short a payment reads on screen exactly like a complete one`);
    return null;
  }
  return [...rows]
    .map((r) => ({ ...r, inPrintedTotal: r.inPrintedTotal ?? true }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * `54555490` — three small figures the text layer ran together: gross 545,
 * TDS 55, net 490. Neo Infra's `Distribution on Other Income` rows print
 * amounts small enough that the columns touch, and the spaces are simply not
 * in the text.
 *
 * Split ONLY where EXACTLY ONE cut satisfies gross − TDS = net. Zero cuts, or
 * several, is a misread and the row is refused — and even a unique cut still
 * has to survive the printed income total, which is what licenses it.
 */
export function splitRunTogetherTriple(digits) {
  if (!/^\d{3,}$/.test(digits)) return null;
  const found = [];
  for (let i = 1; i < digits.length - 1; i++) {
    for (let j = i + 1; j < digits.length; j++) {
      const parts = [digits.slice(0, i), digits.slice(i, j), digits.slice(j)];
      if (parts.some((x) => x.length > 1 && x[0] === "0")) continue;
      const [g, t, net] = parts.map(Number);
      if (t < g && g - t === net) found.push({ gross: g, tds: t, net });
    }
  }
  return found.length === 1 ? found[0] : null;
}

// ── ASK ABSOLUTE RETURN FUND — A STATEMENT OF ACCOUNT, REDEEMED TO NIL ───────
//
// ASK's AIF statement of account: one folio, an Account Summary and a dated
// Transaction Summary. The September 2026 delivery brings two folios and both
// are REDEEMED IN FULL, which the statement says twice over:
//
//   • the Account Summary prints the unit balance as a dash beside a valuation
//     of 0.00 in all three valuation columns, and its Total row the same;
//   • the Transaction Summary's own unit counts net to exactly nil — every unit
//     a Capital Contribution allotted, a Net Return on Capital Contribution
//     took back.
//
// So the holding is a MEASURED zero — quantity 0, marked at the NAV net of fee
// the statement prints — the way 3P's redeemed classes are (Stage 10ak), and
// NOT a dash read as null, which is Hedged Equity's case: there the dash stood
// in for every figure on the row; here it sits beside three printed zero
// valuations and a dated record that reaches nil. Only where both hold is it
// read as nil — a dash beside a non-zero valuation refuses the whole summary.
//
// THE TRANSACTION SUMMARY IS FIVE DECLARED ROW TYPES, one printed line each,
// with a long label wrapped above and below the figures:
//
//   Capital Contribution                    units   the amount invested
//   Stamp Duty                              -       (the charge on it)
//   Return of Capital Contribution          -       (gross, at the NAV net of fee)
//   Tax on Return of Capital Contribution   -       (the tax withheld from it)
//   Net Return on Capital Contribution      units   (the cash paid out)
//
// It is published ONLY if it ties, and every check is struck on figures the
// statement prints: on each redemption date the gross less the tax is the net,
// to the paisa; on the Account Summary's own NAV date the gross and the net are
// the redeemed units at the NAV net of fee and at the NAV net of fee & tax; and
// the units the table allots and redeems reach the Account Summary's balance. A
// row of a type this reader does not declare, or a line of the table nothing
// read, withholds the whole table rather than publishing it with a row missing.
//
// NO REALISED GAIN IS PRINTED, SO NONE IS WRITTEN. What the family made is
// arithmetic on the dated rows — FIFO over them strikes it (Stage 10ca) — and
// this reader carries only what the statement prints. NO SEBI CATEGORY IS
// PRINTED EITHER, so the engagement names none: a category written here would
// put a chip on the fund that traces to nothing (PM-C3).

/** One series of the fund, named the same on the holding and on every dated
 *  row that bought or redeemed it — so the two land on one securityKey. */
export const askArfClassName = (cls, series) => `ASK Absolute Return Fund — Class ${cls} Series ${series}`;

const ARF_SERIES = String.raw`ASK\s+Absolute\s+Return\s+Fund\s*(?:\([^)\n]*\)\s*)?[-–]\s*Class\s+([A-Z]\d?)\s+Series\s+(\d{2}\/\d{2}\/\d{4})\s+(INF[0-9A-Z]{9})`;
/** `ASK Absolute Return Fund ("ASK ARF") - Class A6 Series 31/01/2025 INF0V6R22JL5
 *   31 Mar 2026 - 1,087.4566 0.00 1,066.3665 0.00 1,040.2477 0.00` */
const ARF_SUMMARY_ROW = new RegExp(ARF_SERIES
  + String.raw`\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})`  // 4 NAV date
  + String.raw`\s+(-|[\d,]+\.\d+)`                   // 5 units, or a dash
  + String.raw`\s+([\d,]+\.\d+)\s+([\d,]+\.\d{2})`   // 6 gross NAV, 7 gross valuation
  + String.raw`\s+([\d,]+\.\d+)\s+([\d,]+\.\d{2})`   // 8 NAV net of fee, 9 valuation net of fee
  + String.raw`\s+([\d,]+\.\d+)\s+([\d,]+\.\d{2})`,  // 10 NAV net of fee & tax, 11 valuation net of fee & tax
  "gi");
/** `Total - 0.00 0.00 0.00` — units, then the three valuation columns. */
const ARF_TOTAL = /^Total\s+(-|[\d,]+\.\d+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/im;
/** `30/09/2025 ASK ARF - Class A6 Series 31/01/2025 INF0V6R22JL5 Return of Capital Contribution - (10,14,94,665.47)` */
const ARF_TXN = new RegExp(
  String.raw`^(\d{2}\/\d{2}\/\d{4})\s+ASK\s+ARF\s*[-–]\s*Class\s+([A-Z]\d?)\s+Series\s+(\d{2}\/\d{2}\/\d{4})\s+(INF[0-9A-Z]{9})`
  + String.raw`(?:\s+(.*?))?\s+(-|[\d,]+\.\d+)\s+(\(?-?[\d,]+\.\d{2}\)?)$`, "i");
const ARF_DATED = /^\d{2}\/\d{2}\/\d{4}\s+\S/;
/** The title each page reprints; inside the table it is a page break, not a row. */
const ARF_RUNNING_TITLE = /^ASK\s+Absolute\s+Return\s+Fund$/i;
/** The table's own column headings, printed again on a page the table continues onto. */
const ARF_TXN_HEADER = /^Date\s+Scheme\s*&\s*Series\s+Name\s+Transaction\s+Description\s+Units\s+Amount$/i;
/** The five row types, DECLARED — anything else withholds the table. */
const ARF_TYPES = [
  [/^Capital Contribution$/i, "contribution"],
  [/^Stamp Duty$/i, "stamp"],
  [/^Return of Capital Contribution$/i, "gross"],
  [/^Tax on Return of Capital Contribution(?: Tax on Redemption)?$/i, "tax"],
  [/^Net Return on Capital Contribution$/i, "net"],
];
const arfMoney = (v) => Math.round(v * 100) / 100;
const arfUnits = (v) => Math.round(v * 1e3) / 1e3;
const arfDash = (v) => String(v ?? "").trim() === "-";

/**
 * Everything the statement prints that this reader uses, read once and shared
 * by the holdings, the dated rows and their checks — so a check can never be
 * struck on a different reading of the page from the one it licenses.
 */
export function askArfParse(text) {
  const cut = text.search(/^Transaction Summary\s*$/im);
  const summaryText = cut < 0 ? text : text.slice(0, cut);
  const series = [...summaryText.matchAll(ARF_SUMMARY_ROW)].map((m) => ({
    cls: m[1], series: m[2], isin: m[3], navDate: toIso(m[4]),
    unitsPrinted: m[5].trim(), units: arfDash(m[5]) ? null : n(m[5]),
    grossNav: n(m[6]), grossValue: n(m[7]),
    navNetFee: n(m[8]), valueNetFee: n(m[9]),
    navNetFeeTax: n(m[10]), valueNetFeeTax: n(m[11]),
  }));
  const t = ARF_TOTAL.exec(summaryText);
  const total = t
    ? { unitsPrinted: t[1].trim(), units: arfDash(t[1]) ? null : n(t[1]), grossValue: n(t[2]), valueNetFee: n(t[3]), valueNetFeeTax: n(t[4]) }
    : null;
  return { series, total, ledger: cut < 0 ? null : askArfLedger(text.slice(cut)) };
}

/**
 * The Transaction Summary, line by line. A row whose label is too long for its
 * column prints the figures on the anchor line and the words above and below
 * it — `Tax on Return of Capital` / the row / `Contribution Tax on Redemption`
 * — so a row with no words of its own takes the line before it and the line
 * after it, and each line is claimed by ONE row. A line nothing claimed is
 * reported, because a figure or a label this reader walked past is exactly
 * what would make a published table quietly incomplete.
 */
function askArfLedger(section) {
  const lines = section.split("\n").map((l) => l.trim());
  let end = lines.findIndex((l, i) => i > 0 && /^\d+\.\s+\S/.test(l));
  if (end < 0) end = lines.length;
  const body = lines.slice(1, end);
  // THE PAGE FOOTER. Where the table runs onto a second page, the footer every
  // page carries — the manager's name and its office — lands inside it, and the
  // same lines are printed again below the notes, at the foot of the last page.
  // A line printed inside the table AND again after it has ended is that
  // footer, never a row's label; anything else still has to be claimed.
  const furniture = new Set(lines.slice(end).filter(Boolean));
  const used = new Set();
  const skip = (l) => !l || ARF_RUNNING_TITLE.test(l) || ARF_TXN_HEADER.test(l) || (furniture.has(l) && !ARF_DATED.test(l));
  const nearest = (from, step) => {
    for (let j = from; j >= 0 && j < body.length; j += step) {
      if (skip(body[j])) continue;
      return ARF_DATED.test(body[j]) || used.has(j) ? -1 : j;
    }
    return -1;
  };
  const rows = [];
  const undeclared = [];
  body.forEach((line, i) => {
    if (!ARF_DATED.test(line)) return;
    used.add(i);
    const m = ARF_TXN.exec(line);
    if (!m) { undeclared.push(line.slice(0, 10)); return; }
    let description = (m[5] ?? "").trim();
    if (!description) {
      const before = nearest(i - 1, -1);
      const after = nearest(i + 1, +1);
      for (const j of [before, after]) if (j >= 0) used.add(j);
      description = [before, after].filter((j) => j >= 0).map((j) => body[j]).join(" ").replace(/\s+/g, " ").trim();
    }
    const type = ARF_TYPES.find(([re]) => re.test(description))?.[1] ?? null;
    if (!type) { undeclared.push(`${m[1]} ${description || "(no label)"}`); return; }
    rows.push({
      date: toIso(m[1]), cls: m[2], series: m[3], isin: m[4], description, type,
      unitsPrinted: m[6].trim(), units: arfDash(m[6]) ? null : n(m[6]), amount: n(m[7]),
    });
  });
  const unread = body.filter((l, i) => !skip(l) && !used.has(i));
  return { rows, undeclared, unread };
}

/**
 * THE ACCOUNT SUMMARY TIES OR IT IS NOT PUBLISHED. Each valuation is its units
 * at its own NAV within the precision the two are printed to (the bound
 * `threePFlows` holds every 3P row to), a dash is nil only beside valuations of
 * nil, and the Total row is the rows added up. Returns what failed; empty means
 * the summary may be published.
 */
export function askArfSummaryFails(parsed) {
  const fails = [];
  if (!parsed.series.length) return ["no Account Summary row matched the declared column order"];
  for (const s of parsed.series) {
    const label = `Class ${s.cls} Series ${s.series}`;
    const vals = [["gross", s.grossNav, s.grossValue], ["net of fee", s.navNetFee, s.valueNetFee],
      ["net of fee & tax", s.navNetFeeTax, s.valueNetFeeTax]];
    if (vals.some(([, nav, v]) => !isNumLocal(nav) || !isNumLocal(v))) {
      fails.push(`${label}: a NAV or a valuation did not read as a number`);
      continue;
    }
    if (s.units === null && vals.some(([, , v]) => v !== 0)) {
      fails.push(`${label}: the unit balance prints a dash beside a valuation that is not nil`);
      continue;
    }
    const q = s.units ?? 0;
    for (const [what, nav, v] of vals) {
      const bound = Math.abs(q) * 5e-5 + (s.units === null ? 0 : nav * 5e-4) + 0.01;
      if (Math.abs(q * nav - v) > bound) fails.push(`${label}: ${q} unit(s) at the ${what} NAV ${nav} is not the printed ${v}`);
    }
  }
  const t = parsed.total;
  if (!t) fails.push("the Account Summary prints no Total row to tie its rows to");
  else {
    const sumUnits = arfUnits(parsed.series.reduce((a, s) => a + (s.units ?? 0), 0));
    if (t.units === null ? sumUnits !== 0 || parsed.series.some((s) => s.units !== null)
      : Math.abs(sumUnits - t.units) > 0.0005) {
      fails.push(`the Total row prints ${t.unitsPrinted} unit(s) against ${sumUnits} across the rows`);
    }
    for (const [what, k] of [["gross valuation", "grossValue"], ["valuation net of fee", "valueNetFee"],
      ["valuation net of fee & tax", "valueNetFeeTax"]]) {
      const sum = arfMoney(parsed.series.reduce((a, s) => a + (s[k] ?? 0), 0));
      if (Math.abs(sum - t[k]) > 0.01) fails.push(`the Total row's ${what} ${t[k]} is not the rows' ${sum}`);
    }
  }
  return fails;
}

/**
 * THE DATED RECORD, published only if every check ties — see the block above.
 * Returns the cash flows the book reads: one CONTRIBUTION per Capital
 * Contribution (every rupee paid, the stamp duty included, with the invested
 * amount and the charge each as printed) and one WITHDRAWAL per redemption
 * date (the cash paid out, with the gross and the tax in its notes). The
 * statement prints a redemption's unit count unsigned and its amount in
 * parentheses; the units are carried signed, out of the folio, because that is
 * what the row's own amount and label say happened.
 *
 * Each row carries the day its series was issued, as the series' own name
 * prints it (`seriesIssued`): a Capital Contribution dated on it is the first
 * allotment that series can have had, so the record begins at nil — the
 * evidence `capitalRecordFromInception` reads where a statement prints no
 * running unit balance.
 *
 * Exported for `__tests__/askArf.test.mjs`, which breaks the real statement's
 * archived text one figure at a time to prove each check can fail.
 */
export function askArfFlows(text, warn) {
  const parsed = askArfParse(text);
  const L = parsed.ledger;
  if (!L) return [];
  if (L.undeclared.length) {
    warn("transaction-type-not-declared",
      `${L.undeclared.length} dated row(s) in the Transaction Summary carry a type this reader does not declare `
      + `(${L.undeclared.join("; ")}); the dated record is withheld rather than published with rows missing from it`);
    return [];
  }
  if (L.unread.length) {
    warn("transaction-line-not-read",
      `${L.unread.length} line(s) of the Transaction Summary belong to no row this reader read; the dated record is `
      + "withheld rather than published with something on the page walked past");
    return [];
  }
  if (!L.rows.length) {
    warn("dated-table-does-not-tie", "the Transaction Summary is printed but no row of it was read");
    return [];
  }

  const fails = [];
  const seriesOf = new Map(parsed.series.map((s) => [`${s.cls}|${s.series}|${s.isin}`, s]));
  for (const r of L.rows) {
    if (!seriesOf.has(`${r.cls}|${r.series}|${r.isin}`)) {
      fails.push(`${r.date} ${r.description}: Class ${r.cls} Series ${r.series} ${r.isin} is not a series the Account Summary prints`);
    }
    if (!isNumLocal(r.amount)) fails.push(`${r.date} ${r.description}: the amount did not read as a number`);
    const carriesUnits = r.type === "contribution" || r.type === "net";
    if (carriesUnits !== (r.units !== null)) {
      fails.push(`${r.date} ${r.description}: ${carriesUnits ? "prints no unit count" : `prints ${r.unitsPrinted} unit(s) where the type carries none`}`);
    }
    if (r.type === "contribution" ? !(r.amount > 0) : !(r.amount < 0)) {
      fails.push(`${r.date} ${r.description}: prints ${r.amount}, the wrong side of nil for the type`);
    }
  }

  const flows = [];
  const keyOf = (r) => `${r.date}|${r.cls}|${r.series}|${r.isin}`;
  const groups = new Map();
  for (const r of L.rows) {
    const g = groups.get(keyOf(r)) ?? { date: r.date, cls: r.cls, series: r.series, isin: r.isin, rows: [] };
    g.rows.push(r);
    groups.set(keyOf(r), g);
  }
  for (const g of groups.values()) {
    const of = (type) => g.rows.filter((r) => r.type === type);
    const [contrib, stamp, gross, tax, net] = ["contribution", "stamp", "gross", "tax", "net"].map(of);
    const at = `${g.date} Class ${g.cls} Series ${g.series}`;
    if (contrib.length > 1 || stamp.length > 1 || gross.length > 1 || tax.length > 1 || net.length > 1) {
      fails.push(`${at}: a row type is printed twice on one date, so which charge belongs to which row is not printed`);
      continue;
    }
    if (stamp.length && !contrib.length) fails.push(`${at}: Stamp Duty with no Capital Contribution beside it`);
    if ((gross.length || tax.length || net.length) && !(gross.length && net.length)) {
      fails.push(`${at}: a redemption that does not print both its Return of Capital Contribution and its Net Return`);
    }
    if (contrib.length && (gross.length || net.length)) {
      fails.push(`${at}: a contribution and a redemption on one date and series — which charge is whose is not printed`);
    }
    const name = askArfClassName(g.cls, g.series);
    if (contrib.length) {
      const c = contrib[0];
      const charge = stamp.length && isNumLocal(stamp[0].amount) ? arfMoney(Math.abs(stamp[0].amount)) : null;
      flows.push(makeCashFlow({
        date: g.date, description: c.description, security: name, isin: g.isin, kind: "contribution",
        amount: charge === null ? c.amount : arfMoney(c.amount + charge),
        netAmount: c.amount,
        expenses: charge,
        units: c.units,
        seriesIssued: toIso(g.series),
        notes: charge === null
          ? "Capital Contribution as printed; no Stamp Duty row is printed beside it"
          : `Capital Contribution ${c.amount} and Stamp Duty ${charge}, printed as two rows on this date; the amount is every rupee paid, the two together`,
      }));
    }
    if (gross.length && net.length) {
      const G = Math.abs(gross[0].amount ?? NaN);
      const T = tax.length ? Math.abs(tax[0].amount ?? NaN) : 0;
      const N = Math.abs(net[0].amount ?? NaN);
      if (Math.abs(arfMoney(G - T) - N) > 0.005) {
        fails.push(`${at}: Return of Capital Contribution ${G} less tax ${T} is ${arfMoney(G - T)}, against a printed net ${N}`);
      }
      const s = seriesOf.get(`${g.cls}|${g.series}|${g.isin}`);
      const u = net[0].units;
      if (s && u !== null && s.navDate === g.date) {
        for (const [what, nav, want] of [["gross", s.navNetFee, G], ["net", s.navNetFeeTax, N]]) {
          const bound = Math.abs(u) * 5e-5 + nav * 5e-4 + 0.01;
          if (Math.abs(u * nav - want) > bound) {
            fails.push(`${at}: ${u} unit(s) at the Account Summary's NAV ${nav} is not the printed ${what} ${want}`);
          }
        }
      }
      flows.push(makeCashFlow({
        date: g.date, description: net[0].description, security: name, isin: g.isin, kind: "withdrawal",
        amount: net[0].amount,
        units: u === null ? null : -Math.abs(u),
        seriesIssued: toIso(g.series),
        notes: `Return of Capital Contribution ${G} less Tax on Return of Capital Contribution ${T} = ${N} paid out; `
          + "the statement prints the unit count unsigned and the amount in parentheses",
      }));
    }
  }

  // The units the table allots and redeems reach the Account Summary's balance,
  // series by series — the printed nil the holding stands on. A dash is that
  // nil only beside valuations of nil (`askArfSummaryFails`' own rule); beside
  // a valuation that is not nil the balance is not printed at all, so there is
  // nothing for the run to reach and the record is withheld rather than tied to
  // a zero the statement contradicts.
  for (const s of parsed.series) {
    const nilDash = s.units === null && [s.grossValue, s.valueNetFee, s.valueNetFeeTax].every((v) => v === 0);
    if (s.units === null && !nilDash) {
      fails.push(`Class ${s.cls} Series ${s.series}: the Account Summary prints a dash beside a valuation that is not nil, so the balance the table's units must reach is not printed`);
      continue;
    }
    const mine = L.rows.filter((r) => r.cls === s.cls && r.series === s.series && r.isin === s.isin);
    const run = arfUnits(mine.reduce((a, r) => a + (r.type === "contribution" ? r.units ?? 0 : r.type === "net" ? -(r.units ?? 0) : 0), 0));
    const want = s.units ?? 0;
    if (Math.abs(run - want) > 0.0005) {
      fails.push(`Class ${s.cls} Series ${s.series}: the table's units run to ${run} against the Account Summary's ${s.unitsPrinted}`);
    }
  }

  if (fails.length) {
    warn("dated-table-does-not-tie",
      "the Transaction Summary is not published for this folio: " + fails.join("; "));
    return [];
  }
  return flows.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "contribution" ? -1 : 1));
}

/** The holdings: one per Account Summary series, published only if the summary ties. */
export function askArfHoldingRows(text, warn) {
  const parsed = askArfParse(text);
  const fails = askArfSummaryFails(parsed);
  if (fails.length) {
    warn("summary-does-not-tie", "the Account Summary is not published for this folio: " + fails.join("; "));
    return [];
  }
  return parsed.series;
}

/**
 * The two printed tables, archived as the statement prints them — only where
 * each ties, because a section is what a reader checking a figure opens and a
 * table that did not tie is a reading this reader does not stand behind. The
 * raw page text is in `pages.json` either way.
 */
function askArfSections(text) {
  const parsed = askArfParse(text);
  const out = {};
  if (!askArfSummaryFails(parsed).length) {
    out["account-summary"] = {
      name: "account-summary",
      rows: [["series", "isin", "navDate", "units", "grossNav", "grossValuation", "navNetOfFee", "valuationNetOfFee",
        "navNetOfFeeAndTax", "valuationNetOfFeeAndTax"],
      ...parsed.series.map((s) => [askArfClassName(s.cls, s.series), s.isin, s.navDate, s.unitsPrinted, s.grossNav,
        s.grossValue, s.navNetFee, s.valueNetFee, s.navNetFeeTax, s.valueNetFeeTax]),
      ["Total", "", "", parsed.total.unitsPrinted, "", parsed.total.grossValue, "", parsed.total.valueNetFee, "",
        parsed.total.valueNetFeeTax]],
    };
  }
  const quiet = () => {};
  if (parsed.ledger && askArfFlows(text, quiet).length) {
    out["transaction-summary"] = {
      name: "transaction-summary",
      rows: [["date", "series", "isin", "description", "units", "amount"],
        ...parsed.ledger.rows.map((r) => [r.date, askArfClassName(r.cls, r.series), r.isin, r.description,
          r.unitsPrinted, r.amount])],
    };
  }
  return Object.keys(out).length ? out : null;
}

/** The second holder the statement prints, or nobody where it prints `NA`. */
function askArfJointHolders(text) {
  const m = /Second\s+Holder\s+Name\s*:\s*([^\n]{1,90})/i.exec(text);
  const name = m ? m[1].split(NEXT_LABEL)[0].trim() : "";
  return !name || /^(?:N\.?\s*A\.?|-|nil|none)$/i.test(name) ? [] : [name];
}

/**
 * BUOYANT'S PORTFOLIO SNAP REPORT — the same holding as the account statement,
 * reported a second way, and checked against itself before it is believed.
 *
 * Page 1 is the account statement's own Account Summary (the row
 * `BY_SUMMARY_ROW` reads) and its dated record; page 3 is the snap: the
 * scheme's classification and inception, Current Investments per class in
 * whole rupees, an Investment Summary since inception, THIS ACCOUNT's TWRR and
 * the FUND's top holdings. Nothing on page 3 becomes a fact of the book — the
 * holding is page 1's, units × NAV — but page 3 restates page 1 in round
 * rupees, so the two must agree before the document is published as ok:
 *
 *   1. page 1's units × NAV is its printed value TO THE PAISA, and its Total row
 *      is its one row;
 *   2. each class page 3 lists is page 1's cost and value ROUNDED, a class page 1
 *      does not hold prints 0 0, and page 3's Total is its rows;
 *   3. Capital Invested + Income Distributed + Withdrawal + Profit / Loss is the
 *      printed Current Value, which is page 1's value rounded, on page 1's date;
 *   4. page 3 names the same account as page 1.
 *
 * The fund's top holdings and the account's TWRR are ARCHIVED as sections, as
 * printed, and nothing reads either as a return or a look-through. The TWRR is
 * the ACCOUNT's, not the scheme's: Ajay's and Ankita's snaps print the same
 * holdings to the line and the same 1-month and 3-month figures, and DIFFERENT
 * 1-year and since-inception ones (11.56% / 10.28% against 12.02% / 10.65%) —
 * the two folios sat in different unit classes until Ajay's switched in June
 * 2026, and a scheme has one return. The page says it is after management fees
 * and other expenses, and post tax. Exported for `__tests__/buoyantSnap.test.mjs`.
 */
const SNAP_CI_ROW = /^BUOYANT\s+OPPORTUNITIES\s+(-?[\d,]+)\s+(-?[\d,]+)\s*$/i;
const SNAP_HOLDING = /(?:^|\s)(\d{1,2})\s+([A-Z][A-Za-z0-9 &.,'()/-]*?)\s+(\d+\.\d{2})%(?=\s*$)/gm;
const snapInt = (s) => (s == null ? null : n(s));

export function buoyantSnapParse(text) {
  const p3at = text.search(/^Classification\s*:/im);
  const p3 = p3at < 0 ? "" : text.slice(p3at);
  const row = BY_SUMMARY_ROW.exec(text);
  const total1 = /^Total\s+([\d,]+\.\d+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/im.exec(text);
  const ciAt = p3.search(/^Current\s+Investments\s*$/im);
  // The holdings heading sits on a line of its own on one folio's snap and at
  // the END of the "Investment Summary (INR)" line on the other's — the same
  // page, laid out two ways. Anchored on the line's end either way, never on
  // its start alone, or the second folio's fund holdings are never found.
  const CURRENT_HOLDINGS = /(?:^|[ \t])Current\s+Holdings[ \t]*$/im;
  const chAt = p3.search(CURRENT_HOLDINGS);
  const ciBlock = ciAt < 0 ? [] : p3.slice(ciAt, chAt > ciAt ? chAt : undefined).split("\n").map((l) => l.trim());
  const classes = [];
  let ciTotal = null;
  ciBlock.forEach((l, i) => {
    const m = SNAP_CI_ROW.exec(l);
    if (m) {
      const tail = ciBlock.slice(i + 1, i + 4).join(" ");
      const k = /CLASS\s+([A-Z]\d?)\b/i.exec(tail);
      classes.push({ cls: k ? k[1].toUpperCase() : null, cost: snapInt(m[1]), value: snapInt(m[2]) });
    }
    const t = /^Total\s+(-?[\d,]+)\s+(-?[\d,]+)\s*$/i.exec(l);
    if (t) ciTotal = { cost: snapInt(t[1]), value: snapInt(t[2]) };
  });
  const line = (re) => (re.exec(p3) ?? [])[1] ?? null;
  const summary = {
    since: line(/^Since\s+(\d{2}\/\d{2}\/\d{4})\s+Amount/im),
    capitalInvested: snapInt(line(/^Capital\s+Invested\s+(-?[\d,]+)/im)),
    incomeDistributed: snapInt(line(/^Income\s+Distributed\s+(-?[\d,]+)/im)),
    withdrawal: snapInt(line(/^Withdrawal\s+(-?[\d,]+)/im)),
    profitLoss: snapInt(line(/^Profit\s*\/\s*Loss\s+(-?[\d,]+)/im)),
    currentValueDate: line(/^Current\s+Value\s*\((\d{2}\/\d{2}\/\d{4})\)/im),
    currentValue: snapInt(line(/^Current\s+Value\s*\(\d{2}\/\d{2}\/\d{4}\)\s+(-?[\d,]+)/im)),
  };
  const twrr = /^Portfolio\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s+(-?[\d.]+)%/im.exec(p3);
  const hAt = chAt;
  const hEnd = p3.search(/^Total\s+100(?:\.0+)?%\s*$/im);
  const hBlock = hAt < 0 ? "" : p3.slice(hAt, hEnd > hAt ? hEnd : undefined);
  const fundHoldings = [...hBlock.matchAll(SNAP_HOLDING)].map((m) => ({ sr: Number(m[1]), security: m[2].trim(), pct: n(m[3]) }));
  return {
    row: row ? { navDate: toIso(row[1]), units: n(row[2]), cost: n(row[3]), nav: n(row[4]), value: n(row[5]) } : null,
    total1: total1 ? { units: n(total1[1]), cost: n(total1[2]), value: n(total1[3]) } : null,
    account1: FIELD(text, "Account", String.raw`(\d{4,})`),
    asOf1: toIso((/As of\s+(\d{2}\/\d{2}\/\d{4})/i.exec(text) ?? [])[1]),
    account3: line(/^Account\s*:\s*(\d{4,})\s*-/im),
    asOf3: toIso(line(/^As\s+of\s+(\d{2}\/\d{2}\/\d{4})/im) ?? (/As of\s+(\d{2}\/\d{2}\/\d{4})(?![\s\S]*As of\s+\d)/i.exec(text) ?? [])[1]),
    classification: line(/^Classification\s*:\s*([^\n]+)/im)?.trim() ?? null,
    inception: line(/^Inception\s+Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/im),
    classes, ciTotal, summary,
    twrr: twrr ? { m1: n(twrr[1]), m3: n(twrr[2]), y1: n(twrr[3]), since: n(twrr[4]),
      sinceFrom: line(/^(\d{2}\/\d{2}\/\d{2})\b/m) } : null,
    fundHoldings,
    fundHoldingsTotal: hEnd >= 0,
  };
}

/** What does not tie, in words; empty means the snap restates page 1 exactly. */
export function buoyantSnapFails(p, heldClass) {
  const fails = [];
  const r = p.row;
  if (!r) return ["page 1 prints no Account Summary row in the declared column order"];
  const derived = Math.round(r.units * r.nav * 100) / 100;
  if (derived !== r.value) fails.push(`page 1: ${r.units} unit(s) × NAV ${r.nav} is ${derived}, not the printed ${r.value}`);
  if (!p.total1) fails.push("page 1 prints no Total row");
  else if (p.total1.units !== r.units || p.total1.cost !== r.cost || p.total1.value !== r.value) {
    fails.push("page 1's Total row is not its one Account Summary row");
  }
  if (!p.classes.length) fails.push("page 3 prints no Current Investments row");
  for (const c of p.classes) {
    if (!c.cls) { fails.push("a Current Investments row names no class"); continue; }
    const want = c.cls === heldClass ? { cost: Math.round(r.cost), value: Math.round(r.value) } : { cost: 0, value: 0 };
    if (c.cost !== want.cost || c.value !== want.value) {
      fails.push(`page 3 Class ${c.cls}: ${c.cost} / ${c.value} is not page 1's ${want.cost} / ${want.value} rounded`);
    }
  }
  if (!p.classes.some((c) => c.cls === heldClass)) fails.push(`page 3 lists no Class ${heldClass}, the class page 1 holds`);
  if (!p.ciTotal) fails.push("page 3's Current Investments prints no Total row");
  else {
    const sum = p.classes.reduce((a, c) => ({ cost: a.cost + (c.cost ?? 0), value: a.value + (c.value ?? 0) }), { cost: 0, value: 0 });
    if (sum.cost !== p.ciTotal.cost || sum.value !== p.ciTotal.value) fails.push("page 3's Current Investments Total is not its rows");
    if (p.total1 && (p.ciTotal.cost !== Math.round(p.total1.cost) || p.ciTotal.value !== Math.round(p.total1.value))) {
      fails.push("page 3's Current Investments Total is not page 1's Total rounded");
    }
  }
  const s = p.summary;
  const parts = [s.capitalInvested, s.incomeDistributed, s.withdrawal, s.profitLoss, s.currentValue];
  if (parts.some((v) => !isNumLocal(v))) fails.push("page 3's Investment Summary did not read as five figures");
  else {
    if (s.capitalInvested + s.incomeDistributed + s.withdrawal + s.profitLoss !== s.currentValue) {
      fails.push(`page 3's Investment Summary does not add up: ${s.capitalInvested} + ${s.incomeDistributed} + ${s.withdrawal} + ${s.profitLoss} is not ${s.currentValue}`);
    }
    if (s.currentValue !== Math.round(r.value)) fails.push(`page 3's Current Value ${s.currentValue} is not page 1's ${r.value} rounded`);
  }
  if (toIso(s.currentValueDate) !== p.asOf1) fails.push(`page 3's Current Value is dated ${s.currentValueDate}, not the statement's ${p.asOf1}`);
  if (!p.account3 || p.account3 !== p.account1) fails.push("page 3 does not name the account page 1 names");
  return fails;
}

/**
 * The FUND's own top holdings tie only if their serial numbers run 1..N, a
 * `Total 100%` row closes them, and their weights add to 100 within the
 * precision each is printed to (two decimals, so N × 0.005 at the most).
 * Returns what failed; empty means the table may be archived.
 */
export function buoyantSnapHoldingsFails(p) {
  const h = p.fundHoldings;
  if (!h.length) return ["no fund holding row was read"];
  const fails = [];
  if (!p.fundHoldingsTotal) fails.push("the fund holdings print no Total 100% row");
  if (h.some((x, i) => x.sr !== i + 1)) fails.push(`the fund holdings' serial numbers do not run 1 to ${h.length}`);
  const sum = h.reduce((a, x) => a + x.pct, 0);
  if (Math.abs(sum - 100) > h.length * 0.005 + 1e-9) {
    fails.push(`the fund holdings add to ${Math.round(sum * 100) / 100}%, not 100%`);
  }
  return fails;
}
const buoyantSnapHoldingsTie = (p) => !buoyantSnapHoldingsFails(p).length;

/**
 * Whether the snap restates page 1 — and, where it does, whether the two tables
 * archived AS PRINTED were read. The fund's top holdings and this account's
 * TWRR become no fact of the book, so a table this reader cannot read is
 * withheld from the archive rather than archived wrong; and a withheld table
 * SAYS so, because a section that silently stops appearing is indistinguishable
 * from a snap that never printed one. Where the pages do not restate each other
 * every page-3 table is withheld for that reason, which the first warning names.
 */
function buoyantSnapCheck(text, holdings, warn) {
  const held = /CLASS\s+([A-Z]\d?)/i.exec(text)?.[1]?.toUpperCase() ?? null;
  const p = buoyantSnapParse(text);
  const fails = holdings.length === 1 ? buoyantSnapFails(p, held) : ["the snap carries more than one Account Summary row"];
  if (fails.length) {
    warn("snap-does-not-tie", "the Portfolio Snap Report's pages do not restate each other: " + fails.join("; "));
    return;
  }
  const unread = [
    ...(p.twrr ? [] : ["the Performance (TWRR) row did not read as four percentages"]),
    ...buoyantSnapHoldingsFails(p),
  ];
  if (unread.length) {
    warn("snap-section-not-read", "a table page 3 prints is not archived, because it did not read whole: " + unread.join("; "));
  }
}

/**
 * THE SNAP'S OWN PERFORMANCE ROW, AS A RETURN SERIES (Stage 10df). Page 3 prints
 * `Portfolio 2.09% 5.87% 11.56% 10.28%` — trailing 1 month, 3 months and 1 year,
 * and since the date the row names, this account's time-weighted return after
 * management fees, expenses and tax. It was archived as a section and reached
 * no return block, so the Performance page carried no figure for either folio.
 *
 * Published only where the snap restates its own page 1 (`buoyantSnapFails`),
 * the gate every other figure on it passes. `siAnnualised` is read off the
 * dates the row spans — the snap annualises only past a year, as its own
 * heading says — and is null where the start date does not read. A row that
 * does not read as four percentages yields no series, never zeros.
 */
function buoyantSnapReturns(text, meta = {}) {
  const p = buoyantSnapParse(text);
  const held = /CLASS\s+([A-Z]\d?)/i.exec(text)?.[1]?.toUpperCase() ?? null;
  if (!p.twrr || buoyantSnapFails(p, held).length) return [];
  const from = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(p.twrr.sinceFrom ?? "");
  const fromIso = from ? `20${from[3]}-${from[2]}-${from[1]}` : null;
  const to = p.asOf3 ?? p.asOf1;
  const days = fromIso && to ? (Date.parse(to) - Date.parse(fromIso)) / 86400000 : NaN;
  return [makeReturnSeries({
    series: "Portfolio",
    m1: p.twrr.m1, m3: p.twrr.m3, y1: p.twrr.y1, si: p.twrr.since,
    siAnnualised: Number.isFinite(days) ? days >= 365 : null,
    // "after management fees, expenses and tax", in the snap's own words.
    feeBasis: "after",
    source: meta.docKey ?? null,
  })];
}

function buoyantSnapSections(text) {
  const p = buoyantSnapParse(text);
  const held = /CLASS\s+([A-Z]\d?)/i.exec(text)?.[1]?.toUpperCase() ?? null;
  if (buoyantSnapFails(p, held).length) return null;
  const s = p.summary;
  const out = {
    "investment-summary": {
      name: "investment-summary",
      rows: [["line", "amount (INR, whole rupees, as printed)"],
        ["Scheme classification", p.classification ?? ""],
        ["Scheme inception date", p.inception ?? ""],
        [`Since ${s.since ?? ""}`, ""],
        ["Capital Invested", s.capitalInvested], ["Income Distributed", s.incomeDistributed],
        ["Withdrawal", s.withdrawal], ["Profit / Loss", s.profitLoss],
        [`Current Value (${s.currentValueDate})`, s.currentValue]],
    },
    "current-investments": {
      name: "current-investments",
      rows: [["class", "cost (INR, whole rupees)", "value (INR, whole rupees)"],
        ...p.classes.map((c) => [buoyantClassName(c.cls), c.cost, c.value]),
        ["Total", p.ciTotal.cost, p.ciTotal.value]],
    },
  };
  if (p.twrr) {
    out["performance-twrr"] = {
      name: "performance-twrr",
      rows: [["period", "portfolio TWRR % (this account's, after management fees, expenses and tax; over a year annualised — as printed)"],
        ["1m", p.twrr.m1], ["3m", p.twrr.m3], ["1y", p.twrr.y1], [`since ${p.twrr.sinceFrom ?? "inception"}`, p.twrr.since]],
    };
  }
  if (buoyantSnapHoldingsTie(p)) {
    out["fund-holdings"] = {
      name: "fund-holdings",
      rows: [["sr", "security (the scheme's holding, as printed)", "% of assets"],
        ...p.fundHoldings.map((h) => [h.sr, h.security, h.pct])],
    };
  }
  return out;
}

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
     * ONE pattern, shared with `buoyantFlows`' check 2, so the balance that
     * check reads is the row this layout reads.
     */
    row: BY_SUMMARY_ROW,
    read: (m) => ({
      navDate: toIso(m[1]), quantity: n(m[2]), totalCost: n(m[3]),
      marketPrice: n(m[4]), printedValue: n(m[5]),
      absoluteYieldPct: n(m[6]), annualizedYieldPct: n(m[7]),
    }),
    // Through `buoyantClassName`, the name the dated flows carry too — a holding
    // and the contributions that bought it must land on one securityKey.
    security: (text) => (/CLASS\s+([A-Z]\d?)/i.exec(text)
      ? buoyantClassName(/CLASS\s+([A-Z]\d?)/i.exec(text)[1])
      : "Buoyant Opportunities Strategy — Category III"),
    account: (text) => FIELD(text, "Account", String.raw`(\d{4,})`),
    folio: (text) => FIELD(text, "Folio", String.raw`([A-Z0-9]{4,})`),
    asOf: (text) => toIso((/As of\s+(\d{2}\/\d{2}\/\d{4})/i.exec(text) ?? [])[1]),
    // `Account : 103473 AJAY THAKURDAS JAISINGHANI` — the holder is on the
    // title line, after the account number and with no label of its own.
    holder: (text) => (/Account\s*:\s*\d{4,}\s+([A-Z][A-Z\s]{6,44}?)\s*(?:\n|Buoyant)/i.exec(text) ?? [])[1],
    /** The deposits, the per-class allotments and the switch — see `buoyantFlows`. */
    flowsFrom: buoyantFlows,
    /**
     * The Portfolio Snap Report is this statement with a third page; the
     * classifier types it `portfolio-snap` (on its file name AND its page-3
     * headings) and the same row is read, checked against that page.
     */
    variants: {
      "portfolio-snap": { verify: buoyantSnapCheck, sectionsFrom: buoyantSnapSections, returnsFrom: buoyantSnapReturns, okWhenClean: true },
    },
  },
  {
    key: "founders",
    engagement: "AIF",
    // NO CATEGORY IS WRITTEN HERE, because none is printed: this statement
    // carries no SEBI category and no registration number, and no other
    // document in the archive names one for this fund. This string used to read
    // "Category II AIF - …", which put a category chip on the fund that traced
    // to nothing — the Transition Venture defect (PM-C3) in a second reader. The
    // family place the fund themselves (`FAMILY_MARKET_SIDE`), so its side of
    // the book does not move; only the claim about its paperwork does.
    providerEngagement: "drawdown AIF, with a commitment and called capital — the statement prints no SEBI category",
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
    /**
     * `06/08/2026 Net Purchase ( Transaction Date : 06/08/2026 ) 21,41,89,290.54
     *  14.0491 15245765.959 15245765.959` — amount, NAV, units, unit balance.
     */
    flowsFrom: mfPurchaseFlows({
      net: (line) => {
        const m = /^(\d{2}\/\d{2}\/\d{4})\s+Net\s+Purchase(?:\s*\(\s*Transaction\s+Date\s*:\s*\d{2}\/\d{2}\/\d{4}\s*\))?\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)$/i.exec(line);
        return m ? { date: toIso(m[1]), net: n(m[2]), nav: n(m[3]), units: n(m[4]), balance: n(m[5]) } : null;
      },
      heldUnits: (text) => {
        const m = /(Motilal\s+Oswal\s+Active\s+Momentum\s+Fund[^\n]*?)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)/.exec(text);
        return m ? n(m[2]) : null;
      },
      security: (text) => {
        const m = /(Motilal\s+Oswal\s+Active\s+Momentum\s+Fund[^\n]*?)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)/.exec(text);
        return m ? m[1].trim() : null;
      },
    }),
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
    /**
     * `06/08/2026 Net Purchase 16.21 309,984,500.77 16.2100 19,123,041.380
     *  19,123,041.380` — NAV, amount, price, units, balance. The Gross Ongoing
     * Purchase and Stamp Duty rows above it print no date of their own.
     */
    flowsFrom: mfPurchaseFlows({
      net: (line) => {
        const m = /^(\d{2}\/\d{2}\/\d{4})\s+Net\s+Purchase\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)$/i.exec(line);
        return m ? { date: toIso(m[1]), nav: n(m[4]), net: n(m[3]), units: n(m[5]), balance: n(m[6]) } : null;
      },
      heldUnits: (text) => {
        const m = /(\d{2}-\w{3}-\d{4})\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)/.exec(text);
        return m ? n(m[3]) : null;
      },
      security: (text) => {
        const m = /\/\s*(Helios[^\n]*?)\s*-\s*(INF[0-9A-Z]{9})/i.exec(text);
        return m ? m[1].replace(/\s*\*\s*/g, " ").replace(/\s+/g, " ").trim() : "Helios Flexi Cap Fund - Direct Growth";
      },
    }),
  },
  {
    key: "threeP",
    engagement: "AIF",
    // THE CATEGORY IS NOT ON 3P'S OWN STATEMENT — it is on the family's
    // DEPOSITORY tape for the same units, which names the scheme "3P INDIA EQUITY
    // FUND 1-CATEGORY III AIF-CLASS B1" (and B2, B3). So the category is carried
    // and says where it was printed, rather than reading as the fund's own words.
    providerEngagement: "Category III AIF — as the depository's scheme name for these units prints it (\"3P INDIA EQUITY FUND 1-CATEGORY III AIF\"); unit classes B1/B2/B3",
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
    // NO CATEGORY IS WRITTEN HERE, for the reason given on the Founders layout:
    // the statement prints none, and nothing else in the archive names one for
    // this fund. The family place it private themselves (`FAMILY_MARKET_SIDE`).
    providerEngagement: "drawdown AIF, with a commitment and uncalled capital — the statement prints no SEBI category",
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
    /**
     * THE MANAGER BLOCK PRINTS THE FUND'S SEBI REGISTRATION, CATEGORY INCLUDED —
     * "Manager to : Neo Infra Income Opportunities Fund · AIF -Category-II No :
     * IN/AIF2/22-23/1042" — and this string used to leave it out, so the fund
     * read as "Category not stated" beside a statement that states it. The
     * registration is quoted VERBATIM (§5 — the provider's own wording), which
     * is what `shared/aifCategory.mjs` reads the category from; where the line
     * is not on the page nothing is added and no category is claimed.
     */
    providerEngagement: (text) => {
      const base = "drawdown fund — the statement prints a capital commitment, dated drawdowns and a quarterly NAV";
      const reg = /AIF\s*-\s*Category\s*-\s*(?:III|II|I)\s+No\s*:\s*IN\/AIF\d\/[\d-]+\/\d+/i.exec(text ?? "");
      return reg ? `${base}; its manager block prints the SEBI registration "${reg[0].replace(/\s+/g, " ")}"` : base;
    },
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
        payouts: neoPayouts(text, warn),
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
      payouts: baringPayouts(text, warn),
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
  {
    /**
     * ASK ABSOLUTE RETURN FUND — see the block above `askArfClassName`. One
     * holding per Account Summary series and one dated row per contribution
     * and per redemption, each published ONLY where the statement's own
     * arithmetic ties it. Both folios in this archive are REDEEMED TO NIL:
     * the summary prints a dash for units and 0.00 for every valuation, so the
     * holding is a MEASURED zero at the NAV net of fee the statement prints,
     * which is what `isRedeemedToNil` reads as a closed position.
     */
    key: "askArf",
    engagement: "AIF",
    // NO CATEGORY IS WRITTEN HERE, because none is printed (PM-C3).
    providerEngagement: "AIF statement of account — the statement prints no SEBI category",
    provider: PROVIDERS.askArf,
    match: /ASK\s+Absolute\s+Return\s+Fund/i,
    assetClass: "AIF",
    rowsFrom: (text, warn) => askArfHoldingRows(text, warn ?? (() => {})),
    read: (s) => ({
      cls: s.cls, series: s.series,
      isin: s.isin,
      navDate: s.navDate,
      // A dash beside valuations of nil is nil — `askArfSummaryFails` has
      // already refused a dash beside anything else.
      quantity: s.units ?? 0,
      // The column the holding is VALUED at: net of fee, before tax — the
      // basis the statement's own Total row and the family's review carry.
      marketPrice: s.navNetFee,
      printedValue: s.valueNetFee,
    }),
    security: (_t, r) => askArfClassName(r.cls, r.series),
    account: (text) => (/Folio\s+Number\s*:?\s*(\d{6,})/i.exec(text) ?? [])[1] ?? null,
    asOf: (text) => toIso((/Statement\s+Date\s*:\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i.exec(text) ?? [])[1]),
    // `Name : <first holder>` — and never the `Second Holder Name` or the
    // `Distributor Name` printed on the same page.
    holder: (text) => {
      const m = /(?<!Holder\s{0,3}|Distributor\s{0,3})\bName\s*:\s*([^\n]{1,90})/.exec(text);
      return m ? m[1].split(NEXT_LABEL)[0].trim() || null : null;
    },
    jointHolders: askArfJointHolders,
    flowsFrom: askArfFlows,
    sectionsFrom: askArfSections,
    // The statement's own Total row, which prints a MEASURED 0.00 — the sum of
    // printed values below would read it as nothing. No cost is printed.
    totalsFrom: (text, holdings) => {
      const p = askArfParse(text);
      return holdings.length && p.total
        ? { totalMarketValue: p.total.valueNetFee, totalCost: null, positionCount: holdings.length }
        : null;
    },
    infoFrom: (holdings) => holdings.some((h) => h.quantity === 0)
      ? ["redeemed-to-nil", "every unit of this series has been redeemed: the Account Summary prints a dash for units and 0.00 for every valuation, so the holding is carried as a MEASURED zero at the NAV the statement prints — what the family received is the dated withdrawals, not a value"]
      : null,
    note: "valued at the NAV NET OF FEE, before tax — the basis the statement's Total row and the family's consolidated review both carry; the NAV net of fee and tax is printed beside it and kept in the archive. The statement prints no realised gain and no SEBI category, so the book carries neither",
    okWhenClean: true,
  },
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
 * NEO INFRA'S PAYOUTS — three dated tables, three printed totals.
 *
 *   `13-Jun-24 Distribution of Interest Income - - 1,20,149 12,015 1,08,134`
 *   `05-Jan-26 Capital Redemption -14,162.80 -14,16,280 - - -`
 *   `30-Aug-24 Equalization amount (paid)/received 1,86,952 18,695 1,68,257`
 *
 * reconciled against `Income Payout (Gross)`, `Principal Payout` and `Net
 * Equalisation` in the summary grid — and the grid's own `Total Payout` must be
 * the first two added, which is the statement checking itself before this
 * reader checks it.
 *
 * TWO THINGS THIS DOES NOT DO, deliberately. It does not drop the payouts dated
 * after the valuation date (the 9 July distribution sits on a statement whose
 * value is struck on 30 June): the record is the statement's, and WHICH flows a
 * return may count against which valuation is the return's question, answered
 * where the return is struck. And it does not net the principal off the cost:
 * the book's cost is the gross contribution the statement prints.
 */
function neoPayouts(text, warn) {
  const at = (re, i) => { const m = re.exec(text); return m ? n(m[i]) : null; };
  const rows = [];
  const INCOME = /(\d{2}-[A-Za-z]{3}-\d{2}) ((?:Short|Long) [Tt]erm [Cc]apital [Gg]ain|Distribution (?:of|on) (?:Interest|Other) Income) - - ([^\n]+)/g;
  for (const m of text.matchAll(INCOME)) {
    const figures = m[3].trim().split(" ");
    let row = null;
    if (figures.length === 3) {
      row = { gross: n(figures[0]), tds: figures[1] === "-" ? null : n(figures[1]), net: n(figures[2]) };
    } else if (figures.length === 1) {
      row = splitRunTogetherTriple(figures[0].replace(/,/g, ""));
    }
    rows.push({ date: toIso(m[1]), kind: "income", label: m[2], ...(row ?? { gross: null, tds: null, net: null }) });
  }
  for (const m of text.matchAll(/(\d{2}-[A-Za-z]{3}-\d{2}) Capital Redemption (-?[\d,]+\.\d+) (-?[\d,]+) - - -/g)) {
    const amount = n(m[3]);
    rows.push({ date: toIso(m[1]), kind: "capital", label: "Capital Redemption",
      gross: amount == null ? null : Math.abs(amount), tds: null, net: amount == null ? null : Math.abs(amount) });
  }
  for (const m of text.matchAll(/(\d{2}-[A-Za-z]{3}-\d{2}) Equalization amount \(paid\)\/received (-?[\d,]+) (-?[\d,]+|-) (-?[\d,]+)/g)) {
    rows.push({ date: toIso(m[1]), kind: "equalisation", label: "Equalisation received",
      gross: n(m[2]), tds: m[3] === "-" ? null : n(m[3]), net: n(m[4]) });
  }
  const income = at(NEO_ROWS.contribution, 2);
  const principal = at(NEO_ROWS.capital, 2);
  const total = at(NEO_ROWS.pending, 2);
  const equalisation = at(NEO_ROWS.undrawn, 2);
  // THE STATEMENT'S OWN IDENTITY FIRST. If the grid's three figures disagree
  // with each other, no row can be reconciled against them.
  if (income != null && principal != null && total != null && Math.abs(income + principal - total) > 1) {
    warn?.("payouts-summary-does-not-tie",
      `the summary grid prints Income Payout ${income} and Principal Payout ${principal} against a Total Payout of ${total}; no payout is carried`);
    return null;
  }
  if (income == null && principal == null && equalisation == null) return null;
  return payoutsIfTheyTie(rows, [
    { kind: "income", total: income, what: "Income Payout (Gross)" },
    { kind: "capital", total: principal, what: "Principal Payout" },
    { kind: "equalisation", total: equalisation, what: "Net Equalisation" },
  ], warn);
}

/**
 * BARING'S PAYOUTS — a distribution printed NET per row and GROSS only in
 * total, plus a compensating contribution printed in full.
 *
 *   `Less: Distribution (E) 37,252` · `Capital Distribution (Redemption) -`
 *   `Income Distribution 27,616` · `TDS 9,636`
 *   `Net Distribution STCG FY2025-26 31/03/2026 27,321`
 *   `Net Distribution Dividend FY2025-26 31/03/2026 295`
 *   `Compensating contribution 30/09/2025 18,909 1,891 17,018`  (NOT PART OF NAV)
 *
 * THE GROSS OF A DISTRIBUTION IS NOT PRINTED PER ROW, so it is never
 * apportioned across rows. Where every dated distribution row falls on ONE date
 * the statement's own totals ARE that date's gross, TDS and net, and they are
 * carried as one dated payout; rows spanning several dates would need a split
 * the statement does not print, and refuse. Every identity is the statement's:
 * E = redemption + income + TDS, and the net rows add to the income line.
 *
 * The compensating contribution's table prints no total. Its row prints gross,
 * TDS and net, and that row reconciling on its own figures is the only witness
 * the table offers — so it is accepted on exactly that, and says so.
 */
function baringPayouts(text, warn) {
  const figure = (re) => { const m = re.exec(text); return m ? n(m[1]) : null; };
  const E = figure(/Less: Distribution \(E\) ([\d,]+)/i);
  if (E == null) return null;
  const incomeNet = figure(/\nIncome Distribution ([\d,]+)/);
  const tds = figure(/\nTDS ([\d,]+)/);
  const redemptionRaw = (/Capital Distribution \(Redemption\) (-|[\d,]+)/i.exec(text) ?? [])[1];
  // A DASH IN AN IDENTITY IS WHAT THE IDENTITY SAYS IT IS. E = redemption +
  // income + TDS, so the redemption line is E less the two printed beside it —
  // and the dash is accepted only where that remainder is nil.
  const redemption = redemptionRaw === "-" ? 0 : n(redemptionRaw);
  if (incomeNet == null || tds == null || redemption == null || Math.abs(redemption + incomeNet + tds - E) > 1) {
    warn?.("payouts-summary-does-not-tie",
      `the NAV summary prints Distribution (E) ${E} against redemption ${redemptionRaw ?? "—"}, income ${incomeNet ?? "—"} and TDS ${tds ?? "—"}; no payout is carried`);
    return null;
  }
  const rows = [];
  const dated = [...text.matchAll(/Net Distribution (.+?) (\d{2}\/\d{2}\/\d{4}) ([\d,]+)/g)]
    .map((m) => ({ label: `Net Distribution ${m[1].trim()}`, date: toIso(m[2]), net: n(m[3]) }));
  if (redemption > 0) {
    warn?.("payouts-unchecked", `the statement prints a capital redemption of ${redemption} and no dated row this reader recognises for it; no payout is carried`);
    return null;
  }
  if (dated.length) {
    const dates = [...new Set(dated.map((d) => d.date))];
    const netSum = Math.round(dated.reduce((t, d) => t + (d.net ?? 0), 0) * 100) / 100;
    if (dates.length !== 1 || !dates[0] || Math.abs(netSum - incomeNet) > 1) {
      warn?.("payouts-do-not-tie",
        `${dated.length} dated net distribution(s) over ${dates.length} date(s) sum to ${netSum} against a printed Income Distribution of ${incomeNet}; the gross per date is not printed and is not apportioned, so no payout is carried`);
      return null;
    }
    rows.push({ date: dates[0], kind: "income", label: dated.map((d) => d.label).join(" · "), gross: incomeNet + tds, tds, net: incomeNet });
  } else if (E > 0) {
    warn?.("payouts-unchecked", `the statement prints a distribution of ${E} and no dated row for it; no payout is carried`);
    return null;
  }
  for (const m of text.matchAll(/Compensating contribution (\d{2}\/\d{2}\/\d{4}) ([\d,]+) ([\d,]+) ([\d,]+)/gi)) {
    rows.push({ date: toIso(m[1]), kind: "equalisation", label: "Compensating contribution",
      gross: n(m[2]), tds: n(m[3]), net: n(m[4]) });
  }
  return payoutsIfTheyTie(rows, [
    { kind: "income", total: E - redemption, what: "Distribution (E)" },
    { kind: "equalisation", total: null, what: "compensating-contribution total", rowsWitness: true },
  ], warn);
}

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
  // A report the classifier types differently from a plain statement — Buoyant's
  // Portfolio Snap Report — is the same layout with checks of its own. The
  // report type is the classifier's, never invented here.
  const variant = layout.variants?.[meta.reportType] ?? null;
  const reportType = variant ? meta.reportType : "holdings";
  const warnFn = (code, detail) => warn(warnings, code, detail);
  /** Warnings that describe the statement rather than fault the reading. */
  const INFO = new Set(["statement-basis", "redeemed-to-nil"]);
  const statusOf = (fallback) => (variant?.okWhenClean ?? layout.okWhenClean)
    && warnings.every((w) => INFO.has(w.code)) ? "ok" : fallback;

  // `rowsFrom` builds the rows itself, for a statement whose holdings are not
  // one regex match each: Sky Capital prints one line per ALLOTMENT and the
  // family holds several in the same series, so the rows are aggregated by
  // series before they become holdings. Everything else keeps the regex path.
  const before = warnings.length;
  const rows = layout.rowsFrom
    ? layout.rowsFrom(text, warnFn)
    : layout.allRows
    ? [...text.matchAll(layout.row)]
    : [layout.row.exec(text)].filter(Boolean);

  if (!rows.length) {
    // A layout that KNOWS why it has no rows says so. Everything else falls
    // back to the column diagnosis, which is the only honest answer when the
    // reason is genuinely unknown.
    const reason = layout.emptyReason?.(text) ?? null;
    if (reason) warn(warnings, "account-holds-nothing", reason);
    // A layout that built its rows itself and said why it has none has already
    // diagnosed it; the generic column message would contradict that.
    else if (warnings.length > before) { /* the reader's own diagnosis stands */ }
    else {
      warn(warnings, "summary-row-not-matched",
        `this document is a ${layout.provider} statement but its summary row did not match the declared column order; nothing is read from it rather than reading the wrong columns`);
    }
    if (layout.note) warn(warnings, "statement-basis", layout.note);
    return {
      provider: layout.provider, owner, pan,
      accountNo: layout.account?.(text) ?? layout.folio?.(text) ?? null,
      asOf: layout.asOf?.(text) ?? null,
      reportType,
      engagement: layout.engagement ?? "unknown",
      providerEngagement: engagementOf(layout, text),
      jointHolders: layout.jointHolders?.(text) ?? undefined,
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
  if (variant?.verify) variant.verify(text, holdings, warnFn);

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
  const info = layout.infoFrom?.(holdings);
  if (info) warn(warnings, info[0], info[1]);
  const ownSections = { ...(layout.sectionsFrom?.(text) ?? {}), ...(variant?.sectionsFrom?.(text) ?? {}) };
  const printedTotals = layout.totalsFrom?.(text, holdings) ?? null;

  return {
    provider: layout.provider,
    owner, pan,
    accountNo: layout.account?.(text) ?? layout.folio?.(text) ?? null,
    asOf: layout.asOf?.(text) ?? null,
    // These ARE holdings statements — one scheme, its units and its NAV. Left
    // as `unknown` the docKey reads `…-unknown` and precedence has nothing to
    // key on.
    reportType,
    // WHAT THE VEHICLE IS, in the fund's own words. Left unset these accounts
    // came out `engagement: "unknown"` with a null providerEngagement, which
    // section 5 of CLAUDE.md warns is never to be defaulted - and null is not
    // even in the contract, so the typecheck refused the book outright.
    engagement: layout.engagement ?? "unknown",
    providerEngagement: engagementOf(layout, text),
    jointHolders: layout.jointHolders?.(text) ?? undefined,
    holdings,
    cashFlows,
    // A time-weighted return the statement prints, where the layout reads one.
    ...(variant?.returnsFrom ? { returns: variant.returnsFrom(text, meta) } : {}),
    // BROWSABLE PROVENANCE, so a reader who sees a redemption on the dashboard
    // can open the rows it was read from. A dated table archived only inside
    // `document.json` is provenance the Data Audit page cannot show.
    sections: cashFlows.length || Object.keys(ownSections).length
      ? {
        ...(cashFlows.length ? {
          transactions: {
            name: "transactions",
            rows: [["date", "class", "description", "kind", "amount", "net", "units", "balanceUnits"],
              ...cashFlows.map((c) => [c.date, c.security ?? "", c.description, c.kind,
                c.amount ?? "", c.netAmount ?? "", c.units ?? "", c.balance ?? ""])],
          },
        } : {}),
        ...ownSections,
      }
      : undefined,
    commitment,
    totals: printedTotals ? makeTotals(printedTotals) : makeTotals({
      totalMarketValue: layout.valuesNothing ? null : holdings.reduce((t, h) => t + (h.printed?.marketValue ?? 0), 0) || null,
      totalCost: holdings.reduce((t, h) => t + (h.totalCost ?? 0), 0) || null,
      positionCount: holdings.length,
    }),
    warnings,
    status: statusOf(undefined),
  };
}

export const PROVIDER = Object.values(PROVIDERS);
