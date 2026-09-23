// The 3P `Financial Transaction(s)` reader, and its five checks.
// Run: node scripts/ingest/__tests__/altFund.test.mjs
//
// WRITTEN AGAINST A SYNTHETIC STATEMENT, and every case is a MUTATION of it.
// The reader emits nothing unless all five checks pass, so the only way to know
// the checks are load-bearing is to break the statement one figure at a time and
// watch each one refuse. A suite that only asserts the happy path proves the
// regex matches; it proves nothing about the licence to publish a dated tape.
import { threePFlows, buoyantFlows } from "../providers/altFundStatements.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("altFund");

// A statement in 3P's own layout, with figures chosen so every identity holds:
//   gross - setup - stamp = net,  |net| = |units| x NAV,  balances run,
//   the reclassification nets to zero in rupees, and page 3 agrees.
//
//   B1: 1,00,00,000 buys 99,999.000 units at 100.0000 (1,000 stamp duty)
//   B1 out at 120.0000 -> (1,19,99,880.00)
//   B2: 1,19,99,880.00 in at 96.0000 -> 1,24,998.750 units
const STATEMENT = `
Account Summary as on 31-07-2026
3P India Equity Fund 1 - Class B1
Date Transaction Type Contribution Setup Expense Stamp Amount Post-Tax No. of Units Balance
04-05-2023 Subscription 1,00,00,000.00 - 1,000.00 99,99,000.00 100.0000 99,990.000 99,990.000
31-03-2026 Reclassification Out - - - (1,19,98,800.00) 120.0000 (99,990.000) 0.000
3P India Equity Fund 1 - Class B2
Date Transaction Type Contribution Setup Expense Stamp Amount Post-Tax No. of Units Balance
31-03-2026 Reclassification In - - - 1,19,98,800.00 96.0000 1,24,987.500 1,24,987.500
31-07-2026 Full Units Redemption - - - (1,49,98,500.00) 120.0000 (1,24,987.500) 0.000
Reclassification
With Effect From 1 April 2026 1,24,987.500 B2 0.70%
`;

const read = (text) => {
  const warns = [];
  const rows = threePFlows(text, (code, detail) => warns.push({ code, detail }));
  return { rows, warns };
};

// ── the statement as printed ────────────────────────────────────────────────
{
  const { rows, warns } = read(STATEMENT);
  ok("a statement that ties is read", rows.length === 4, `got ${rows.length} row(s), warns ${JSON.stringify(warns)}`);
  ok("no warning on a clean read", warns.length === 0, JSON.stringify(warns));

  const kinds = rows.map((r) => r.kind);
  ok("a subscription is a contribution", kinds[0] === "contribution", kinds.join(","));
  ok("a redemption is a withdrawal", kinds.at(-1) === "withdrawal", kinds.join(","));
  ok("a reclassification is neither",
    kinds.filter((k) => k === "reclassification").length === 2, kinds.join(","));

  /**
   * ...AND THE LABEL IS NOT THE POINT — THE MONEY IS.
   *
   * Typed as a contribution and a withdrawal, a class transfer would put its
   * whole value out of the family's dated record and back into it on one day,
   * inside one folio, having moved nothing. On the real statement that is
   * ₹17.85 Cr in each direction. Asserted as the FIGURE rather than the kind, so
   * a reader of this suite can see what the label is protecting: a check on the
   * word alone would pass a reader that had renamed the kind and kept the money.
   */
  const rs = (k) => rows.filter((r) => r.kind === k).reduce((t, r) => t + Math.abs(r.amount), 0);
  ok("what a reclassification would have added to each side, had it been one",
    Math.round(rs("reclassification") / 2) === 11998800, String(rs("reclassification")));
  ok("...and the two real sides carry only real money",
    rs("contribution") === 10000000 && rs("withdrawal") === 14998500,
    `${rs("contribution")} / ${rs("withdrawal")}`);

  // The LABEL is the statement's own word, which is what reaches the family's
  // transactions table. "Full Units Redemption", never our "Sell".
  ok("the label is the statement's own",
    rows.at(-1).description === "Full Units Redemption", rows.at(-1).description);

  // Each class is its own security, so a per-class row can be told apart.
  ok("each class keys as its own security",
    new Set(rows.map((r) => r.securityKey)).size === 2, JSON.stringify(rows.map((r) => r.securityKey)));

  // netAmount is the DECLARATION that the amount is a movement. Only the row
  // that prints a gross can carry one.
  ok("a gross row declares its own net", rows[0].netAmount === 9999000, String(rows[0].netAmount));
  ok("a row with no gross column declares no net",
    rows.slice(1).every((r) => r.netAmount === null), JSON.stringify(rows.map((r) => r.netAmount)));

  // Signed as printed: the archive is the faithful record.
  ok("a parenthesised figure stays negative", rows.at(-1).amount === -14998500, String(rows.at(-1).amount));
  ok("units are signed as printed", rows.at(-1).units === -124987.5, String(rows.at(-1).units));
}

// ── each check, proved by breaking the statement ────────────────────────────
// EACH MUTATION ISOLATES ONE CHECK, and that took measuring rather than
// reasoning: the first draft changed a unit count, which moves the units x NAV
// identity AND the running balance, so checks 2 and 3 both fired and neither
// could be shown to be load-bearing on its own. Every figure below is chosen so
// that exactly one identity breaks — the reclassification case moves the amount
// and its NAV TOGETHER, so units x NAV still ties and only the netting fails.
const breaks = [
  ["(1) the row's own arithmetic",
   // Stamp duty alone: gross - charges no longer reaches the printed net, while
   // units x NAV and the balance are untouched.
   ["- 1,000.00 99,99,000.00", "- 2,000.00 99,99,000.00"]],
  ["(2) amount is units x NAV",
   // The NAV alone: the row's own subtraction still ties and so does the balance.
   ["99,99,000.00 100.0000", "99,99,000.00 110.0000"]],
  ["(3) the running balance",
   // The printed Balance Units alone, on the first row of Class B1.
   ["100.0000 99,990.000 99,990.000", "100.0000 99,990.000 88,880.000"]],
  ["(4) the reclassification nets to zero in rupees",
   // The amount AND its NAV together, so units x NAV still holds to the printed
   // precision (99,990 x 119.9920 = 1,19,98,000.08) and only the two sides stop
   // cancelling — Rs 800 of money appearing out of a transfer.
   ["(1,19,98,800.00) 120.0000", "(1,19,98,000.00) 119.9920"]],
  ["(5) page 3 agrees with the tape",
   ["With Effect From 1 April 2026 1,24,987.500", "With Effect From 1 April 2026 1,24,000.000"]],
  ["a transaction type this reader does not declare",
   ["31-07-2026 Full Units Redemption", "31-07-2026 Bonus Issue"]],
];
for (const [label, [from, to]] of breaks) {
  const text = STATEMENT.replace(from, to);
  ok(`${label} — the mutation applied`, text !== STATEMENT, `"${from}" not found`);
  const { rows, warns } = read(text);
  ok(`${label} refuses the whole table`, rows.length === 0, `got ${rows.length} row(s)`);
  ok(`${label} says why`, warns.length === 1 && /does-not-tie|not-declared/.test(warns[0].code),
    JSON.stringify(warns));
}

// ── AND A CHECK MUST NOT FIRE ON A CORRECT STATEMENT ────────────────────────
//
// The units do NOT net to zero across a reclassification — each side is struck
// at its own class NAV — and check 4 asserting they did is exactly the premise
// this reader refuted on its first run against the real statement. 99,990 units
// leave at 120.0000 and 1,24,987.5 arrive at 96.0000, a gain of 24,997.5 on a
// transfer that moved no money.
{
  const { rows } = read(STATEMENT);
  const recl = rows.filter((r) => r.kind === "reclassification");
  const dU = recl.reduce((t, r) => t + r.units, 0);
  const dRs = Math.round(recl.reduce((t, r) => t + r.amount, 0) * 100) / 100;
  ok("a reclassification nets to zero in rupees", dRs === 0, String(dRs));
  ok("and legitimately NOT in units", Math.abs(dU - 24997.5) < 0.0005, String(dU));
}

// ── A DOCUMENT WITH NO SUCH TABLE YIELDS NOTHING AND SAYS NOTHING ───────────
{
  const { rows, warns } = read("Account Summary as on 31-07-2026\nNothing dated here at all.\n");
  ok("no table, no rows", rows.length === 0);
  ok("no table, no warning", warns.length === 0, JSON.stringify(warns));
}

// ═══════════════════════════════════════════════════════════════════════════
// BUOYANT — the dated deposits, and the class switch the return was hiding
// ═══════════════════════════════════════════════════════════════════════════
//
// Figures chosen so every identity holds, and so the statement carries the
// three things the real ones do: a CLASS SWITCH (A1 -> A4 on 01/03/2026), a
// GAIN DISTRIBUTION reinvested into an allotment (01/06/2025), and a PAGE
// BREAK between Class A1's heading and its first rows — the header lines it
// reprints must not reset the class.
//
//   01/01/2025  deposit 1,00,00,000  -> A1 1,00,000 units at 100.0000
//   01/06/2025  deposit   50,00,000  + gain distr 5,000 -> A1 40,000 at 125.1250
//   01/03/2026  deposit   22,40,000  -> A4 20,000 at 112.0000
//               A1 1,40,000 redeemed at 120.0000 = 1,68,00,000
//                 -> A4 1,50,000 at 112.0000 (the switch)
//   held: A4 1,70,000 units, cost 1,90,40,000
const BUOYANT = `
Account Summary : As of 31/07/2026
Folio : TEST001
Serial No NAV Date Unit Balance Cost (INR) NAV Value (INR) Absolute % Annualised %
BUOYANT OPPORTUNITIES 31/07/2026 1,70,000.0000 1,90,40,000.00 115.0000 1,95,50,000.00 2.68 5.00
STRATEGY - CATEGORY III -
CLASS A4
Total 1,70,000.0000 1,90,40,000.00 1,95,50,000.00
Date Transactions Amount (INR)
01/01/2025 Cash Deposits 1,00,00,000.00
01/06/2025 Cash Deposits 50,00,000.00
01/03/2026 Cash Deposits 22,40,000.00
Transactions : BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III - CLASS A4
Date Transactions NAV Units Amount (INR)
01/03/2026 Units Allotment 112.0000 20,000.0000 22,40,000.00
01/03/2026 Units Allotment 112.0000 1,50,000.0000 1,68,00,000.00
Transactions : BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III - CLASS A1
Date Transactions NAV Units Amount (INR)
Account Statement
Account : 100001 TEST HOLDER
Buoyant Opportunities Strategy - Investor
As of 31/07/2026
01/01/2025 Units Allotment 100.0000 1,00,000.0000 1,00,00,000.00
01/06/2025 Units Allotment 125.1250 40,000.0000 50,05,000.00
01/03/2026 Unit Redemption 120.0000 1,40,000.0000 1,68,00,000.00
Transactions : Other Liabilities and Assets
Date Transactions NAV Units Amount (INR)
01/06/2025 Gain Distr. 1.0000 5,000.0000 5,000.00
Note: NAV per unit is net of all expenses and taxes, up to the last closure date.
`;

const readB = (text) => {
  const warns = [];
  const rows = buoyantFlows(text, (code, detail) => warns.push({ code, detail }));
  return { rows, warns };
};

// ── the statement as printed ────────────────────────────────────────────────
{
  const { rows, warns } = readB(BUOYANT);
  ok("buoyant: a statement that ties is read", rows.length === 9, `got ${rows.length} row(s), warns ${JSON.stringify(warns)}`);
  ok("buoyant: no warning on a clean read", warns.length === 0, JSON.stringify(warns));

  const of = (k) => rows.filter((r) => r.kind === k);
  // ONLY A DEPOSIT IS CAPITAL. Everything else on the statement is a movement
  // INSIDE the fund, and `capitalMovesFrom` reads contributions and withdrawals
  // alone — so the switch cannot enter the family's capital record as money out
  // and back in, and the reinvested distribution cannot enter it as money in.
  ok("buoyant: the deposits and only the deposits are contributions",
    of("contribution").length === 3 && of("contribution").reduce((t, r) => t + r.amount, 0) === 17240000,
    JSON.stringify(of("contribution").map((r) => r.amount)));
  ok("buoyant: nothing is a withdrawal", of("withdrawal").length === 0);
  ok("buoyant: the switch is two reclassification legs",
    of("reclassification").length === 2, rows.map((r) => r.kind).join(","));
  ok("buoyant: the switch moves no money",
    Math.round(of("reclassification").reduce((t, r) => t + r.amount, 0) * 100) === 0,
    String(of("reclassification").reduce((t, r) => t + r.amount, 0)));
  ok("buoyant: the reinvested distribution is income, never capital",
    of("reinvested-income").length === 1 && of("reinvested-income")[0].amount === 5000);
  ok("buoyant: a deposit-funded allotment is an allotment", of("allotment").length === 3);

  // THE PAGE BREAK. Class A1's rows sit after a reprinted page header, and all
  // three must still be filed under A1 — the redemption above all, because it
  // is the leg that makes this a switch rather than a mystery.
  // Class-table rows only: a DEPOSIT also names the class it bought, so counting
  // every A1-keyed row would count the cash table too.
  const a1 = rows.filter((r) => r.kind !== "contribution" && /class-a1$/.test(r.securityKey ?? ""));
  ok("buoyant: the class carries across a page break", a1.length === 3,
    JSON.stringify(rows.map((r) => [r.date, r.kind, r.securityKey])));
  ok("buoyant: a deposit names the class it bought",
    of("contribution").map((r) => (r.securityKey ?? "").slice(-2)).join(",") === "a1,a1,a4",
    of("contribution").map((r) => r.securityKey).join(","));
}

// ── EACH GATE MUST BE ABLE TO REFUSE ON ITS OWN ─────────────────────────────
//
// Every mutation is built to break ONE identity and leave the other four
// holding, so a gate that stopped checking would let exactly its own case
// through. A mutation that tripped two gates would prove neither.
const bBreaks = [
  ["gate 1 — an undeclared row type",
    BUOYANT.replace("Note: NAV", "01/07/2025 Dividend Payout 1.0000 100.0000 100.00\nNote: NAV"),
    "transaction-type-not-declared"],
  ["gate 1 — a cash movement this reader has never seen printed",
    BUOYANT.replace("01/03/2026 Cash Deposits 22,40,000.00", "01/03/2026 Cash Deposits 22,40,000.00\n01/04/2026 Cash Withdrawal 1,000.00"),
    "transaction-type-not-declared"],
  // units x NAV no longer meets the printed amount — and nothing else moves.
  ["gate 2 — a row's own arithmetic",
    BUOYANT.replace("01/01/2025 Units Allotment 100.0000", "01/01/2025 Units Allotment 101.0000"),
    "dated-table-does-not-tie", /unit\(s\) at 101/],
  // The deposit that paid for 01/06/2025's allotment is gone.
  ["gate 3 — a missed deposit",
    BUOYANT.replace("01/06/2025 Cash Deposits 50,00,000.00\n", ""),
    "dated-table-does-not-tie", /2025-06-01: 5005000 was allotted/],
  ["gate 4 — units against the printed balance",
    BUOYANT.replace("31/07/2026 1,70,000.0000 1,90,40,000.00", "31/07/2026 1,70,001.0000 1,90,40,000.00"),
    "dated-table-does-not-tie", /Class A4: 170000 unit/],
  ["gate 5 — cost against the printed cost",
    BUOYANT.replace("31/07/2026 1,70,000.0000 1,90,40,000.00", "31/07/2026 1,70,000.0000 1,90,50,000.00"),
    "dated-table-does-not-tie", /Class A4: allotments add to 19040000/],
];
for (const [label, text, code, detail] of bBreaks) {
  const { rows, warns } = readB(text);
  ok(`buoyant ${label}: publishes nothing`, rows.length === 0, `got ${rows.length} row(s)`);
  const w = warns.find((x) => x.code === code);
  ok(`buoyant ${label}: says why`, !!w && (!detail || detail.test(w.detail)), JSON.stringify(warns));
  // And names ONLY its own cause: a second failure would mean the mutation
  // broke two identities, and then neither gate is shown to be load-bearing.
  const causes = (w?.detail ?? "").split("; ").length;
  ok(`buoyant ${label}: trips one gate only`, code !== "dated-table-does-not-tie" || causes === 1,
    w?.detail ?? "");
}

// ── A redemption that is not one leg of a switch is not read as one ─────────
//
// TWO WAYS IT CAN FAIL TO BE ONE, AND THEY ARE DIFFERENT GUARDS.
{
  // Money that LEFT. The switch-in allotment is gone and the A4 summary moved
  // to match, so gates 4 and 5 hold — but ₹1,68,00,000 was redeemed on a day
  // nothing paid out is printed, and the day cannot balance. Gate 3 is what
  // refuses a payout this reader has never seen printed, before any pairing.
  const payout = BUOYANT
    .replace("01/03/2026 Units Allotment 112.0000 1,50,000.0000 1,68,00,000.00\n", "")
    .replace("31/07/2026 1,70,000.0000 1,90,40,000.00", "31/07/2026 20,000.0000 22,40,000.00");
  const { rows, warns } = readB(payout);
  ok("buoyant: money redeemed and paid out publishes nothing", rows.length === 0, `got ${rows.length}`);
  ok("buoyant: and the day that cannot balance is named",
    warns.some((w) => /2026-03-01: 2240000 was allotted against 19040000/.test(w.detail)), JSON.stringify(warns));
}
{
  // Money that STAYED, but in two pieces. The switch-in is split across two
  // allotments of 84,00,000 each, so the day balances, the units tie and the
  // cost ties — every other gate passes — and no SINGLE allotment matches the
  // redemption. Which rows came from the switch is then a guess, so the table
  // is withheld rather than filed on one.
  const split = BUOYANT.replace(
    "01/03/2026 Units Allotment 112.0000 1,50,000.0000 1,68,00,000.00",
    "01/03/2026 Units Allotment 112.0000 75,000.0000 84,00,000.00\n01/03/2026 Units Allotment 112.0000 75,000.0000 84,00,000.00");
  const { rows, warns } = readB(split);
  ok("buoyant: a switch that cannot be paired publishes nothing", rows.length === 0, `got ${rows.length}`);
  ok("buoyant: and says it cannot tell a switch from a payout",
    warns.some((w) => /pairs with 0 allotment\(s\) rather than one/.test(w.detail)), JSON.stringify(warns));
  ok("buoyant: and that is its only complaint",
    (warns[0]?.detail ?? "").split("; ").length === 1, warns[0]?.detail ?? "");
}

// ── No such table: nothing, and no warning ──────────────────────────────────
{
  const { rows, warns } = readB("Account Summary : As of 31/07/2026\nNothing dated here at all.\n");
  ok("buoyant: no table, no rows", rows.length === 0);
  ok("buoyant: no table, no warning", warns.length === 0, JSON.stringify(warns));
}

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
