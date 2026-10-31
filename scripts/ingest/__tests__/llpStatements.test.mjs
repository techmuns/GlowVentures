// The two LLP holding statements of 29 Oct 2026: the printed layout's reader, and
// the family's note laid over it at the book's seam (`applyFamilyAdvice`).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractLayout } from "../lib/layout.mjs";
import { extract } from "../providers/hdfcNsdl.mjs";
import { applyFamilyAdvice, FAMILY_ADVISED_INVESTMENTS } from "../reference/familyAdvisedInvestments.mjs";
import { resolveOwner } from "../../../shared/owners.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = async (name) => extract({
  grid: await extractLayout(new Uint8Array(fs.readFileSync(path.join(ROOT, "source/october-2026-f", name)))),
  meta: { docKey: name, source: name },
});

const cases = [
  ["Glowterra.pdf", "67776432", "GLOWTERRA LLP", [13521127, 14112676]],
  ["LLP.pdf", "67776424", "GLOWSPHERE LLP", [4507042, 4704225]],
];
for (const [file, accountNo, holder, units] of cases) {
  const doc = await read(file);
  assert.equal(doc.status, "ok", `${file}: ${JSON.stringify(doc.warnings)}`);
  assert.equal(doc.accountNo, accountNo);
  assert.equal(doc.owner, holder);
  assert.equal(doc.asOf, "2026-10-29");
  assert.deepEqual(doc.holdings.map((h) => h.quantity), units);
  assert.deepEqual(doc.holdings.map((h) => h.isin), ["INE0TBU01016", "INE0TBU03020"]);
  assert.match(doc.holdings[1].security, /PREF 24SP46$/);
  // ₹10 is a face value: the statement alone gives units and no value.
  for (const h of doc.holdings) {
    assert.equal(h.printed.marketValue, null);
    assert.equal(h.faceValue, 10);
  }
  // Each is its own entity, and neither resolves to a partner.
  assert.equal(resolveOwner(holder).owner?.kind, "firm");
  assert.equal(resolveOwner(holder).owner?.partners?.length, 2);

  const advice = FAMILY_ADVISED_INVESTMENTS[Number(accountNo)];
  const { doc: advised, notes } = applyFamilyAdvice({
    ...doc, docKey: file, status: "ok",
    holdings: doc.holdings.map((h) => ({ ...h, marketValue: null })), cashFlows: [],
  });
  const paid = advice.lines.reduce((t, l) => t + l.amount, 0);
  assert.equal(advised.holdings.reduce((t, h) => t + h.marketValue, 0), paid);
  assert.ok(advised.holdings.every((h) => h.valuedAtCost && h.totalCost === h.marketValue));
  assert.deepEqual(advised.cashFlows.map((c) => c.date).sort(), ["2026-09-25", "2026-10-01"]);
  // The equity line's amount is not its units × 17.75, and it says so.
  assert.equal(notes.length, 1);
  assert.match(notes[0], /below its own/);
  assert.match(advised.holdings[0].advisedNote, /does not say why/);

  // A note whose units disagree with the statement is refused: a quantity stays a quantity.
  const refused = applyFamilyAdvice({
    ...doc, docKey: file, status: "ok",
    holdings: doc.holdings.map((h) => ({ ...h, quantity: h.quantity + 1, marketValue: null })), cashFlows: [],
  });
  assert.ok(refused.doc.holdings.every((h) => h.marketValue === null && !h.valuedAtCost));
  assert.equal(refused.doc.cashFlows.length, 0);
}

// Every other document passes through untouched.
const other = { accountNo: "67786137", holdings: [{}] };
assert.equal(applyFamilyAdvice(other).doc, other);
console.log("llp statements: ok");
