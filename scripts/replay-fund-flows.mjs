#!/usr/bin/env node
/**
 * REPLAY THE FUND-STATEMENT READER'S DATED RECORD OVER THE COMMITTED ARCHIVE.
 *
 * `npm run replay:flows` · `npm run replay:flows -- --check`
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The sixth of its kind, after `rekey:archive`, `build-lookthrough --reindex`,
 * `replay:calls`, `replay:movements` and `replay:owners`, and governed by the
 * same three rules. `npm run extract` needs `GLOW_PDF_PASSWORDS` for eight
 * encrypted statements and `pdftoppm`/`tesseract` for two outlined-text ones,
 * and `guardAgainstShrinkingTheArchive` correctly refuses a run without them —
 * so a reader change would otherwise be unlandable on most machines.
 *
 * It lands `buoyantFlows`: Buoyant's account statement prints every Cash
 * Deposit since inception, every allotment and redemption per class, and the
 * Class A1 → A4 switch that restarted the fund's printed cost at the switch-day
 * NAV — and the reader took only the summary row above them. The text it parses
 * is `public/audit/<doc>/pages.json`, rebuilt here EXACTLY as `extract()` builds
 * it, and the REAL `extract()` is what runs over it — so this is a faithful
 * partial replay of extraction, not a second implementation. The next full
 * `npm run extract` calls the same function on the same text and writes the
 * same bytes.
 *
 *   1. IT ONLY EVER ADDS — A DATED RECORD WHERE NONE WAS ARCHIVED, or a
 *      FIELD to one that was. `cashFlows` was `[]` on every document the first
 *      pass landed on; a document that already carries one may only gain a
 *      value where the archive held null — the same rows, in the same order,
 *      every value already archived coming back unchanged (Stage 10cz: the
 *      Stamp Duty line Helios and Active Momentum print, now carried as
 *      `expenses`). A row that would CHANGE a value, or a count that moves, is
 *      a different change, made by a different reader, and refuses.
 *      Beside it, exactly what `writeArchive` would write for a document with a
 *      dated table: the browsable `transactions.json` section, and that
 *      section's entry in the manifest.
 *   2. ITS GATE IS STRUCK ON THE ARCHIVE. The replayed holdings must reproduce
 *      the ones already stored — security, quantity, printed cost and NAV,
 *      holding for holding. If they do not, this reader is not seeing what the
 *      extractor saw, nothing is written and the run exits non-zero.
 *   3. `--check` WRITES NOTHING and is the control run. Against the committed
 *      archive it must be a no-op, which is what says the files on disk are what
 *      the extractor would write.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public/audit");
const CHECK = process.argv.includes("--check");

const alt = await import(path.join(ROOT, "scripts/ingest/providers/altFundStatements.mjs"));

const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** `writeArchive`'s own formatting — one space, a trailing newline. */
const write = (file, v) => fs.writeFileSync(file, JSON.stringify(v, null, 1) + "\n");

/** `extract()`'s grid, rebuilt from the committed pages — the reader joins them itself. */
function pagesOf(docKey) {
  const p = path.join(AUDIT, docKey, "pages.json");
  if (!fs.existsSync(p)) return null;
  return (JSON.parse(fs.readFileSync(p, "utf8")).pages ?? []).map((x) => ({ text: x.text ?? "" }));
}

/** The fields rule 2 holds a replayed holding to — the primitives this reader reads. */
const identity = (h) => [h.securityKey, h.quantity, h.totalCost, h.marketPrice];

const manifestFile = path.join(AUDIT, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const funds = new Set(alt.PROVIDER);
let checked = 0, changed = 0, refused = 0, manifestChanged = false;

for (const entry of manifest) {
  if (!funds.has(entry.provider) || entry.reportType !== "holdings") continue;
  const file = path.join(AUDIT, entry.docKey, "document.json");
  if (!fs.existsSync(file)) continue;
  const pages = pagesOf(entry.docKey);
  if (!pages) continue;
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));

  let out;
  try { out = alt.extract({ grid: { pages } }); } catch (e) {
    console.error(`REFUSED ${entry.docKey}: the reader threw — ${e?.message ?? e}`);
    refused += 1;
    continue;
  }
  if (!out) continue;
  checked += 1;
  const flows = out.cashFlows ?? [];
  if (eq(flows, doc.cashFlows ?? [])) continue;

  // RULE 2 — the gate. The same holdings, in the same order, on the same
  // primitives.
  const was = doc.holdings ?? [];
  const same = out.holdings.length === was.length
    && out.holdings.every((h, i) => eq(identity(h), identity(was[i])));
  if (!same) {
    console.error(`REFUSED ${entry.docKey}: the replayed holdings do not reproduce the ${was.length} already on disk`);
    refused += 1;
    continue;
  }
  // RULE 1 — this adds a record where none was archived, or a field to one
  // that was, and rewrites nothing that was already there.
  const archived = doc.cashFlows ?? [];
  let added = [];
  if (archived.length) {
    const addsOnly = archived.length === flows.length && archived.every((a, i) =>
      [...new Set([...Object.keys(a), ...Object.keys(flows[i])])].every((k) => eq(a[k], flows[i][k]) || a[k] == null));
    if (!addsOnly) {
      console.error(`REFUSED ${entry.docKey}: ${archived.length} dated row(s) are already archived and the replay would `
        + "change a value on them or their count; this replay only adds a record, or a field where the archive held none");
      refused += 1;
      continue;
    }
    added = [...new Set(archived.flatMap((a, i) => Object.keys(flows[i]).filter((k) => a[k] == null && flows[i][k] != null)))];
  }

  changed += 1;
  const kinds = flows.reduce((m, c) => ({ ...m, [c.kind]: (m[c.kind] ?? 0) + 1 }), {});
  console.log(archived.length
    ? `${CHECK ? "would update" : "updated"} ${entry.docKey.padEnd(52)} ${archived.length} dated row(s) gain ${added.join(", ")}`
    : `${CHECK ? "would update" : "updated"} ${entry.docKey.padEnd(52)} dated rows 0 → ${flows.length} `
      + `(${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ")})`);
  if (CHECK) continue;

  write(file, { ...doc, cashFlows: flows });
  // Exactly what `writeArchive` writes for a dated table: the section file, and
  // its sheet listed AHEAD of the raw pages, which is the order that function
  // emits them in.
  const section = out.sections?.transactions;
  if (section) {
    write(path.join(AUDIT, entry.docKey, "transactions.json"), section);
    const sheet = {
      key: "transactions",
      name: section.name ?? "transactions",
      rows: section.rows?.length ?? 0,
      cols: section.rows?.reduce((m, r) => Math.max(m, r.length), 0) ?? 0,
    };
    entry.sheets = [sheet, ...(entry.sheets ?? []).filter((s) => s.key !== "transactions")];
    entry.sections = entry.sheets.map((s) => s.key);
    manifestChanged = true;
  }
}

if (manifestChanged && !CHECK) write(manifestFile, manifest);

console.log(`\n${checked} fund statement(s) replayed · ${changed} ${CHECK ? "would change" : "changed"} · ${refused} refused`);
if (refused) process.exit(1);
if (CHECK && changed) process.exit(2);
