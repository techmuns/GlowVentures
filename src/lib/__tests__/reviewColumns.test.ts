// Independent SheetJS reads verify the metadata against the workbook, including displayed date precision.
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { REVIEW_COLUMN_DATA as data } from "@/data/reviewColumns";
import { BOOK_POSITIONS } from "@/data/glowData";
import { reviewField, REVIEW_COLUMNS, withReviewAccessors } from "@/lib/reviewColumns";
import { sortRows } from "@/lib/tableView";
const wb = XLSX.readFile(data.workbook, { cellNF: true });
const sheet = (name: string) => wb.Sheets[wb.SheetNames.find((n) => n.trim() === name)!];
const monetary = new Set(["income", "reviewCost", "reviewValue", "fundAum", "monthlyOpening", "monthlyPurchase", "monthlySale", "monthlyClosing", "activeGain", "entityTotal", "entityPrivateCost", "entityPeFunds", "entityUnlisted", "entityDebt", "entityCash", "entityAlternate", "monthlyIncome", "monthlyGain", "liquidityAssigned", "adjustedValue"]);
let checked = 0;
for (const records of [data.bySource, data.byProduct, data.byEntity, data.byCategory, data.byBasket, data.bySector]) {
  for (const record of Object.values(records)) for (const [id, field] of Object.entries(record)) {
    if (typeof field.value !== "number") continue;
    const [tab, address] = field.source.split("!");
    const raw = sheet(tab)[address]?.v;
    assert.equal(typeof raw, "number", field.source);
    const scale = id === "reviewCommitment" ? 1e5 : monetary.has(id) ? 1e7 : tab === "Equity Quants" && id !== "schemes" ? 0.01 : 1;
    assert.ok(Math.abs(field.value - Number(raw) * scale) < 0.001, `${id}: ${field.source} changed amount or unit`);
    checked++;
  }
}
const pi = sheet("Private Investments");
for (let row = 4; row <= 90; row++) {
  const field = data.bySource[`Private Investments:${row}`].investmentRange;
  const cell = pi[`C${row}`];
  assert.ok(field.value, `Missing date C${row}`);
  if (typeof cell.v !== "number") continue;
  const iso = new Date(Date.UTC(1899, 11, 30) + cell.v * 864e5).toISOString().slice(0, 10);
  const fmt = String(cell.z).replace(/\\./g, "").replace(/\[[^\]]*\]/g, "");
  assert.equal(field.precision, /d/i.test(fmt) ? "day" : "month", `C${row} acquired day precision`);
  assert.equal(field.from, /d/i.test(fmt) ? iso : iso.slice(0, 7));
}
assert.equal(data.bySource["Private Investments:66"].investmentRange.value, "20 Aug 2025");
assert.equal(data.bySource["Private Investments:14"].investmentRange.value, "Mar 2024");
assert.equal(data.bySource["Debt:9"].reviewCommitment.value, 50_000_000);
assert.equal(data.byProduct["sanshi fund 1"].monthlyReturn.value, null);
assert.match(data.byProduct["sanshi fund 1"].monthlyReturn.note!, /previous.month valuation/);
assert.equal(data.byCategory.equity.totalGain.value, null, "An unspecified money unit must stay unresolved");
assert.equal(data.byProduct["motilal oswal founders fund ii"].managementFee.value, "1.05%");
assert.equal(data.byProduct["neo infra income opportunities fund share class a5"].reviewValue.note!.includes("31 March 2026"), true);
assert.equal(new Set(REVIEW_COLUMNS.map((c) => c.id)).size, REVIEW_COLUMNS.length);
const reviewPositions = BOOK_POSITIONS.filter((p) => p.reviewSource?.sheet.trim() === "Private Investments");
for (const p of reviewPositions) {
  const expected = data.bySource[`Private Investments:${p.reviewSource!.row}`].investmentRange;
  assert.deepEqual(reviewField({ positions: [p] }, "investmentRange"), expected, p.security);
}
assert.ok(reviewPositions.length > 50);
assert.equal(reviewField({ securityKey: "ema-partners-india-limited" }, "investmentRange").value, null, "Preference shares must not be joined to listed equity");
assert.equal(reviewField({ positions: reviewPositions.slice(0, 2) }, "investmentRange").value, null, "Different investment records must not be pooled");
assert.equal(reviewField({ positions: [reviewPositions[0], { ...reviewPositions[0], securityKey: "unmatched", reviewSource: undefined }] }, "investmentRange").value, null);
const accessors = withReviewAccessors({}, (p: typeof BOOK_POSITIONS[number]) => ({ positions: [p] }));
const sorted = sortRows(reviewPositions, { col: "review:investmentRange", dir: "asc" }, accessors);
const dates = sorted.map((p) => String(reviewField({ positions: [p] }, "investmentRange").sortValue));
assert.deepEqual(dates, [...dates].sort());
assert.equal(reviewField({ positions: [reviewPositions[0]], familySubset: true }, "investmentRange").value, null);
assert.equal(reviewField({ category: "Equity", familySubset: true }, "reviewValue").value, null);
assert.match(reviewField({ category: "Equity", familySubset: true }, "reviewValue").note!, /whole family/);
const feeScope = { product: "Motilal Oswal Founders Fund II", familySubset: true };
assert.equal(reviewField(feeScope, "managementFee").value, "1.05%", "Instrument metadata remains applicable to a selected member");
const scopedAccessors = withReviewAccessors({}, (p: typeof BOOK_POSITIONS[number]) => ({ positions: [p] }), true);
assert.ok(reviewPositions.every((p) => scopedAccessors["review:investmentRange"](p) === null), "Member-scoped sorting must use the same absent values as cells");
console.log(`ok ${checked} independent source amount/unit checks; all 87 private dates and ${reviewPositions.length} book joins; precision, sparse/ambiguous matches, valuation notes and sorting`);
