#!/usr/bin/env node
/**
 * REPLAY THE MUTUAL-FUND FOLIO READER'S COST OVER THE COMMITTED ARCHIVE.
 *
 * `npm run replay:folio-cost` · `npm run replay:folio-cost -- --check`
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The HDFC and Kotak account statements print `Account Summary as on <date>`
 * with a `Cost (INR)` column, and `mutualFundFolio.mjs` read only the scheme
 * blocks below it — so HDFC 15644806, 15725046, 16002141 and Kotak 7125255
 * reached the book with units and a value and NO COST, and every one of them
 * showed `—` for Invested and Avg cost. The statements are encrypted, and
 * `npm run extract` carries an encrypted statement forward unread without
 * `GLOW_PDF_PASSWORDS`, so the reader change would otherwise be unlandable on
 * most machines. Like `replay:flows`, this runs the REAL `extract()` over
 * `public/audit/<doc>/pages.json` — the text a full run reads — so the next
 * `npm run extract` writes the same bytes.
 *
 * ── THE THREE RULES ─────────────────────────────────────────────────────────
 *
 *   1. IT TOUCHES ONLY WHAT THE READER CHANGE MOVES: a holding's `totalCost`
 *      and the three figures `deriveHolding` strikes from it (`gainLoss`,
 *      `pctGainLoss`, `unrealized`), the document's printed `totals.totalCost`,
 *      and the `invested` column of its holdings section. A cost may only
 *      arrive where the archive held null; one that would CHANGE an archived
 *      cost is a different change and refuses.
 *   2. ITS GATE IS STRUCK ON THE ARCHIVE. The replayed rows must be the rows on
 *      disk — same order, key, ISIN, units, NAV, NAV date and printed value —
 *      with the same warnings and dated rows. If not, this reader is not seeing
 *      what the extractor saw, and nothing is written for that document.
 *   3. `--check` WRITES NOTHING and is the control run: against the reader as
 *      it stood before this change it reproduced every folio byte for byte.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as folio from "./ingest/providers/mutualFundFolio.mjs";
import { deriveDocument } from "./ingest/lib/document.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public/audit");
const CHECK = process.argv.includes("--check");

const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** `writeArchive`'s own formatting — one space, a trailing newline. */
const write = (file, v) => fs.writeFileSync(file, JSON.stringify(v, null, 1) + "\n");

/** The holding fields the cost moves — nothing else is written. */
const MOVED = ["totalCost", "gainLoss", "pctGainLoss", "unrealized"];
/** Warnings `extract.mjs` writes around a reader — opening the PDF, resolving the owner — never the reader itself. */
const EXTRACT_CODES = new Set(["pdf-encrypted", "owner-unresolved", "owner-from-account-number", "from-bundle",
  "account-no-from-client-code", "account-no-from-sole-account", "provider-from-sibling", "security-name-from-isin"]);
/** What rule 2 holds a replayed row to. */
const identity = (h) => [h.securityKey, h.isin, h.quantity, h.marketPrice, h.priceAsOn, h.printed?.marketValue];

/** Every provider name extract.mjs's `EXTRACTORS` routes to this reader. */
const FOLIO_PROVIDERS = new Set(["Aditya Birla Sun Life Mutual Fund", "Kotak Mahindra Mutual Fund",
  "Mirae Asset Mutual Fund", "HDFC Mutual Fund", "ICICI Prudential Mutual Fund", folio.PROVIDER]);

const manifest = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));
let checked = 0, changed = 0, refused = 0, costed = 0;
const refuse = (docKey, why) => { console.error(`REFUSED ${docKey}: ${why}`); refused += 1; };

for (const entry of manifest) {
  if (entry.reportType !== "holdings") continue;
  const dir = path.join(AUDIT, entry.docKey);
  const file = path.join(dir, "document.json");
  const pagesFile = path.join(dir, "pages.json");
  if (!fs.existsSync(file) || !fs.existsSync(pagesFile)) continue;
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!FOLIO_PROVIDERS.has(doc.provider) && !FOLIO_PROVIDERS.has(entry.provider)) continue;
  // Only the scheme-block layout prints its cost in an account summary; the
  // others already read theirs.
  const pages = (JSON.parse(fs.readFileSync(pagesFile, "utf8")).pages ?? []).map((p) => ({ text: p.text ?? "" }));
  if (!pages.some((p) => /Market Value of Balance Units at NAV of/i.test(p.text))) continue;

  let out;
  try { out = folio.extract({ grid: { pages }, meta: { docKey: entry.docKey, reportType: doc.reportType, provider: doc.provider } }); } catch (e) {
    refuse(entry.docKey, `the reader threw — ${e?.message ?? e}`);
    continue;
  }
  checked += 1;
  const was = doc.holdings ?? [];
  const derived = deriveDocument({ ...doc, holdings: out.holdings }).holdings;

  // RULE 2 — the same rows, the same warnings, the same dated record.
  if (derived.length !== was.length || !derived.every((h, i) => eq(identity(h), identity(was[i])))) {
    refuse(entry.docKey, `the replayed rows do not reproduce the ${was.length} already on disk`);
    continue;
  }
  // The opener's and extract.mjs's own notes are not the reader's to reproduce.
  const readerWarnings = (doc.warnings ?? []).filter((w) => !EXTRACT_CODES.has(w.code));
  if (!eq(out.warnings, readerWarnings) || !eq(out.cashFlows ?? [], doc.cashFlows ?? [])) {
    refuse(entry.docKey, "the reader's warnings or dated rows differ from the archive's — a different change from the one this replay lands");
    continue;
  }
  // RULE 1 — a cost only where the archive held none.
  const overwrites = derived.filter((h, i) => was[i].totalCost != null && !eq(h.totalCost, was[i].totalCost));
  if (overwrites.length) {
    refuse(entry.docKey, `it would change an archived cost on ${overwrites.map((h) => h.security).join(", ")}`);
    continue;
  }

  const holdings = was.map((w, i) => {
    const next = { ...w };
    for (const k of MOVED) next[k] = derived[i][k];
    return next;
  });
  const next = { ...doc, holdings, totals: { ...doc.totals, totalCost: out.totals.totalCost } };
  costed += holdings.filter((h) => h.quantity > 0 && h.totalCost != null).length;
  if (eq(next, doc)) continue;

  changed += 1;
  const gained = holdings.filter((h, i) => h.totalCost != null && was[i].totalCost == null);
  console.log(`${CHECK ? "would update" : "updated"} ${entry.docKey.padEnd(52)} cost read on ${gained.map((h) => `${h.security} (${h.totalCost})`).join(", ")}`);
  if (CHECK) continue;
  write(file, next);
  const section = out.sections?.holdings;
  if (section) write(path.join(dir, "holdings.json"), section);
}

console.log(`\n${checked} folio statement(s) with scheme blocks replayed · ${changed} ${CHECK ? "would change" : "changed"} · ${refused} refused`);
console.log(`${costed} held scheme(s) on them carry the cost their statement prints`);
if (refused) process.exit(1);
if (CHECK && changed) process.exit(2);
