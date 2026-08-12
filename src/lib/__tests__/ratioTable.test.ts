// THE RATIO TABLE READER, CHECKED AGAINST THE REAL PAGE.
//
// The fixture is the moneycontrol ratios section for Reliance exactly as
// `web_reader` returned it on 2026-08-12, cut at the section boundaries and
// otherwise untouched. Everything asserted below is a figure a human can read
// off it, and every case is one where a plausible wrong answer is easy:
//
//   • the "Trend" column — a Highcharts placeholder — taken as the first year
//   • "Per Share Ratios" (a heading with no figures) read as a ratio of nulls
//   • the two-digit year "Mar 26" read as 26 AD
//   • a bonus issue read as the business halving
//   • ANOTHER COMPANY'S PAGE rendered under this holding's name
import fs from "node:fs";
import path from "node:path";
import {
  parseRatioTable, parseRatioPeriod, parseRatioCell, checkIdentity, shareCountBreaks,
} from "@/lib/ratioTable";

const FIXTURES = process.env.GLOW_FIXTURES ?? path.join(process.cwd(), "src/lib/__tests__/fixtures");
const MD = fs.readFileSync(path.join(FIXTURES, "ratios-RELIANCE.md"), "utf8");

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};

// ── headers and cells ───────────────────────────────────────────────────────
eq("a two-digit year is this century", parseRatioPeriod("Mar 26"), { label: "Mar 26", year: 2026 });
eq("a four-digit year still parses", parseRatioPeriod("Mar 2026").year, 2026);
eq("a non-period header has no year", parseRatioPeriod("Trend").year, null);
eq("a plain number", parseRatioCell("59.69"), 59.69);
eq("grouped digits", parseRatioCell("1,172.75"), 1172.75);
eq("THE CHART PLACEHOLDER IS NOT A VALUE", parseRatioCell("Created with Highcharts 11.4.8"), null);
eq("a blank is not zero", parseRatioCell(""), null);
eq("a percent sign is stripped, the number kept", parseRatioCell("8.93"), 8.93);

// ── the real page ───────────────────────────────────────────────────────────
const doc = parseRatioTable(MD);
eq("the page names its own company", doc.sourceCompany, "Reliance");
eq("and its basis", doc.basis, "Consolidated");
eq("seven year-ends, Trend excluded", doc.periods.map((p) => p.label),
   ["Mar 26", "Mar 25", "Mar 24", "Mar 23", "Mar 22", "Mar 21", "Mar 20"]);

const row = (l: string) => doc.rows.find((r) => r.label === l);
// Read straight off the source: Basic EPS runs 59.69 (Mar 26) … 63.07 (Mar 20).
eq("EPS first and last", [row("Basic EPS (Rs.)")!.values[0], row("Basic EPS (Rs.)")!.values[6]], [59.69, 63.07]);
eq("… and it is a per-share line", row("Basic EPS (Rs.)")!.perShare, true);
eq("ROE reads across", row("Return on Networth / Equity (%)")!.values.slice(0, 3), [8.93, 8.25, 8.77]);
eq("… flagged as a percent", row("Return on Networth / Equity (%)")!.percent, true);
eq("… and is NOT a per-share line", row("Return on Networth / Equity (%)")!.perShare, false);
eq("current ratio", row("Current Ratio (%)")!.values[0], 1.10);

// A SECTION HEADING IS NOT A RATIO OF NULLS.
eq("headings are marked as such", row("Per Share Ratios")!.heading, true);
eq("… and a real row is not", row("Basic EPS (Rs.)")!.heading, false);
eq("every section heading found", doc.rows.filter((r) => r.heading).map((r) => r.label),
   ["Per Share Ratios", "Profitability Ratios", "Liquidity Ratios", "Coverage Ratios", "Valuation Ratios"]);

// The Trend column must not have become a data column: if it had, every row's
// first value would be null and the figures would be shifted a year.
eq("no row starts with the chart column", doc.rows.filter((r) => !r.heading).every((r) => r.values.length === 7), true);

// ── the identity check, which is why this is renderable at all ──────────────
eq("the holding's own name matches", checkIdentity(doc, "Reliance Industries Ltd").matches, true);
eq("a short page name matches a long holding name", checkIdentity(doc, "Reliance Industries Limited").matches, true);
// THE MEASURED FAILURE: asked for ABCAPITAL the resolver returned Tata
// Capital's page. Real figures, wrong company — the one thing this must refuse.
const wrongCo = parseRatioTable(MD.replace("# Reliance Key Financial Ratios", "# Tata Capital Key Financial Ratios"));
eq("another company's page is refused", checkIdentity(wrongCo, "Aditya Birla Capital Ltd").matches, false);
eq("… and the reason names both", /Tata Capital.*different company.*Aditya Birla Capital/.test(checkIdentity(wrongCo, "Aditya Birla Capital Ltd").reason), true);
// A page with no H1 cannot be attributed, so it is refused too — an unrun
// check is not a passed one.
const noName = parseRatioTable(MD.replace(/^# .*$/m, "# Something Else"));
eq("a page that names no company is refused", checkIdentity(noName, "Reliance Industries Ltd").matches, false);

// ── the share-count trap ────────────────────────────────────────────────────
// Every per-share row halves between Mar 24 and Mar 25 while the margins hold:
// a share count doubling, which charted unadjusted reads as a 50% collapse.
const breaks = shareCountBreaks(doc);
eq("the share-count break is found", breaks.map((b) => b.period.label), ["Mar 25"]);
eq("… at roughly half", Math.round((breaks[0]?.factor ?? 0) * 100) / 100 < 0.55, true);

console.log(fails ? `\n${fails} FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
