// THE REAL ESTATE BULK-ENTRY WORKBOOK.
//
// One row per property, with the fields of the Add Property form. The template
// is written and read here, so the page and the tests share one definition of
// every column. A blank cell is "not entered", never a zero. A cell that cannot
// be read exactly is reported with its row and column; it is never guessed.
// ExcelJS is passed in, so the browser can load it lazily and node can test a
// real .xlsx round trip.
import { PROPERTY_TYPES, PROPERTY_STATUSES, AREA_UNITS, AREA_BASES, TITLE_STATUSES, ACQUISITION_TYPES, PROPERTY_ID, validateProperty, propertyLabel, earmarkLabel } from "./realEstate.mjs";

export const SHEET = "Properties";
export const MAX_UPLOAD_ROWS = 250;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MIN_OWNER_PAIRS = 4;

const FIELDS = [
  { key: "name", header: "Property name", kind: "text", width: 26 },
  { key: "type", header: "Property type", kind: "choice", options: PROPERTY_TYPES, list: "Property type", width: 16 },
  { key: "status", header: "Status", kind: "choice", options: PROPERTY_STATUSES, list: "Status", width: 18 },
  { key: "address", header: "Address / survey no.", kind: "text", width: 34 },
  { key: "city", header: "City / district", kind: "text", width: 18 },
  { key: "state", header: "State", kind: "text", width: 16 },
  { key: "country", header: "Country", kind: "text", width: 12 },
  { key: "pincode", header: "PIN / postal code", kind: "text", width: 14, format: "@" },
  { key: "acquisition", header: "Acquisition", kind: "choice", options: ACQUISITION_TYPES, list: "Acquisition", width: 14 },
  { key: "purchasedOn", header: "Purchase / inheritance / gift date", kind: "date", width: 18 },
  { key: "area", header: "Area", kind: "number", width: 11 },
  { key: "areaUnit", header: "Area unit", kind: "choice", options: AREA_UNITS, list: "Area unit", width: 11 },
  { key: "areaBasis", header: "Area basis", kind: "choice", options: AREA_BASES, list: "Area basis", width: 15 },
  { key: "owners" },
  { key: "cost", header: "Purchase cost (₹) / value on date of inheritance or gift", kind: "money", width: 22 },
  { key: "value", header: "Current value (₹)", kind: "money", width: 17 },
  { key: "valuationDate", header: "Valuation date", kind: "date", width: 15 },
  { key: "monthlyRent", header: "Monthly rent (₹)", kind: "money", width: 15 },
  { key: "monthlyCosts", header: "Monthly costs (₹)", kind: "money", width: 15 },
  { key: "debt", header: "Loan outstanding (₹)", kind: "money", width: 17 },
  { key: "monthlyEmi", header: "EMI / month (₹)", kind: "money", width: 15 },
  // The form's Tax on sale section.
  { key: "priorCost", header: "Previous owner's cost (₹)", kind: "money", width: 18 },
  { key: "priorAcquiredOn", header: "Previous owner acquired on", kind: "date", width: 16 },
  { key: "fmv2001", header: "Value on 1 Apr 2001 (₹)", kind: "money", width: 17 },
  { key: "ruralAgricultural", header: "Rural agricultural land", kind: "choice", options: ["Yes", "No"], list: "Yes / No", width: 14, bool: true },
  { key: "tenant", header: "Tenant", kind: "text", width: 20 },
  { key: "leaseEnd", header: "Lease ends", kind: "date", width: 14 },
  { key: "titleStatus", header: "Title status", kind: "choice", options: TITLE_STATUSES, list: "Title status", width: 18 },
  // The form's Earmark section: a tick box, the intended recipient and a note, read into `earmark`.
  { key: "earmarked", header: "Earmarked / to be gifted", kind: "choice", options: ["Yes", "No"], list: "Yes / No", width: 14, earmark: true },
  { key: "recipient", header: "Intended recipient", kind: "owner", width: 24, earmark: true },
  { key: "earmarkNote", header: "Earmark note", kind: "text", width: 26, earmark: true },
  { key: "notes", header: "Notes", kind: "text", width: 30 },
  { key: "latitude", header: "Map latitude", kind: "coordinate", width: 13 },
  { key: "longitude", header: "Map longitude", kind: "coordinate", width: 13 },
  { key: "id", header: "Property ID (blank for a new property)", kind: "id", width: 38, locked: true },
  { key: "updatedAt", header: "Last saved (do not edit)", kind: "version", width: 26, locked: true },
];
const FIELD_KEYS = FIELDS.filter(f => f.kind && f.kind !== "id" && f.kind !== "version" && !f.earmark).map(f => f.key);
const EARMARK_KEYS = FIELDS.filter(f => f.earmark).map(f => f.key);
const BOOL_KEYS = new Set(FIELDS.filter(f => f.bool).map(f => f.key));
const HEADER_OF = Object.fromEntries(FIELDS.filter(f => f.header).map(f => [f.key, f.header]));
const ownerHeader = (n, share) => `Owner ${n}${share ? " share %" : ""}`;

/** The template's columns in order: owner / share pairs where the form has Family ownership. */
export function templateColumns(ownerPairs = MIN_OWNER_PAIRS) {
  return FIELDS.flatMap(f => f.key === "owners" ? Array.from({ length: ownerPairs }, (_, i) => [
    { key: `owner${i + 1}`, owner: i, header: ownerHeader(i + 1), kind: "owner", width: 24 },
    { key: `share${i + 1}`, owner: i, header: ownerHeader(i + 1, true), kind: "share", width: 10 },
  ]).flat() : [f]);
}

const FORMATS = { money: "#,##0", date: "dd-mmm-yyyy", coordinate: "0.0000000" };
const LISTS = [["Family members", null], ...FIELDS.filter(f => f.list).map(f => [f.list, f.options])];

/** The template, optionally filled with `properties` so they can be edited in the same file. */
export function buildPropertyWorkbook(ExcelJS, { properties = [], members = [] } = {}) {
  const book = new ExcelJS.Workbook();
  book.creator = "Glow Ventures dashboard";
  const sheet = book.addWorksheet(SHEET, { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  const guide = book.addWorksheet("How to fill");
  const lists = book.addWorksheet("Lists");
  const columns = templateColumns(Math.max(MIN_OWNER_PAIRS, ...properties.map(p => p.owners.length)));
  sheet.columns = columns.map(c => ({ key: c.key, width: c.width ?? 14, style: FORMATS[c.kind] || c.format ? { numFmt: FORMATS[c.kind] ?? c.format } : {} }));
  const header = sheet.getRow(1);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: c.locked ? "FF6B6B6B" : "FF1F1B16" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.locked ? "FFE7E7E7" : "FFF3E7C9" } };
    cell.alignment = { wrapText: true, vertical: "middle" };
  });
  header.height = 34;
  for (const p of properties) {
    const values = {};
    for (const c of columns) {
      if (c.key === "earmarked") values[c.key] = p.earmark ? "Yes" : null;
      else if (c.key === "recipient") values[c.key] = p.earmark?.recipient || null;
      else if (c.key === "earmarkNote") values[c.key] = p.earmark?.note || null;
      else if (c.bool) values[c.key] = p[c.key] ? "Yes" : null;
      else if (c.kind === "owner") values[c.key] = p.owners[c.owner]?.name || null;
      else if (c.kind === "share") values[c.key] = p.owners[c.owner]?.share ?? null;
      else if (c.kind === "date") values[c.key] = p[c.key] ? new Date(`${p[c.key]}T00:00:00Z`) : null;
      else if (c.kind === "version") values[c.key] = p.updatedAt ?? "";
      else { const v = p[c.key]; values[c.key] = v === "" || v == null ? null : v; }
    }
    const row = sheet.addRow(values);
    columns.forEach((c, i) => { if (c.locked) row.getCell(i + 1).font = { color: { argb: "FF6B6B6B" } }; });
  }
  const letter = i => sheet.getColumn(i + 1).letter;
  const range = i => `${letter(i)}2:${letter(i)}${MAX_UPLOAD_ROWS + 1}`;
  // The Lists sheet holds every dropdown, so a choice reads the same in the file and on the form.
  const listRef = {};
  LISTS.forEach(([title, options], i) => {
    const values = options ?? members.map(m => m.label);
    const col = lists.getColumn(i + 1);
    col.width = 26; col.values = [title, ...values];
    lists.getRow(1).getCell(i + 1).font = { bold: true };
    if (values.length) listRef[title] = `Lists!$${col.letter}$2:$${col.letter}$${values.length + 1}`;
  });
  columns.forEach((c, i) => {
    const prompt = c.kind === "money" ? { type: "decimal", operator: "greaterThanOrEqual", formulae: [0], error: "Enter rupees as a plain number (for example 5000000), or leave the cell blank." }
      : c.kind === "share" ? { type: "decimal", operator: "between", formulae: [0, 100], error: "Enter a share from 0 to 100 (60 means 60%), or leave it blank." }
      : c.kind === "date" ? { type: "date", operator: "greaterThan", formulae: [new Date(Date.UTC(1900, 0, 1))], error: "Enter a date, for example 15/08/2021." }
      : c.kind === "choice" ? { type: "list", formulae: [listRef[c.list]], error: `Choose one of: ${c.options.join(", ")}.` }
      : (c.kind === "owner" || c.key === "recipient") && listRef["Family members"] ? { type: "list", formulae: [listRef["Family members"]], showErrorMessage: false }
      : null;
    if (prompt) sheet.dataValidations.add(range(i), { allowBlank: true, showErrorMessage: true, errorStyle: "stop", errorTitle: c.header, ...prompt });
  });
  guide.columns = [{ width: 4 }, { width: 110 }];
  [
    "One row per property. The columns are the fields of the Add Property form on Real Estate.",
    "Leave a cell blank when the figure is not known. A blank is saved as not entered; 0 is saved as a measured zero.",
    "Amounts are whole-property rupees as plain numbers: 50000000, not 5 Cr or 50 L.",
    "Owner share % is a number from 0 to 100 (60 means 60%). Choose family members from the list; any other name is saved as typed.",
    "Dates: an Excel date, or DD/MM/YYYY.",
    "Inherited or gifted: enter the value on the date of inheritance or gift in the cost column, or leave it blank. Never 0.",
    "A new property: leave Property ID blank.",
    "A downloaded property keeps its Property ID and Last saved; do not edit those two cells. Its row replaces the saved property, so a cleared cell clears that field.",
    "For the estimated tax on a sale: for an inherited or gifted property, the previous owner's cost and acquisition date; for one held since before 1 Apr 2001, its value on that date.",
    "Earmarked / to be gifted: Yes marks the property for a future gift to the intended recipient. It is a marker only; ownership and value stay with the owners.",
    "Removing a row does not delete a property. Delete it on the dashboard.",
    `Upload the file on Real Estate with Bulk entry. Every row is checked first; if any row has a problem, nothing is saved. Up to ${MAX_UPLOAD_ROWS} properties per file.`,
  ].forEach((line, i) => { const row = guide.addRow([i + 1, line]); row.alignment = { wrapText: true, vertical: "top" }; });
  return book;
}

// ── READING ─────────────────────────────────────────────────────────────────

const normalize = s => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const BLANK_WORDS = new Set(["-", "—", "–", "na", "n/a", "nil"]);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthOf = word => { const w = word.toLowerCase(); const i = MONTHS.findIndex(m => w.length >= 3 && m.startsWith(w)); return i < 0 && w === "sept" ? 9 : i < 0 ? null : i + 1; };

/** A cell's value as Excel last computed it: text, a number, a Date, or a marker for what cannot be read. */
function cellValue(v) {
  if (v == null) return null;
  if (v instanceof Date || typeof v !== "object") return v;
  if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join("");
  if ("formula" in v || "sharedFormula" in v) return v.result === undefined ? { unreadable: "a formula with no saved result" } : cellValue(v.result);
  if ("error" in v) return { unreadable: `the Excel error ${v.error}` };
  if ("text" in v) return cellValue(v.text);
  return { unreadable: "a value that is not text, a number or a date" };
}
const isoDate = (y, m, d) => {
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return !Number.isNaN(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso ? iso : null;
};
function parseCell(column, raw, numFmt) {
  const v = cellValue(raw);
  if (v && typeof v === "object" && "unreadable" in v) return { error: `${column.header}: ${v.unreadable}. Type the value instead.` };
  const str = v instanceof Date ? "" : String(v ?? "").trim();
  const blank = v === null || (typeof v === "string" && (str === "" || (column.kind !== "text" && column.kind !== "owner" && BLANK_WORDS.has(str.toLowerCase()))));
  switch (column.kind) {
    case "text": case "owner": case "version":
      if (v instanceof Date) return { value: column.kind === "version" ? v.toISOString() : v.toISOString().slice(0, 10) };
      return { value: str };
    case "id":
      if (blank) return { value: "" };
      return PROPERTY_ID.test(str) ? { value: str } : { error: `${column.header}: "${str}" is not a Property ID from this dashboard. Clear it to add the row as a new property.` };
    case "choice": {
      if (blank) return { value: "" };
      const match = column.options.find(o => normalize(o) === normalize(str));
      return match ? { value: match } : { error: `${column.header}: "${str}" is not one of ${column.options.join(", ")}.` };
    }
    case "date": {
      if (blank) return { value: null };
      if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) return { error: `${column.header}: not a valid date.` };
        return { value: isoDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()) };
      }
      let iso = null, m;
      if ((m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) iso = isoDate(+m[1], +m[2], +m[3]);
      else if ((m = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) iso = isoDate(+m[3], +m[2], +m[1]);
      else if ((m = str.match(/^(\d{1,2})[\s-]+([a-z]+)[\s,-]+(\d{4})$/i)) && monthOf(m[2])) iso = isoDate(+m[3], monthOf(m[2]), +m[1]);
      return iso ? { value: iso } : { error: `${column.header}: "${str}" is not a date. Use an Excel date or DD/MM/YYYY.` };
    }
    case "money": case "number": case "share": case "coordinate": {
      if (blank) return { value: null };
      let n;
      if (typeof v === "number") {
        n = v;
        // A share typed into a cell formatted as a percentage is stored as a fraction (60% is 0.6).
        if (column.kind === "share" && /%/.test(numFmt ?? "")) n = Math.round(n * 100 * 1e9) / 1e9;
      } else {
        const cleaned = str.replace(/^(₹|rs\.?|inr)\s*/i, "").replace(/[,\s]/g, "");
        const pattern = column.kind === "coordinate" ? /^-?\d+(\.\d+)?$/ : column.kind === "share" ? /^\d+(\.\d+)?%?$/ : /^\d+(\.\d+)?$/;
        if (typeof v !== "string" || !pattern.test(cleaned)) return { error: `${column.header}: "${str}" is not ${column.kind === "money" ? "a plain number of rupees (for example 5000000)" : column.kind === "share" ? "a share from 0 to 100" : "a number"}. Leave it blank if it is not known.` };
        n = Number(cleaned.replace(/%$/, ""));
      }
      if (!Number.isFinite(n)) return { error: `${column.header}: not a number.` };
      if (column.kind !== "coordinate" && n < 0) return { error: `${column.header}: cannot be negative.` };
      if (column.kind === "share" && n > 100) return { error: `${column.header}: ${n} is above 100. Enter the share as a percentage from 0 to 100.` };
      return { value: n };
    }
  }
  return { error: `${column.header}: unknown column.` };
}

/**
 * Reads an uploaded workbook into rows of parsed cells. File-level problems
 * (no Properties sheet, a renamed or deleted column) stop the whole file.
 */
export async function readPropertyWorkbook(ExcelJS, data) {
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(data); }
  catch { return { fileErrors: ["The file could not be opened as an Excel workbook (.xlsx). Save it as an Excel Workbook and upload it again."], notes: [], rows: [] }; }
  const sheet = book.worksheets.find(ws => normalize(ws.name) === normalize(SHEET));
  if (!sheet) return { fileErrors: [`The file has no "${SHEET}" sheet. Download the template and enter the properties on that sheet.`], notes: [], rows: [] };
  const fileErrors = [], notes = [];
  const byHeader = new Map(templateColumns(0).map(c => [normalize(c.header), c]));
  const found = new Map(), owners = new Map(), seen = new Set();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const raw = cellValue(cell.value), text = normalize(typeof raw === "object" && raw ? "" : raw);
    if (!text) return;
    if (seen.has(text)) { fileErrors.push(`The column "${String(raw).trim()}" appears twice. Keep one.`); return; }
    seen.add(text);
    const owner = text.match(/^owner (\d+)( share %)?$/);
    if (owner) {
      const n = Number(owner[1]);
      const pair = owners.get(n) ?? {};
      pair[owner[2] ? "share" : "name"] = col;
      owners.set(n, pair);
    } else if (byHeader.has(text)) found.set(byHeader.get(text).key, { column: byHeader.get(text), col });
    else notes.push(`The column "${String(raw).trim()}" is not in the template and was ignored.`);
  });
  const missing = templateColumns(0).filter(c => !found.has(c.key)).map(c => `"${c.header}"`);
  if (missing.length) fileErrors.push(`Missing ${missing.length === 1 ? "column" : "columns"} ${missing.join(", ")}. Download the template again rather than renaming or deleting columns.`);
  const pairs = [...owners.entries()].sort((a, b) => a[0] - b[0]);
  for (const [n, pair] of pairs) if (!pair.name || !pair.share) fileErrors.push(`"${ownerHeader(n, !pair.share)}" has no matching "${ownerHeader(n, !!pair.share)}" column.`);
  if (!owners.has(1)) fileErrors.push(`Missing the "${ownerHeader(1)}" and "${ownerHeader(1, true)}" columns.`);
  if (fileErrors.length) return { fileErrors, notes, rows: [] };
  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values = {}, errors = [], ownerCells = [];
    for (const [key, { column, col }] of found) {
      const cell = row.getCell(col);
      const parsed = parseCell(column, cell.value, cell.numFmt);
      if (parsed.error) { errors.push(parsed.error); values[key] = undefined; } else values[key] = parsed.value;
    }
    for (const [n, pair] of pairs) {
      const nameCell = row.getCell(pair.name), shareCell = row.getCell(pair.share);
      const name = parseCell({ kind: "owner", header: ownerHeader(n) }, nameCell.value);
      const share = parseCell({ kind: "share", header: ownerHeader(n, true) }, shareCell.value, shareCell.numFmt);
      if (name.error) errors.push(name.error);
      if (share.error) errors.push(share.error);
      ownerCells.push({ n, name: name.value ?? "", share: share.value ?? null, filled: !!(name.value || share.value != null || name.error || share.error) });
    }
    const content = errors.length > 0 || ownerCells.some(o => o.filled) || [...FIELD_KEYS, ...EARMARK_KEYS].some(k => values[k] !== "" && values[k] !== null);
    if (!content && !values.id) continue;
    rows.push({ row: r, values, owners: ownerCells.filter(o => o.filled), errors, content });
  }
  if (rows.length > MAX_UPLOAD_ROWS) return { fileErrors: [`The file has ${rows.length} property rows. Upload at most ${MAX_UPLOAD_ROWS} at a time.`], notes, rows: [] };
  if (!rows.length) fileErrors.push(`The "${SHEET}" sheet has no property rows. Enter one property per row below the headings.`);
  return { fileErrors, notes, rows };
}

// ── PLANNING ────────────────────────────────────────────────────────────────

const identity = p => p.name || p.address ? `${normalize(p.name)}|${normalize(p.address)}` : null;
const comparable = p => JSON.stringify(validateProperty({ ...p, updatedAt: undefined }).property ?? null);
const showValue = (key, v) => typeof v === "boolean" ? (v ? "Yes" : "No") : v === null || v === undefined || v === "" ? "blank"
  : typeof v === "number" ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 7 }).format(v) : String(v);
const earmarkText = p => `${earmarkLabel(p)}${p.earmark?.note ? ` · ${p.earmark.note}` : ""}`;
const ownersText = owners => owners.map(o => `${o.name || "unnamed"}${o.share === null ? "" : ` ${showValue("share", o.share)}%`}`).join(", ") || "blank";
// validateProperty names a field by its key; the reader names it by its column heading.
const readable = message => message.replace(/^Check (\w+);/, (_, key) => `Check ${HEADER_OF[key] ?? key};`);

/**
 * Turns read rows into what saving would do: a new property, an update, an
 * unchanged row, or a problem. Nothing is saved unless every row is clean.
 */
export function planPropertyUpload(read, { existing = [], members = [], newId = () => crypto.randomUUID() } = {}) {
  const byId = new Map(existing.map(p => [p.id, p]));
  const memberByName = new Map(members.map(m => [normalize(m.label), m]));
  const idCount = new Map();
  for (const r of read.rows) if (r.values.id) idCount.set(r.values.id, (idCount.get(r.values.id) ?? 0) + 1);
  const rows = read.rows.map(r => {
    const errors = [...r.errors], notes = [];
    const current = r.values.id ? byId.get(r.values.id) : null;
    if (r.values.id && !current) errors.push("This Property ID is not on the dashboard. Clear it to add the row as a new property.");
    if (r.values.id && idCount.get(r.values.id) > 1) errors.push("The same Property ID is on more than one row. Keep one row per property.");
    if (current && (r.values.updatedAt ?? "") !== (current.updatedAt ?? "")) errors.push("This property was changed on the dashboard after the file was downloaded. Download the file again and re-enter this row.");
    if (r.values.id && !r.content) errors.push("The row has a Property ID but no details. Restore the row, or delete the property on the dashboard.");
    const owners = r.owners.map(o => {
      if (!o.name && o.share !== null) errors.push(`${ownerHeader(o.n, true)} is entered without a name in ${ownerHeader(o.n)}.`);
      // The form's rule: a typed name that matches a family member is that member; otherwise it is kept as typed.
      const member = memberByName.get(normalize(o.name));
      const kept = current?.owners.find(c => c.ownerId && normalize(c.name) === normalize(o.name));
      if (o.name && !member && !kept && members.length) notes.push(`${o.name} is not a family member on the dashboard; saved as typed.`);
      return { ownerId: member?.ownerId ?? kept?.ownerId ?? null, name: kept?.name ?? member?.label ?? o.name, share: o.share };
    });
    if (r.values.area != null && !r.values.areaUnit) errors.push("Area unit: choose the unit for the area entered.");
    const recipient = r.values.recipient ?? "", note = r.values.earmarkNote ?? "";
    if (r.values.earmarked !== "Yes" && (recipient || note)) errors.push("Earmarked / to be gifted: choose Yes for the recipient or note entered, or clear them.");
    const member = memberByName.get(normalize(recipient));
    const keptRecipient = current?.earmark?.recipientId && normalize(current.earmark.recipient) === normalize(recipient) ? current.earmark : null;
    if (recipient && !member && !keptRecipient && members.length) notes.push(`${recipient} is not a family member on the dashboard; saved as typed.`);
    const earmark = r.values.earmarked === "Yes" ? { recipientId: member?.ownerId ?? keptRecipient?.recipientId ?? null, recipient: keptRecipient?.recipient ?? member?.label ?? recipient, note } : null;
    // A field the template does not carry keeps its saved value; every template field is the row's.
    const candidate = { ...(current ?? {}), ...Object.fromEntries(FIELD_KEYS.map(k => [k, BOOL_KEYS.has(k) ? r.values[k] === "Yes" : r.values[k]])), id: current?.id ?? newId(), owners, earmark };
    delete candidate.updatedAt;
    const checked = validateProperty(candidate);
    if (checked.error && !errors.length) errors.push(readable(checked.error));
    const property = checked.property ?? null;
    const changes = current && property ? [
      ...FIELD_KEYS.filter(k => JSON.stringify(current[k] ?? (BOOL_KEYS.has(k) ? false : null)) !== JSON.stringify(property[k] ?? null)).map(k => ({ field: HEADER_OF[k], before: showValue(k, current[k]), after: showValue(k, property[k]) })),
      ...(JSON.stringify(current.owners) !== JSON.stringify(property.owners) ? [{ field: "Owners", before: ownersText(current.owners), after: ownersText(property.owners) }] : []),
      ...(JSON.stringify(current.earmark ?? null) !== JSON.stringify(property.earmark) ? [{ field: "Earmark", before: earmarkText(current), after: earmarkText(property) }] : []),
    ] : [];
    return { row: r.row, isNew: !r.values.id, label: property ? propertyLabel(property) : r.values.name || r.values.address || `Row ${r.row}`,
      action: errors.length ? "error" : !current ? "new" : comparable(current) === comparable(property) ? "unchanged" : "update",
      property: errors.length ? null : property, base: current ? current.updatedAt ?? "" : null, errors, notes: [...new Set(notes)], changes,
      identity: identity({ name: r.values.name ?? "", address: r.values.address ?? "" }) };
  });
  // A new row naming a property already on the dashboard, or repeating another row, would add it twice.
  const referenced = new Set(read.rows.map(r => r.values.id).filter(id => byId.has(id)));
  const firstRow = new Map();
  for (const row of rows) {
    if (!row.identity) continue;
    const twin = row.isNew && existing.find(p => !referenced.has(p.id) && identity(p) === row.identity);
    if (twin) fail(row, `"${propertyLabel(twin)}" with this name and address is already on the dashboard. To change it, download the template with current properties and edit its row.`);
    if (firstRow.has(row.identity)) fail(row, `Same name and address as row ${firstRow.get(row.identity)}. Keep one row per property.`);
    else firstRow.set(row.identity, row.row);
  }
  const count = action => rows.filter(r => r.action === action).length;
  const counts = { new: count("new"), update: count("update"), unchanged: count("unchanged"), error: count("error") };
  return { rows, counts, fileErrors: read.fileErrors, notes: read.notes,
    ready: !read.fileErrors.length && !counts.error && counts.new + counts.update > 0,
    items: rows.filter(r => r.action === "new" || r.action === "update").map(r => ({ property: r.property, base: r.base })) };
}
function fail(row, message) { row.errors.push(message); row.action = "error"; row.property = null; }
