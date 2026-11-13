// ── PRIVATE MARKET → GENERATE REPORT button (client #418) ───────────────────
//
// *"can I simply create a separate report … and generate a summary of
//  progression or performance of investments over time … management-ready."*
//  — Gaurav, 5 Nov 2026.
//
// The same two-step flow the Morning CIO report uses — pick a period, then
// preview-and-download — pointed at the private book's own snapshot and PDF.
// It reuses the CIO report's dialog styling (`cio-report-*`) so the two reports
// look like one family, and the shared period picker from `cioReportPeriod`.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileDown, Loader2, X } from "lucide-react";
import type { PrivateReportSnapshot } from "@/lib/privateReport";
import { REPORT_PERIODS, reportPeriod, reportToday, type ReportPeriod } from "@/lib/cioReportPeriod";

const PdfPreview = lazy(() => import("./PdfPreview"));
type Result = { url: string; filename: string; pages: number; bytes: number };

function ReportOptions({ initial, preview, close }: { initial: ReportPeriod; preview: (period: ReportPeriod) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const today = reportToday();
  const [key, setKey] = useState(initial.key);
  const [year, setYear] = useState(Number(initial.from?.slice(0, 4) ?? today.slice(0, 4)));
  const [quarter, setQuarter] = useState(Math.ceil(Number(initial.from?.slice(5, 7) ?? today.slice(5, 7)) / 3));
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to);
  const [failure, setFailure] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  let chosen: ReportPeriod | undefined, error = "";
  try { chosen = reportPeriod(key, { today, year, quarter, from, to }); } catch (e) { error = (e as Error).message; }
  return createPortal(<dialog ref={dialog} onCancel={close} aria-label="Choose private market report period" className="cio-report-options" data-pm-report-options>
    <form onSubmit={e => { e.preventDefault(); if (chosen) { try { preview(chosen); } catch { setFailure("The selected records could not be prepared. Please retry."); } } }}>
      <div className="cio-report-options-heading"><div><strong>Generate report</strong><p>Choose the period for your private market review.</p></div>
        <button type="button" onClick={close} aria-label="Close report options"><X size={20} /></button></div>
      <label>Reporting period<select autoFocus value={key} onChange={e => {
        const next = e.target.value; setKey(next); setFailure("");
        if (next === "fy") setYear(Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0));
        else if (next === "quarter" || next === "year") setYear(Number(today.slice(0, 4)));
        if (next === "custom" && chosen) { setFrom(chosen.from ?? ""); setTo(chosen.to); }
      }} data-pm-report-period>{REPORT_PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {["quarter", "fy", "year"].includes(key) && <div className="cio-report-date-fields">
        <label>{key === "fy" ? "Financial year starts in" : "Year"}<input aria-label="Reporting year" type="number" min="1900" max={Number(today.slice(0, 4))} value={year} onChange={e => setYear(Number(e.target.value))} /></label>
        {key === "quarter" && <label>Quarter<select aria-label="Reporting quarter" value={quarter} onChange={e => setQuarter(Number(e.target.value))}>{[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}</select></label>}
      </div>}
      <div className="cio-report-date-fields">
        <label>From<input aria-label="Report start date" type="date" max={chosen?.to ?? today} value={key === "custom" ? from : chosen?.from ?? ""} readOnly={key !== "custom"} disabled={key === "history"} onChange={e => setFrom(e.target.value)} /></label>
        <label>To<input aria-label="Report end date" type="date" max={today} min={chosen?.from ?? undefined} value={key === "custom" ? to : chosen?.to ?? ""} readOnly={key !== "custom"} onChange={e => setTo(e.target.value)} /></label>
      </div>
      <p className="cio-report-period-note">Each investment's return is measured over its own records — a private fund's multiple and IRR run from its first capital call to its latest valuation, whatever period you choose. The period sets the report's "as at" date and framing.</p>
      {(error || failure) && <p role="alert" className="cio-report-period-error">{error || failure}</p>}
      <div className="cio-report-options-footer"><button type="button" onClick={close}>Cancel</button>
        <button type="submit" disabled={!chosen} className="cio-report-download"><FileDown size={15} /> Preview report</button></div>
    </form>
  </dialog>, document.body);
}

function ReportDialog({ snapshot, close, change }: { snapshot: PrivateReportSnapshot; close: () => void; change: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true, url: string | undefined;
    setResult(undefined); setError("");
    void import("@/lib/exportPrivateReport").then(m => m.exportPrivateReport(snapshot)).then(r => {
      if (!active) return;
      url = URL.createObjectURL(r.blob);
      setResult({ url, filename: r.filename, pages: r.pages, bytes: r.blob.size });
    }).catch(() => { if (active) setError("The report could not be prepared. Please retry."); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [snapshot, attempt]);
  return createPortal(<dialog ref={dialog} onCancel={close} aria-label="Private market report preview"
    className="cio-report-dialog" data-pm-report-preview>
    <div className="cio-report-toolbar">
      <div><strong>{snapshot.brand.name} · Private Market Review</strong>
        <small>{snapshot.period.label} · {snapshot.scope} · {snapshot.currency} · Prepared by {snapshot.brand.provider}{result ? ` · ${result.pages} pages` : ""}</small></div>
      <div className="cio-report-actions">
        <button type="button" onClick={change}>Change period</button>
        {result && <a href={result.url} download={result.filename} className="cio-report-download"><Download size={15} /> Download PDF</a>}
        <button type="button" onClick={close} aria-label="Close report preview"><X size={20} /></button>
      </div>
    </div>
    <div className="cio-report-document">
      {error ? <div className="cio-report-loading" role="alert"><p>{error}</p>
        <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry report</button></div>
        : result ? <Suspense fallback={<div className="cio-report-loading">Opening PDF…</div>}>
          <PdfPreview key={result.url} url={result.url} file={{ file: result.filename, bytes: result.bytes, encrypted: false, part: null }}
            title={`${snapshot.brand.name} Private Market Review`} />
        </Suspense> : <div className="cio-report-loading" role="status"><Loader2 className="animate-spin" size={26} /> Preparing your colour PDF…</div>}
    </div>
  </dialog>, document.body);
}

export function PrivateReportExport({ snapshot }: { snapshot: (period: ReportPeriod) => PrivateReportSnapshot }) {
  const button = useRef<HTMLButtonElement>(null);
  const [options, setOptions] = useState(false);
  const [period, setPeriod] = useState(() => reportPeriod("history"));
  const [captured, setCaptured] = useState<PrivateReportSnapshot>();
  const close = () => { setOptions(false); setCaptured(undefined); requestAnimationFrame(() => button.current?.focus()); };
  // The dashboard's own primary-CTA style (champagne on dark ink), the same the
  // Watchlist's "Add" button uses on this page — a light-mode-safe surface, where
  // the CIO report's fixed dark-teal `cio-report-export` button would read as an
  // un-remapped dark fill on the light page (the `check:pages` contrast sweep).
  // The report DIALOG keeps the shared `cio-report-*` styling, so the two reports
  // still open into the same experience.
  return <>
    <button ref={button} type="button" data-pm-export-report onClick={() => setOptions(true)}
      title="Preview and download a colour PDF of your private companies and funds"
      className="inline-flex items-center gap-1.5 rounded-md bg-champagne-500 px-3 py-1.5 text-[12.5px] font-semibold text-ink-950 ring-focus transition-colors hover:bg-champagne-400">
      <FileDown size={15} aria-hidden /> Generate report
    </button>
    {options && <ReportOptions initial={period} close={close} preview={p => { const value = snapshot(p); setPeriod(p); setOptions(false); setCaptured(value); }} />}
    {captured && <ReportDialog snapshot={captured} close={close} change={() => { setCaptured(undefined); setOptions(true); }} />}
  </>;
}
