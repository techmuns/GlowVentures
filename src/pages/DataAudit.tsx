import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadSheetFormats, columnDecimals, type SheetFormats } from "@/lib/sheetFormats";
import { Table2, Lock, Search, Download, ShieldAlert, FileSpreadsheet } from "lucide-react";
import { BasisPill } from "@/components/BasisPill";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { ConsolidatedSheet } from "@/components/ConsolidatedSheet";

// The Data Audit archive lives in public/audit/ and is served at /audit/* in dev,
// preview and production. On the hosted site those requests sit behind the edge
// password gate (functions/_middleware.js); if a fetch fails we show a fallback notice.
type SheetMeta = { key: string; name: string; rows: number; cols: number };
type FileMeta = {
  fileKey: string; label: string; fy: string; source: string; reportType: string;
  status: "ok" | "partial" | "failed" | "encrypted"; sheets: SheetMeta[];
};
type Cell = string | number | null;
type Sheet = { name: string; rows: Cell[][] };

/**
 * A chip names WHICH document it opens — the provider, the account, the report
 * and its date (XA-26). It read the date alone, so 42 chips said "2026-07-31"
 * and the only way to tell them apart was to open each one. Where two chips
 * would still read alike (a statement reissued on the same date), the later is
 * numbered; its source file is the chip's hover either way.
 */
const chipLabel = (f: { label: string; fy: string }) => {
  const [provider, account, type] = f.label.split(" · ");
  if (!provider || !account || !type) return [f.label, f.fy].filter(Boolean).join(" · ");
  return [`${provider.split(" ").slice(0, 2).join(" ")} ${account}`, type, f.fy].filter(Boolean).join(" · ");
};
function chipLabels(manifest: readonly { fileKey: string; label: string; fy: string }[]): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const f of manifest) {
    const base = chipLabel(f);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.set(f.fileKey, n === 1 ? base : `${base} · #${n}`);
  }
  return out;
}

/**
 * THE DOCUMENT THIS PAGE OPENS ON IS CHOSEN, NOT WHICHEVER PATH SORTS FIRST.
 *
 * It was the first manifest entry carrying sheets, and the manifest is ordered
 * by SOURCE PATH — so a delivery whose folder sorts earlier silently moves
 * which statement a reader lands on. Two things turn on that, and neither is
 * served by leaving it to a directory name:
 *
 *   - this page exists so a figure on the dashboard can be checked against the
 *     statement that struck it, and a savings-account statement struck none. It
 *     is in no total on this site at all (`bankStatement.mjs`'s own
 *     `EXCLUDED_REASON`), so nobody opens the archive wanting one first;
 *   - its tape is the family's own banking, one narration per row naming
 *     whoever that row paid. That is theirs to open deliberately rather than
 *     the first thing the page shows, and one of those narrations names the
 *     ring-fenced company, which `check:pages` asserts no route but /polycab
 *     does.
 *
 * It stays a PREFERENCE and not a filter: a drop carrying nothing else would
 * otherwise open on an empty page, which says less than the statement does. A
 * reader reaches any document in one click from the chips either way.
 */
const NOT_A_DEFAULT_DOCUMENT = new Set(["bank-statement"]);
function defaultDocument(m: readonly FileMeta[]): FileMeta | null {
  return m.find((f) => f.sheets.length && !NOT_A_DEFAULT_DOCUMENT.has(f.reportType))
    ?? m.find((f) => f.sheets.length)
    ?? null;
}

const BASE = import.meta.env.BASE_URL;
const VISIBLE_CAP = 200;

function colLabel(i: number): string {
  let s = "", n = i + 1;
  while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function fmtCell(v: Cell, decimals: number | null = null): { text: string; num: boolean; full: string } {
  if (v === null || v === undefined || v === "") return { text: "", num: false, full: "" };
  if (typeof v === "number") {
    // Mirror how Excel *displays* the cell. The workbook stores full binary
    // precision (1687.79022064853) but shows it through the column's number
    // format ("1,687.79"), so we re-apply that precision here; the untouched
    // stored value stays in `full` (hover tooltip) and in the CSV export.
    const text = decimals != null
      ? v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : Number.isInteger(v)
        ? v.toLocaleString("en-IN")
        : v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    return { text, num: true, full: String(v) };
  }
  // Excel dates land as ISO datetimes at midnight — render the date, not the raw
  // timestamp, so the cell reads like the source sheet (full value stays in `full`).
  const s = String(v);
  const dateOnly = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?$/.exec(s);
  return { text: dateOnly ? dateOnly[1] : s, num: false, full: s };
}

function SourceArchive() {
  const [status, setStatus] = useState<"loading" | "ready" | "restricted">("loading");
  const [manifest, setManifest] = useState<FileMeta[]>([]);
  const [fileKey, setFileKey] = useState("");
  const [sheetKey, setSheetKey] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [exact, setExact] = useState(false); // deep-link `eq` → whole-cell match instead of substring
  const [showAll, setShowAll] = useState(false);
  const [formats, setFormats] = useState<SheetFormats | null>(null);
  const cache = useRef<Record<string, Sheet>>({});
  const [searchParams] = useSearchParams();
  const pendingFind = useRef<string | null>(null); // a deep-link's `find`/`eq`, applied on next sheet load
  const pendingExact = useRef<boolean>(false);

  useEffect(() => {
    let alive = true;
    // Per-column number formats for every sheet, so the grid shows the precision
    // the workbook shows (see sheetFormats).
    loadSheetFormats().then((f) => { if (alive) setFormats(f); });
    fetch(`${BASE}audit/manifest.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((m: FileMeta[]) => {
        if (!alive) return;
        setManifest(m);
        if (!searchParams.get("file")) {
          const first = defaultDocument(m);
          if (first) { setFileKey(first.fileKey); setSheetKey(first.sheets[0].key); }
        }
        setStatus("ready");
      })
      .catch(() => alive && setStatus("restricted"));
    return () => { alive = false; };
  }, []);

  // Deep-link: ?file=&sheet=&find= opens a specific workbook/sheet and highlights
  // the rows containing `find` (an ISIN, name…), so a dashboard number can point
  // straight at its source cells. Runs on first load and on in-app navigation.
  useEffect(() => {
    if (status !== "ready" || !manifest.length) return;
    const eq = searchParams.get("eq");
    const find = eq ?? searchParams.get("find");
    const wantFile = searchParams.get("file");
    // A CONSOLIDATED figure names no single document, because it spans five.
    // Its link carries only `find`, and the honest response is to open the
    // archive with that term already in the search box rather than to pick a
    // document at random and highlight nothing. Returning early here — which is
    // what used to happen — dropped the term silently.
    if (!wantFile) {
      if (find) { pendingFind.current = find; pendingExact.current = eq != null; setQuery(find); setExact(eq != null); }
      return;
    }
    const f = manifest.find((x) => x.fileKey === wantFile && x.sheets.length);
    // A file key the manifest does not carry is a BROKEN link, and quietly
    // leaving the previously-open document on screen is how a reader ends up
    // reading another account's statement believing it is the one they clicked.
    if (!f) {
      if (typeof console !== "undefined") console.warn(`[audit] no document "${wantFile}" in the manifest — the link that sent you here is stale.`);
      return;
    }
    const wantSheet = searchParams.get("sheet");
    const s = (wantSheet && f.sheets.find((x) => x.key === wantSheet)) || f.sheets[0];
    pendingFind.current = find;
    pendingExact.current = eq != null;
    setFileKey(f.fileKey);
    setSheetKey(s?.key ?? "");
  }, [searchParams, status, manifest]);

  useEffect(() => {
    if (status !== "ready" || !fileKey || !sheetKey) return;
    if (pendingFind.current) { setQuery(pendingFind.current); setExact(pendingExact.current); pendingFind.current = null; pendingExact.current = false; }
    else { setQuery(""); setExact(false); }
    setShowAll(false);
    const id = `${fileKey}/${sheetKey}`;
    if (cache.current[id]) { setSheet(cache.current[id]); setSheetLoading(false); return; }
    let alive = true;
    setSheetLoading(true); setSheet(null);
    fetch(`${BASE}audit/${fileKey}/${sheetKey}.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((s: Sheet) => { if (!alive) return; cache.current[id] = s; setSheet(s); })
      .catch(() => alive && setSheet(null))
      .finally(() => alive && setSheetLoading(false));
    return () => { alive = false; };
  }, [status, fileKey, sheetKey]);

  const currentFile = manifest.find((f) => f.fileKey === fileKey);
  const labels = useMemo(() => chipLabels(manifest), [manifest]);
  const ncols = useMemo(() => sheet ? sheet.rows.reduce((m, r) => Math.max(m, r.length), 0) : 0, [sheet]);
  // Detect the sheet's column-heading row (the label-heaviest of the first rows) so
  // we can pin it as a header — otherwise a filter (e.g. by ISIN) hides it and the
  // user is left with only the A/B/C letters.
  const headerRowIndex = useMemo(() => {
    if (!sheet) return -1;
    // A heading cell is a *label* — plain text, not a date and not a number written
    // as text. Counting raw strings instead misreads data rows whose cells are ISO
    // dates or codes (e.g. a dividend row "BALKRISHNA … 2022-08-11 … Rate not
    // declared") as the heading row, which then mislabels every column beneath it.
    const isLabel = (c: Cell) => {
      if (typeof c !== "string") return false;
      const s = c.trim();
      if (s === "") return false;
      if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return false;      // ISO datetime
      if (/^[-+]?[\d,]*\.?\d+%?$/.test(s)) return false;     // number-as-text
      return true;
    };
    // Scan far enough down to clear a tall preamble: "Future consumer Not
    // considered" (FY21-22) carries four note/metadata lines before its
    // "Name of the Script | Remarks | Qty | Rate | Total" heading on row 9.
    let best = -1, bestLabels = -1;
    for (let i = 0; i < Math.min(sheet.rows.length, 16); i++) {
      let nonEmpty = 0, labels = 0;
      for (const c of sheet.rows[i] ?? []) {
        if (c === null || c === undefined || String(c).trim() === "") continue;
        nonEmpty++;
        if (isLabel(c)) labels++;
      }
      // Require the row to be predominantly labels, then take the richest one.
      if (labels >= 2 && nonEmpty > 0 && labels / nonEmpty >= 0.6 && labels > bestLabels) {
        bestLabels = labels; best = i;
      }
    }
    return best;
  }, [sheet]);
  // Rows that sit ABOVE the heading row in the workbook (sheet titles, "Data as on
  // …" notes, pivot "Column Labels" bands). They must stay above it on screen too —
  // rendering them as ordinary body rows put stray values under unrelated headings
  // (e.g. "NABS Equity" beneath "Pur Date"), which reads as mixed-up columns.
  const preambleRows = useMemo(() => {
    if (!sheet || headerRowIndex <= 0) return [] as { i: number; row: Cell[] }[];
    return sheet.rows.slice(0, headerRowIndex)
      .map((row, i) => ({ i, row }))
      .filter(({ row }) => row.some((c) => c !== null && c !== undefined && String(c).trim() !== ""));
  }, [sheet, headerRowIndex]);
  const headerRow = headerRowIndex >= 0 && sheet ? sheet.rows[headerRowIndex] : null;
  // Display precision per column, taken from the workbook's own number formats
  // (see sheetFormats) so the grid shows what Excel shows.
  const colDecimals = useMemo(
    () => Array.from({ length: ncols }, (_, c) => columnDecimals(formats, fileKey, sheetKey, c)),
    [formats, fileKey, sheetKey, ncols],
  );
  const filtered = useMemo(() => {
    if (!sheet) return [] as { i: number; row: Cell[] }[];
    const q = query.trim().toLowerCase();
    // Body = everything after the heading row; the heading and anything above it are
    // pinned in <thead>, in their original workbook order.
    const base = sheet.rows.map((row, i) => ({ i, row })).filter(({ i }) => i > headerRowIndex);
    if (!q) return base;
    return base.filter(({ row }) => row.some((c) => {
      if (c === null || c === undefined) return false;
      const s = String(c).trim().toLowerCase();
      return exact ? s === q : s.includes(q);
    }));
  }, [sheet, query, headerRowIndex, exact]);
  const visible = showAll ? filtered : filtered.slice(0, VISIBLE_CAP);
  /**
   * ── A ROW WITH FEWER CELLS THAN ITS HEADER IS NOT PLACED BY POSITION (XA-20)
   *
   * The extracted tables keep a row's cells in printed order and drop the ones
   * the statement left blank — so Goldstandard's bank-book "Opening Balance"
   * prints 8 cells against 10 headings, and drawing cell c under heading c put
   * its balance, ₹3,20,63,226.81, under "expenses". The row's own record in
   * document.json has it right; this grid cannot say which heading each cell
   * belongs to, so such a row is shown in printed order across the width, and
   * says so, rather than as a figure under the wrong heading.
   */
  const isShortRow = (row: Cell[]) => !!headerRow && row.length < headerRow.length
    && row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "").length >= 2;
  const shortCount = filtered.filter(({ row }) => isShortRow(row)).length;

  const totalSheets = manifest.reduce((n, f) => n + f.sheets.length, 0);
  // A partially-parsed document still has sheets worth reading; only a document
  // with nothing extracted is unusable.
  const okFiles = manifest.filter((f) => f.sheets.length).length;

  function downloadCsv() {
    if (!sheet) return;
    const esc = (v: Cell) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = sheet.rows.map((r) => Array.from({ length: ncols }, (_, c) => esc(r[c] ?? null)).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${fileKey}__${sheetKey}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (status === "restricted") {
    return (
      <div className="flex h-full flex-col">
        <div className="grid flex-1 place-items-center py-16 text-center">
          <div className="max-w-lg">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-slate-100">Couldn't load the archive</h2>
            <p className="mt-2 text-sm text-slate-400">
              The audit archive under <span className="mono text-slate-300">public/audit/</span> couldn't be fetched.
              This usually means the site is still deploying or the network is briefly unavailable — refresh to retry.
              It is not a sign-in problem: this data is served statically, so signing in again will not change it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Sources" title="Original statement tables"
        subtitle="Extracted statement tables — one entry per source document, exactly as parsed."
        right={<span className="inline-flex items-center gap-1.5">
          {/* Always STATEMENT: these ARE the source tables. A live price has no
              business anywhere on this page. */}
          <BasisPill statement liveText="Statement tables"
            hint="Every table here is the extracted statement exactly as parsed. The live price feed is never applied to this page." />
          {status === "ready" ? <Pill tone="info">{okFiles} documents · {totalSheets} tables</Pill> : null}
        </span>} />

      {/* Workbook selector */}
      <div className="mb-3 flex flex-wrap gap-2">
        {manifest.map((f) => {
          const locked = f.sheets.length === 0;
          const active = f.fileKey === fileKey;
          return (
            <button key={f.fileKey} type="button" disabled={locked}
              onClick={() => { if (!locked) { setFileKey(f.fileKey); setSheetKey(f.sheets[0]?.key ?? ""); } }}
              title={locked ? "Nothing could be extracted from this document" : f.source}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] transition-colors ${
                active ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400"
                : locked ? "cursor-not-allowed border-ink-700 bg-ink-800/40 text-slate-600"
                : "border-ink-700 bg-ink-800 text-slate-300 hover:bg-ink-700/60"}`}>
              {locked ? <Lock className="h-3.5 w-3.5" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              <span className="font-medium" data-xa="audit-chip" data-file={f.fileKey}>{labels.get(f.fileKey) ?? f.label}</span>
              {locked && <span className="text-[10px] uppercase tracking-wide">locked</span>}
              {!locked && <span className="text-slate-500">· {f.sheets.length}</span>}
            </button>
          );
        })}
      </div>

      {/* Sheet tabs */}
      {currentFile && (
        <div className="mb-3 flex flex-wrap gap-1.5 border-b border-ink-700 pb-3">
          {currentFile.sheets.map((s) => {
            const active = s.key === sheetKey;
            return (
              <button key={s.key} type="button" onClick={() => setSheetKey(s.key)}
                className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                  active ? "bg-ink-700 text-slate-100" : "text-slate-400 hover:bg-ink-700/40 hover:text-slate-200"}`}>
                {s.name} <span className="mono text-[10px] text-slate-500">{s.rows}×{s.cols}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setExact(false); }} placeholder="Search this sheet…"
            className="w-72 rounded-md border border-ink-700 bg-ink-800 py-2 pl-9 pr-3 text-sm text-slate-200 ring-focus" />
        </div>
        {sheet && (
          <span className="text-[12px] text-slate-500">
            Showing <span className="mono text-slate-300">{visible.length.toLocaleString("en-IN")}</span> of{" "}
            <span className="mono text-slate-300">{filtered.length.toLocaleString("en-IN")}</span>
            {query ? ` matching rows` : ` rows`}
          </span>
        )}
        {sheet && shortCount > 0 && (
          <span className="text-[12px] text-amber-400" data-xa="audit-short-note" data-count={shortCount}
            title="These rows printed fewer cells than the table has headings, so which heading each cell belongs to is not recorded here. They are shown in printed order across the row rather than placed under a heading by position; each one's normalized record is in the document's own document.json.">
            · {shortCount.toLocaleString("en-IN")} row{shortCount === 1 ? "" : "s"} with fewer cells than headings, shown unaligned
          </span>
        )}
        {sheet && !showAll && filtered.length > VISIBLE_CAP && (
          <button onClick={() => setShowAll(true)}
            className="rounded-md border border-ink-700 bg-ink-800 px-3 py-1.5 text-[12px] text-slate-300 hover:bg-ink-700/60">
            Load all {filtered.length.toLocaleString("en-IN")} rows
          </button>
        )}
        <div className="ml-auto">
          {sheet && (
            <button onClick={downloadCsv}
              className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800 px-3 py-1.5 text-[12px] text-slate-300 hover:bg-ink-700/60">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <Card pad={false} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          {status === "loading" || sheetLoading ? (
            <div className="grid h-40 place-items-center text-sm text-slate-500">Loading…</div>
          ) : !sheet ? (
            <div className="grid h-40 place-items-center text-sm text-slate-500">
              <div className="flex items-center gap-2"><Table2 className="h-4 w-4" /> Select a workbook and sheet.</div>
            </div>
          ) : (
            /* ── A WORKBOOK REPRODUCED AS THE STATEMENT PUBLISHED IT ──────
               Exempt, and it says so in the markup. This is not a table this
               app composed: it is a spreadsheet viewer, with the source's own
               column letters across the top, its own row numbers down the side
               and its rows pinned in workbook order — which is the whole point
               of a provenance page. Sorting its rows or moving a column would
               make the grid stop matching the document a reader is checking
               against, which is the one thing it exists to do. */
            <table className="border-separate border-spacing-0 text-[12px]"
              data-table-static="a spreadsheet reproduced in the source's own row and column order — this page exists to be checked against the document, so neither may be rearranged">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 border-b border-r border-ink-700 bg-ink-900 px-2 py-1.5 text-slate-600" />
                  {Array.from({ length: ncols }, (_, c) => (
                    <th key={c} className="label-xs whitespace-nowrap border-b border-r border-ink-700 bg-ink-900 px-3 py-1.5 text-center font-medium">
                      {colLabel(c)}
                    </th>
                  ))}
                </tr>
                {/* Sheet preamble — titles/notes that sit above the heading row in the
                    workbook. Kept here so the on-screen order matches the source exactly. */}
                {preambleRows.map(({ i, row }) => (
                  <tr key={`pre-${i}`}>
                    <th className="sticky left-0 z-30 border-b border-r border-ink-700 bg-ink-900 px-2 py-1 text-right mono text-[10px] font-normal text-slate-600">{i + 1}</th>
                    {Array.from({ length: ncols }, (_, c) => {
                      const { text, num, full } = fmtCell(row[c] ?? null, colDecimals[c]);
                      return (
                        <td key={c} title={full}
                          className={`max-w-[280px] truncate border-b border-r border-ink-700 bg-ink-900/60 px-3 py-1 text-[11px] italic text-slate-400 ${num ? "text-right mono not-italic" : "text-left"}`}>
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {headerRow && (
                  <tr>
                    <th className="sticky left-0 z-30 border-b border-r border-ink-700 bg-ink-800 px-2 py-1.5 text-[10px] text-slate-500">{headerRowIndex + 1}</th>
                    {Array.from({ length: ncols }, (_, c) => {
                      const { text } = fmtCell(headerRow[c] ?? null);
                      return (
                        <th key={c} title={text}
                          className="max-w-[280px] truncate border-b border-r border-ink-700 bg-ink-800 px-3 py-1.5 text-left text-[11px] font-semibold text-slate-200">
                          {text || <span className="text-slate-600">—</span>}
                        </th>
                      );
                    })}
                  </tr>
                )}
              </thead>
              <tbody>
                {visible.map(({ i, row }) => isShortRow(row) ? (
                  <tr key={i} className="hover:bg-ink-700/30" data-xa="audit-short-row" data-row={i + 1}
                    data-cells={row.length} data-cols={headerRow?.length ?? 0}>
                    <td className="sticky left-0 z-10 border-b border-r border-ink-700 bg-ink-900 px-2 py-1 text-right mono text-[10px] text-slate-600">
                      {i + 1}
                    </td>
                    <td colSpan={ncols} className="border-b border-r border-ink-700/60 px-3 py-1 text-slate-300"
                      title={`This row printed ${row.length} cells against the table's ${headerRow?.length ?? 0} headings, so which heading each cell belongs to is not recorded — they are shown in printed order rather than placed by position.`}>
                      <span className="mono">{row.map((c, ci) => fmtCell(c ?? null, colDecimals[ci]).text || "·").join("   ")}</span>
                      <span className="ml-3 text-[10.5px] text-amber-400">{row.length} of {headerRow?.length ?? 0} cells · placement not recorded</span>
                    </td>
                  </tr>
                ) : (
                  <tr key={i} className="hover:bg-ink-700/30">
                    <td className="sticky left-0 z-10 border-b border-r border-ink-700 bg-ink-900 px-2 py-1 text-right mono text-[10px] text-slate-600">
                      {i + 1}
                    </td>
                    {Array.from({ length: ncols }, (_, c) => {
                      const { text, num, full } = fmtCell(row[c] ?? null, colDecimals[c]);
                      const q = query.trim().toLowerCase();
                      const cell = text.trim().toLowerCase();
                      const hit = q !== "" && (exact ? cell === q : cell.includes(q));
                      return (
                        <td key={c} title={full}
                          className={`max-w-[280px] truncate border-b border-r border-ink-700/60 px-3 py-1 ${
                            num ? "text-right mono" : ""} ${hit ? "bg-champagne-500/20 font-medium text-champagne-200" : "text-slate-300"}`}>
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

export function DataAudit() {
  const [params] = useSearchParams();
  const [sourceCount, setSourceCount] = useState<number | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(() => params.has("file") || params.has("sources") || params.has("find") || params.has("eq"));
  const sourcesRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (params.has("file") || params.has("sources") || params.has("find") || params.has("eq")) {
      setSourcesOpen(true);
      requestAnimationFrame(() => sourcesRef.current?.scrollIntoView({ block: "start" }));
    }
  }, [params, sourceCount]);
  return <div className="flex min-w-0 flex-col">
    <PageHeader eyebrow="Admin" title="Data Audit" subtitle="Glow Ventures consolidated sheet. Updated automatically as new statements are wired into the dashboard."
      right={<BasisPill statement liveText="Consolidated statement data" hint="The consolidated sheet uses the canonical statement and review book, with each account's own date. Live quotes do not change the audit record." />} />
    <ConsolidatedSheet onSources={() => setSourcesOpen(true)} onLoaded={setSourceCount} />
    <details ref={sourcesRef} open={sourcesOpen} onToggle={e => setSourcesOpen(e.currentTarget.open)} className="mt-8 border-t border-ink-700 pt-4" data-audit-sources="footnote" data-xa="audit-sources" data-open={String(sourcesOpen)}>
      <summary className="cursor-pointer text-sm font-medium text-slate-400">Sources{sourceCount != null ? ` · ${sourceCount} original documents` : ""}</summary>
      <p data-prose-ok="source footnote requested by the customer" className="my-3 text-xs text-slate-500">Original extracted tables support the consolidated sheet above. Open a document to inspect its statement rows.</p>
      {sourcesOpen && <SourceArchive />}
    </details>
  </div>;
}
