import { ExportableTable } from "@/components/ExportableTable";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { X, FileText, FileSpreadsheet, Loader2, Download, Lock, Table2, ArrowLeft } from "lucide-react";
import type { WorkSheet } from "xlsx";
import { Pill } from "@/components/Pill";
import { AbsentSection, DASH } from "@/components/Absent";
import { ViewToggle, type ViewDef } from "@/components/ViewToggle";
import { fmtDate } from "@/lib/format";
import type { LibraryDoc } from "@/lib/statementLibrary";
import {
  cellText, columnLetters, fileSize, hasText, isSheetFormat, mergeLayout, sheetRows, unreadReason, sourceSheetIndex,
  type GridCell, type GridMerge, type PageText, type PublishedFile, type StatementFileIndex,
} from "@/lib/statementPreview";
import { usePreviewDialog } from '@/lib/usePreviewDialog';
import { isinBeforePage } from '@/lib/pdfSourceHighlight';
import { sourcePage } from '@/lib/sourceTrace';
import { loadPdfPreview, preloadPdfPreview } from '@/lib/pdfPreviewLoader';

const BASE = import.meta.env.BASE_URL;
const OriginalPdf = lazy(loadPdfPreview);

export function prepareStatementPreview() {
  preloadPdfPreview();
  void loadIndex().catch(() => {});
}
/** Rows a sheet shows before "Show more" — a broker's tape runs to thousands. */
const ROW_STEP = 500;

/** The open file lives in the address (`?file=<docKey>`), as the open folder
 *  does, so a preview is linkable and the browser's Back button closes it. */
const FILE_PARAM = "file";

/** Which file's preview is open, and how to open and close one. */
export function useFilePreview() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const openKey = params.get(FILE_PARAM);
  // Opened from this page, the preview added a history entry, so closing it
  // steps back over that entry; arrived at by a link, there is none to step
  // back to and the parameter is dropped in place.
  const pushed = useRef(false);
  useEffect(() => { if (!openKey) pushed.current = false; }, [openKey]);
  const open = useCallback((docKey: string) => {
    pushed.current = true;
    setParams((p) => { p.set(FILE_PARAM, docKey); return p; });
  }, [setParams]);
  const close = useCallback(() => {
    if (pushed.current) { pushed.current = false; navigate(-1); return; }
    setParams((p) => { for (const key of [FILE_PARAM, 'record', 'field', 'isin', 'security', 'sourceValue', 'sheet', 'rows', 'path']) p.delete(key); return p; }, { replace: true });
  }, [navigate, setParams]);
  return { openKey, open, close };
}

type Loaded =
  | { status: "loading" }
  | { status: "ready"; pages: PageText[] }
  | { status: "unread"; reason: string }
  | { status: "unavailable"; reason: string };

const getJson = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));

/** The file's text as the archive holds it, or the reason it holds none. */
function usePages(docKey: string): Loaded {
  const [state, setState] = useState<Loaded>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    const dir = `${BASE}audit/${encodeURIComponent(docKey)}`;
    getJson(`${dir}/pages.json`)
      .then(async (j: { pages?: PageText[] }) => {
        const pages = (j.pages ?? []).filter((p) => typeof p.text === "string");
        if (hasText(pages)) return { status: "ready", pages } as Loaded;
        // NOTHING WAS READ FROM THIS FILE — its document record names the cause
        // (a scan with no text layer, a removal notice in place of a workbook).
        const doc = await getJson(`${dir}/document.json`).catch(() => null);
        return {
          status: "unread",
          reason: unreadReason(doc?.warnings) ?? "The ingest pipeline read no text from this file.",
        } as Loaded;
      })
      .catch((e: Error) => ({
        status: "unavailable",
        reason: `The statement archive did not return this file's contents (${e.message}).`,
      }) as Loaded)
      .then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [docKey]);
  return state;
}

// ── THE ORIGINAL FILE ────────────────────────────────────────────────────────

type Original =
  | { status: "loading" }
  | { status: "ready"; file: PublishedFile; url: string; previewUrl: string }
  | { status: "missing"; reason: string };

// One index per page load: it lists every file the build published.
let indexLoad: Promise<StatementFileIndex> | null = null;
const loadIndex = () => (indexLoad ??= getJson(`${BASE}statement-files/index.json`).catch((e) => {
  indexLoad = null;
  throw e;
}));

/** The published original of this document, or why this build carries none. */
function useOriginal(docKey: string): Original {
  const [state, setState] = useState<Original>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    loadIndex()
      .then((index): Original => {
        const file = index.files?.[docKey];
        if (file) {
          const url = `${BASE}statement-files/${encodeURIComponent(file.file)}`;
          return { status: "ready", file, url,
            previewUrl: file.preview ? `${BASE}api/statement-previews/${encodeURIComponent(file.preview.file)}` : url };
        }
        return { status: "missing", reason: index.missing?.[docKey] ?? "This build did not publish the original file." };
      })
      .catch((e: Error): Original => ({ status: "missing", reason: `The list of published files did not load (${e.message}).` }))
      .then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [docKey]);
  return state;
}

/** A sheet ready to draw: rows of cells, the widest row's width, its merged blocks. */
interface Grid {
  rows: GridCell[][];
  cols: number;
  merges: GridMerge[];
}

/** A sheet of the text as read — tab-separated rows — as a grid. */
function textGrid(text: string): Grid {
  const { rows, cols } = sheetRows(text);
  return { rows: rows.map((r) => r.map(cellText)), cols, merges: [] };
}

/**
 * A worksheet of the original workbook as a grid, from A1 so the column letters
 * are the file's own. Each cell shows its formatted text — the number and date
 * formats the provider set, as Excel shows them — with the stored value on
 * hover. The extent is the last cell that holds anything: a workbook's own range
 * is often padded far past its data.
 */
function workbookGrid(XLSX: typeof import("xlsx"), ws: WorkSheet, textual: boolean): Grid {
  let lastRow = -1;
  let lastCol = -1;
  for (const key of Object.keys(ws)) {
    if (key.startsWith("!")) continue;
    const cell = ws[key];
    if (cell?.v == null && cell?.w == null) continue;
    if (String(cell.w ?? cell.v).trim() === "") continue;
    const at = XLSX.utils.decode_cell(key);
    lastRow = Math.max(lastRow, at.r);
    lastCol = Math.max(lastCol, at.c);
  }
  const rows: GridCell[][] = [];
  for (let r = 0; r <= lastRow; r++) {
    const row: GridCell[] = [];
    for (let c = 0; c <= lastCol; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell?.v == null && cell?.w == null) { row.push({ text: "", full: "", numeric: false }); continue; }
      const text = String(cell.w ?? cell.v);
      const stored = cell.v == null ? text : String(cell.v);
      // A text file's cells are all text, so a figure in one is aligned by its look.
      row.push({ text, full: stored, numeric: cell.t === "n" || (textual && cellText(text).numeric) });
    }
    rows.push(row);
  }
  const merges = ((ws["!merges"] ?? []) as GridMerge[])
    .filter((m) => m.s.r <= lastRow && m.s.c <= lastCol)
    .map((m) => ({ s: m.s, e: { r: Math.min(m.e.r, lastRow), c: Math.min(m.e.c, lastCol) } }));
  return { rows, cols: lastCol + 1, merges };
}

type Workbook =
  | { status: "loading" }
  | { status: "ready"; sheets: SheetView[] }
  | { status: "failed"; reason: string };

interface SheetView {
  key: string;
  label: string;
  grid: Grid;
}

/** The original spreadsheet, opened in the browser with the workbook reader. */
function useWorkbook(url: string, format: string): Workbook {
  const [state, setState] = useState<Workbook>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    const csv = format === "CSV" || format === "TSV";
    Promise.all([import("xlsx"), fetch(url, { cache: "no-store" })])
      .then(async ([XLSX, r]) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const bytes = new Uint8Array(await r.arrayBuffer());
        // A TEXT FILE IS SHOWN AS WRITTEN. A CSV, or a broker's HTML table saved
        // as .xls (LKP's export), carries its values as characters, and the
        // reader would otherwise parse them: "01/07/2026" (1 July) became a date
        // serial read month-first as 7 January. `raw` keeps every cell's text;
        // a binary workbook's cells are typed by the file and are unaffected.
        // Its built-in short date (format 14) follows the reader's locale in
        // Excel; the workbook reader would draw it month-first, so it is drawn
        // day-first, as these statements print dates.
        const textual = csv || /^\s*</.test(new TextDecoder().decode(bytes.subarray(0, 64)));
        const wb = csv
          ? XLSX.read(new TextDecoder().decode(bytes), { type: "string", raw: true })
          : XLSX.read(bytes, { type: "array", raw: true, dateNF: "dd/mm/yyyy" });
        const sheets = wb.SheetNames.map((name) => ({ key: name, label: name, grid: workbookGrid(XLSX, wb.Sheets[name], textual) }));
        return { status: "ready", sheets } as Workbook;
      })
      .catch((e: Error) => ({
        status: "failed",
        reason: `The browser could not open this workbook (${e.message}). Download it to open it in Excel, or see its text as read.`,
      }) as Workbook)
      .then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [url, format]);
  return state;
}

function OriginalSheets({ url, format }: { url: string; format: string }) {
  const wb = useWorkbook(url, format);
  if (wb.status === "loading") return <Opening what="Opening the workbook…" />;
  if (wb.status === "failed") {
    return (
      <AbsentSection what="This workbook did not open here" needs={wb.reason}>
        <p className="max-w-xl text-xs text-slate-500" data-prose-ok="why the original workbook did not open">{wb.reason}</p>
      </AbsentSection>
    );
  }
  return <SheetTabs sheets={wb.sheets} sourceLocation />;
}

function Opening({ what }: { what: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> {what}
    </div>
  );
}

// ── THE TEXT AS READ ─────────────────────────────────────────────────────────

/** A PDF's pages, one after another, each as the text it carries. */
function PageList({ pages }: { pages: PageText[] }) {
  return (
    <div className="space-y-4" data-preview-pages={pages.length}>
      {pages.map((p) => (
        <section key={p.page} className="rounded-lg border border-ink-700 bg-ink-800" data-preview-page={p.page}>
          <div className="border-b border-ink-700 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Page {p.page}
          </div>
          {p.text.trim()
            ? <pre className="mono whitespace-pre-wrap break-words px-4 py-3 text-[12px] leading-relaxed text-slate-200"
                data-prose-ok="the statement's own text, as read from the file">{p.text}</pre>
            : <div className="px-4 py-3 text-xs text-slate-500" title="This page of the file carries no text">{DASH}</div>}
        </section>
      ))}
    </div>
  );
}

const EMPTY_CELL: GridCell = { text: "", full: "", numeric: false };

/** One sheet as a grid: column letters across, row numbers down, merged blocks
 *  drawn as one cell. */
function SheetGrid({ grid, sourceSelected }: { grid: Grid; sourceSelected?: boolean }) {
  const { rows, cols, merges } = grid;
  const [shown, setShown] = useState(ROW_STEP);
  const [params] = useSearchParams();
  const selectedRows = useMemo(() => new Set(sourceSelected ? (params.get('rows') ?? '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= rows.length) : []), [params, rows.length, sourceSelected]);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => setShown(ROW_STEP), [grid]);
  useEffect(() => {
    if (!selectedRows.size) return;
    setShown(n => Math.max(n, ...selectedRows));
    const frame = requestAnimationFrame(() => host.current?.querySelector('[data-source-row="true"]')?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(frame);
  }, [grid, selectedRows]);
  if (!rows.length) return <AbsentSection what="This sheet is empty" needs="The file carries this sheet with no cells in it." />;
  const body = (allRows: boolean) => {
    const drawn = allRows ? rows.length : Math.min(shown, rows.length);
    const { spans, covered } = mergeLayout(merges, drawn);
    return rows.slice(0, drawn).map((r, i) => (
      <tr key={i} data-source-row={selectedRows.has(i + 1) ? 'true' : undefined} className={selectedRows.has(i + 1) ? 'bg-champagne-500/10' : undefined}>
        <td className="mono px-2 py-1 text-right text-[10.5px] text-slate-600">{i + 1}</td>
        {Array.from({ length: cols }, (_, c) => {
          if (covered.has(`${i}:${c}`)) return null;
          const cell = r[c] ?? EMPTY_CELL;
          const span = spans.get(`${i}:${c}`);
          return (
            <td key={c} rowSpan={span?.rowSpan} colSpan={span?.colSpan} title={cell.full !== cell.text ? cell.full : undefined}
              className={`whitespace-nowrap px-3 py-1 text-slate-200 ${cell.numeric ? "mono text-right" : ""}`}>
              {cell.text}
            </td>
          );
        })}
      </tr>
    ));
  };
  return (
    <div ref={host} data-preview-sheet-rows={rows.length}>
      <div className="overflow-auto rounded-lg border border-ink-700">
        <ExportableTable className="min-w-full border-collapse text-[12px]"
          data-table-static="the file's own sheet, cell for cell as the provider laid it out">
          {allRows => <>
          <thead className="text-left text-[10.5px] uppercase tracking-wide text-slate-500">
            <tr className="border-b border-ink-700">
              <th className="px-2 py-1.5 font-medium" />
              {Array.from({ length: cols }, (_, c) => <th key={c} className="px-3 py-1.5 font-medium">{columnLetters(c)}</th>)}
            </tr>
          </thead>
          <tbody>{body(allRows)}</tbody>
          </>}
        </ExportableTable>
      </div>
      {rows.length > shown && (
        <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
          <span>Rows 1–{shown.toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")}</span>
          <button type="button" onClick={() => setShown((n) => n + ROW_STEP)}
            className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1 font-medium text-slate-300 hover:bg-ink-700">
            Show {Math.min(ROW_STEP, rows.length - shown).toLocaleString("en-IN")} more
          </button>
        </div>
      )}
    </div>
  );
}

/** A workbook's sheets, one tab each — a CSV is a workbook of one. */
function SheetTabs({ sheets, sourceLocation = false }: { sheets: SheetView[]; sourceLocation?: boolean }) {
  const [params] = useSearchParams();
  const requested = params.get('sheet');
  const requestedAt = sourceLocation ? sourceSheetIndex(sheets.map(s => s.key), requested) : null;
  const [at, setAt] = useState(() => requestedAt ?? 0);
  if (!sheets.length) return <AbsentSection what="This workbook has no sheets" needs="The file carries no worksheet to show." />;
  const sheet = sheets[Math.min(at, sheets.length - 1)];
  return (
    <div>
      {sourceLocation && requested && requestedAt === null && <p role="alert" className="mb-2 text-xs text-slate-400" data-prose-ok="unresolved worksheet citation">The cited worksheet could not be uniquely identified. Select a sheet below to inspect the original.</p>}
      {sheets.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Sheets in this file">
          {sheets.map((s, i) => (
            <button key={s.key} type="button" role="tab" aria-selected={i === at} onClick={() => setAt(i)}
              data-preview-sheet-tab={s.key}
              className={`rounded-md border px-3 py-1 text-xs font-medium ${i === at
                ? "border-champagne-500/50 bg-champagne-500/10 text-champagne-400"
                : "border-ink-600 bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      <SheetGrid grid={sheet.grid} sourceSelected={at === requestedAt} />
    </div>
  );
}

/** The text as read of a spreadsheet: its sheets, numbered as the reader wrote them. */
function TextSheets({ pages }: { pages: PageText[] }) {
  const sheets = useMemo(() => pages.map((p) => ({ key: String(p.page), label: `Sheet ${p.page}`, grid: textGrid(p.text) })), [pages]);
  return <SheetTabs sheets={sheets} />;
}

type View = "original" | "text";
const VIEWS: readonly ViewDef<View>[] = [
  { key: "original", label: "Original file", icon: FileText, title: "The file as the provider sent it" },
  { key: "text", label: "Text as read", icon: Table2,
    title: "The text the ingest pipeline read from this file — the record every figure on this site is built from" },
];

const ACTION = "inline-flex shrink-0 items-center gap-1 rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-ink-700";

/**
 * THE PREVIEW WINDOW. Opened from a file's row in a Statement Library folder;
 * Escape, the close button or a click outside the window closes it.
 *
 * It opens on the ORIGINAL FILE — a PDF drawn inside the app, a workbook
 * drawn from its own cells — with the TEXT AS READ one switch away, so a reader
 * can hold the two side by side. Each view says which it is; a file this build
 * did not publish opens on its text and says why, and a file the pipeline could
 * not read says why in the archive's words, through `AbsentSection`.
 *
 * Opened deliberately, it shows the statement whole: like Data Audit's raw page
 * text, a document may name the ring-fenced holding (the family's own email
 * domain is on many statements), which is why no route opens one by default.
 */
export function StatementPreview({ doc, onClose, backLabel }: { doc: LibraryDoc; onClose: () => void; backLabel?: string }) {
  const [params] = useSearchParams();
  const loaded = usePages(doc.fileKey);
  const original = useOriginal(doc.fileKey);
  const [picked, setPicked] = useState<View | null>(null);
  const view: View = picked ?? (original.status === "missing" ? "text" : "original");
  const published = original.status === "ready" ? original : null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const sheet = isSheetFormat(doc.format);
  // The PDF viewer takes the whole window and scrolls itself.
  const fills = view === "original" && !!published && !sheet;

  usePreviewDialog(onClose, dialogRef, closeRef);

  const count = loaded.status === "ready" ? loaded.pages.length : null;
  const selectedPage = loaded.status === 'ready' ? sourcePage(loaded.pages, params.get('isin'), params.get('sourceValue')) : undefined;
  const meta = [doc.owner, doc.accountNo, doc.asOf ? fmtDate(doc.asOf) : null, doc.delivery].filter(Boolean);

  // Portalled into `#root`, as the chat dialog is: `#root` carries `--app-zoom`,
  // so the window keeps the app's scale, and `fixed inset-0` resolves against
  // the viewport rather than an ancestor with a filter. Sized as a share of the
  // overlay, never in `vh` (index.css).
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/70 p-6 backdrop-blur-xl"
      onMouseDownCapture={e => e.stopPropagation()}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${doc.reportLabel} — ${doc.fileName}`}
        data-statement-preview={doc.fileKey} data-preview-state={loaded.status} data-preview-format={doc.format}
        data-preview-view={view} data-preview-original={original.status}
        className="flex h-full max-h-[880px] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">

        <div className="flex flex-wrap items-start gap-3 border-b border-ink-700 px-4 py-3 sm:flex-nowrap">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border border-champagne-500/30 bg-champagne-500/10 text-champagne-400">
            {sheet ? <FileSpreadsheet className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-slate-100">{doc.reportLabel}</span>
              <Pill>{doc.format}</Pill>
              {published && <Pill>{fileSize(published.file.bytes)}</Pill>}
              {published?.file.encrypted && !published.file.preview && (
                <Pill tone="warn" icon={<Lock className="h-3 w-3" />}>
                  <span title="This PDF opens with its account holder's statement password, and the viewer asks for it. Its text, as read, needs none.">
                    Password-protected
                  </span>
                </Pill>
              )}
              {published?.file.part && (
                <Pill tone="info">
                  <span title="This statement is one part of a bundled PDF; the viewer opens the file at its first page.">
                    {published.file.part.from === published.file.part.to
                      ? `Page ${published.file.part.from} of the file`
                      : `Pages ${published.file.part.from}–${published.file.part.to} of the file`}
                  </span>
                </Pill>
              )}
              {view === "text" && count != null && (
                <Pill tone="info">{count} {sheet ? (count === 1 ? "sheet" : "sheets") : (count === 1 ? "page" : "pages")}</Pill>
              )}
            </div>
            <div className="mono mt-1 truncate text-[11.5px] text-slate-400" title={doc.fileName}>{doc.fileName}</div>
            {meta.length > 0 && <div className="mt-0.5 text-[11px] text-slate-500">{meta.join(" · ")}</div>}
          </div>
          <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto">
            {backLabel && <button type="button" onClick={onClose} className={ACTION} data-source-back><ArrowLeft className="h-3.5 w-3.5" />{backLabel}</button>}
            {published && (
              <>
                <a href={published.url} download={doc.fileName} className={ACTION} title={`Download ${doc.fileName}`} data-preview-download>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </>
            )}
            {doc.hasSheets && (
              <Link to={`/audit?file=${encodeURIComponent(doc.fileKey)}`} className={ACTION}
                title="Open what was read from this file, table by table, in Data Audit">
                <Table2 className="h-3.5 w-3.5" /> Data Audit
              </Link>
            )}
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close preview" title="Close (Esc)"
              className="btn-ghost h-8 shrink-0 px-2">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-4 pt-3">
          <ViewToggle views={VIEWS} active={view} onChange={setPicked} />
        </div>

        <div className={`min-h-0 flex-1 px-4 pb-4 ${fills ? "flex flex-col" : "overflow-auto"}`}>
          {view === "original" && original.status === "loading" && <Opening what="Opening the file…" />}
          {view === "original" && original.status === "missing" && (
            <AbsentSection what="The original file is not in this build" needs={original.reason}>
              <p className="max-w-xl text-xs text-slate-500" data-prose-ok="why the original file is not shown">{original.reason}</p>
            </AbsentSection>
          )}
          {view === "original" && published && (sheet
            ? <OriginalSheets url={published.url} format={doc.format} />
            : <Suspense fallback={<Opening what="Opening PDF…" />}>
                <OriginalPdf key={published.previewUrl} url={published.previewUrl} file={published.file} initialPage={selectedPage}
                  sourceTarget={loaded.status !== 'loading' && params.get('sourceValue') && params.get('isin') ? {
                    value: params.get('sourceValue')!, isin: params.get('isin')!, field: params.get('field'),
                    initialIsin: loaded.status === 'ready' && selectedPage ? isinBeforePage(loaded.pages, selectedPage) : null,
                  } : undefined} title={`${doc.reportLabel} — ${doc.fileName}`} />
              </Suspense>)}

          {view === "text" && loaded.status === "loading" && <Opening what="Opening the file…" />}
          {view === "text" && loaded.status !== "loading" && loaded.status !== "ready" && (
            <AbsentSection what={loaded.status === "unread" ? "Nothing could be read from this file" : "This file's contents did not load"}
              needs={loaded.reason}>
              <p className="max-w-xl text-xs text-slate-500" data-prose-ok="why this file has no contents to show">{loaded.reason}</p>
            </AbsentSection>
          )}
          {view === "text" && loaded.status === "ready" && (sheet ? <TextSheets pages={loaded.pages} /> : <PageList pages={loaded.pages} />)}
        </div>
      </div>
    </div>,
    document.getElementById("root") ?? document.body,
  );
}
