// THE PAYOUT READER AND ITS GATE — what a drawdown fund paid BACK, dated.
// Run: node scripts/ingest/__tests__/payouts.test.mjs
//
// WRITTEN AGAINST SYNTHETIC STATEMENTS, and every case is a MUTATION of one,
// for the reason `capitalCalls.test.mjs` gives: `payoutsIfTheyTie` publishes a
// dated payout table only where its rows reproduce the totals the same
// statement prints, so the only way to know that gate is load-bearing is to
// break a statement one figure at a time and watch it refuse. The happy path
// proves the regexes match; the mutations prove the licence.
//
// THE CASE THAT MATTERS MOST IS THE ONE THAT LOOKS BEST. A payout record short
// a payment makes a money-weighted return read LOWER than the fund earned, and
// on screen it looks exactly like a complete record — so SHORT always refuses,
// and the one tolerated difference (a row the statement's own summary does not
// count) must be exactly one row, identified, and marked.
import { layoutFor, splitRunTogetherTriple } from "../providers/altFundStatements.mjs";
import { payoutsFrom } from "../providers/transitionVenture.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("payouts");

const read = (text) => {
  const warns = [];
  const layout = layoutFor(text);
  const cap = layout?.capitalFrom ? layout.capitalFrom(text, (code, detail) => warns.push({ code, detail })) : null;
  return { warns, payouts: cap?.payouts };
};
const codes = (warns) => warns.map((w) => w.code);
const byKind = (rows) => Object.fromEntries(["income", "capital", "equalisation"]
  .map((k) => [k, (rows ?? []).filter((r) => r.kind === k).reduce((t, r) => t + r.gross, 0)]));

// ── THE RUN-TOGETHER TRIPLE ──────────────────────────────────────────────────
//
// Neo Infra's smallest income rows print gross, TDS and net close enough that
// the text layer loses the spaces: `54555490` is 545 − 55 = 490. The split is
// accepted only where exactly ONE cut satisfies gross − TDS = net.
ok("`54555490` splits to 545 / 55 / 490", JSON.stringify(splitRunTogetherTriple("54555490")) === JSON.stringify({ gross: 545, tds: 55, net: 490 }),
  JSON.stringify(splitRunTogetherTriple("54555490")));
ok("`62862566` splits to 628 / 62 / 566", splitRunTogetherTriple("62862566")?.gross === 628);
ok("a run with no valid cut yields nothing", splitRunTogetherTriple("12345") === null, JSON.stringify(splitRunTogetherTriple("12345")));
// `12111` reads two ways — 12 − 1 = 11 and 12 − 11 = 1 — and nothing on the
// page says which. The helper must refuse a string with more than one reading
// rather than pick one; the total would then have to rescue a guess.
ok("a run with MORE THAN ONE valid cut is refused, never guessed",
  splitRunTogetherTriple("12111") === null, JSON.stringify(splitRunTogetherTriple("12111")));

// ── NEO INFRA: three dated tables against three printed totals ───────────────
const NEO = `
Neo Infra Income Opportunities Fund I
Statement of Account As of: 31 Jul-26
Capital Commitment Principal Payout NAV (Net)
₹ 5,00,00,000 (100%) ₹ 1,00,000 ₹ 114.24
Gross Capital Contribution Income Payout (Gross) Valuation (Net)
₹ 2,00,00,000 (100%) ₹ 3,45,545 ₹ 5,54,98,303.25
Pending Drawdown Total Payout Units
₹ 0 (0%) ₹ 4,45,545 4,85,837
Undrawn Commitment Net Equalisation Face Value
₹ 3,00,00,000 (0%) ₹ 20,000 ₹ 100
NAV/unit and Valuation is as of 30-Jun-2026.
Folio No: 9039920536 | Class: A5
Transaction Details All figures are in INR
04-Oct-23 Initial Contribution 25,000.00 25,00,000 - - -
24-Oct-23 First Drawdown 75,000.00 75,00,000 - - -
26-Feb-24 Second Drawdown 1,00,000.00 1,00,00,000 - - -
13-Jun-24 Short term capital gain - - 1,00,000 10,000 90,000
30-Aug-24 Distribution of Interest Income - - 2,45,000 24,500 2,20,500
05-Jan-26 Distribution on Other Income - - 54555490
05-Jan-26 Capital Redemption -1,000.00 -1,00,000 - - -
30-Aug-24 Equalization amount (paid)/received 20,000 2,000 18,000
`;

{
  const { payouts, warns } = read(NEO);
  ok("Neo: a statement that ties carries every payout", Array.isArray(payouts) && payouts.length === 5,
    JSON.stringify(payouts));
  const k = byKind(payouts);
  ok("Neo: each kind reproduces its own printed total",
    k.income === 345545 && k.capital === 100000 && k.equalisation === 20000, JSON.stringify(k));
  ok("Neo: the run-together row is read as 545 gross", payouts?.some((r) => r.gross === 545 && r.tds === 55 && r.net === 490));
  ok("Neo: a capital redemption is a POSITIVE payout of principal",
    payouts?.find((r) => r.kind === "capital")?.gross === 100000);
  ok("Neo: payouts come back oldest first", payouts?.[0]?.date === "2024-06-13", payouts?.[0]?.date);
  ok("Neo: every row that ties is marked as counted by the summary", payouts?.every((r) => r.inPrintedTotal === true));
  ok("Neo: a statement that ties warns about nothing", warns.length === 0, JSON.stringify(warns));
}

{
  // SHORT A PAYMENT — the dangerous direction. Dropping one income row must
  // refuse the whole table, never publish the rest.
  const short = NEO.replace("30-Aug-24 Distribution of Interest Income - - 2,45,000 24,500 2,20,500\n", "");
  const { payouts, warns } = read(short);
  ok("a record SHORT an income payment is refused whole, not published partial",
    payouts === null && codes(warns).includes("payouts-do-not-tie"), JSON.stringify({ payouts, warns }));
}

{
  // ONE EXTRA ROW THE SUMMARY DOES NOT COUNT — the real Neo Infra statement's
  // own case (a ₹455 `Distribution on Other Income` dated 9 July 2026 that its
  // Income Summary omits). Carried, marked, and named.
  const extra = NEO.replace("05-Jan-26 Capital Redemption",
    "09-Jul-26 Distribution on Other Income - - 45546409\n05-Jan-26 Capital Redemption");
  const { payouts, warns } = read(extra);
  const row = payouts?.find((r) => r.gross === 455);
  ok("one row over the printed total is carried and marked, not dropped",
    Array.isArray(payouts) && row?.inPrintedTotal === false && codes(warns).includes("payouts-row-not-in-printed-total"),
    JSON.stringify({ row, warns }));
  ok("...and only THAT row is marked", payouts?.filter((r) => r.inPrintedTotal === false).length === 1);
}

{
  // A ROW READ TWICE offers two candidates of the same gross, so the
  // one-row-explained path cannot swallow it.
  const twice = NEO.replace("13-Jun-24 Short term capital gain - - 1,00,000 10,000 90,000\n",
    "13-Jun-24 Short term capital gain - - 1,00,000 10,000 90,000\n13-Jun-24 Short term capital gain - - 1,00,000 10,000 90,000\n");
  const { payouts, warns } = read(twice);
  ok("a row read twice is refused, not explained away as one extra row",
    payouts === null && codes(warns).includes("payouts-do-not-tie"), JSON.stringify({ payouts, warns }));
}

{
  // A ROW WHOSE OWN FIGURES DISAGREE is a misread, whatever the total says.
  const misread = NEO.replace("1,00,000 10,000 90,000", "1,00,000 10,000 91,000");
  const { payouts, warns } = read(misread);
  ok("a row whose gross − TDS is not its net refuses the table",
    payouts === null && codes(warns).includes("payouts-row-misread"), JSON.stringify({ payouts, warns }));
}

{
  // THE STATEMENT DISAGREEING WITH ITSELF. The grid's Total Payout must be
  // income plus principal before any row is reconciled against either.
  const selfContradicting = NEO.replace("₹ 4,45,545 4,85,837", "₹ 4,45,645 4,85,837");
  const { payouts, warns } = read(selfContradicting);
  ok("a summary grid that does not add up refuses before any row is read",
    payouts === null && codes(warns).includes("payouts-summary-does-not-tie"), JSON.stringify({ payouts, warns }));
}

{
  // A CAPITAL ROW WITH NO PRINTED PRINCIPAL is unchecked, and refuses.
  const unchecked = NEO.replace("₹ 5,00,00,000 (100%) ₹ 1,00,000 ₹ 114.24", "₹ 5,00,00,000 (100%) ₹ 0 ₹ 114.24");
  const { payouts } = read(unchecked);
  ok("a principal row against a printed nil principal refuses", payouts === null, JSON.stringify(payouts));
}

// ── BARING: gross printed only in total, net printed per row ─────────────────
const BARING = `
Baring Private Equity India Fund 6
Statement of Account as on 31-Mar-2026
Folio # AIFM_TEST_0001 : ANKITA JAISINGHANI
Class of Units / Class A1 / INF15Q422013 Hurdle Rate 10%.
Capital Commitment A 5,00,00,000 - -
Capital Call B 2,02,50,000 - 40.50%
Capital Contribution C 2,02,50,000 - 40.50%
Pending Contribution D = B - C - - -
Undrawn Capital G = A - B + E 2,97,50,000 - 59.50%
Balance Units I = H / Face Value - 202.50 -
NAV per unit - 93,047.9444 - -
Less: Distribution (E) 37,252
Capital Distribution (Redemption) -
Income Distribution 27,616
TDS 9,636
DRAWDOWN 1 03/10/2024 09/10/2024 1,00,000 65.00 65,00,000
DRAWDOWN 2 05/12/2024 27/12/2024 1,00,000 50.00 50,00,000
DRAWDOWN 3 22/07/2025 26/07/2025 1,00,000 25.00 25,00,000
DRAWDOWN 4 25/09/2025 25/09/2025 1,00,000 62.50 62,50,000
DISTRIBUTION TRANSACTIONS DATE NET (INR)
Net Distribution STCG FY2025-26 31/03/2026 27,321
Net Distribution Dividend FY2025-26 31/03/2026 295
OTHER TRANSACTIONS
Compensating contribution 30/09/2025 18,909 1,891 17,018
`;

{
  const { payouts, warns } = read(BARING);
  ok("Baring: one dated distribution plus one compensating contribution", payouts?.length === 2, JSON.stringify(payouts));
  const dist = payouts?.find((r) => r.kind === "income");
  // THE GROSS IS THE STATEMENT'S OWN TOTAL, never apportioned across rows: all
  // the dated rows fall on one date, so that total IS that date's gross.
  ok("Baring: the distribution is the printed GROSS (E), on its one date",
    dist?.gross === 37252 && dist?.tds === 9636 && dist?.net === 27616 && dist?.date === "2026-03-31", JSON.stringify(dist));
  ok("Baring: the compensating contribution is carried on its own row's figures",
    payouts?.find((r) => r.kind === "equalisation")?.gross === 18909);
  ok("Baring: a statement that ties warns about nothing", warns.length === 0, JSON.stringify(warns));
}

{
  // TWO DATES, ONE PRINTED GROSS: the split per date is not printed and must
  // not be apportioned.
  const twoDates = BARING.replace("Net Distribution Dividend FY2025-26 31/03/2026 295", "Net Distribution Dividend FY2025-26 31/12/2025 295");
  const { payouts, warns } = read(twoDates);
  ok("distribution rows across two dates refuse — the gross per date is not printed",
    payouts === null && codes(warns).includes("payouts-do-not-tie"), JSON.stringify({ payouts, warns }));
}

{
  const shortNet = BARING.replace("Net Distribution Dividend FY2025-26 31/03/2026 295\n", "");
  const { payouts } = read(shortNet);
  ok("net rows short of the printed Income Distribution refuse", payouts === null, JSON.stringify(payouts));
}

{
  const brokenE = BARING.replace("Less: Distribution (E) 37,252", "Less: Distribution (E) 37,352");
  const { payouts, warns } = read(brokenE);
  ok("E ≠ redemption + income + TDS refuses before any row is read",
    payouts === null && codes(warns).includes("payouts-summary-does-not-tie"), JSON.stringify({ payouts, warns }));
}

{
  // A STATEMENT THAT PRINTS NO DISTRIBUTION BLOCK AT ALL says nothing about
  // payouts — which is NULL, never an empty list claiming the fund paid nothing.
  const none = BARING.replace(/Less: Distribution[\s\S]*?TDS 9,636\n/, "").replace(/DISTRIBUTION TRANSACTIONS[\s\S]*$/, "");
  const { payouts } = read(none);
  ok("no distribution block is NULL, not []", payouts === null, JSON.stringify(payouts));
}

// ── TRANSITION VENTURE: a measured nil, or nothing claimed ───────────────────
{
  const nil = "Summary of Capital Distributions Net Distribution 0.00 TDS 0.00 Gross Distribution 0.00";
  ok("a printed Gross Distribution of 0.00 with no rows is a MEASURED nil — []",
    JSON.stringify(payoutsFrom(nil, [], () => {})) === "[]");
  const warns = [];
  const some = payoutsFrom("Gross Distribution 5,000.00", [], (code) => warns.push(code));
  ok("a non-zero Gross Distribution on an unmeasured layout is NULL, and says why",
    some === null && warns.includes("payouts-unread"), JSON.stringify({ some, warns }));
  ok("no Gross Distribution printed at all is NULL", payoutsFrom("nothing here", [], () => {}) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
