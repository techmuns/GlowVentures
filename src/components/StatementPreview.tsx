import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { X, ExternalLink, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { Pill } from "@/components/Pill";
import { AbsentSection, DASH } from "@/components/Absent";
import { fmtDate } from "@/lib/format";
import type { LibraryDoc } from "@/lib/statementLibrary";
import { cellText, columnLetters, hasText, isSheetFormat, sheetRows, unreadReason, type PageText } from "@/lib/statementPreview";

const BASE = import.meta.env.BASE_URL;
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
    setParams((p) => { p.delete(FILE_PARAM); return p; }, { replace: true });
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

/** One sheet laid back out as a grid: column letters across, row numbers down. */
function SheetGrid({ text }: { text: string }) {
  const { rows, cols } = useMemo(() => sheetRows(text), [text]);
  const [shown, setShown] = useState(ROW_STEP);
  useEffect(() => setShown(ROW_STEP), [text]);
  if (!rows.length) return <AbsentSection what="This sheet is empty" needs="The file carries this sheet with no cells in it." />;
  const visible = rows.slice(0, shown);
  return (
    <div data-preview-sheet-rows={rows.length}>
      <div className="overflow-auto rounded-lg border border-ink-700">
        <table className="min-w-full border-collapse text-[12px]"
          data-table-static="the file's own sheet, cell for cell as the provider laid it out">
          <thead className="text-left text-[10.5px] uppercase tracking-wide text-slate-500">
            <tr className="border-b border-ink-700">
              <th className="px-2 py-1.5 font-medium" />
              {Array.from({ length: cols }, (_, c) => <th key={c} className="px-3 py-1.5 font-medium">{columnLetters(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={i}>
                <td className="mono px-2 py-1 text-right text-[10.5px] text-slate-600">{i + 1}</td>
                {Array.from({ length: cols }, (_, c) => {
                  const cell = cellText(r[c] ?? "");
                  return (
                    <td key={c} title={cell.full !== cell.text ? cell.full : undefined}
                      className={`whitespace-nowrap px-3 py-1 text-slate-200 ${cell.numeric ? "mono text-right" : ""}`}>
                      {cell.text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
function SheetTabs({ pages }: { pages: PageText[] }) {
  const [at, setAt] = useState(0);
  const sheet = pages[Math.min(at, pages.length - 1)];
  return (
    <div>
      {pages.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Sheets in this file">
          {pages.map((p, i) => (
            <button key={p.page} type="button" role="tab" aria-selected={i === at} onClick={() => setAt(i)}
              data-preview-sheet-tab={p.page}
              className={`rounded-md border px-3 py-1 text-xs font-medium ${i === at
                ? "border-champagne-500/50 bg-champagne-500/10 text-champagne-400"
                : "border-ink-600 bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
              Sheet {p.page}
            </button>
          ))}
        </div>
      )}
      <SheetGrid text={sheet.text} />
    </div>
  );
}

/**
 * THE PREVIEW WINDOW. Opened from a file's row in a Statement Library folder;
 * Escape, the close button or a click outside the window closes it.
 *
 * WHAT IT SHOWS ON ITS FACE: the text as read from the file, labelled so, with
 * the original file's name — a reader is never left to think the page drew the
 * statement's own layout. A file the pipeline could not read says why, in the
 * archive's words, through `AbsentSection`.
 *
 * Opened deliberately, it shows the statement whole: like Data Audit's raw page
 * text, a document may name the ring-fenced holding (the family's own email
 * domain is on many statements), which is why no route opens one by default.
 */
export function StatementPreview({ doc, onClose }: { doc: LibraryDoc; onClose: () => void }) {
  const loaded = usePages(doc.fileKey);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const sheet = isSheetFormat(doc.format);

  // Focus moves into the window when it opens and back to the row that opened
  // it when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close.current(); } };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); opener?.focus?.(); };
  }, []);

  const count = loaded.status === "ready" ? loaded.pages.length : null;
  const meta = [doc.owner, doc.accountNo, doc.asOf ? fmtDate(doc.asOf) : null, doc.delivery].filter(Boolean);

  // Portalled into `#root`, as the chat dialog is: `#root` carries `--app-zoom`,
  // so the window keeps the app's scale, and `fixed inset-0` resolves against
  // the viewport rather than an ancestor with a filter. Sized as a share of the
  // overlay, never in `vh` (index.css).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-6 backdrop-blur-xl"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`${doc.reportLabel} — ${doc.fileName}`}
        data-statement-preview={doc.fileKey} data-preview-state={loaded.status} data-preview-format={doc.format}
        className="flex h-full max-h-[880px] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">

        <div className="flex items-start gap-3 border-b border-ink-700 px-4 py-3">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border border-champagne-500/30 bg-champagne-500/10 text-champagne-400">
            {sheet ? <FileSpreadsheet className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-slate-100">{doc.reportLabel}</span>
              <Pill>{doc.format}</Pill>
              {count != null && <Pill tone="info">{count} {sheet ? (count === 1 ? "sheet" : "sheets") : (count === 1 ? "page" : "pages")}</Pill>}
              {count != null && <Pill><span title="The text the ingest pipeline read from this file — the record every figure on this site is built from. The file's own layout and styling are not reproduced.">Text as read</span></Pill>}
            </div>
            <div className="mono mt-1 truncate text-[11.5px] text-slate-400" title={doc.fileName}>{doc.fileName}</div>
            {meta.length > 0 && <div className="mt-0.5 text-[11px] text-slate-500">{meta.join(" · ")}</div>}
          </div>
          {doc.hasSheets && (
            <Link to={`/audit?file=${encodeURIComponent(doc.fileKey)}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-ink-700"
              title="Open what was read from this file, table by table, in Data Audit">
              <ExternalLink className="h-3.5 w-3.5" /> Data Audit
            </Link>
          )}
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close preview" title="Close (Esc)"
            className="btn-ghost h-8 shrink-0 px-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {loaded.status === "loading" && (
            <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Opening the file…
            </div>
          )}
          {loaded.status !== "loading" && loaded.status !== "ready" && (
            <AbsentSection what={loaded.status === "unread" ? "Nothing could be read from this file" : "This file's contents did not load"}
              needs={loaded.reason}>
              <p className="max-w-xl text-xs text-slate-500" data-prose-ok="why this file has no contents to show">{loaded.reason}</p>
            </AbsentSection>
          )}
          {loaded.status === "ready" && (sheet ? <SheetTabs pages={loaded.pages} /> : <PageList pages={loaded.pages} />)}
        </div>
      </div>
    </div>,
    document.getElementById("root") ?? document.body,
  );
}
