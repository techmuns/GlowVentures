import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Search, FileSpreadsheet } from "lucide-react";
import { readModel } from "@/lib/readModel";
import type { ConsolidatedBook, ConsolidatedColumn, ConsolidatedCell, ConsolidatedLink } from "@/lib/consolidatedSheet";
import { Card } from "./Card";

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
  const [showAll, setShowAll] = useState(false);
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
  const sheet = book?.tabs.find(t => t.name === params.get("consolidated")) ?? book?.tabs.find(t => t.name === "Portfolio Allocation");
  const query = params.get("q") ?? "";
  const scope = useMemo(() => {
    try { const parsed = JSON.parse(params.get("scope") ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed).filter(([k, v]) => typeof v === "string" && sheet?.columns.some(c => c.key === k))) as Record<string, string> : {}; }
    catch { return {}; }
  }, [params, sheet]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sheet?.rows.map((row, index) => ({ row, index })).filter(({ row }) => Object.entries(scope).every(([key, v]) => row.values[sheet.columns.findIndex(c => c.key === key)] === v)
      && (!q || row.values.some(v => String(v ?? "").toLowerCase().includes(q)))) ?? [];
  }, [sheet, query, scope]);
  useEffect(() => setShowAll(false), [sheet?.name, query]);
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
    <p data-prose-ok="consolidated template units, valuation basis and missing-input coverage" className="mb-3 max-w-5xl text-xs leading-relaxed text-slate-400">{sheet.note}</p>
    <Card pad={false}>
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-xs" data-table-static="the consolidated workbook format preserves its summary hierarchy and register column order">
          <thead className="sticky top-0 z-20"><tr>{sheet.columns.map((c, i) => <th key={c.key} className={`border-b border-r border-ink-700 bg-ink-800 px-3 py-3 text-left font-semibold text-slate-200 ${i === 0 ? "sticky left-0 z-30" : ""}`}
            style={{ minWidth: Math.min(220, Math.max(100, c.width * 7)), maxWidth: 340 }}><span className="block">{c.label}</span></th>)}</tr></thead>
          <tbody>{(showAll ? filtered : filtered.slice(0, 200)).map(({ row, index }) => <tr key={index} data-consolidated-row={index} className={row.kind ? "font-semibold" : "hover:bg-ink-700/30"}>
            {row.values.map((value, i) => {
              const c = sheet.columns[i], link = row.links?.[c.key];
              const text = display(value, c);
              const target = link?.file !== undefined ? `/audit?${link.file ? `file=${encodeURIComponent(link.file)}` : "sources=1"}` : link?.sheet ? `/audit?consolidated=${encodeURIComponent(link.sheet)}${link.find ? `&q=${encodeURIComponent(link.find)}` : ""}${link.where ? `&scope=${encodeURIComponent(JSON.stringify(link.where))}` : ""}` : null;
              return <td key={c.key} title={value == null ? "Not reported or unsupported by the available source record. See the sheet note and Checks." : String(value)}
                className={`border-b border-r border-ink-700/50 px-3 py-2.5 align-top ${typeof value === "number" ? "text-right mono whitespace-nowrap" : "text-left"} ${i === 0 ? "sticky left-0 z-10" : ""} ${row.kind === "group" ? "bg-champagne-500/10 text-champagne-400" : row.kind === "total" ? "bg-ink-700 text-slate-100" : "bg-ink-900 text-slate-300"}`} style={{ maxWidth: 340 }}>
                {target && value != null ? <Link to={target} onClick={() => { if (link?.file !== undefined) onSources(); }} className="text-champagne-400 underline decoration-champagne-500/40 underline-offset-2 hover:decoration-champagne-400">{text}</Link> : text}
              </td>;
            })}</tr>)}</tbody>
        </table>
        {!filtered.length && <p className="p-6 text-sm text-slate-500">No matching rows.</p>}
      </div>
    </Card>
    <div className="mt-2 flex items-center gap-3 text-xs text-slate-500"><span>{filtered.length.toLocaleString("en-IN")} {query ? "matching " : ""}rows · all 17 subtabs included in Excel</span>
      {!showAll && filtered.length > 200 && <button className="text-champagne-400 underline" onClick={() => setShowAll(true)}>Show all rows</button>}</div>
  </section>;
}
