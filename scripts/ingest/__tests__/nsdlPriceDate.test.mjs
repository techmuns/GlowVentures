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
import { extract } from "../providers/nsdlDemat.mjs";
import { makeDocument, deriveDocument, assertNormalized } from "../lib/document.mjs";
import { makeGridPdf } from "./fixtures/makePdf.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("nsdlPriceDate");

/** A two-holding-plus-one-par statement; `pricesAsOn` is the total row's clause, or null for none. */
function statementPdf(pricesAsOn) {
  const total = "123,638,194,147.00";
  return makeGridPdf([
    [22, 800, "ICICI BANK LIMITED"],
    [22, 790, "DP ID : IN302902"],
    [22, 770, "Statement of Holding 31-Mar-2026"],
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
  ], { mediaBox: [0, 0, 595, 842] });
}

async function read(pricesAsOn) {
  const { pages, error } = await extractLayout(statementPdf(pricesAsOn));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
