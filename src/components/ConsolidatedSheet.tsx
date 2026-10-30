import { useTableExportFilter } from "@/lib/tableExportSnapshot";
import { ExportableTable } from "@/components/ExportableTable";
import { InfiniteTableBody } from "./InfiniteTableBody";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Search, FileSpreadsheet } from "lucide-react";
import { readModel } from "@/lib/readModel";
import type { ConsolidatedBook, ConsolidatedColumn, ConsolidatedCell, ConsolidatedLink } from "@/lib/consolidatedSheet";
import { Card } from "./Card";
import { statementSourceHref } from '@/lib/sourceTrace';
import { SourceLink } from "./SourceLink";

const EMPTY_SCOPE: Record<string, string> = {};

function display(value: ConsolidatedCell, column: ConsolidatedColumn) {
  if (value === null || value === "") return "—";
  if (typeof value !== "number") return value;
  if (column.format.includes("%")) return value.toLocaleString("en-IN", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const precision = /\.([0#]+)/.exec(column.format)?.[1].length ?? (Number.isInteger(value) ? 0 : 2);
  return value.toLocaleString("en-IN", { minimumFractionDigits: precision, maximumFractionDigits: precision });
}
export function ConsolidatedSheet({ onSources, onLoaded }: { onSources: () => void; onLoaded: (count: number) => void }) {
  const [book, setBook] = useState<ConsolidatedBook | null>(null);
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState(false);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    let alive = true;
    setFailed(false);
    readModel<ConsolidatedBook>("consolidated/book.json").then(b => {
      if (!alive) return;
      if (b) { setBook(b); onLoaded(b.documents); } else setFailed(true);
    });
    return () => { alive = false; };
  }, [retry, onLoaded]);
  const sheet = book?.tabs.find(t => t.name === params.get("consolidated")) ?? book?.tabs[0];
  const query = useTableExportFilter(params.get("q") ?? "", "");
  const scopeFilter = useMemo(() => {
    try { const parsed = JSON.parse(params.get("scope") ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed).filter(([k, v]) => typeof v === "string" && sheet?.columns.some(c => c.key === k))) as Record<string, string> : {}; }
    catch { return {}; }
  }, [params, sheet]);
  const scope = useTableExportFilter(scopeFilter, EMPTY_SCOPE);
  const isTransactions = sheet?.name === "Transactions";
  const from = useTableExportFilter(isTransactions ? params.get("from") ?? "" : "", "");
  const to = useTableExportFilter(isTransactions ? params.get("to") ?? "" : "", "");
  const invalidRange = !!from && !!to && from > to;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const dateColumn = sheet?.columns.findIndex(c => c.key === "date") ?? -1;
    return sheet?.rows.map((row, index) => ({ row, index })).filter(({ row }) => {
      const date = row.values[dateColumn];
      return Object.entries(scope).every(([key, v]) => row.values[sheet.columns.findIndex(c => c.key === key)] === v)
        && (!(from || to) || (typeof date === "string" && !!date && (!from || date >= from) && (!to || date <= to)))
        && (!q || row.values.some(v => String(v ?? "").toLowerCase().includes(q)));
    }) ?? [];
  }, [sheet, query, scope, from, to]);
  function setDate(key: "from" | "to", value: string) {
    const next = new URLSearchParams(params);
    next.set("consolidated", "Transactions");
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }
  function navigate(link: ConsolidatedLink) {
    const next = new URLSearchParams();
    if (link.file !== undefined) {
      if (link.file) next.set("file", link.file); else next.set("sources", "1");
      setParams(next); onSources(); return;
    }
    if (link.sheet) next.set("consolidated", link.sheet);
    if (link.find) next.set("q", link.find);
    if (link.where) next.set("scope", JSON.stringify(link.where));
    setParams(next);
  }
  if (failed) return <Card><p className="text-sm text-amber-400">Couldn’t load the consolidated sheet. The source archive is available below.</p><button className="mt-3 text-sm underline" onClick={() => setRetry(n => n + 1)}>Retry</button></Card>;
  if (!book || !sheet) return <Card><p className="text-sm text-slate-500">Loading consolidated sheet…</p></Card>;
  async function download() {
    if (!book) return;
    setExporting(true); setExportError(false);
    try {
      const { downloadConsolidatedExcel } = await import("@/lib/exportConsolidatedExcel");
      await downloadConsolidatedExcel(book, window.location.origin);
    } catch { setExportError(true); }
    finally { setExporting(false); }
  }
  return <section aria-label="Consolidated Sheet" data-consolidated="ready" data-xa="consolidated-sheet" data-tabs={book.tabs.length} className="min-w-0">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-champagne-400" /><h2 className="font-semibold text-slate-100">Consolidated Sheet</h2>
        <span className="text-xs text-slate-500">Glow Ventures · {book.asOf}</span></div>
      <button onClick={download} disabled={exporting} className="inline-flex items-center gap-2 rounded-md border border-champagne-500/40 bg-champagne-500/10 px-3 py-2 text-sm text-champagne-400 disabled:opacity-50">
        <Download className="h-4 w-4" />{exporting ? "Preparing Excel…" : "Download Excel"}
      </button>
    </div>
    {exportError && <p role="alert" className="mb-3 text-sm text-amber-400">Excel download failed. Try Download Excel again.</p>}
    <nav aria-label="Consolidated sheet subtabs" className="mb-4 flex flex-wrap gap-1.5 border-b border-ink-700 pb-3">
      {book.tabs.map(t => <button key={t.name} onClick={() => navigate({ sheet: t.name })} aria-current={t.name === sheet.name ? "page" : undefined}
        className={`rounded-md border px-3 py-1.5 text-xs ${t.name === sheet.name ? "border-champagne-500/40 bg-champagne-500/10 font-semibold text-champagne-400" : "border-ink-700 text-slate-400 hover:bg-ink-700/40 hover:text-slate-200"}`}>{t.name}</button>)}
    </nav>
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <h3 className="text-base font-semibold text-slate-100">{sheet.name}</h3>
      {Object.keys(scope).length > 0 && <button className="rounded-md border border-champagne-500/30 px-2 py-1 text-xs text-champagne-400" onClick={() => { const next = new URLSearchParams(params); next.delete("scope"); setParams(next); }} title="Clear the summary filter">{Object.values(scope).join(" · ")} ×</button>}
      <div className="relative ml-auto"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
        <input aria-label="Search consolidated sheet" value={query} placeholder="Search this sheet…" className="w-64 rounded-md border border-ink-700 bg-ink-800 py-2 pl-8 pr-3 text-sm text-slate-200"
          onChange={e => { const next = new URLSearchParams(params); next.set("consolidated", sheet.name); if (e.target.value) next.set("q", e.target.value); else next.delete("q"); setParams(next, { replace: true }); }} /></div>
    </div>
    {isTransactions && <fieldset aria-label="Transaction date range" className="mb-3 flex min-w-0 flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-xs text-slate-400">From date
        <input type="date" value={from} max={to || undefined} onChange={e => setDate("from", e.target.value)}
          aria-invalid={invalidRange || undefined} aria-describedby={invalidRange ? "transaction-date-error" : undefined}
          className="h-9 w-40 rounded-md border border-ink-700 bg-ink-800 px-2.5 text-sm text-slate-200 ring-focus" />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-400">To date
        <input type="date" value={to} min={from || undefined} onChange={e => setDate("to", e.target.value)}
          aria-invalid={invalidRange || undefined} aria-describedby={invalidRange ? "transaction-date-error" : undefined}
          className="h-9 w-40 rounded-md border border-ink-700 bg-ink-800 px-2.5 text-sm text-slate-200 ring-focus" />
      </label>
      {(from || to) && <button type="button" className="rounded px-2 py-1 text-xs text-champagne-400 ring-focus hover:underline" onClick={() => {
        const next = new URLSearchParams(params); next.delete("from"); next.delete("to"); setParams(next, { replace: true });
      }}>Clear dates</button>}
      {invalidRange && <p id="transaction-date-error" role="alert" className="text-xs text-amber-400">From date must be on or before To date.</p>}
    </fieldset>}
    {!isTransactions && <p data-prose-ok="consolidated template units, valuation basis and missing-input coverage" className="mb-3 max-w-5xl text-xs leading-relaxed text-slate-400">{sheet.note}</p>}
    <Card pad={false}>
      <div className="max-h-[65vh] overflow-auto" data-navigation-scroll="consolidatedsheet-1">
        <ExportableTable exportName={`Consolidated — ${sheet.name}`} className="w-full border-separate border-spacing-0 text-xs" data-table-static="the consolidated workbook keeps one fixed column order so the Excel download and the page read the same">
          <thead className="sticky top-0 z-20"><tr>{sheet.columns.map((c, i) => <th key={c.key} data-col-key={c.key} className={`border-b border-r border-ink-700 bg-ink-800 px-3 py-3 text-left font-semibold text-slate-200 ${i === 0 ? "sticky left-0 z-30" : ""}`}
            style={{ minWidth: Math.min(220, Math.max(100, c.width * 7)), maxWidth: 340 }}><span className="block">{c.label}</span></th>)}</tr></thead>
          <InfiniteTableBody navigationKey="consolidatedsheet-filtered" rows={filtered} columns={sheet.columns.length} resetKey={JSON.stringify([sheet.name, query, scope, from, to])}>{({ row, index }) => <tr key={index} data-consolidated-row={index} className={row.kind ? "font-semibold" : "hover:bg-ink-700/30"}>
            {row.values.map((value, i) => {
              const c = sheet.columns[i], link = row.links?.[c.key];
              const text = display(value, c);
              const target = link?.file ? statementSourceHref({ document: link.file, pointer: link.record, field: link.field,
                isin: link.isin, value: link.field === 'quantity' && typeof value === 'number' ? value : undefined,
                accountId: '', securityKey: '', label: text })
                : link?.file !== undefined ? '/audit?sources=1' : link?.sheet ? `/audit?consolidated=${encodeURIComponent(link.sheet)}${link.find ? `&q=${encodeURIComponent(link.find)}` : ""}${link.where ? `&scope=${encodeURIComponent(JSON.stringify(link.where))}` : ""}` : null;
              return <td key={c.key} data-export-value={value == null ? "—" : value} data-export-type={typeof value === "number" ? "number" : "text"} data-export-format={c.format} title={value == null ? "Not reported or unsupported by the available source record. See the row's Notes." : String(value)}
                className={`border-b border-r border-ink-700/50 px-3 py-2.5 align-top ${typeof value === "number" ? "text-right mono whitespace-nowrap" : "text-left"} ${i === 0 ? "sticky left-0 z-10" : ""} ${row.kind === "group" ? "bg-champagne-500/10 text-champagne-400" : row.kind === "total" ? "bg-ink-700 text-slate-100" : "bg-ink-900 text-slate-300"}`} style={{ maxWidth: 340 }}>
                {target && value != null ? <SourceLink to={target} className="text-champagne-400 underline decoration-champagne-500/40 underline-offset-2 hover:decoration-champagne-400">{text}</SourceLink>
                  : typeof value === "string" && value.length > 120 ? <span className="line-clamp-3">{text}</span> : text}
              </td>;
            })}</tr>}</InfiniteTableBody>
        </ExportableTable>
        {!filtered.length && <p className="p-6 text-sm text-slate-500">No matching rows.</p>}
      </div>
    </Card>
    <div className="mt-2 flex items-center gap-3 text-xs text-slate-500"><span role="status">{filtered.length.toLocaleString("en-IN")} {query || from || to || Object.keys(scope).length ? "matching " : ""}rows · {book.tabs.length === 2 ? "both tabs" : `all ${book.tabs.length} tabs`} included in Excel</span></div>
  </section>;
}
