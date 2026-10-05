// THE MOPWM REVIEW TAB, CHECKED AGAINST THE WORKBOOK ITSELF (Stage 10dg).
//   npm run test:family
//
// The tab shows the family's consolidated review's private-market lines as the
// review prints them. The failures worth catching here are the ones that render
// perfectly:
//
//   • a line LEFT OUT — the client's own words were "make sure nothing is
//     missed", and a table that drops a row still adds up to itself;
//   • a figure read off the WRONG ROW or the wrong column, which reads exactly
//     like the right one;
//   • a return struck on a basis the line does not have;
//   • a review figure reaching the BOOK, which would end this book's guarantee
//     that every number traces to the institution that struck it;
//   • a name this dashboard keeps off every page arriving through the review.
//
// Every expectation is read off the workbook with SheetJS on the run, cell by
// cell — never through `scripts/lib/reviewPrivateRead.mjs`, the code under
// test, which would agree with itself by construction.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { REVIEW_PRIVATE } from "@/data/reviewPrivate";
import { allReviewRows, memberTotal, reviewTotals, SUMMARY_SECTIONS, type ReviewRow } from "@/lib/reviewPrivate";

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const CRORE = 1e7;
const WB = XLSX.readFile(path.join(process.cwd(), REVIEW_PRIVATE.workbook));
const sheet = (name: string) => {
  // The review's own sheet names carry stray spaces ("Private Investments ").
  const real = WB.SheetNames.find((n) => n.trim() === name.trim());
  const ws = real ? WB.Sheets[real] : undefined;
  if (!ws) throw new Error(`the review has no sheet "${name}"`);
  return ws;
};
/** Every cell of one Excel row (1-based), as SheetJS reads it. */
const rowCells = (tab: string, row: number): unknown[] => {
  const ws = sheet(tab);
  const out: unknown[] = [];
  for (let c = 0; c < 30; c++) out.push(ws[XLSX.utils.encode_cell({ r: row - 1, c })]?.v ?? null);
  return out;
};
const numbersIn = (cells: unknown[]) => cells.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
/** A rupee figure the generator emitted appears in that row as crores, to the rupee. */
const hasCrore = (cells: unknown[], rupees: number) => numbersIn(cells).some((v) => Math.abs(v * CRORE - rupees) <= 1);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const d = REVIEW_PRIVATE;
const rows = allReviewRows(d);

console.log("\n1. Every line of the Private Investments tab is a row of this tab, once");
{
  const PI = "Private Investments";
  const ws = sheet(PI);
  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  // The data rows sit between the review's own "Private Equity" head and its "Total".
  let head = -1, total = -1;
  for (let r = range.s.r; r <= range.e.r; r++) {
    const b = ws[XLSX.utils.encode_cell({ r, c: 1 })]?.v;
    if (head < 0 && /^private equity$/i.test(String(b ?? "").trim())) head = r + 1;
    if (/^total$/i.test(String(b ?? "").trim())) total = r + 1;
  }
  ok("the tab's head and Total rows are found", head > 0 && total > head, `head ${head}, total ${total}`);
  const productRows: number[] = [];
  for (let r = head + 1; r < total; r++) if (String(rowCells(PI, r)[1] ?? "").trim()) productRows.push(r);
  const mine = rows.filter((r) => r.tab === PI).map((r) => r.row).sort((a, b) => a - b);
  ok(`the workbook's ${productRows.length} product rows are exactly this tab's Private Investments rows`,
    productRows.length === mine.length && productRows.every((r, i) => r === mine[i]),
    `workbook ${productRows.length}, tab ${mine.length}`);
  ok("…and that is the 87 the review lists", productRows.length === 87, String(productRows.length));
  // The cost column BY ITS HEADER, never by position: the Total row carries a
  // stray figure (921871) in its date column, which a positional read takes for a cost.
  let costCol = -1;
  for (let r = range.s.r; r < head && costCol < 0; r++) {
    costCol = rowCells(PI, r + 1).findIndex((v) => typeof v === "string" && /^investment at cost$/i.test(v.trim()));
  }
  ok("the tab's Investment at Cost column is found by its header", costCol >= 0);
  const totalCost = Number(rowCells(PI, total)[costCol]);
  ok("the generated total is the workbook's Total row", Math.abs(d.privateInvestmentsTotal.invested - totalCost * CRORE) <= 1,
    `${d.privateInvestmentsTotal.invested} vs ${totalCost * CRORE}`);
  const sum = rows.filter((r) => r.tab === PI).reduce((s, r) => s + (r.invested ?? 0), 0);
  ok("the lines' cost adds to the review's own Total, to the rupee", Math.abs(sum - totalCost * CRORE) <= 1, `${sum} vs ${totalCost * CRORE}`);
}

console.log("\n2. Every row's name and figures are on the review row it names");
{
  const misses: string[] = [];
  for (const r of rows) {
    const cells = rowCells(r.tab, r.row);
    const text = cells.filter((v): v is string => typeof v === "string").map(norm).join(" | ");
    const first = norm(r.name).split(" ").slice(0, 2).join(" ");
    if (!text.includes(first)) misses.push(`${r.name}: "${first}" not on ${r.tab} row ${r.row}`);
    if (r.invested !== null && r.invested !== 0 && !hasCrore(cells, r.invested)) misses.push(`${r.name}: cost ${r.invested} not on its row`);
    if (r.value !== null && r.value !== 0 && !hasCrore(cells, r.value)) misses.push(`${r.name}: value ${r.value} not on its row`);
  }
  ok(`all ${rows.length} rows read off their own review row`, misses.length === 0, misses.slice(0, 4).join("; "));
}

console.log("\n3. Each block ties to the review's own head");
for (const s of d.sections) {
  if (!s.head) continue;
  const t = reviewTotals(s.rows);
  const cells = rowCells(s.tab, s.head.row);
  ok(`${s.title}: the head is the workbook's own ${s.tab} row ${s.head.row}`, hasCrore(cells, s.head.invested) && hasCrore(cells, s.head.value));
  ok(`${s.title}: its lines add to the head's cost and value`,
    Math.abs((t.invested ?? 0) - s.head.invested) <= 1 && Math.abs((t.value ?? 0) - s.head.value) <= 1,
    `cost ${t.invested} vs ${s.head.invested}, value ${t.value} vs ${s.head.value}`);
}

console.log("\n4. The members tie to the blocks, column by column");
{
  const sum = (f: (m: (typeof d.members)[number]) => number | null) => d.members.reduce((s, m) => s + (f(m) ?? 0), 0);
  const pe = d.sections.find((s) => s.key === "pe-funds")!;
  const unl = d.sections.find((s) => s.key === "unlisted")!;
  ok("PE funds by member add to the PE block's value", Math.abs(sum((m) => m.peFunds) - (pe.head?.value ?? NaN)) <= 1);
  ok("unlisted by member add to the unlisted block's value", Math.abs(sum((m) => m.unlisted) - (unl.head?.value ?? NaN)) <= 1);
  ok("private equity at cost by member adds to the Private Investments Total", Math.abs(sum((m) => m.peAtCost) - d.privateInvestmentsTotal.invested) <= 1);
  // The review's Investorwise summary takes PE funds and unlisted shares at its
  // own VALUE, and the Private Investments tab at COST — its own words.
  const summaryValue = d.sections.filter((s) => SUMMARY_SECTIONS.includes(s.key))
    .flatMap((s) => s.rows.map((r) => (s.tab === "Private Investments" ? (r.invested ?? 0) : (r.value ?? 0))))
    .reduce((a, b) => a + b, 0);
  const members = d.members.reduce((s, m) => s + (memberTotal(m) ?? 0), 0);
  ok("the members' total is the summary sections' lines — PE funds and unlisted at value, private investments at cost",
    Math.abs(members - summaryValue) <= 2, `${members} vs ${summaryValue}`);
  ok("…and the credit line is the one thing the members band leaves out",
    d.sections.filter((s) => !SUMMARY_SECTIONS.includes(s.key)).every((s) => s.key === "credit"));
}

console.log("\n5. Every return is re-derived on the basis the line has");
{
  const bad: string[] = [];
  for (const r of rows) {
    if (r.gain === null) { if (r.ret !== null) bad.push(`${r.name}: a return with no gain`); continue; }
    const base = r.retBasis === "rows" ? r.paidIn : r.retBasis === "cost" ? r.invested : null;
    if (base === null || !base) { bad.push(`${r.name}: a gain with no base`); continue; }
    if (r.atCost) bad.push(`${r.name}: a gain on a line held at cost`);
    const gain = (r.value ?? 0) + (r.paidBack ?? 0) - base;
    if (Math.abs(gain - r.gain) > 1) bad.push(`${r.name}: gain ${r.gain} vs ${gain}`);
    if (r.ret === null || Math.abs(r.ret - r.gain / base) > 1e-9) bad.push(`${r.name}: return ${r.ret} vs ${r.gain / base}`);
  }
  ok("gain = value + paid back − paid in (or the review's cost), and return = gain ÷ that base", bad.length === 0, bad.slice(0, 3).join("; "));
  const noDates = rows.filter((r) => r.xirr !== null && (!r.since || !r.until));
  ok("every XIRR carries the dates it spans, so a sub-year one can be refused", noDates.length === 0, noDates.map((r) => r.name).join(", "));
  const subYear = rows.filter((r) => r.xirr !== null && r.since && r.until && (Date.parse(r.until) - Date.parse(r.since)) / 864e5 < 365);
  ok("this book has sub-year XIRRs for the tab to refuse — the guard is load-bearing", subYear.length > 0, String(subYear.length));
}

console.log("\n6. Nothing here reaches the book");
{
  const importers: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|mjs|js)$/.test(f)) continue;
      if (/@\/data\/reviewPrivate\b|data\/reviewPrivate["']/.test(readFileSync(p, "utf8"))) importers.push(p);
    }
  };
  walk("src");
  const allowed = new Set(["src/lib/reviewPrivate.ts", "src/components/ReviewPrivateTable.tsx", "src/lib/__tests__/reviewPrivate.test.ts"]);
  ok("only the review tab's own files read the generated module", importers.every((p) => allowed.has(p)), importers.join(", "));
  ok("build-book does not read the review", !/reviewPrivate|review-private/i.test(readFileSync("scripts/build-book.mjs", "utf8")));
  ok("glowData.ts carries none of it", !/reviewPrivate/i.test(readFileSync("src/data/glowData.ts", "utf8")));
}

console.log("\n7. No name this dashboard keeps off its pages arrives through the review");
{
  const text = JSON.stringify(d);
  ok("no line, check or join names the ring-fenced holding", !/polycab/i.test(text));
  ok("…nor the register's sentinel", !/avendus/i.test(text));
}

console.log("\n8. The review's own inconsistencies are listed, each short on its face");
{
  ok("the 20 checks are listed", d.checks.length === 20, String(d.checks.length));
  const long = d.checks.filter((c) => c.short.length > 80 || !c.text || !c.detail);
  ok("each has a short face and its full text behind it", long.length === 0, long.map((c) => c.key).join(", "));
  const mismatched = rows.filter((r: ReviewRow) => r.ret !== null && r.reviewRet !== null && Math.abs(r.ret - r.reviewRet) > 1e-4);
  ok("every line whose printed return differs from its re-derived one is among the checks",
    mismatched.every((r) => d.checks.some((c) => c.text.includes(r.name.split(" - ")[0].split(" (")[0]))),
    mismatched.map((r) => r.name).join(", "));
}

console.log("\n9. Every line's date is its own review cell's, written out as a date");
{
  // The tab once printed "45631" under Integris — an Excel serial, which is
  // 5 Dec 2024. Each line is held to the date cell on the review row it names,
  // the column found by its HEADER scanning up from the line, and formatted
  // here a second way. A month range is the review's own words; it is written
  // out too, so "Sept 20" cannot read as the 20th of September.
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const HEAD = /date investment range|investment date range/i;
  const bad: string[] = [];
  let serials = 0, months = 0;
  for (const r of rows) {
    const ws = sheet(r.tab);
    const at = (row: number, c: number) => ws[XLSX.utils.encode_cell({ r: row - 1, c })]?.v;
    let col = -1;
    for (let row = r.row - 1; row >= 1 && col < 0; row--) for (let c = 0; c < 30; c++) if (HEAD.test(String(at(row, c) ?? ""))) { col = c; break; }
    if (col < 0) { bad.push(`${r.name}: no date column above row ${r.row}`); continue; }
    const v = at(r.row, col);
    if (v === undefined || v === null || String(v).trim() === "") { if (r.dates !== null) bad.push(`${r.name}: a date the review does not print`); continue; }
    if (typeof v === "number") {
      serials++;
      const t = new Date(Date.UTC(1899, 11, 30) + v * 864e5);
      const iso = t.toISOString().slice(0, 10);
      const text = `${t.getUTCDate()} ${MON[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
      if (r.dates?.precision !== "day" || r.dates.from !== iso || r.dates.to !== iso || r.dates.text !== text)
        bad.push(`${r.name}: cell ${v} is ${text}, the tab says ${JSON.stringify(r.dates)}`);
      continue;
    }
    const toks = [...String(v).matchAll(/([a-z]{3,})[\s'-]*(\d{2,4})/gi)];
    const m = (tk: RegExpMatchArray) => {
      const i = MON.findIndex((x) => x.toLowerCase() === tk[1].slice(0, 3).toLowerCase());
      return i < 0 ? null : { ym: `${tk[2].length === 2 ? `20${tk[2]}` : tk[2]}-${String(i + 1).padStart(2, "0")}`, text: `${MON[i]} ${tk[2].length === 2 ? `20${tk[2]}` : tk[2]}` };
    };
    const a = toks.length ? m(toks[0]) : null, b = toks.length ? m(toks[toks.length - 1]) : null;
    if (!a || !b) { if (r.dates?.text !== String(v).trim()) bad.push(`${r.name}: an unread cell "${v}" is not shown as printed`); continue; }
    months++;
    const text = a.text === b.text ? a.text : `${a.text} – ${b.text}`;
    if (r.dates?.precision !== "month" || r.dates.from !== a.ym || r.dates.to !== b.ym || r.dates.text !== text || r.dates.printed !== String(v).replace(/\s+/g, " ").trim())
      bad.push(`${r.name}: "${v}" is ${text}, the tab says ${JSON.stringify(r.dates)}`);
  }
  ok("every line's date is the date its own review cell holds", bad.length === 0, bad.slice(0, 3).join("; "));
  ok("no line prints a bare number where a date belongs", rows.every((r) => !r.dates || !/\d{5}/.test(r.dates.text)),
    rows.filter((r) => r.dates && /\d{5}/.test(r.dates.text)).map((r) => r.name).slice(0, 3).join(", "));
  // LOAD-BEARING: the workbook keeps most single dates as serials, so the defect
  // this section exists for has a subject on this book.
  ok("the workbook stores dates as serials, so the conversion is exercised", serials > 0 && months > 0, `${serials} serials, ${months} month ranges`);
}

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall review-tab checks passed");
