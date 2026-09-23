#!/usr/bin/env node
/**
 * REPLAY THE FUND UNIT-FLOW READERS OVER THE COMMITTED ARCHIVE.
 *
 * `npm run replay:flows` · `npm run replay:flows -- --check`
 *
 * ── WHAT THIS LANDS, AND WHY FIFO NEEDS IT ─────────────────────────────────
 *
 * FIFO matches every unit sold against the earliest unit bought, so it needs
 * the DATED UNIT RECORD of a holding — which units came in on which date for
 * how much, and which went out. Two fund statements printed that table and
 * nothing read it:
 *
 *   BUOYANT  — each folio's account statement prints its Cash Deposits, every
 *              Units Allotment with its units, a class switch (A1 → A4) booked
 *              as a "Unit Redemption" and a fresh allotment, and a reinvested
 *              gain distribution. Unread, the book took the statement's own Cost
 *              column, which RESTAMPS the switched units at the switch NAV —
 *              so the family's A1 contributions vanished from the cost and the
 *              holding's return read about half what the fund's own fact sheet
 *              says.
 *   NEO INFRA — the capital account prints every drawdown with its units and a
 *              Capital Redemption of 14,162.8 units. Unread, ₹14.16 L that came
 *              back to the family stayed in the cost of what is still held.
 *
 * ── WHY THIS IS A REPLAY, NOT A REPAIR LAYER ────────────────────────────────
 *
 * `npm run extract` needs `GLOW_PDF_PASSWORDS` and would refuse to shrink the
 * archive without them, so a reader change would be unlandable on most
 * machines. The readers parse `public/audit/<doc>/pages.json` — committed, and
 * rebuilt here EXACTLY as `extract()` joins it — so running the REAL reader
 * over it is a faithful partial replay: the next full extraction calls the same
 * `flowsFrom` on the same text and writes the same bytes. `rekey:archive`,
 * `replay:calls`, `replay:movements` and `replay:owners` are the precedents,
 * and the same three rules govern this one:
 *
 *   1. IT ONLY EVER ADDS. A document that already carries cash flows keeps them
 *      byte-identically; this writes only where the collection is EMPTY, plus
 *      the `transactions` provenance sheet `extract()` would write beside it.
 *   2. ITS GATE IS STRUCK ON THE ARCHIVE. Every document that ALREADY carries
 *      the table (3P's, read since Stage 10am) must replay to exactly what is on
 *      disk. A replay that cannot reproduce the rows already there is not
 *      reading what the extractor read, and nothing it produces is trusted —
 *      the run writes nothing and exits non-zero.
 *   3. `--check` WRITES NOTHING and is the control run: against an unchanged
 *      reader it must be a no-op.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public/audit");
const CHECK = process.argv.includes("--check");

const alt = await import(path.join(ROOT, "scripts/ingest/providers/altFundStatements.mjs"));

const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** `extract()`'s own text, rebuilt from the committed pages — see `replay:calls`. */
function textOf(docKey) {
  const p = path.join(AUDIT, docKey, "pages.json");
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return (j.pages ?? []).map((x) => x.text ?? "").join("\n").replace(/[ \t]+/g, " ");
}

/** The provenance sheet `altFundStatements.extract()` writes beside the flows. */
function sheetOf(cashFlows) {
  return {
    name: "transactions",
    rows: [["date", "class", "description", "kind", "amount", "net", "units", "balanceUnits"],
      ...cashFlows.map((c) => [c.date, c.security ?? "", c.description, c.kind,
        c.amount ?? "", c.netAmount ?? "", c.units ?? "", c.balance ?? ""])],
  };
}

const manifestPath = path.join(AUDIT, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

let replayed = 0, reproduced = 0, refused = 0;
const writes = [];
for (const entry of manifest) {
  const file = path.join(AUDIT, entry.docKey, "document.json");
  if (!fs.existsSync(file)) continue;
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const text = textOf(entry.docKey);
  if (!text) continue;
  const layout = alt.layoutFor(text);
  if (!layout?.flowsFrom) continue;
  // Only the fund statements themselves — a layout matches on its issuer's own
  // wording, and the PMS report set Buoyant also issues is read elsewhere.
  if (doc.reportType !== "holdings") continue;

  const warnings = [];
  const flows = layout.flowsFrom(text, (code, detail) => warnings.push({ code, detail }));
  replayed += 1;

  // RULE 2 — the gate, struck on what is already on disk.
  if ((doc.cashFlows ?? []).length) {
    if (!eq(flows, doc.cashFlows)) {
      console.error(`REFUSED: ${entry.docKey} carries ${doc.cashFlows.length} cash flow(s) the replay does not reproduce (${flows.length} replayed)`);
      refused += 1;
    } else {
      reproduced += 1;
    }
    continue;
  }
  if (!flows.length) continue;

  // RULE 1 — only ever add. The document gains its flows, any warning the
  // reader raised while reading them, and the provenance sheet.
  const next = { ...doc, cashFlows: flows, warnings: [...(doc.warnings ?? []), ...warnings] };
  const sheet = sheetOf(flows);
  const meta = {
    key: "transactions", name: sheet.name, rows: sheet.rows.length,
    cols: sheet.rows.reduce((m, r) => Math.max(m, r.length), 0),
  };
  writes.push({ entry, file, next, sheet, meta });
  const kinds = {};
  for (const f of flows) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
  console.log(`${CHECK ? "would add" : "added"} ${entry.docKey.padEnd(70)} ${flows.length} rows ${JSON.stringify(kinds)}${warnings.length ? ` · ${warnings.length} warning(s)` : ""}`);
}

if (refused) {
  console.error(`\n${refused} document(s) refused — nothing written.`);
  process.exit(1);
}

if (!CHECK) {
  for (const { entry, file, next, sheet, meta } of writes) {
    fs.writeFileSync(file, JSON.stringify(next, null, 1) + "\n");
    fs.writeFileSync(path.join(path.dirname(file), "transactions.json"), JSON.stringify(sheet, null, 1) + "\n");
    // The sheet goes BEFORE the raw page text, which is where `writeArchive`
    // puts every section: sections first, `pages` last.
    const sheets = (entry.sheets ?? []).filter((s) => s.key !== "transactions");
    const at = sheets.findIndex((s) => s.key === "pages");
    sheets.splice(at < 0 ? sheets.length : at, 0, meta);
    entry.sheets = sheets;
    entry.sections = sheets.map((s) => s.key);
    entry.warnings = next.warnings.length;
  }
  if (writes.length) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
}

console.log(`\n${replayed} fund statement(s) replayed · ${reproduced} reproduced what is on disk · `
  + `${writes.length} ${CHECK ? "would gain" : "gained"} a unit-flow table · ${refused} refused`);
if (CHECK && writes.length) process.exit(2);
