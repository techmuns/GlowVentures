// THE CASH-FLOW READER, CHECKED AGAINST TWO REAL RESPONSES FOR ONE COMPANY.
//
// Both fixtures beside this file are live bodies saved byte for byte:
//   • `yfin-ABCAPITAL.NS.md`     — /financials/ABCAPITAL.NS, 2026-08-12
//   • `financials-ABCAPITAL.md`  — /api/research?kind=financials, 2026-08-11
//
// Having BOTH for the same company is the point. The unit check is a
// reconciliation between them, and a hand-written pair would prove only that my
// two inventions agree with each other.
//
// The cases below are the ones where a plausible-looking wrong answer is easy:
//
//   • "$1.44B" read as 1.44, or as dollars
//   • "$2.61B" on a SHARE COUNT taken as money
//   • "N/A" in the oldest column read as 0
//   • a unit check that passes because it never ran
import fs from "node:fs";
import path from "node:path";
import { parseFinancials, parsePeriod } from "@/lib/financialTables";
import {
  parseScaled, parseStatements, statementNamed, scaledRow, scaledRowAny,
  valueAtYear, checkUnits, earningsCalendar, isUpcoming,
} from "@/lib/yfinStatements";

const FIXTURES = process.env.GLOW_FIXTURES ?? path.join(process.cwd(), "src/lib/__tests__/fixtures");
const YFIN = fs.readFileSync(path.join(FIXTURES, "yfin-ABCAPITAL.NS.md"), "utf8");
const SCREENER = fs.readFileSync(path.join(FIXTURES, "financials-ABCAPITAL.md"), "utf8");

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};

// ── cells ───────────────────────────────────────────────────────────────────
eq("billions", parseScaled("$1.44B").value, 1.44e9);
eq("millions", parseScaled("$983.60M").value, 983.6e6);
eq("trillions", parseScaled("$1.07T").value, 1.07e12);
eq("negative before the symbol", parseScaled("$-48.80M").value, -48.8e6);
eq("a bare zero", parseScaled("$0").value, 0);
eq("no suffix", parseScaled("$14.41").value, 14.41);
eq("N/A IS NOT ZERO", parseScaled("N/A").value, null);
eq("an empty cell is not zero", parseScaled("").value, null);
eq("the suffix is recorded", parseScaled("$1.44B").suffix, "B");
eq("the symbol is recorded, not interpreted", parseScaled("$1.44B").symbol, true);
// The document prints a SHARE COUNT with a dollar sign, which is the proof that
// the symbol is a formatter artifact and not a currency claim.
eq("a share count parses as a count", parseScaled("$2.61B").value, 2.61e9);

// ── ISO period headers ──────────────────────────────────────────────────────
eq("an ISO column header is a period", parsePeriod("2026-03-31"),
   { label: "2026-03-31", year: 2026, month: 3, ttm: false });
eq("… and still parses screener's own form", parsePeriod("Mar 2026").year, 2026);

// ── the real document ───────────────────────────────────────────────────────
const st = parseStatements(YFIN);
eq("four sections parsed", st.tables.map((t) => t.name),
   ["Income Statement", "Balance Sheet", "Cash Flow Statement"]);
eq("the calendar is read from the prose block, not a table", st.calendar.length > 0, true);
eq("not the empty stub", st.empty, false);

const cf = statementNamed(st, "Cash Flow Statement");
eq("cash flow reports five columns", cf!.periods.map((p) => p.label),
   ["2026-03-31", "2025-03-31", "2024-03-31", "2023-03-31", "2022-03-31"]);

// Read straight off the source: Beginning Cash Position 2026-03-31 = $43.31B.
eq("a cash flow figure in base units", valueAtYear(cf, scaledRow(cf, "Beginning Cash Position"), 2026), 43.31e9);
eq("a negative one", valueAtYear(cf, scaledRow(cf, "Capital Expenditure"), 2026), -3.94e9);
// The oldest column is N/A on almost every line — it must stay null.
eq("the N/A column stays absent", valueAtYear(cf, scaledRow(cf, "Beginning Cash Position"), 2022), null);
eq("a line the company does not report is null, not the nearest row", scaledRow(cf, "EBITDA"), null);
eq("scaledRowAny takes the first label that exists",
   scaledRowAny(cf, ["Cash Flow From Continuing Operating Activities", "Operating Cash Flow"]) !== null, true);

// ── THE UNIT CHECK — the reason any of this may be rendered ─────────────────
const screener = parseFinancials(SCREENER);
const verdict = checkUnits(st, screener);
eq("units confirmed against the screener statements", verdict.verdict, "confirmed");
eq("both comparisons ran", verdict.checks.map((c) => c.what), ["Earnings per share", "Revenue"]);
eq("EPS establishes the currency", verdict.checks[0].establishes, "currency");
eq("revenue establishes the scale", verdict.checks[1].establishes, "scale");
// EPS 14.41 against screener's 14.75 — the same number, so one currency.
eq("EPS agrees", verdict.checks[0].agrees, true);
// 459.27e9 rupees / 1e7 = 45,927 against screener's 45,513 crore.
eq("revenue is 1e7 x the crore figure", Math.round((verdict.checks[1].ratio ?? 0) / 1e5) / 100, 1.01);
eq("revenue agrees", verdict.checks[1].agrees, true);

// AN UNRUN CHECK IS NOT A PASSED ONE. With nothing to reconcile against, the
// verdict must be unmeasurable — never confirmed by default.
eq("no screener document means unmeasurable, NOT confirmed", checkUnits(st, null).verdict, "unmeasurable");
eq("… and it says why", /nothing to reconcile/.test(checkUnits(st, null).reason), true);
// An empty screener parse reaches the same place by a different route.
eq("an empty counterpart is unmeasurable too", checkUnits(st, parseFinancials("")).verdict, "unmeasurable");

// A CONTRADICTION MUST BE CAUGHT. Restate the screener P&L a hundredfold — as
// if those figures were rupees rather than crore — and the revenue comparison
// must fail rather than widening to accommodate it.
//
// The row label carries a NON-BREAKING space before screener's "+" marker, so
// the substitution matches on the digits it is replacing rather than on a label
// typed out by hand — the same trap `cellsOf` folds away for every consumer.
const REVENUE_ROW = /^(\|\s*Revenue\s*[ \s]*\+\s*\|)(.*)$/m;
eq("the fixture's revenue row is found for the negative case", REVENUE_ROW.test(SCREENER), true);
const wrongScale = parseFinancials(SCREENER.replace(REVENUE_ROW, (_m, head: string, cells: string) =>
  head + cells.replace(/[\d,]+/g, (n) => String(Number(n.replace(/,/g, "")) * 100))));
const bad = checkUnits(st, wrongScale);
eq("a hundredfold scale error is caught", bad.verdict, "contradicted");
eq("… and it is REVENUE that is named, not EPS", /revenue/i.test(bad.reason) && !/earnings/i.test(bad.reason), true);
eq("… while the EPS check still passes", bad.checks[0].agrees, true);

// ── the calendar ────────────────────────────────────────────────────────────
const calendar = earningsCalendar(st);
eq("the earnings date is read", calendar.earningsDate, "2026-10-29");
eq("an estimate is a number", calendar.epsAverage, 4.73);
eq("a date this document does not carry is null", calendar.exDividendDate, null);
eq("a future date is upcoming", isUpcoming("2026-10-29", new Date("2026-08-12T00:00:00Z")), true);
eq("a past date is not", isUpcoming("2026-06-05", new Date("2026-08-12T00:00:00Z")), false);
eq("no date is neither", isUpcoming(null), null);

// ── the empty stub, which is what a MISSING SUFFIX looks like ───────────────
const stub = parseStatements("## Income Statement\n\nNo data available.\n\n## Cash Flow Statement\n\nNo data available.\n");
eq("the no-data stub is recognised", stub.empty, true);
eq("… and yields no tables to render", stub.tables.length, 0);

console.log(fails ? `\n${fails} FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
