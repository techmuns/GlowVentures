// SUPPLEMENTARY PROFILES OF PRIVATE INVESTMENTS — a fund's strategy and a
// company's description — read off whatever file the family supplies them in.
//
//   *"Add fund strategy and company-description fields to the canonical
//    private-market data … Match supplementary data to the investment identity
//    rather than requiring the client to maintain one upload format."*
//
// No statement prints either field, so they come from the family or their
// adviser: a sheet, a CSV, a JSON file, dropped into `source/` through the
// Statement Library like any other document. This reader does NOT require one
// layout. A table is a profile table when its HEADER names an investment (by
// name, ISIN, folio or security key) AND a strategy or a description — wherever
// that header row sits, in whichever column order, across or down the sheet. The
// match to the book is by the investment's IDENTITY, at display time
// (`src/lib/investmentProfiles.ts`), never by row position or file name.
//
// It reads TEXT only. Nothing here is a figure, so nothing here can reach a
// total; a value it cannot read is left out, never guessed.
import { readSpreadsheet } from "../ingest/lib/sheet.mjs";

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const text = (s) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return /^(?:|-+|—|–|na|n\/a|#n\/a|nil|none|null|tbd|x)$/i.test(t) ? null : t;
};

/**
 * THE HEADERS EACH FIELD IS KNOWN BY, matched on the WHOLE header text. A word
 * found inside a longer header does not count: "Transaction description" is a
 * statement's narration, not a company description.
 */
export const PROFILE_HEADERS = {
  name: /^(?:investment|investment name|investments|company|company name|companies|fund|fund name|scheme|scheme name|product|product name|security|security name|holding|holding name|name|investee|investee company|portfolio company|issuer|issuer name|entity|entity name|instrument|instrument name|startup|startup name|deal|deal name)$/,
  aka: /^(?:investment name aka|aka|also known as|brand|brand name|trading name|trade name|known as)$/,
  isin: /^(?:isin|isin code|isin no|isin number)$/,
  folio: /^(?:folio|folio no|folio number|account|account no|account number|client code|client id|crn|crn no)$/,
  securityKey: /^(?:security key|securitykey|investment key)$/,
  strategy: /^(?:strategy|fund strategy|investment strategy|strategy description|investment style|fund style|style|investment approach|approach|investment thesis|thesis|investment focus|fund focus)$/,
  description: /^(?:description|company description|business description|investment description|about|about the company|business|nature of business|what the company does|what they do|overview|company overview|business overview|company profile|profile|summary|business summary)$/,
};
const IDENTITY = ["name", "isin", "folio", "securityKey"];
const PAYLOAD = ["strategy", "description"];
/** A header carrying two of these is a statement's ledger, never a profile table. */
const LEDGER = /^(?:date|txn date|transaction date|trade date|value date|amount|debit|credit|balance|closing balance|narration|units|quantity|nav|rate|price)$/;

const colName = (c) => { let s = ""; for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };

/** The columns a header row names, or null where it is not a profile header. */
export function profileHeader(cells) {
  const cols = {};
  let ledger = 0;
  (cells ?? []).forEach((cell, c) => {
    const t = norm(cell);
    if (!t) return;
    if (LEDGER.test(t)) ledger++;
    for (const [field, re] of Object.entries(PROFILE_HEADERS)) {
      if (!(field in cols) && re.test(t)) { cols[field] = c; break; }
    }
  });
  if (ledger >= 2) return null;
  if (!IDENTITY.some((f) => f in cols) || !PAYLOAD.some((f) => f in cols)) return null;
  return cols;
}

/**
 * EVERY PROFILE RECORD ON ONE GRID. `cell(r, c)` names a cell as the reader
 * would find it in the file, so a transposed grid still cites the real cell.
 */
function recordsOfGrid(rows, cell) {
  const out = [];
  for (let h = 0; h < rows.length; h++) {
    const cols = profileHeader(rows[h]);
    if (!cols) continue;
    let r = h + 1;
    for (; r < rows.length; r++) {
      const row = rows[r] ?? [];
      // The next profile header starts a new table on the same sheet.
      if (profileHeader(row)) break;
      const at = (f) => (f in cols ? text(row[cols[f]]) : null);
      const identity = Object.fromEntries([...IDENTITY, "aka"].map((f) => [f, at(f)]));
      if (!IDENTITY.some((f) => identity[f])) continue;
      if (/^(?:sub\s*)?total\b|\btotal$/i.test(identity.name ?? "")) continue;
      const payload = Object.fromEntries(PAYLOAD.map((f) => {
        const value = at(f);
        return [f, value ? { value, cell: cell(r, cols[f]) } : null];
      }));
      if (!PAYLOAD.some((f) => payload[f])) continue;
      out.push({ at: cell(r, cols[IDENTITY.find((f) => identity[f] && f in cols)]), identity, ...payload });
    }
    h = r - 1;
  }
  return out;
}

const transpose = (rows) => {
  const width = Math.max(0, ...rows.map((r) => r?.length ?? 0));
  return Array.from({ length: width }, (_, c) => rows.map((r) => r?.[c] ?? ""));
};

/** Profile records on a set of sheets — across the sheet, or down it with the labels in a column. */
export function profilesOfSheets(sheets) {
  const out = [];
  for (const s of sheets ?? []) {
    const rows = (s.rows ?? []).map((r) => (r ?? []).map((v) => (v == null ? "" : String(v))));
    let found = recordsOfGrid(rows, (r, c) => `${colName(c)}${r + 1}`);
    if (!found.length) found = recordsOfGrid(transpose(rows), (r, c) => `${colName(r)}${c + 1}`);
    for (const rec of found) out.push({ sheet: s.name ?? null, ...rec });
  }
  return out;
}

/**
 * JSON, in the shapes a person writes it: an array of records, an object
 * holding one (`{ "investments": [...] }`), or an object keyed by investment
 * name. Keys are matched like headers.
 */
export function profilesOfJson(value) {
  const rowsOf = (v) => {
    if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object" && !Array.isArray(x));
    if (!v || typeof v !== "object") return [];
    const arrays = Object.values(v).filter(Array.isArray);
    if (arrays.length === 1) return rowsOf(arrays[0]);
    // Keyed by name: { "Integris": { "description": "…" } }
    return Object.entries(v).filter(([, x]) => x && typeof x === "object" && !Array.isArray(x))
      .map(([name, x]) => ({ name, ...x }));
  };
  const records = rowsOf(value);
  if (!records.length) return [];
  const keys = [...new Set(records.flatMap((r) => Object.keys(r)))];
  const header = profileHeader(keys);
  if (!header) return [];
  const grid = [keys, ...records.map((r) => keys.map((k) => (typeof r[k] === "string" || typeof r[k] === "number" ? String(r[k]) : "")))];
  return recordsOfGrid(grid, (r, c) => (r === 0 ? keys[c] : `[${r - 1}].${keys[c]}`)).map((rec) => ({ sheet: null, ...rec }));
}

/** Profile records in one file's bytes, by what the bytes are — never by the file's name. */
export function profilesOfFile(bytes, file) {
  const head = bytes.subarray(0, 64).toString("utf8").replace(/^﻿/, "").trimStart();
  if (/\.json$/i.test(file) || head.startsWith("{") || head.startsWith("[")) {
    try { return profilesOfJson(JSON.parse(bytes.toString("utf8").replace(/^﻿/, ""))); } catch { /* not JSON — try it as a sheet */ }
  }
  const wb = readSpreadsheet(bytes);
  if (wb.error) return [];
  return profilesOfSheets(wb.sheets);
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/**
 * WHICH DELIVERY A FILE CAME IN, as a sortable key — the newest record wins
 * (the standing rule). `uploads-2026-10-19/…` is its date; `october-2026-c/…`
 * is the month and the letter; a file at the top of `source/` sorts first.
 */
export function deliveryOf(rel) {
  const parts = rel.split(/[\\/]/);
  for (const p of parts) {
    const up = /^uploads-(\d{4}-\d{2}-\d{2})$/.exec(p);
    if (up) return up[1];
    const m = /^([a-z]+)-(\d{4})(?:-([a-z]))?$/.exec(p.toLowerCase());
    if (m && MONTHS.includes(m[1])) return `${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-00${m[3] ?? ""}`;
  }
  return "";
}
