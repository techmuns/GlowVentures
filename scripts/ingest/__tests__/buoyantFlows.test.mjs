// Buoyant's dated record — the deposits, the per-class allotments and the class
// switch — and the five checks that license publishing it.
// Run: node scripts/ingest/__tests__/buoyantFlows.test.mjs
//
// WRITTEN AGAINST A SYNTHETIC STATEMENT, and every case is a MUTATION of it —
// `altFund.test.mjs`'s method, for the same reason: the reader emits nothing
// unless all five checks pass, so the only way to know each check is
// load-bearing is to break the statement one figure at a time and watch it
// refuse. The real statements would pass whatever these checks said.
import { buoyantFlows, extract } from "../providers/altFundStatements.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("buoyantFlows");

// Buoyant's own layout, with figures chosen so every identity holds exactly:
//
//   01/06/2024  deposit 1,00,00,000 → Class A1   1,00,000 units @ 100
//   01/04/2025  deposit   50,00,000 + Gain Distr. 5,000 reinvested
//                                   → Class A1     40,040 units @ 125 = 50,05,000
//   01/06/2025  the SWITCH: A1 1,40,040 units out @ 150 = 2,10,06,000
//                           A4 1,75,050 units in  @ 120 = 2,10,06,000
//   01/06/2025  deposit   60,00,000 → Class A4     50,000 units @ 120
//
// So the family PAID 2,10,00,000 in cash, the units cost 2,10,05,000 (the
// reinvested distribution included), and the fund's own Cost column for Class
// A4 reads 2,70,06,000 — the switch-day value, which is the whole defect this
// reader exists to expose. The Class A1 table runs over a page break, exactly as
// one of Ajay's two issues prints it.
const STATEMENT = `
Account Statement
Account : 100001 TEST INVESTOR NAME
Buoyant Opportunities Strategy - Investor
As of 31/07/2026
Summary of Capital Distribution
LT Profit Payout ST Profit Payout Dividend Payout Interest Payout Principal Payout TDS on Payout Total Distribution
0.00 0.00 0.00 0.00 0.00 0.00 0.00
Account Summary : As of 31/07/2026
Folio : BOUYA999
Serial No NAV Date Unit Balance Cost (INR) NAV Value (INR) Absolute % Annualised %
BUOYANT OPPORTUNITIES 31/07/2026 2,25,050.0000 2,70,06,000.00 130.0000 2,92,56,500.00 8.33 9.00
STRATEGY - CATEGORY III -
CLASS A4
Total 2,25,050.0000 2,70,06,000.00 2,92,56,500.00
Date Transactions Amount (INR)
01/06/2024 Cash Deposits 1,00,00,000.00
01/04/2025 Cash Deposits 50,00,000.00
01/06/2025 Cash Deposits 60,00,000.00
Transactions : BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III - CLASS A4
Date Transactions NAV Units Amount (INR)
01/06/2025 Units Allotment 120.0000 1,75,050.0000 2,10,06,000.00
01/06/2025 Units Allotment 120.0000 50,000.0000 60,00,000.00
Transactions : BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III - CLASS A1
Date Transactions NAV Units Amount (INR)
Account Statement
Account : 100001 TEST INVESTOR NAME
Buoyant Opportunities Strategy - Investor
As of 31/07/2026
01/06/2024 Units Allotment 100.0000 1,00,000.0000 1,00,00,000.00
01/04/2025 Units Allotment 125.0000 40,040.0000 50,05,000.00
01/06/2025 Unit Redemption 150.0000 1,40,040.0000 2,10,06,000.00
Transactions : Other Liabilities and Assets
Date Transactions NAV Units Amount (INR)
01/04/2025 Gain Distr. 1.0000 5,000.0000 5,000.00
Note: NAV per unit is net of all expenses and taxes, up to the last closure date.
Investment Summary (INR)
Capital Invested 21,000,000
`;

const read = (text) => {
  const warns = [];
  const rows = buoyantFlows(text, (code, detail) => warns.push({ code, detail }));
  return { rows, warns, why: warns.map((w) => w.detail).join(" | ") };
};
/** One mutation: `from` must occur exactly once, so a stale edit cannot pass silently. */
const mutate = (from, to, text = STATEMENT) => {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`mutation anchor ${JSON.stringify(from)} occurs ${n} times`);
  return text.replace(from, to);
};
const refuses = (label, text, reason) => {
  const { rows, why } = read(text);
  ok(`${label} — refused`, rows.length === 0, `published ${rows.length} row(s)`);
  ok(`${label} — and says why`, reason.test(why), why || "(no warning)");
};

// ── the statement as printed ────────────────────────────────────────────────
{
  const { rows, warns } = read(STATEMENT);
  ok("a statement that ties is read", rows.length === 5, `got ${rows.length} row(s): ${JSON.stringify(warns)}`);
  ok("no warning on a clean read", warns.length === 0, JSON.stringify(warns));

  const byKind = (k) => rows.filter((r) => r.kind === k);
  ok("three deposits are three contributions", byKind("contribution").length === 3);
  ok("the switch is two reclassification legs", byKind("reclassification").length === 2);
  ok("nothing is a withdrawal — no money left the fund", byKind("withdrawal").length === 0);

  /**
   * THE MONEY, NOT THE LABELS. Typed as a withdrawal and a contribution, the
   * switch would put 2,10,06,000 out of the family's dated record and back in
   * on one day, having moved nothing — and the book would then carry the
   * switch-day value as money paid in, which is exactly the Invested ₹72.5 Cr
   * the family refused to believe. Asserted as the FIGURES.
   */
  const cash = byKind("contribution").reduce((t, r) => t + r.amount, 0);
  const bought = byKind("contribution").reduce((t, r) => t + r.netAmount, 0);
  ok("what the family PAID is the deposits alone", cash === 21000000, String(cash));
  ok("what the units COST includes the reinvested distribution", bought === 21005000, String(bought));
  const legs = byKind("reclassification");
  ok("the switch nets to zero rupees", Math.abs(legs.reduce((t, r) => t + r.amount, 0)) <= 1,
    legs.map((r) => r.amount).join(" / "));
  ok("...and its value appears in no contribution",
    !byKind("contribution").some((r) => r.amount === 21006000 || r.netAmount === 21006000));

  const gain = rows.find((r) => r.date === "2025-04-01");
  ok("a reinvested Gain Distr. is on the allotment it bought, not a deposit of its own",
    gain?.amount === 5000000 && gain?.netAmount === 5005000 && /reinvested/i.test(gain?.notes ?? ""),
    JSON.stringify(gain));

  const out = legs.find((r) => r.amount < 0), inn = legs.find((r) => r.amount > 0);
  ok("the out-leg is the old class", out?.securityKey === "buoyant-opportunities-strategy-category-iii-class-a1",
    out?.securityKey);
  ok("the in-leg is the new class", inn?.securityKey === "buoyant-opportunities-strategy-category-iii-class-a4",
    inn?.securityKey);
  ok("the legs carry the statement's own words",
    out?.description === "Unit Redemption" && inn?.description === "Units Allotment",
    `${out?.description} / ${inn?.description}`);
  ok("on the switch day the units leave before they arrive",
    rows.indexOf(out) < rows.indexOf(inn), rows.map((r) => r.description).join(", "));

  // The running balance is the statement's own arithmetic reproduced, carried
  // as the check it is: Class A1 runs to zero, Class A4 to the summary's figure.
  ok("Class A1 runs to zero on the switch", out?.balance === 0, String(out?.balance));
  const lastA4 = rows.filter((r) => /class-a4$/.test(r.securityKey)).at(-1);
  ok("Class A4 runs to the Account Summary's Unit Balance", lastA4?.balance === 225050, String(lastA4?.balance));
  ok("a table that runs over a page break is read whole",
    byKind("contribution").filter((r) => /class-a1$/.test(r.securityKey)).length === 2);
}

// ── ONE CASE PER CHECK ──────────────────────────────────────────────────────

// (1) units × NAV must reproduce the printed amount.
refuses("(1) a NAV that does not reproduce its row's amount",
  mutate("01/04/2025 Units Allotment 125.0000", "01/04/2025 Units Allotment 126.0000"),
  /is not the printed/);

// (2) the running units must reach the summary's balance...
refuses("(2) a Unit Balance the transactions do not reach",
  mutate("31/07/2026 2,25,050.0000", "31/07/2026 2,25,051.0000"),
  /run to .* units against the Account Summary/);
// ...and a class the summary does not print must run to zero.
refuses("(2) a class left holding units the summary does not print",
  mutate("Capital Invested 21,000,000", "Capital Invested 21,010,000",
    mutate("01/06/2025 Cash Deposits 60,00,000.00", "01/06/2025 Cash Deposits 60,00,000.00\n01/07/2025 Cash Deposits 10,000.00",
      mutate("Transactions : Other Liabilities", "Transactions : BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III - CLASS A2\n01/07/2025 Units Allotment 100.0000 100.0000 10,000.00\nTransactions : Other Liabilities"))),
  /Class A2: .* against zero/);

// (3) a redemption with no switch partner is money OUT, which is not declared.
refuses("(3) a redemption whose partner is on another day",
  mutate("01/06/2025 Units Allotment 120.0000 1,75,050.0000", "02/06/2025 Units Allotment 120.0000 1,75,050.0000"),
  /no allotment of another class on the same day/);
// ±₹1 is the whole allowance: each leg is rounded at its own NAV. The real
// statement's residual is ₹0.06 and must read; ₹2 is not rounding.
{
  const within = mutate("31/07/2026 2,25,050.0000 2,70,06,000.00", "31/07/2026 2,25,049.9995 2,70,05,999.94",
    mutate("01/06/2025 Units Allotment 120.0000 1,75,050.0000 2,10,06,000.00", "01/06/2025 Units Allotment 120.0000 1,75,049.9995 2,10,05,999.94"));
  const { rows, why } = read(within);
  ok("(3) a switch residual of ₹0.06 still reads", rows.length === 5, why);
}
refuses("(3) a switch residual of ₹2 is not rounding",
  mutate("31/07/2026 2,25,050.0000 2,70,06,000.00", "31/07/2026 2,25,049.9833 2,70,05,998.00",
    mutate("01/06/2025 Units Allotment 120.0000 1,75,050.0000 2,10,06,000.00", "01/06/2025 Units Allotment 120.0000 1,75,049.9833 2,10,05,998.00")),
  /no allotment of another class on the same day/);

// (4) every deposit buys an allotment, every allotment is bought, and a
//     distribution is reinvested rather than paid out.
refuses("(4) a deposit that buys no allotment",
  mutate("01/06/2025 Cash Deposits 60,00,000.00", "01/06/2025 Cash Deposits 60,00,001.00"),
  /buys no allotment on its own day/);
refuses("(4) a Gain Distr. that was paid out",
  mutate("Capital Invested 21,000,000", "Capital Invested 21,005,000",
    mutate("01/04/2025 Cash Deposits 50,00,000.00", "01/04/2025 Cash Deposits 50,05,000.00")),
  /Gain Distr\. is reinvested in no allotment/);
refuses("(4) a payout on the Summary of Capital Distribution",
  mutate("0.00 0.00 0.00 0.00 0.00 0.00 0.00", "0.00 0.00 0.00 0.00 1,000.00 0.00 1,000.00"),
  /prints a payout/);

// (5) the deposits against the statement's own Capital Invested.
refuses("(5) Capital Invested the deposits do not sum to",
  mutate("Capital Invested 21,000,000", "Capital Invested 22,000,000"),
  /sum to .* Capital Invested/);
{
  const { rows } = read(mutate("Capital Invested 21,000,000", ""));
  ok("(5) an issue printing no Capital Invested is still read", rows.length === 5);
}

// A dated type this reader does not declare refuses the whole record.
refuses("an undeclared transaction type",
  mutate("01/06/2025 Cash Deposits 60,00,000.00", "01/06/2025 Cash Deposits 60,00,000.00\n01/07/2025 Cash Withdrawal 5,000.00"),
  /does not declare/);

// ── the layout end to end — the join `build-book` depends on ────────────────
{
  const doc = extract({ grid: { pages: [{ text: STATEMENT }] } });
  const holdingKey = doc?.holdings?.[0]?.securityKey;
  ok("the holding and its contributions share one securityKey",
    holdingKey === "buoyant-opportunities-strategy-category-iii-class-a4"
      && doc.cashFlows.some((c) => c.kind === "contribution" && c.securityKey === holdingKey),
    `${holdingKey} vs ${doc?.cashFlows?.map((c) => c.securityKey).join(",")}`);
  ok("the dated table is archived as a browsable section",
    (doc?.sections?.transactions?.rows?.length ?? 0) === 6,
    String(doc?.sections?.transactions?.rows?.length));
  ok("the holding still reads the fund's own cost — the reader does not repair it",
    doc?.holdings?.[0]?.totalCost === 27006000, String(doc?.holdings?.[0]?.totalCost));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
