import { readFileSync, writeFileSync } from "node:fs";
import { readSpreadsheet, readXlsxFormats } from "./ingest/lib/sheet.mjs";
import { readDates, num, REVIEW_WORKBOOK } from "./lib/reviewPrivateRead.mjs";
import { securityKeyOf } from "../shared/securityKey.mjs";
import { REVIEW_PRIVATE_JOIN } from "../shared/reviewPrivateJoin.mjs";

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
const text = (s) => /^(?:|--?|na|n\/a|#n\/a|x)$/i.test(String(s ?? "").trim()) ? null : String(s).trim();
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (s) => `${MON[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
const colName = (c) => { let s = ""; for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
export function reviewDate(raw, format = "General") {
  const d = readDates(raw);
  if (!d.from || !d.to) return null;
  // A month format stores a day internally. That day is not precision the source displays.
  const fmt = format.replace(/\\./g, "").replace(/\[[^\]]*\]|"[^"]*"/g, "");
  if (d.precision === "day" && /m/i.test(fmt) && !/d/i.test(fmt)) { d.from = d.from.slice(0, 7); d.to = d.to.slice(0, 7); d.precision = "month"; }
  const display = d.precision === "day" ? `${Number(d.from.slice(8))} ${month(d.from)}` : d.from === d.to ? month(d.from) : `${month(d.from)} – ${month(d.to)}`;
  return { value: display, sortValue: d.from, precision: d.precision, from: d.from, to: d.to };
}

const bytes = readFileSync(REVIEW_WORKBOOK);
const wb = readSpreadsheet(bytes);
if (wb.error) throw new Error(wb.error);
const formats = readXlsxFormats(bytes);
const sheets = new Map(wb.sheets.map((s) => [s.name.trim(), s]));
const data = { asOf: "2026-06-30", workbook: REVIEW_WORKBOOK, bySource: {}, byProduct: {}, bySecurity: {}, byEntity: {}, byCategory: {}, byBasket: {}, bySector: {} };
const cell = (sheet, row, col, value, note, extra) => ({ value, source: `${sheet}!${colName(col)}${row + 1}`, ...(note ? { note } : {}), ...extra });
const put = (target, id, sheet, row, col, value, note, extra) => { target[id] = cell(sheet, row, col, value, note, extra); };
const headers = (s, marker, at = 0) => {
  const row = s.rows.findIndex((r, i) => i >= at && r.some((v) => norm(v) === marker));
  if (row < 0) throw new Error(`${s.name}: no ${marker} header`);
  return { row, cols: Object.fromEntries(s.rows[row].map((v, i) => [norm(v), i])) };
};
const number = (raw, scale = 1) => { const value = num(raw); return value === null ? null : Math.round(value * scale * 1e8) / 1e8; };
const merge = (a, b) => {
  for (const [id, field] of Object.entries(b)) {
    if (field.value !== null && (a[id]?.value === null || !a[id])) a[id] = field;
  }
  return a;
};
const PRODUCT_COLUMNS = {
  investmentRange: /^(?:investment date range|date investment range)$/,
  advisor: /^advisor$/, investors: /^investor$/, benchmark: /^benchmark$/,
  allocation: /^allocation %$/, schemeAbsolute: /^scheme absolute %$/, benchmarkAbsolute: /^index absolute %$/,
  schemeXirr: /^scheme xirr %$/, benchmarkXirr: /^index xirr %$/, income: /^dividend interest$/,
  remarks: /^remarks$/, reviewCost: /^investment at cost(?: in crores)?$/, reviewValue: /^market value(?: in crores)?$/,
};
for (const name of ["Private Investments", "Equity", "Debt", "Cash", "Alternate", "Stable Growth", "Entrepreneruial Growth", "Thematic,Tactical", "Liquid", "Private Equity Excl Pre IPO", "Pre IPO"]) {
  const s = sheets.get(name), h = headers(s, "product");
  const productCol = h.cols.product;
  for (let row = h.row + 1; row < s.rows.length; row++) {
    const r = s.rows[row], product = text(r[productCol]);
    if (/^total$|^debt investment plan$/i.test(product ?? "")) break;
    if (!product || /^note:|^\*|^private equity$/i.test(product)) continue;
    const fields = {};
    for (const [id, re] of Object.entries(PRODUCT_COLUMNS)) {
      const col = Object.entries(h.cols).find(([label]) => re.test(label))?.[1];
      if (col === undefined) continue;
      const raw = r[col];
      if (id === "investmentRange") {
        const date = reviewDate(raw, formats[name]?.[`${colName(col)}${row + 1}`]);
        put(fields, id, name, row, col, date?.value ?? null, "The investment date/range recorded for this family investment in the June review. It is not an account funding date or a valuation date.", date ?? {});
      } else {
        const amount = ["income", "reviewCost", "reviewValue"].includes(id);
        const numeric = amount || ["allocation", "schemeAbsolute", "benchmarkAbsolute", "schemeXirr", "benchmarkXirr"].includes(id);
        put(fields, id, name, row, col, numeric ? number(raw, amount ? 1e7 : 1) : text(raw));
      }
    }
    if (name === "Debt" && h.cols["commitment amount"] !== undefined) {
      const col = h.cols["commitment amount"];
      // The worksheet formula divides INR by 10^5: this one column is lakhs, not crores.
      put(fields, "reviewCommitment", name, row, col, number(r[col], 1e5), "Commitment amount is recorded in lakhs in this column, unlike the adjacent cost/value columns in crores.");
    }
    if (name === "Pre IPO") put(fields, "status", name, row, productCol, `Pre IPO${fields.remarks?.value ? ` · ${fields.remarks.value}` : ""}`);
    if (name === "Private Investments") put(fields, "status", name, row, productCol,
      /written off/i.test(fields.remarks?.value ?? "") ? "Written off" : Number(r[h.cols["investment at cost"]]) === 0 ? "See listed holding" : "Held at cost");
    if (["Private Equity Excl Pre IPO", "Pre IPO"].includes(name) && fields.remarks?.value !== null && fields.remarks?.value !== undefined) {
      const existing = data.byProduct[norm(product)];
      if (existing?.remarks?.value && existing.remarks.value !== fields.remarks.value) {
        fields.remarks.value = `${existing.remarks.value}; ${fields.remarks.value}`;
        fields.remarks.source = `${existing.remarks.source}; ${fields.remarks.source}`;
      }
      if (existing) existing.remarks = fields.remarks;
    }
    data.bySource[`${name}:${row + 1}`] = fields;
    merge(data.byProduct[norm(product)] ??= {}, fields);
    if (name === "Pre IPO") data.byProduct[norm(product)].status = fields.status;
    // Private records have a row identity. Supplementary remarks/status stay attached to that identity.
    if (["Private Equity Excl Pre IPO", "Pre IPO"].includes(name)) {
      const pi = sheets.get("Private Investments");
      for (let i = 3; i < pi.rows.length; i++) if (norm(pi.rows[i]?.[1]) === norm(product)) {
        const dest = data.bySource[`Private Investments:${i + 1}`];
        if (dest) { if (fields.remarks?.value) dest.remarks = fields.remarks; if (fields.status?.value) dest.status = fields.status; }
      }
    }
  }
}

// Scheme metadata is matched on an exact reviewed name or an explicit alias, never a fuzzy prefix.
const ALIASES = {
  "Buoyant Opportunities Portfolio AIF A1": "Buoyant Opportunities Portfolio AIF",
  "3P India Equity Fund 1 - B1": "3P India Equity Fund 1",
  "Kotak Large & Midcap Fund": "Kotak Large & Midcap Fund - Direct- Growth",
  "Bandhan Large & Midcap Fund": "Bandhan Large & Mid Cap Fund - Direct Plan - Growth",
  "Kotak Multi Cap fund": "Kotak Multicap Fund-Direct Plan-Growth",
  "VEC Small and Mid cap fund": "VEC Small and Mid cap fund",
};
const keyFor = (name) => norm(ALIASES[name] ?? name);
const details = sheets.get("Equity Scheme details"), dh = headers(details, "fund manager");
const detailCols = { fundManager: "fund manager", fundAum: "aum in crs", investmentStyle: "investment style", regularExpense: "regular expense ratio", directExpense: "direct expense ratio", managementFee: "management fee", exitLoad: "exit load", lockIn: "lock in no lock in" };
for (let row = dh.row + 1; row < details.rows.length; row++) {
  const r = details.rows[row], name = text(r[1]);
  if (!name || !Object.values(detailCols).some((label) => text(r[dh.cols[label]]) !== null)) continue;
  const record = data.byProduct[keyFor(name)] ??= {};
  for (const [id, label] of Object.entries(detailCols)) {
    const col = dh.cols[label];
    if (col === undefined) throw new Error(`Scheme details: missing ${label}`);
    const raw = r[col];
    let value = id === "fundAum" ? number(raw, 1e7) : text(raw);
    if (["regularExpense", "directExpense", "managementFee"].includes(id) && value !== null && num(raw) !== null) {
      const format = formats["Equity Scheme details"]?.[`${colName(col)}${row + 1}`] ?? "";
      value = `${number(raw, format.includes("%") ? 100 : 1)}%`;
    }
    put(record, id, "Equity Scheme details", row, col, value, id === "fundAum" ? "The whole fund's AUM, in crores as the source labels it. It is not the family's holding value." : undefined);
  }
}
for (const name of ["Plan of Action - Equity", "Debt"]) {
  const s = sheets.get(name);
  const start = name === "Debt" ? s.rows.findIndex((r) => norm(r[1]) === "debt investment plan") + 1 : 1;
  for (let row = start; row < s.rows.length; row++) {
    const nameCol = name === "Debt" ? 1 : 0, recommendationCol = nameCol + 1;
    const product = text(s.rows[row][nameCol]), recommendation = text(s.rows[row][recommendationCol]);
    if (product && recommendation) put(data.byProduct[keyFor(product)] ??= {}, "recommendation", name, row, recommendationCol, recommendation, "Historical adviser recommendation in the June review, not a current instruction or an executed transaction.");
  }
}
const attribution = sheets.get("Attribution Analysis");
for (let row = 3; row < attribution.rows.length; row++) {
  const r = attribution.rows[row], name = text(r[0]);
  if (!name || /^\*/.test(name)) continue;
  const fields = data.byProduct[keyFor(name)] ??= {};
  const monthly = { monthlyOpening: 2, monthlyPurchase: 3, monthlySale: 4, monthlyClosing: 1, monthlyReturn: 5, monthlyBenchmark: 6, monthlyAlpha: 7, inceptionAlpha: 8, monthlyRemarks: 9 };
  for (const [id, col] of Object.entries(monthly)) {
    const note = /sanshi/i.test(name) ? "The workbook notes that Sanshi's previous-month valuation is also dated 30 June. This comparison needs reconciliation." : "Historical comparison: 31 May to 30 June 2026, as printed in the review.";
    const numeric = id !== "monthlyRemarks", monetary = ["monthlyOpening", "monthlyPurchase", "monthlySale", "monthlyClosing"].includes(id);
    put(fields, id, "Attribution Analysis", row, col, /sanshi/i.test(name) && id !== "monthlyClosing" && id !== "monthlyRemarks" ? null : numeric ? number(r[col], monetary ? 1e7 : 1) : text(r[col]), note);
  }
}
const monthlySheet = sheets.get("Month on Month Equity Change");
for (let row = 2; row < monthlySheet.rows.length; row++) {
  const r = monthlySheet.rows[row], name = text(r[2]);
  if (!name || /^note:|^total$/i.test(name)) continue;
  const fields = data.byCategory[norm(name)] ??= {};
  for (const [id, col, scale] of [["monthlyOpening", 3, 1e7], ["monthlyPurchase", 4, 1e7], ["monthlySale", 5, 1e7], ["monthlyIncome", 6, 1e7], ["monthlyClosing", 7, 1e7], ["monthlyGain", 8, 1e7], ["monthlyReturn", 9, 1], ["monthlyBenchmark", 10, 1], ["benchmark", 11, null]]) {
    put(fields, id, monthlySheet.name, row, col, scale === null ? text(r[col]) : number(r[col], scale), "June 2026 comparison as printed. The workbook notes incremental sales/purchases after 30 April; earlier transactions are captured in the previous value.");
  }
}
for (const sheetName of ["Portfolio Allocation", "Live Equity Performance"]) {
  const s = sheets.get(sheetName), h = headers(s, "category");
  for (let row = h.row + 2; row < s.rows.length; row++) {
    const r = s.rows[row], name = text(r[1]);
    if (!name || /^note:/.test(name)) continue;
    const fields = data.byCategory[norm(name)] ??= {};
    for (const [id, col, scale] of [["withinClass", 7, 1], ["income", 9, 1e7], ["activeGain", 13, 1e7], ["schemeAbsolute", 15, 1], ["benchmarkAbsolute", 16, 1], ["schemeXirr", 18, 1], ["benchmarkXirr", 19, 1], ["reviewCost", 4, 1e7], ["reviewValue", 5, 1e7]]) {
      if (!fields[id]) put(fields, id, sheetName, row, col, number(r[col], scale));
    }
    // The header supplies no unit for this field. Keep that ambiguity visible rather than guessing INR.
    if (!fields.totalGain) put(fields, "totalGain", sheetName, row, 11, null, `The source prints ${r[11] ?? "no figure"}; its unit is not specified for gain including redeemed funds.`);
    if (!fields.investmentRange) { const date = reviewDate(r[3], formats[sheetName]?.[`D${row + 1}`]); put(fields, "investmentRange", sheetName, row, 3, date?.value ?? null, undefined, date ?? {}); }
  }
}
const asset = sheets.get("Asset Allocation");
for (let row = 2; row <= 5; row++) {
  const r = asset.rows[row], name = norm(r[1]).replace(/ alternate$/, "alternate");
  const fields = data.byCategory[name] ??= {};
  // Monetary fields stay out: this tab's lakhs heading conflicts with its consolidated crores values.
  for (const [id, col] of [["effectiveAllocation", 4], ["adjustedAllocation", 7], ["adjustedEffectiveAllocation", 8]]) put(fields, id, "Asset Allocation", row, col, number(r[col]));
}
const iw = sheets.get("Investorwise Summary"), ih = headers(iw, "category");
for (const [name, col] of Object.entries(ih.cols)) {
  if (col <= 1 || name.includes("allocation")) continue;
  const displayName = iw.rows[ih.row][col], fields = data.byEntity[norm(displayName)] ??= {};
  for (const [id, label] of [["entityTotal", "total"], ["entityPrivateCost", "private equity at cost"], ["entityPeFunds", "pe funds"], ["entityUnlisted", "direct equity unlisted"], ["entityDebt", "debt"], ["entityCash", "cash"], ["entityAlternate", "alternate"]]) {
    const row = iw.rows.findIndex((r) => norm(r[1]) === label);
    if (row >= 0) put(fields, id, "Investorwise Summary", row, col, number(iw.rows[row][col], 1e7));
  }
}
const quants = sheets.get("Equity Quants");
for (let row = 2; row <= 21; row++) {
  const r = quants.rows[row], product = text(r[1]);
  if (product) {
    const fields = data.byProduct[keyFor(product)] ??= {};
    for (const [id, col] of [["schemes", 3], ["nifty50Weight", 4], ["nifty500Weight", 5]]) put(fields, id, "Equity Quants", row, col, number(r[col], id === "schemes" ? 1 : 0.01));
  }
  if (row <= 11 && text(r[7])) {
    const fields = data.bySector[norm(r[7])] ??= {};
    for (const [id, col] of [["nifty50Weight", 9], ["nifty500Weight", 10], ["reviewAllocation", 8]]) put(fields, id, "Equity Quants", row, col, number(r[col], 0.01));
  }
}
for (const name of ["Stable Growth", "Entrepreneruial Growth", "Thematic,Tactical", "Liquid"]) {
  const s = sheets.get(name), row = s.rows.findIndex((r) => norm(r[2]) === "total");
  if (row >= 0) {
    const fields = data.byBasket[norm({ "Entrepreneruial Growth": "Entrepreneurial Growth", "Thematic,Tactical": "Thematic & Tactical", Liquid: "Liquidity" }[name] ?? name)] ??= {};
    for (const [id, col] of [["reviewCost", 6], ["reviewValue", 7]]) put(fields, id, name, row, col, number(s.rows[row][col], 1e7));
  }
}
const productNames = new Map();
for (const s of sheets.values()) for (const row of s.rows) for (const value of row) {
  const key = norm(value);
  if (data.byProduct[key]) { const names = productNames.get(key) ?? new Set(); names.add(value); productNames.set(key, names); }
}
for (const join of REVIEW_PRIVATE_JOIN) {
  const candidates = [...productNames].filter(([, names]) => [...names].some((name) => join.line.test(name))).map(([key]) => key);
  if (candidates.length === 1) for (const key of join.keys) data.bySecurity[key] = candidates[0];
}
// Exact key matching for remaining securities is safe; an abbreviated name is left unmatched.
for (const [key, fields] of Object.entries(data.byProduct)) {
  const normalized = securityKeyOf(key);
  if (!data.bySecurity[normalized]) data.bySecurity[normalized] = key;
  fields.asOf = { value: "30 Jun 2026", sortValue: data.asOf, source: "Consolidated review as on 30 June 2026" };
}
// Keep the workbook's dated valuation caveats with the product, including when the review is June-dated.
for (const [product, sheetName, note] of [
  ["Neo Infra Income Opportunities Fund Share Class A5", "Debt", "Valuation as on 31 March 2026; returns are net of expenses and tax."],
  ["Baring PE India Fund 6", "Alternate", "Valuation as on 31 March 2026."],
  ["360 One Special Opportunities Fund - Series 8 - Class A3 (AIF Category II)", "Alternate", "Valuation as on 31 May 2026."],
  ["Sky Capital Titan Rising Funds 1", "Alternate", "NAV basis at 31 December; February 2026 additions at 31 March 2026 face value."],
  ["Transition Venture Capital fund I", "Alternate", "Valuation as on 28 February 2026."],
]) {
  const fields = data.byProduct[norm(product)];
  if (!fields) throw new Error(`Missing valuation-note product: ${product}`);
  const s = sheets.get(sheetName), actualRow = s.rows.findIndex((r) => r.some((v) => sheetName === "Debt" ? /Neo Infra.*valuation/i.test(v) : norm(v).includes(norm(product.split(" ").slice(0, 2).join(" "))) && /valuation/i.test(v)));
  if (actualRow < 0) throw new Error(`Missing source valuation note: ${product}`);
  const actualCol = s.rows[actualRow].findIndex((v) => /valuation/i.test(v));
  fields.valuationNote = cell(sheetName, actualRow, actualCol, text(s.rows[actualRow][actualCol]));
  for (const field of Object.values(fields)) if (field !== fields.valuationNote) field.note = [field.note, note, `${sheetName}!${colName(actualCol)}${actualRow + 1}`].filter(Boolean).join(" · ");
  for (const [sourceKey, sourceFields] of Object.entries(data.bySource)) {
    const [sourceSheet, sourceRow] = sourceKey.split(":");
    const source = sheets.get(sourceSheet);
    if (source?.rows[Number(sourceRow) - 1]?.some((v) => norm(v) === norm(product))) {
      sourceFields.valuationNote = fields.valuationNote;
      for (const field of Object.values(sourceFields)) if (field !== sourceFields.valuationNote) field.note = [field.note, note].filter(Boolean).join(" · ");
    }
  }
}
const out = `// GENERATED by npm run build-review-columns. Source cells are kept separate from the live book.\nimport type { ReviewColumnData } from "../lib/reviewColumns";\nexport const REVIEW_COLUMN_DATA: ReviewColumnData = ${JSON.stringify(data, null, 1)};\n`;
const target = "src/data/reviewColumns.ts";
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== out) throw new Error("Review columns do not match the workbook. Run npm run build-review-columns.");
} else writeFileSync(target, out);
console.log(`Review columns: ${Object.keys(data.bySource).length} source rows, ${Object.keys(data.byProduct).length} products; all values retain their source cells.`);
