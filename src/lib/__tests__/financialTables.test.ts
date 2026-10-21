// THE FINANCIAL-TABLE PARSER, CHECKED AGAINST A REAL RESPONSE.
//
// The fixture beside this file is the LIVE body returned by
// `/api/research?kind=financials&ticker=ABCAPITAL` on 2026-08-11, saved byte for
// byte. It is not a hand-written sample: a fixture I invent proves my parser
// agrees with my idea of the format, which is the thing most likely to be wrong.
//
// Every assertion below is a figure a human can read off the source document,
// and each one is a case where a plausible-looking wrong answer is easy:
//
//   • a blank cell read as 0 (Gross NPA % is empty on every column here)
//   • the TTM column treated as a year end, silently shortening a CAGR window
//   • Indian digit grouping mis-parsed (1,11,347 is not 1.11347)
//   • a percent row averaged as if it were money
//   • a row matched by POSITION, so inserting a line shifts every figure
import fs from "node:fs";
import path from "node:path";
import {
  parseFinancials, parsePeriod, parseCell, tableNamed, rowNamed, rowAny,
  seriesOf, cagrPct, growthPct, ratioRow,
} from "@/lib/financialTables";

// The runner passes the repo's fixture directory: this file is bundled to a
// temp dir before it runs, so `import.meta.url` would resolve beside the bundle.
const FIXTURES = process.env.GLOW_FIXTURES ?? path.join(process.cwd(), "src/lib/__tests__/fixtures");
const MD = fs.readFileSync(path.join(FIXTURES, "financials-ABCAPITAL.md"), "utf8");

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};

// ── period headers ──────────────────────────────────────────────────────────
eq("a month-year header", parsePeriod("Mar 2015"), { label: "Mar 2015", year: 2015, month: 3, ttm: false });
eq("TTM is flagged, never a year", parsePeriod("TTM"), { label: "TTM", year: null, month: null, ttm: true });
eq("an unrecognised header keeps its label", parsePeriod("FY?"), { label: "FY?", year: null, month: null, ttm: false });

// ── cells ───────────────────────────────────────────────────────────────────
eq("Indian grouping", parseCell("1,11,347").value, 111347);
eq("a blank cell is NOT zero", parseCell("").value, null);
eq("an em-dash is NOT zero", parseCell("—").value, null);
eq("a percent is flagged", parseCell("13%"), { value: 13, percent: true });
eq("a leading minus", parseCell("-39").value, -39);
eq("parenthesised negative", parseCell("(39)").value, -39);
eq("text is not a number", parseCell("Jio Financial").value, null);

// ── the real document ───────────────────────────────────────────────────────
const doc = parseFinancials(MD);
eq("five pipe tables parsed", doc.tables.map((t) => t.name),
   ["Shareholding Pattern", "Balance Sheet", "Profit & Loss", "Quarterly Results", "Peer Comparison"]);
eq("prose sections kept, not discarded", doc.prose.map((p) => p.name), ["Pros & Cons", "About"]);

const pl = tableNamed(doc, "Profit & Loss");
eq("P&L period headers", pl!.periods.map((p) => p.label).slice(0, 3), ["Mar 2015", "Mar 2016", "Mar 2017"]);
eq("P&L last column is TTM", pl!.periods[pl!.periods.length - 1].ttm, true);

// Read straight off the source: Revenue runs 2,710 (Mar 2015) → 45,513 (Mar 2026),
// with 48,186 in the TTM column.
const rev = rowNamed(pl, "Revenue");
// The source prints "Revenue\u00a0+"; the label is stored with whitespace
// normalised so a caller can compare it against a string a human would type.
eq("row matched despite screener's trailing '+'", rev!.label, "Revenue +");
eq("first and last ANNUAL revenue", [rev!.values[0], rev!.values[11]], [2710, 45513]);
eq("the TTM cell is still readable", rev!.values[12], 48186);

// EPS in Rs, Mar 2015 = 4.08 — a decimal row, to catch an integer-only parser.
eq("decimal row", rowNamed(pl, "EPS in Rs")!.values[0], 4.08);

// Dividend Payout % is 0% on every column: a MEASURED zero, which must survive
// as 0 and not be confused with the blank cells elsewhere.
const payout = rowNamed(pl, "Dividend Payout %");
eq("a measured 0% stays 0", payout!.values[0], 0);
eq("a percent row is flagged as such", payout!.percent, true);

// Gross NPA % is blank on every column of Quarterly Results — the failure case
// this parser exists to get right.
const q = tableNamed(doc, "Quarterly Results");
const npa = rowNamed(q, "Gross NPA %");
eq("an all-blank row parses as all-null, never zeros", npa!.values.every((v) => v === null), true);
eq("… and so contributes no series points", seriesOf(npa, q!.periods).length, 0);

// ── derived ─────────────────────────────────────────────────────────────────
const revSeries = seriesOf(rev, pl!.periods);
eq("TTM excluded from the series by default", revSeries.length, 12);
eq("… and included when asked for", seriesOf(rev, pl!.periods, true).length, 13);
eq("series spans Mar 2015 → Mar 2026", [revSeries[0].period.label, revSeries[11].period.label], ["Mar 2015", "Mar 2026"]);

// 2,710 → 45,513 over 11 years = 29.03% CAGR.
const cagr = cagrPct(revSeries);
eq("revenue CAGR over the full span", Number(cagr!.toFixed(2)),
   Number((((45513 / 2710) ** (1 / 11) - 1) * 100).toFixed(2)));
eq("one point is not a growth rate", cagrPct(revSeries.slice(0, 1)), null);
// A start at or below zero has no compound rate — several holdings have a
// loss-making year, and the formula returns a confident wrong number for them.
eq("a non-positive start gives no CAGR",
   cagrPct([{ period: parsePeriod("Mar 2015"), value: -5 }, { period: parsePeriod("Mar 2020"), value: 100 }]), null);
eq("a sub-year span gives no CAGR",
   cagrPct([{ period: parsePeriod("Mar 2020"), value: 5 }, { period: parsePeriod("Mar 2020"), value: 9 }]), null);

eq("simple growth", Number(growthPct(2710, 3645)!.toFixed(4)), Number((((3645 - 2710) / 2710) * 100).toFixed(4)));
eq("growth off a zero base is not infinite", growthPct(0, 100), null);
eq("growth needs both sides", growthPct(null, 100), null);

// Net Profit / Revenue as a margin, Mar 2015: 309 / 2,710 = 11.40%.
const margin = ratioRow(rowNamed(pl, "Net Profit"), rev, pl!.periods);
eq("derived margin", Number(margin[0]!.toFixed(2)), Number(((309 / 2710) * 100).toFixed(2)));

// ── row matching is by LABEL, not position ──────────────────────────────────
eq("a line the company does not report is null, not the nearest row", rowNamed(pl, "EBITDA"), null);
eq("rowAny takes the first label that exists", rowAny(pl, ["Sales", "Revenue"])!.label, "Revenue +");
eq("rowAny with no match is null", rowAny(pl, ["Sales", "Turnover"]), null);

// ── peers and shareholding, the other two tables a reader acts on ───────────
// THE PEER TABLE'S LABEL COLUMN IS NOT COLUMN 0. It puts a serial number there
// and the company name in column 1, which is why every row carries its full
// `text` and a consumer reads the column it actually needs.
const peers = tableNamed(doc, "Peer Comparison");
eq("peer rows are numbered, so the label column is the serial", peers!.rows[0].label, "1.");
eq("the company name is in column 1", peers!.rows[0].text[1], "Jio Financial");
eq("this company appears among its own peers",
   peers!.rows.some((r) => /Aditya Birla Cap/i.test(r.text[1] ?? "")), true);

const sh = tableNamed(doc, "Shareholding Pattern");
// "Promoters -" carries screener's collapse marker after a NON-BREAKING space.
const promoters = rowNamed(sh, "Promoters");
eq("promoter holding is a percent row", promoters!.percent, true);
eq("promoter holding first and last", [promoters!.values[0], promoters!.values[promoters!.values.length - 1]], [69, 68.81]);

console.log(fails ? `\n${fails} FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
