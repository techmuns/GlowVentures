// THE PRICING DATE ON AN NSDL HOLDING STATEMENT.
// Run: node scripts/ingest/__tests__/nsdlPriceDate.test.mjs
//
// ICICI Bank's NSDL `Statement of Holding 31-Mar-2026` reports its balances at
// the 31st and values them at the 30th: its total row reads `Total Value of
// Holding ( Prices as on 30-Mar-2026 )`. The reader read that date into the
// document, `makeDocument` discarded it, every holding kept `priceAsOn: null`,
// and the book dated each mark to the balance date.
//
// ── WHAT THIS SUITE IS FOR ─────────────────────────────────────────────────
//
//   • a statement that PRINTS `Prices as on …` puts that date on every holding,
//     as `priceAsOn` — and never the title's date, which is the balance's;
//   • a statement that prints NONE leaves every holding null — the title's date
//     is not a pricing date, and a default would be a date nobody printed;
//   • the date SURVIVES the normalized shape: `makeDocument`, `deriveDocument`
//     and `assertNormalized` are what `extract.mjs` runs, and `makeHolding` has
//     silently dropped a reader's field once before (`faceValue`).
//
// Written against a SYNTHETIC statement painted at the real layout's x positions
// (`ISIN Code` x22, `Scrip Name` x91, `Account Description` x337, `Balance`
// x463, `Value (Rs.)` x534) and read through `extractLayout`, so it exercises the
// reader on geometry rather than the committed archive — which would pass
// whatever the reader did, being the thing it wrote.
import { extractLayout } from "../lib/layout.mjs";
import { extract, runStamp, weekdaysStrictlyBetween } from "../providers/nsdlDemat.mjs";
import { makeDocument, deriveDocument, assertNormalized } from "../lib/document.mjs";
import { readGaps } from "../lib/readStatus.mjs";
import { makeGridPdf } from "./fixtures/makePdf.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("nsdlPriceDate");

/**
 * A two-holding-plus-one-par statement; `pricesAsOn` is the total row's clause,
 * or null for none. `stamp` is the page footer's run stamp, drawn where the real
 * one is (x252, below the table), or omitted; `title` is the heading's date.
 */
function statementPdf(pricesAsOn, { stamp = null, title = "31-Mar-2026" } = {}) {
  const total = "123,638,194,147.00";
  return makeGridPdf([
    [22, 800, "ICICI BANK LIMITED"],
    [22, 790, "DP ID : IN302902"],
    [22, 770, `Statement of Holding ${title}`],
    [22, 755, "Name AJAY T JAISINGHANI Client Id 49794950"],
    [22, 740, "Category Non House Beneficiary Status Active"],
    [337, 707, "Account"],
    [22, 700, "ISIN Code"], [91, 700, "Scrip Name"], [463, 700, "Balance"], [534, 700, "Value (Rs.)"],
    [337, 693, "Description"],
    [22, 675, "INE455K01017"], [91, 675, "POLYCAB INDIA LIMITED - EQ"], [337, 675, "Beneficiary"],
    [442, 675, "13901229.000"], [508, 675, "123,512,419,665.00"],
    [22, 655, "INE00GK01023"], [91, 655, "YASH HIGHVOLTAGE LIMITED - EQ"], [337, 655, "Beneficiary"],
    [442, 655, "138462.000"], [508, 655, "125,446,572.00"],
    // A PAR row: 32,791 shares at exactly Rs 10.00 — a face value, carried with
    // no market value. The statement's pricing date still dates what it printed.
    [22, 635, "INE0ETS01014"], [91, 635, "ZENITH LEISURE HOLIDAYS LIMITED - EQ"], [337, 635, "Beneficiary"],
    [442, 635, "32791.000"], [508, 635, "327,910.00"],
    [22, 615, pricesAsOn
      ? `Total Value of Holding ( Prices as on ${pricesAsOn} ) Rs. ${total}`
      : `Total Value of Holding Rs. ${total}`],
    [22, 590, "This is a computer generated report and does not require signature."],
    ...(stamp ? [[252, 570, `${stamp} User Name - Ramawatar Kumbhar Ramawatar Kumbhar (355827) Page 1 of 1`]] : []),
  ], { mediaBox: [0, 0, 595, 842] });
}

async function read(pricesAsOn, opts = {}) {
  const { pages, error } = await extractLayout(statementPdf(pricesAsOn, opts));
  if (error) return { error };
  const docKey = "icici-bank-nsdl-demat-49794950-2026-03-31-holdings";
  const raw = extract({ grid: { pages }, meta: { docKey } });
  if (!raw) return { raw: null };
  // What `extract.mjs` does with a reader's output, so the check is on the
  // normalized document the archive is written from, not on the reader's own object.
  const doc = assertNormalized(deriveDocument(makeDocument({ docKey, sourcePath: "synthetic", status: "ok", ...raw })));
  return { raw, doc };
}

// ── 1. PRINTED: every holding carries the statement's own pricing date ─────────
{
  const { error, raw, doc } = await read("30-Mar-2026");
  ok("the dated statement parses", !error, error ?? "");
  ok("the reader recognises the statement", !!raw);
  if (raw && doc) {
    ok("the account is dated by its BALANCE, the title's 31 Mar", raw.asOf === "2026-03-31", `asOf ${raw.asOf}`);
    ok("three holdings are read", doc.holdings.length === 3, `got ${doc.holdings.length}`);
    ok("every holding carries the printed pricing date, 30 Mar",
      doc.holdings.length > 0 && doc.holdings.every((h) => h.priceAsOn === "2026-03-30"),
      JSON.stringify(doc.holdings.map((h) => [h.securityKey, h.priceAsOn])));
    ok("…which is NOT the balance date — the title's date is never taken for it",
      doc.holdings.every((h) => h.priceAsOn !== raw.asOf));
    ok("the reader's own holdings carry it before normalization too",
      raw.holdings.every((h) => h.priceAsOn === "2026-03-30"));
    const poly = doc.holdings.find((h) => h.securityKey === "polycab-india");
    ok("Polycab is valued at the printed figure, and dated to the pricing session",
      poly?.marketValue === 123512419665 && poly?.priceAsOn === "2026-03-30",
      JSON.stringify({ mv: poly?.marketValue, priceAsOn: poly?.priceAsOn }));
    const par = doc.holdings.find((h) => h.securityKey === "zenith-leisure-holidays");
    ok("a par row keeps its face value and no mark, and the same statement date",
      par?.marketValue === null && par?.faceValue === 10 && par?.priceAsOn === "2026-03-30",
      JSON.stringify({ mv: par?.marketValue, fv: par?.faceValue, priceAsOn: par?.priceAsOn }));
    ok("the skew is warned, naming both dates",
      (doc.warnings ?? []).some((w) => w.code === "price-date-precedes-holding-date"
        && /2026-03-31/.test(w.detail) && /2026-03-30/.test(w.detail)));
  }
}

// ── 2. NOT PRINTED: null on every holding, never the balance date ─────────────
{
  const { error, raw, doc } = await read(null);
  ok("the undated statement parses", !error, error ?? "");
  ok("the reader recognises the undated statement", !!raw);
  if (raw && doc) {
    ok("three holdings are read without a pricing date", doc.holdings.length === 3, `got ${doc.holdings.length}`);
    ok("every holding's pricing date is null — not the title's 31 Mar, not a default",
      doc.holdings.length > 0 && doc.holdings.every((h) => h.priceAsOn === null),
      JSON.stringify(doc.holdings.map((h) => [h.securityKey, h.priceAsOn])));
    ok("no skew is warned where no pricing date was printed",
      !(doc.warnings ?? []).some((w) => w.code === "price-date-precedes-holding-date"));
    ok("the values are still read — only the date is absent",
      doc.holdings.find((h) => h.securityKey === "polycab-india")?.marketValue === 123512419665);
  }
}

// ── 3. A DIFFERENT PRINTED DATE IS READ AS PRINTED, not as a constant ─────────
{
  const { raw, doc } = await read("27-Mar-2026");
  // `every` over an empty list is true, so the count is part of the claim.
  ok("a statement priced at 27 Mar dates its holdings to 27 Mar",
    !!raw && !!doc && doc.holdings.length === 3 && doc.holdings.every((h) => h.priceAsOn === "2026-03-27"),
    JSON.stringify(doc?.holdings.map((h) => h.priceAsOn)));
}

// ── 4. THE RUN CONTRADICTS THE LABEL: balances kept, no valuation ─────────────
//
// The real 31 March statement: labelled `Prices as on 30-Mar-2026`, run on
// Tuesday 21 July 2026, and every listed value is the 20 July close. A balance
// priced at another date's close is a valuation on no date, so no row carries a
// market value or a pricing date. The column's figure is kept as `valueWhenRun`.
{
  const { error, raw, doc } = await read("30-Mar-2026", { stamp: "Tuesday, July 21, 2026 03:57 PM" });
  ok("the statement run in July parses", !error, error ?? "");
  ok("the reader recognises it", !!raw);
  if (raw && doc) {
    ok("the account is still dated by its balance, 31 Mar", raw.asOf === "2026-03-31", `asOf ${raw.asOf}`);
    ok("three holdings are read, every balance kept", doc.holdings.length === 3
      && doc.holdings.find((h) => h.securityKey === "polycab-india")?.quantity === 13901229
      && doc.holdings.find((h) => h.securityKey === "yash-highvoltage")?.quantity === 138462,
      JSON.stringify(doc.holdings.map((h) => [h.securityKey, h.quantity])));
    ok("NO holding carries a market value — the values are not a 31 March valuation",
      doc.holdings.every((h) => h.marketValue === null && h.printed?.marketValue === null),
      JSON.stringify(doc.holdings.map((h) => [h.securityKey, h.marketValue, h.printed?.marketValue])));
    ok("NO holding carries a pricing date — the label is contradicted, and no other date is printed",
      doc.holdings.every((h) => h.priceAsOn === null),
      JSON.stringify(doc.holdings.map((h) => [h.securityKey, h.priceAsOn])));
    const poly = doc.holdings.find((h) => h.securityKey === "polycab-india");
    ok("the column's figure is kept as `valueWhenRun`, never as a value",
      poly?.valueWhenRun === 123512419665 && doc.holdings.find((h) => h.securityKey === "yash-highvoltage")?.valueWhenRun === 125446572,
      JSON.stringify(doc.holdings.map((h) => [h.securityKey, h.valueWhenRun])));
    const par = doc.holdings.find((h) => h.securityKey === "zenith-leisure-holidays");
    ok("a par row keeps its face value and gets no `valueWhenRun` — par is no price on any day",
      par?.faceValue === 10 && !("valueWhenRun" in par), JSON.stringify(par));
    ok("the document totals no market value", doc.totals?.totalMarketValue == null,
      JSON.stringify(doc.totals));
    ok("the printed total still checks every row read",
      (raw.checks?.passed ?? []).some((c) => /printed `Total Value of Holding`/.test(c)) && !(raw.checks?.failed ?? []).length,
      JSON.stringify(raw.checks));
    const w = (doc.warnings ?? []).find((x) => x.code === "values-priced-when-run");
    ok("the contradiction is warned, naming the label, the run and the latest close it can carry",
      !!w && /2026-03-30/.test(w.detail) && /2026-07-21/.test(w.detail) && /2026-07-20/.test(w.detail),
      w?.detail ?? "(none)");
    ok("…and the one-day skew warning, whose claim the run refutes, is not written",
      !(doc.warnings ?? []).some((x) => x.code === "price-date-precedes-holding-date"));
    ok("the warning is a statement NOTE, so a document read in full is not `partial`",
      readGaps(doc).length === 0, JSON.stringify(readGaps(doc)));
  }
}

// ── 5. THE RUN CORROBORATES THE LABEL: read as before ─────────────────────────
//
// The real 31 October statement: labelled `Prices as on 30-Oct-2026` (a
// Friday), run Monday 2 November 16:51. Only a weekend lies between, so no
// session can have closed after the labelled one, and its values stand.
{
  const { raw, doc } = await read("30-Oct-2026", { title: "31-Oct-2026", stamp: "Monday, November 2, 2026 04:51 PM" });
  ok("a statement run the next session keeps its values and its pricing date",
    !!raw && !!doc && doc.holdings.length === 3
      && doc.holdings.find((h) => h.securityKey === "polycab-india")?.marketValue === 123512419665
      && doc.holdings.every((h) => h.priceAsOn === "2026-10-30")
      && doc.holdings.every((h) => !("valueWhenRun" in h)),
    JSON.stringify(doc?.holdings.map((h) => [h.securityKey, h.marketValue, h.priceAsOn, h.valueWhenRun])));
  ok("…and warns the one-day skew, not a contradiction",
    !!doc && doc.warnings.some((w) => w.code === "price-date-precedes-holding-date")
      && !doc.warnings.some((w) => w.code === "values-priced-when-run"));
}

// ── 6. A STAMP THAT DOES NOT AGREE WITH ITSELF DECIDES NOTHING ────────────────
{
  // 21 July 2026 is a Tuesday: a "Monday" stamp on it is a misread, not a run.
  const { raw, doc } = await read("30-Mar-2026", { stamp: "Monday, July 21, 2026 03:57 PM" });
  ok("a stamp whose weekday contradicts its date is ignored, and the label is read",
    !!raw && !!doc && doc.holdings.find((h) => h.securityKey === "polycab-india")?.marketValue === 123512419665
      && doc.holdings.every((h) => h.priceAsOn === "2026-03-30"),
    JSON.stringify(doc?.holdings.map((h) => [h.securityKey, h.marketValue, h.priceAsOn])));
}

// ── 7. THE HELPERS, on the two real stamps ────────────────────────────────────
{
  const july = runStamp("… Tuesday, July 21, 2026 03:57 PM User Name …");
  ok("the July stamp reads as 21 Jul 15:57", july?.date === "2026-07-21" && july?.time === "15:57", JSON.stringify(july));
  const nov = runStamp("Monday, November 2, 2026 04:51 PM");
  ok("the November stamp reads as 2 Nov 16:51", nov?.date === "2026-11-02" && nov?.time === "16:51", JSON.stringify(nov));
  ok("no weekday lies between Fri 30 Oct and Mon 2 Nov", weekdaysStrictlyBetween("2026-10-30", "2026-11-02") === 0);
  ok("80 weekdays lie between Mon 30 Mar and Tue 21 Jul", weekdaysStrictlyBetween("2026-03-30", "2026-07-21") === 80,
    String(weekdaysStrictlyBetween("2026-03-30", "2026-07-21")));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
