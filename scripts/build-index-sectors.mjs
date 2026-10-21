/**
 * ── AN INDEX'S SECTOR WEIGHTS, AS ITS PUBLISHER PRINTS THEM ─────────────────
 *
 *   "they want there to be an option of versus index sector allocation …
 *    they should be able to select the index in comparison to which they want
 *    to compare their portfolio sector allocation. You can pick up index sector
 *    allocation from web search or any credible website or source."
 *
 * The one credible source for an index's sector weights is the index provider's
 * own monthly factsheet: NSE Indices Limited prints a "Sector Representation"
 * table on page one of every Nifty factsheet, dated the last trading day of the
 * month. This reads that table, and nothing else — no weight is typed in here,
 * summed from a third-party site, or carried from memory.
 *
 * ── WHAT IS READ, AND HOW IT IS CHECKED ─────────────────────────────────────
 *
 *   · IDENTITY FIRST. Each factsheet's opening sentence must name the index it
 *     is filed under (`expect`), the way `benchmarks.ts` checks the name the
 *     price service reports before a close is drawn. A factsheet URL that
 *     answers with a different index — or with NSE's HTML shell, which is what
 *     a wrong filename returns, at HTTP 200 — is refused.
 *   · THE TABLE BY ITS HEADER, never by position: the row whose items read
 *     "Sector" and "Weight(%)" fixes the column, and every row below it whose
 *     left-column text carries one figure in that column is a sector, until the
 *     page's own footnote ("## Based on …").
 *   · THE WEIGHTS MUST TIE: they are the whole index, so they sum to 100 within
 *     the printed rounding (±0.1). A table that does not tie is a misread and
 *     the run fails rather than writing it.
 *
 * Labels are kept EXACTLY as printed — NSE's own sector names. Turning them into
 * the book's GICS sectors is `src/lib/indexSectors.ts`, through the same
 * `shared/sectors.mjs` map every statement's sector goes through, so the index
 * and the family's holdings are placed by one definition.
 *
 * ── THE BSE INDICES ARE NOT HERE, AND WHY ───────────────────────────────────
 *
 * Measured on 21 Oct 2026: BSE Index Services' public API (`bseindices.com`,
 * `Codewise_Indices`) lists each Sensex and BSE 500 constituent with its sector
 * but no weight, and its factsheet is not published as a file a run can read.
 * The sector tables that do circulate for those indices are third-party ones
 * weighted by full market capitalisation — not the free-float weights the
 * index itself uses. Neither is the index's own figure, so neither is used;
 * `indexSectors.ts` names the gap on the page.
 *
 * Output: `src/data/indexSectors.json` (generated, never hand-edited) and
 * `docs/INDEX-SECTORS.md`. Re-run monthly with `npm run build-index-sectors`;
 * `FACTSHEET_DIR=<dir>` reads saved copies (`<file>.pdf`) instead of fetching.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractLayout } from "./ingest/lib/layout.mjs";
import { resolveSector } from "../shared/sectors.mjs";

const OUT = new URL("../src/data/indexSectors.json", import.meta.url);
const DOC = new URL("../docs/INDEX-SECTORS.md", import.meta.url);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const BASE = "https://www.niftyindices.com/Factsheet/";

/**
 * Keyed on `BenchmarkKey` (`src/lib/benchmarks.ts`), so the index a reader picks
 * on the NAV chart and on Sector Composition is one key. The filenames are NSE's
 * own — they are irregular (`ind_next50`, `ind_Nifty_Midcap_150`), each one
 * taken from the factsheet link on that index's niftyindices.com page.
 */
const INDICES = [
  { key: "nifty-500", name: "Nifty 500", file: "ind_nifty_500", expect: /\bNifty 500 index\b/i },
  { key: "nifty-50", name: "Nifty 50", file: "ind_nifty50", expect: /\bNifty 50 index\b/i },
  { key: "nifty-next-50", name: "Nifty Next 50", file: "ind_next50", expect: /\bNifty Next 50 Index\b/i },
  { key: "nifty-midcap-150", name: "Nifty Midcap 150", file: "ind_Nifty_Midcap_150", expect: /\bNifty Midcap 150 represents\b/i },
  { key: "nifty-smallcap-250", name: "Nifty Smallcap 250", file: "ind_Nifty_Smallcap_250", expect: /\bNifty Smallcap 250 represents\b/i },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const isoDate = (s) => {
  const m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(s.trim());
  const mi = m ? MONTHS.indexOf(m[1]) : -1;
  return mi < 0 ? null : `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};

async function bytesOf(ix) {
  if (process.env.FACTSHEET_DIR) return new Uint8Array(readFileSync(path.join(process.env.FACTSHEET_DIR, `${ix.file}.pdf`)));
  const res = await fetch(`${BASE}${ix.file}.pdf`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${ix.name}: HTTP ${res.status} for ${ix.file}.pdf`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // A filename NSE does not serve answers 200 with its HTML site shell.
  if (String.fromCharCode(...buf.slice(0, 5)) !== "%PDF-") {
    throw new Error(`${ix.name}: ${ix.file}.pdf answered with ${res.headers.get("content-type") ?? "no content type"}, not a PDF`);
  }
  return buf;
}

/**
 * Page one's items as `{ x, right, text }`, row by row in reading order. Some
 * factsheets draw every string twice at the same spot (the Nifty 50's does), so
 * an item repeated at one position is one item, not a second figure.
 */
function rowsOf(page) {
  return page.rows.map((r) => {
    const seen = new Set();
    return r.items
      .map((it) => ({ x: it.x, right: it.x + (it.width ?? 0), text: String(it.text ?? "").trim() }))
      .filter((it) => {
        const k = `${Math.round(it.x)}|${it.text}`;
        if (!it.text || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.x - b.x);
  });
}

function readFactsheet(ix, page) {
  const rows = rowsOf(page);
  const lineText = rows.map((r) => r.map((i) => i.text).join(" "));
  const all = lineText.join("\n");
  if (!ix.expect.test(all.replace(/\s+/g, " "))) {
    throw new Error(`${ix.name}: the factsheet does not name the index (${ix.expect}) — refusing a sheet for another index`);
  }
  const dateLine = lineText.find((l) => isoDate(l)) ?? null;
  const asOf = dateLine ? isoDate(dateLine) : null;
  if (!asOf) throw new Error(`${ix.name}: no "Month DD, YYYY" date line on page one`);
  const constituents = Number(/No\. of Constituents\s+(\d+)/.exec(all)?.[1] ?? NaN);
  const methodology = /Methodology\s+(Free Float Market Capitali[sz]ation)/i.exec(all)?.[1] ?? null;

  // THE HEADER ROW: an item reading "Sector" and, right of it, "Weight(%)".
  const hi = rows.findIndex((r) => r.some((i) => i.text === "Sector") && r.some((i) => /^Weight\s*\(%\)$/.test(i.text)));
  if (hi < 0) throw new Error(`${ix.name}: no "Sector / Weight(%)" header on page one`);
  const wHead = rows[hi].find((i) => /^Weight\s*\(%\)$/.test(i.text));
  // The weight column's right edge, with a little room for a figure set wider
  // than its heading. Anything further right is the page's other column.
  const colRight = wHead.right + 12;
  const sectors = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const left = rows[r].filter((i) => i.x < colRight);
    if (!left.length) continue;
    const text = left.map((i) => i.text).join(" ");
    if (/^#/.test(text) || /^Disclaimer/i.test(text)) break;
    const num = left.filter((i) => /^\d+\.\d+$/.test(i.text) && i.right > wHead.x - 4);
    const label = left.filter((i) => !num.includes(i) && i.right < wHead.x).map((i) => i.text).join(" ").replace(/\s+/g, " ").trim();
    if (num.length !== 1 || !label) {
      // A left-column line that is neither a sector row nor the footnote ends
      // the table only once it has begun; before that it is the header's own wrap.
      if (sectors.length) break;
      continue;
    }
    sectors.push({ label, weight: Number(num[0].text) });
  }
  const total = sectors.reduce((a, s) => a + s.weight, 0);
  if (!sectors.length || Math.abs(total - 100) > 0.1) {
    throw new Error(`${ix.name}: the sector weights read sum to ${total.toFixed(2)}, not 100 — a misread table is not written`);
  }
  return { asOf, constituents: Number.isFinite(constituents) ? constituents : null, methodology, sectors, total };
}

const out = { generatedBy: "scripts/build-index-sectors.mjs — never hand-edit; re-run with npm run build-index-sectors", indices: {} };
const doc = [
  "# Index sector weights",
  "",
  "Generated by `npm run build-index-sectors` from each index's own NSE Indices Limited factsheet",
  "(the \"Sector Representation\" table on page one). Never hand-edited. Each label is as the factsheet",
  "prints it; the GICS column is where `shared/sectors.mjs` — the map every statement's sector goes",
  "through — places it, and is what Sector Composition compares the family's book against.",
  "",
  "Sensex and BSE 500 are not read: BSE Index Services publishes their constituents' sectors but no",
  "sector weights a run can read, and no third-party figure is substituted.",
  "",
];
for (const ix of INDICES) {
  const layout = await extractLayout(await bytesOf(ix));
  if (layout.error || !layout.pages?.[0]) throw new Error(`${ix.name}: ${layout.error ?? "no page one"}`);
  const r = readFactsheet(ix, layout.pages[0]);
  out.indices[ix.key] = {
    name: ix.name,
    publisher: "NSE Indices Limited",
    url: `${BASE}${ix.file}.pdf`,
    asOf: r.asOf,
    constituents: r.constituents,
    methodology: r.methodology,
    sectors: r.sectors,
  };
  doc.push(`## ${ix.name} — ${r.asOf}`, "",
    `${r.constituents ?? "—"} constituents · ${r.methodology ?? "methodology not printed"} · [factsheet](${BASE}${ix.file}.pdf) · weights sum to ${r.total.toFixed(2)}`, "",
    "| Factsheet sector | Weight (%) | GICS sector |", "| --- | ---: | --- |",
    ...r.sectors.map((s) => {
      const g = resolveSector(s.label);
      return `| ${s.label} | ${s.weight.toFixed(2)} | ${g.matchedBy === null ? "**Unclassified** — no single GICS sector" : g.sector}${g.matchedBy === "prefix" ? " (prefix)" : ""} |`;
    }), "");
  console.log(`${ix.name.padEnd(20)} ${r.asOf}  ${String(r.sectors.length).padStart(2)} sectors  Σ ${r.total.toFixed(2)}  ${r.constituents ?? "?"} constituents`);
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
writeFileSync(DOC, doc.join("\n"));
console.log(`wrote ${path.relative(process.cwd(), OUT.pathname.replace(/^\/([A-Za-z]:)/, "$1"))} and docs/INDEX-SECTORS.md`);
