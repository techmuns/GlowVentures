// The 3P `Financial Transaction(s)` reader, and its five checks.
// Run: node scripts/ingest/__tests__/altFund.test.mjs
//
// WRITTEN AGAINST A SYNTHETIC STATEMENT, and every case is a MUTATION of it.
// The reader emits nothing unless all five checks pass, so the only way to know
// the checks are load-bearing is to break the statement one figure at a time and
// watch each one refuse. A suite that only asserts the happy path proves the
// regex matches; it proves nothing about the licence to publish a dated tape.
import { threePFlows } from "../providers/altFundStatements.mjs";

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

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
