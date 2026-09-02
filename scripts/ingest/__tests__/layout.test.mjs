// Tests for coordinate-aware table extraction.
//
// Runs against a PDF generated HERE with known coordinates, so the assertions
// are about the geometry engine and not about any particular statement. The
// cases are the three failure modes real statements exhibit:
//   • a right-aligned money column whose left edge moves per row,
//   • a figure split mid-number across spans on one line,
//   • a figure split across two lines,
// plus a superscript that must not create a phantom row.
//
// Run: node scripts/ingest/__tests__/layout.test.mjs
import { extractLayout, clusterRows, inferColumns } from "../lib/layout.mjs";
import { parseNum } from "../lib/parseNum.mjs";
import { makeGridPdf, makeInkPdf } from "./fixtures/makePdf.mjs";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (ok) pass++; else { fail++; console.log(`  FAIL ${label}\n       got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

console.log("layout");

// x, y, text. Money column is right-ish aligned at x=470; names start at x=60.
const spans = [
  [60, 700, "Security"], [300, 700, "Qty"], [380, 700, "Price"], [470, 700, "Market Value"],
  [60, 680, "Blue Jet Healthcare Ltd."], [300, 680, "15,000"], [380, 680, "574.50"], [470, 680, "8,617,500.00"],
  [60, 660, "Sundaram Finance Ltd."], [300, 660, "1,200"], [380, 660, "4,905.10"], [470, 660, "5,886,120.00"],
  // split mid-number across two spans on ONE line
  [60, 640, "Sonata Software Ltd."], [300, 640, "9,500"], [380, 640, "362.15"], [470, 640, "3,440,"], [497, 640, "425.00"],
  // split across TWO lines
  [60, 620, "Special Opportunities Fund"], [300, 620, "990,429.684"], [380, 620, "-"], [470, 620, "14,580,412."],
  [470, 612, "51"],
  // superscript marker above the baseline — must join the y=600 row
  [60, 600, "Footnoted Name"], [112, 604, "1"], [300, 600, "100"], [380, 600, "10.00"], [470, 600, "1,000.00"],
];

const { pages, error } = await extractLayout(makeGridPdf(spans));
ok("document parsed", !error, error ?? "");
ok("one page", pages.length === 1, `got ${pages.length}`);
const g = pages[0];

// ── Rows ────────────────────────────────────────────────────────────────────
// 7 painted lines collapse to 6: the continuation merges, the superscript joins.
eq("row count after merge", g.rows.length, 6);

const cellAt = (rowIdx, colIdx) => {
  const c = g.rows[rowIdx].cells.find((c) => c.column === colIdx);
  return c ? c.text : null;
};
const rowByName = (name) => g.rows.findIndex((r) => r.cells.some((c) => c.text.startsWith(name)));

// ── Columns inferred globally ───────────────────────────────────────────────
eq("four columns", g.columns.length, 4);

// ── Ordinary right-aligned money column reads correctly ─────────────────────
const iBlue = rowByName("Blue Jet");
ok("Blue Jet row found", iBlue >= 0);
eq("Blue Jet qty",   parseNum(cellAt(iBlue, 1)), 15000);
eq("Blue Jet price", parseNum(cellAt(iBlue, 2)), 574.50);
eq("Blue Jet value", parseNum(cellAt(iBlue, 3)), 8617500.00);
eq("Blue Jet name",  cellAt(iBlue, 0), "Blue Jet Healthcare Ltd.");

// ── Same-line split stitched back into ONE number ───────────────────────────
const iSonata = rowByName("Sonata");
eq("Sonata value stitched", parseNum(cellAt(iSonata, 3)), 3440425.00);
ok("same-line stitch recorded", g.stitches.some((s) => s.kind === "same-line" && s.joined.replace(/\s/g, "") === "3,440,425.00"),
   JSON.stringify(g.stitches));

// ── Cross-line split stitched, and the fragment row is gone ─────────────────
const iFund = rowByName("Special Opportunities");
eq("cross-line NAV stitched", parseNum(cellAt(iFund, 3)), 14580412.51);
ok("cross-line stitch recorded", g.stitches.some((s) => s.kind === "cross-line" && s.joined === "14,580,412.51"),
   JSON.stringify(g.stitches.filter((s) => s.kind === "cross-line")));
// A dash is "not reported" — it must NOT become 0.
eq("dash stays null", parseNum(cellAt(iFund, 2)), null);
eq("units read",      parseNum(cellAt(iFund, 1)), 990429.684);

// ── Superscript joined its baseline row rather than making a new one ────────
const iFoot = rowByName("Footnoted");
eq("superscript folded in", parseNum(cellAt(iFoot, 3)), 1000.00);
ok("no phantom superscript row", !g.rows.some((r) => r.cells.length === 1 && r.cells[0].text === "1"));

// ── Unit-level checks on the clustering primitives ──────────────────────────
const items = [
  { x: 10, y: 100, width: 20, height: 9, text: "a" },
  { x: 40, y: 100.4, width: 20, height: 9, text: "b" },   // sub-pixel drift
  { x: 70, y: 103, width: 5, height: 5, text: "2" },      // superscript
  { x: 10, y: 80, width: 20, height: 9, text: "c" },      // next line
];
eq("sub-pixel + superscript cluster into one row", clusterRows(items).length, 2);
eq("wide gap yields two columns",
   inferColumns([{ y: 0, items: [{ x: 0, y: 0, width: 10, height: 9, text: "a" }, { x: 100, y: 0, width: 10, height: 9, text: "b" }] }]).length, 2);
eq("touching items yield one column",
   inferColumns([{ y: 0, items: [{ x: 0, y: 0, width: 10, height: 9, text: "a" }, { x: 11, y: 0, width: 10, height: 9, text: "b" }] }]).length, 1);



// ── inkKind: what is on a page that carries no text ────────────────────────────
//
// `noTextLayer` in extract.mjs turns this into the diagnosis a human reads, and
// the two answers send that human to do DIFFERENT things — ask HDFC to re-scan
// paper, or ask them to re-export with fonts embedded. Getting it wrong is the
// "confidently wrong answer" failure that test's own comment already records
// about the review workbook, so both directions are asserted here.
{
  const vec = await extractLayout(makeInkPdf("vector"));
  ok("vector page yields no text rows", vec.pages.every((p) => !p.rows.length));
  eq("vector page inkKind", vec.inkKind?.kind, "vector");
  ok("vector page counted paths", (vec.inkKind?.paths ?? 0) > 0, `paths=${vec.inkKind?.paths}`);
  eq("vector page has no raster image", vec.inkKind?.images, 0);

  const ras = await extractLayout(makeInkPdf("raster"));
  ok("raster page yields no text rows", ras.pages.every((p) => !p.rows.length));
  eq("raster page inkKind", ras.inkKind?.kind, "raster");
  ok("raster page counted an image", (ras.inkKind?.images ?? 0) > 0, `images=${ras.inkKind?.images}`);

  // The cost gate: a document that DID yield text must never pay for the second
  // parse, so inkKind stays null on every ordinary statement in the corpus.
  const withText = await extractLayout(makeGridPdf(spans));
  eq("a document with text is not classified", withText.inkKind, null);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
