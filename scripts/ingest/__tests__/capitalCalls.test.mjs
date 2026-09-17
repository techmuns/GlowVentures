// THE CAPITAL-CALL READER AND ITS GATE.
// Run: node scripts/ingest/__tests__/capitalCalls.test.mjs
//
// WRITTEN AGAINST SYNTHETIC STATEMENTS, and every case is a MUTATION of one.
// `callsIfTheyTie` publishes a dated table only where the rows reproduce the
// total the same statement prints for them, so the only way to know that gate
// is load-bearing is to break each statement one figure at a time and watch it
// refuse. A suite that asserts the happy path proves the regexes match; it
// proves nothing about the licence to publish a dated tape a reader acts on.
//
// AND EACH MUTATION ISOLATES ONE CHECK. A figure changed carelessly moves both
// the sum and the total, two things fail, and neither is shown load-bearing on
// its own — which is the calibration `altFund.test.mjs` records having to make.
import { layoutFor } from "../providers/altFundStatements.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("capitalCalls");

const read = (text) => {
  const warns = [];
  const layout = layoutFor(text);
  if (!layout?.capitalFrom) return { layout, warns, cap: null };
  return { layout, warns, cap: layout.capitalFrom(text, (code, detail) => warns.push({ code, detail })) };
};

// ── BARING: the statement that prints A, B, C and D = B − C under labels ─────
//
// The one layout where called, paid and pending are three separately measured
// figures rather than one figure reported three ways. 65 L + 50 L + 25 L +
// 62.5 L = 2,02,50,000, which is its printed Capital Call B.
const BARING = `
Baring Private Equity India Fund 6
Statement of Account as on 31-Mar-2026
Folio # AIFM_TEST_0001 : ANKITA JAISINGHANI
Class of Units / Class A1 / INF15Q422013 Hurdle Rate 10%.
COMMITMENT AND CONTRIBUTION SUMMARY 2 AMOUNT (INR) UNITS % OF COMMITMENT
Capital Commitment A 5,00,00,000 - -
Capital Call B 2,02,50,000 - 40.50%
Capital Contribution C 2,02,50,000 - 40.50%
Pending Contribution D = B - C - - -
Undrawn Capital G = A - B + E 2,97,50,000 - 59.50%
Balance Units I = H / Face Value - 202.50 -
NAV per unit - 93,047.9444 - -
CAPITAL TRANSACTIONS UNITS AMOUNT (INR)
DRAWDOWN 1 03/10/2024 09/10/2024 1,00,000 65.00 65,00,000
DRAWDOWN 2 05/12/2024 27/12/2024 1,00,000 50.00 50,00,000
DRAWDOWN 3 22/07/2025 26/07/2025 1,00,000 25.00 25,00,000
DRAWDOWN 4 25/09/2025 25/09/2025 1,00,000 62.50 62,50,000
`;

{
  const { cap, warns } = read(BARING);
  ok("Baring: called and paid are read off their OWN labels", cap.called === 20250000 && cap.paid === 20250000,
    JSON.stringify({ called: cap?.called, paid: cap?.paid }));
  // A DASH IS NULL, NEVER A MEASURED NIL. The column carries `-` for "not
  // applicable" on the two rows above it as well, so a zero here would assert
  // the fund has nothing outstanding on the strength of a character it uses for
  // three different things.
  ok("Baring: a dashed Pending line reads NULL, not zero", cap.pending === null, String(cap?.pending));
  ok("Baring: four dated calls, oldest first", cap.calls.length === 4 && cap.calls[0].date === "2024-10-03",
    JSON.stringify(cap?.calls?.map((c) => c.date)));
  // THE CALL DATE, NOT THE ALLOTMENT DATE. `DRAWDOWN n` prints two dates and
  // only the first is when the money was asked for.
  ok("Baring: the FIRST of the two dates is the call date", cap.calls[1].date === "2024-12-05", cap.calls[1]?.date);
  ok("Baring: the rows reproduce Capital Call B",
    cap.calls.reduce((t, c) => t + c.amount, 0) === 20250000);
  ok("Baring: a statement that ties warns about nothing", warns.length === 0, JSON.stringify(warns));
}

// ── THE GATE, BROKEN ONE FIGURE AT A TIME ────────────────────────────────────
//
// Each mutation changes exactly one thing, so exactly one outcome can be
// attributed to it. A schedule ONE CALL SHORT is the dangerous case: it
// understates what the family has paid and on screen it looks exactly like a
// complete one, which is why the answer is nothing rather than a partial table.
{
  const short = BARING.replace(/DRAWDOWN 4 .*\n/, "");
  const { cap, warns } = read(short);
  ok("a call removed publishes NOTHING, not a partial table", cap.calls.length === 0);
  ok("…and says why, by name", warns.some((w) => w.code === "capital-calls-do-not-tie"), JSON.stringify(warns));
  // THE SUMMARY FIGURES SURVIVE THE REFUSAL. They come off a different block and
  // are not in doubt; withholding them too would lose measured facts to punish a
  // table that did not tie.
  ok("…and the summary block is untouched", cap.called === 20250000 && cap.paid === 20250000);
}

{
  // The OTHER side of the same identity: the rows are right and the printed
  // total moved. Same refusal, and it must be the same refusal — a reader
  // cannot tell which side is wrong and neither can this reader.
  const moved = BARING.replace("Capital Call B 2,02,50,000", "Capital Call B 2,52,50,000");
  const { cap, warns } = read(moved);
  ok("a moved printed total refuses the same table", cap.calls.length === 0);
  ok("…naming the same cause", warns.some((w) => w.code === "capital-calls-do-not-tie"));
}

{
  // NO TOTAL TO CHECK AGAINST IS NOT A PASS. The rows may be perfect and there
  // is no way to say so, and this book does not publish a dated figure on that
  // footing — it says which check it could not run.
  const noTotal = BARING.replace("Capital Call B 2,02,50,000", "Capital Call B - ");
  const { cap, warns } = read(noTotal);
  ok("no printed total means no published calls", cap.calls.length === 0);
  ok("…and a DIFFERENT code from a mismatch", warns.some((w) => w.code === "capital-calls-unchecked"),
    JSON.stringify(warns));
}

// ── SKY CAPITAL: two dated tables of the same shape, and only one is calls ────
//
// The commitment block prints `₹ <amount> <date>` exactly as the drawdown block
// does. Swept over the whole page the rows sum to commitment PLUS drawdown and
// the gate correctly refuses them — the tie holds and it is still the wrong
// table, which is why the sweep is cut to the drawdown block.
const SKY = `
SKY CAPITAL RISING TITANS FUND I
Category I Alternative Investment Fund – Angel Fund
Fund Name Sky Capital Rising Titans Fund I
Date July 31, 2026
INVESTOR INFORMATION Folio No. SKY999
Name Test Holder
CAPITAL CONTRIBUTION
Capital Contribution Commitment Commitment Amount Commitment Date
Original Capital Contribution Commitment ₹ 1,00,00,000 27-Mar-2025
Additional Capital Contribution Commitment ₹ 30,00,000 02-Jun-2025
Total Capital Contribution Commitment ₹ 1,30,00,000
Drawdown Details Drawdown Amount Drawdown Date
₹ 50,00,000 09-May-2025
₹ 50,00,000 13-May-2025
₹ 30,00,000 04-Jun-2025
Total Drawdown ₹ 1,30,00,000
Uncalled Commitment NIL
`;

{
  const { cap, warns } = read(SKY);
  ok("Sky: three drawdowns, and the two COMMITMENT rows are not among them",
    cap.calls.length === 3, JSON.stringify(cap?.calls));
  ok("Sky: the first call is the drawdown date, not the commitment date",
    cap.calls[0].date === "2025-05-09", cap.calls[0]?.date);
  ok("Sky: they reproduce Total Drawdown", cap.calls.reduce((t, c) => t + c.amount, 0) === 13000000);
  ok("Sky: nothing warned", warns.length === 0, JSON.stringify(warns));
}

{
  // THE CUT IS A SLICE, NOT A FILTER, AND THIS IS WHERE THAT WAS MEASURED.
  //
  // The comment on this reader first said that without the anchor the sweep
  // would spill into the commitment table and the tie would refuse it. This
  // case refuted that: a slice with no start marker yields NOTHING, so the
  // outcome was zero calls and — before the fix — zero warnings, which is a
  // reader that has quietly stopped finding its table. Safe, and silent.
  //
  // It is the anchor's own check that speaks now, and this asserts the SILENCE
  // is gone rather than that the gate fired: a confidently wrong comment about
  // which check protects you is how the next session deletes the one that does.
  const merged = SKY.replace("Drawdown Details Drawdown Amount Drawdown Date", "Drawdown Amount Drawdown Date");
  const { cap, warns } = read(merged);
  ok("Sky: a missing drawdown anchor publishes nothing", cap.calls.length === 0);
  ok("Sky: …and is REPORTED, not passed over in silence",
    warns.some((w) => w.code === "drawdown-table-not-found"), JSON.stringify(warns));
}

// ── CARNELIAN: the folio that proved `contributed` was two fields ────────────
//
// `Capital Called` and `Amount Contributed` differ by fund income reinvested.
// Reading either as "drawn" loses the distinction the client asked about.
const CARNELIAN = `
CARNELIAN BHARAT AMRITKAAL FUND
(A Category III AIF Scheme)
Statement of Account
Statement Date : 06-Aug-2026
Contributions and Distributions
Capital Commitment (INR) Capital Called (INR) Amount Contributed (INR) Net Contribution (INR)
15,00,00,000.00 15,00,00,000.00 15,00,02,925.10 14,99,95,425.33
Balance Uncalled Capital (INR) Principle (Capital) Repaid (INR) Face Value of Unit
0.00 0.00 10.0000
Transaction Details
31-Aug-2025 Contribution Amount CLASS A2 - 10,00,00,000.00 - - -
31-Dec-2025 DRAWDOWN Transaction CLASS A2 - 5,00,00,000.00 - - -
Summary as on 31-Jul-2026 Pre tax NAV : 12.5540 Closing Value : 16,31,15,312.43
`;

{
  const { cap } = read(CARNELIAN);
  ok("Carnelian: called and paid are DIFFERENT figures and both are read",
    cap.called === 150000000 && cap.paid === 150002925.1,
    JSON.stringify({ called: cap?.called, paid: cap?.paid }));
  ok("Carnelian: two dated calls, tied against Capital Called",
    cap.calls.length === 2 && cap.calls.reduce((t, c) => t + c.amount, 0) === 150000000);
  // The fund's own wording rides with the row. "Contribution" and "DRAWDOWN
  // Transaction" are the same event under two names on one statement, and
  // normalising them would hide that the document says both.
  ok("Carnelian: each row keeps the fund's own label",
    cap.calls[0].label === "Contribution" && cap.calls[1].label === "Drawdown",
    JSON.stringify(cap?.calls?.map((c) => c.label)));
}

// ── NEO INFRA: `Pending Drawdown ₹ 0` is a MEASURED zero ────────────────────
const NEO = `
Neo Infra Income Opportunities Fund I
Statement of Account As of: 31 Jul-26
Capital Commitment Principal Payout NAV (Net)
₹ 5,00,00,000 (100%) ₹ 14,16,280 ₹ 114.24
Gross Capital Contribution Income Payout (Gross) Valuation (Net)
₹ 2,00,00,000 (100%) ₹ 35,31,941 ₹ 5,54,98,303.25
Pending Drawdown Total Payout Units
₹ 0 (0%) ₹ 49,48,221 4,85,837
Undrawn Commitment Net Equalisation Face Value
₹ 3,00,00,000 (0%) ₹ 8,69,355 ₹ 100
NAV/unit and Valuation is as of 30-Jun-2026.
Folio No: 9039920536 | Class: A5
Transaction Details All figures are in INR
04-Oct-23 Initial Contribution 25,000.00 25,00,000 - - -
24-Oct-23 First Drawdown 75,000.00 75,00,000 - - -
26-Feb-24 Second Drawdown 1,00,000.00 1,00,00,000 - - -
`;

{
  const { cap } = read(NEO);
  ok("Neo: a printed `Pending Drawdown ₹ 0` is a measured ZERO, not null",
    cap.pending === 0, String(cap?.pending));
  // CALLED IS DERIVED FROM TWO PRINTED FIGURES, not assumed equal to paid. Today
  // pending is nil and the two coincide; the day a call goes unpaid they will
  // not, which is the whole reason the page separates them.
  ok("Neo: called = contributed + pending, from the statement's own two lines",
    cap.called === 20000000 && cap.paid === 20000000, JSON.stringify({ called: cap?.called, paid: cap?.paid }));
  ok("Neo: three dated calls reproducing Gross Capital Contribution",
    cap.calls.length === 3 && cap.calls.reduce((t, c) => t + c.amount, 0) === 20000000,
    JSON.stringify(cap?.calls));
}

{
  // A PENDING FIGURE THAT IS ACTUALLY OUTSTANDING must reach `called` and must
  // NOT reach `paid`. This is the case this book has none of, and the one the
  // whole called/paid split exists for — so it is constructed rather than
  // waited for, exactly as `accountXirr.test.ts` constructs its own gate.
  const owing = NEO.replace("₹ 0 (0%) ₹ 49,48,221 4,85,837", "₹ 50,00,000 (0%) ₹ 49,48,221 4,85,837");
  const { cap } = read(owing);
  ok("an unpaid call raises `called` and leaves `paid` alone",
    cap.called === 25000000 && cap.paid === 20000000 && cap.pending === 5000000,
    JSON.stringify({ called: cap?.called, paid: cap?.paid, pending: cap?.pending }));
}

// ── MOTILAL OSWAL: `-` in the Uncalled column, across several classes ────────
const MO = `
Account No : 90410099999 As on : 31 Jul 2026
Motilal Oswal Founders Fund Series II
Name : TEST HOLDER Bank Name : HDFC BANK
Account Summary Post Tax
CLASS G1 31-07-2026 11.5502 1,88,95,852.360 20,00,00,000.00 20,00,00,000.00 21,82,50,873.93
Investment Summary
Class Details Commitment Amount Called Capital (B) Uncalled Capital (A)-(B) Received Capital (C) Outstanding Capital
CLASS G1 20,00,00,000.00 15,00,00,000.00 5,00,00,000.00 15,00,00,000.00 -
Transaction Details : CLASS G1
06-08-2024 Contribution - - 10,00,00,000.00
16-10-2024 Contribution - - 5,00,00,000.00
`;

{
  const { cap } = read(MO);
  ok("MO: called, paid and a real uncalled balance all read off their labels",
    cap.called === 150000000 && cap.paid === 150000000, JSON.stringify({ called: cap?.called, paid: cap?.paid }));
  ok("MO: a dashed Outstanding column is NULL", cap.pending === null, String(cap?.pending));
  ok("MO: two dated contributions reproducing Called Capital (B)",
    cap.calls.length === 2 && cap.calls.reduce((t, c) => t + c.amount, 0) === 150000000);
}

{
  // STAMP DUTY AND UNIT ALLOTMENT ARE NOT CALLS, and the tie is what says the
  // exclusion is right: swept in, the rows overshoot Called Capital and refuse.
  const withNoise = MO.replace("16-10-2024 Contribution - - 5,00,00,000.00",
    "16-10-2024 Contribution - - 5,00,00,000.00\n16-10-2024 Units Allotment 11.2400 88,96,352.335 4,99,95,000.25");
  const { cap } = read(withNoise);
  ok("MO: an allotment row is not a call and does not disturb the tie",
    cap.calls.length === 2 && cap.calls.reduce((t, c) => t + c.amount, 0) === 150000000,
    JSON.stringify(cap?.calls));
}

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
