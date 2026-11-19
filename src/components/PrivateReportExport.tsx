// ── PRIVATE MARKET → GENERATE REPORT button (client #418) ───────────────────
//
// *"can I simply create a separate report … where I select either ALL or a
//  SUBSET of all the investments … and generate a summary … PDF, Excel,
//  management-ready."* — Gaurav, 5 Nov 2026.
//
// The same two-step flow the Morning CIO report uses — pick a period (and now a
// subset of investments), then preview-and-download as PDF or Excel. It reuses
// the CIO report's dialog styling (`cio-report-*`) so the two reports look like
// one family, and the shared period picker from `cioReportPeriod`.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileDown, FileSpreadsheet, Loader2, X } from "lucide-react";
import type { PrivateReportSnapshot } from "@/lib/privateReport";
import { REPORT_PERIODS, reportPeriod, reportToday, type ReportPeriod } from "@/lib/cioReportPeriod";

const PdfPreview = lazy(() => import("./PdfPreview"));
type Result = { url: string; filename: string; pages: number; bytes: number };
/** One investment the picker lists; `value` sorts it so the largest sit on top. */
export type ReportInvestment = { key: string; name: string; value: number };

// The report dialog is a light modal in both themes (cio-report-* chrome), so the
// subset picker uses explicit light-surface inline styles — no ink-*/slate-* remap.
const PICK_BOX: React.CSSProperties = { maxHeight: 190, overflowY: "auto", border: "1px solid #c7d8d5", borderRadius: 8, padding: "6px 8px", background: "#fff" };
// flexDirection/justifyContent/textAlign and the checkbox width override the
// `.cio-report-options label` + `input` rules (column layout, full-width input).
const PICK_ROW: React.CSSProperties = { display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 8, padding: "3px 2px", fontSize: 12.5, fontWeight: 400, color: "#183338", cursor: "pointer", textAlign: "left" };
const PICK_CHECK: React.CSSProperties = { width: "auto", minWidth: 0, flex: "0 0 auto", margin: 0, padding: 0 };

function ReportOptions({ initial, investments, selected, setSelected, preview, close }: {
  initial: ReportPeriod; investments: readonly ReportInvestment[];
  selected: Set<string>; setSelected: (next: Set<string>) => void;
  preview: (period: ReportPeriod) => void; close: () => void;
}) {
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
  const toggle = (k: string) => { const n = new Set(selected); n.has(k) ? n.delete(k) : n.add(k); setSelected(n); };
  const none = selected.size === 0;
  return createPortal(<dialog ref={dialog} onCancel={close} aria-label="Choose private market report period and investments" className="cio-report-options" data-pm-report-options>
    <form onSubmit={e => { e.preventDefault(); if (chosen && !none) { try { preview(chosen); } catch { setFailure("The selected records could not be prepared. Please retry."); } } }}>
      <div className="cio-report-options-heading"><div><strong>Generate report</strong><p>Choose the period and the investments for your private market review.</p></div>
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

      {/* ── Pick all or a subset of the investments (Gaurav's own ask) ─────── */}
      {investments.length > 1 && <div data-pm-report-pick style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <span style={{ fontWeight: 600, color: "#183338", fontSize: 12 }}>Investments <span style={{ fontWeight: 400, color: "#63787a" }} data-pm-report-selcount>({selected.size} of {investments.length})</span></span>
          <span style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setSelected(new Set(investments.map(i => i.key)))} data-pm-report-all style={{ fontSize: 12, color: "#0b4f54", fontWeight: 600 }}>All</button>
            <button type="button" onClick={() => setSelected(new Set())} data-pm-report-none style={{ fontSize: 12, color: "#63787a" }}>None</button>
          </span>
        </div>
        <div style={PICK_BOX}>
          {investments.map(i => (
            <label key={i.key} style={PICK_ROW} data-pm-report-option={i.key}>
              <input type="checkbox" checked={selected.has(i.key)} onChange={() => toggle(i.key)} style={PICK_CHECK} />
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</span>
            </label>
          ))}
        </div>
      </div>}

      <p className="cio-report-period-note">Each investment's return is measured over its own records — a private fund's multiple and IRR run from its first capital call to its latest valuation, whatever period you choose. The period sets the report's "as at" date and framing.</p>
      {(error || failure || none) && <p role="alert" className="cio-report-period-error">{error || failure || "Pick at least one investment to include."}</p>}
      <div className="cio-report-options-footer"><button type="button" onClick={close}>Cancel</button>
        <button type="submit" disabled={!chosen || none} className="cio-report-download"><FileDown size={15} /> Preview report</button></div>
    </form>
  </dialog>, document.body);
}

function ReportDialog({ snapshot, close, change }: { snapshot: PrivateReportSnapshot; close: () => void; change: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [xlsxError, setXlsxError] = useState("");
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
  const downloadExcel = async () => {
    if (xlsxBusy) return;
    setXlsxBusy(true); setXlsxError("");
    try {
      const r = await (await import("@/lib/exportPrivateReportExcel")).exportPrivateReportExcel(snapshot);
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch { setXlsxError("Excel could not be prepared. Please retry."); }
    finally { setXlsxBusy(false); }
  };
  return createPortal(<dialog ref={dialog} onCancel={close} aria-label="Private market report preview"
    className="cio-report-dialog" data-pm-report-preview>
    <div className="cio-report-toolbar">
      <div><strong>{snapshot.brand.name} · Private Market Review</strong>
        <small>{snapshot.period.label} · {snapshot.scope} · {snapshot.currency} · {snapshot.count} investment{snapshot.count === 1 ? "" : "s"} · Prepared by {snapshot.brand.provider}{result ? ` · ${result.pages} pages` : ""}{xlsxError ? ` · ${xlsxError}` : ""}</small></div>
      <div className="cio-report-actions">
        <button type="button" onClick={change}>Change selection</button>
        <button type="button" onClick={() => { void downloadExcel(); }} disabled={xlsxBusy} className="cio-report-download" data-pm-report-excel>
          <FileSpreadsheet size={15} /> {xlsxBusy ? "Preparing…" : "Download Excel"}
        </button>
        {result && <a href={result.url} download={result.filename} className="cio-report-download" data-pm-report-pdf><Download size={15} /> Download PDF</a>}
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

export function PrivateReportExport({ snapshot, investments }: {
  snapshot: (period: ReportPeriod, keys: string[] | null) => PrivateReportSnapshot;
  investments: readonly ReportInvestment[];
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [options, setOptions] = useState(false);
  const [period, setPeriod] = useState(() => reportPeriod("history"));
  const [captured, setCaptured] = useState<PrivateReportSnapshot>();
  // All selected by default; a strict subset passes its keys, "all" passes null
  // (the whole book). Keyed on the current investment set so a member-scope change
  // can't leave a stale key selected.
  const allKeys = useMemo(() => investments.map(i => i.key).join("|"), [investments]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(investments.map(i => i.key)));
  useEffect(() => { setSelected(new Set(investments.map(i => i.key))); }, [allKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const keysFor = () => selected.size === investments.length ? null : investments.filter(i => selected.has(i.key)).map(i => i.key);
  const close = () => { setOptions(false); setCaptured(undefined); requestAnimationFrame(() => button.current?.focus()); };
  return <>
    <button ref={button} type="button" data-pm-export-report onClick={() => setOptions(true)}
      title="Preview and download a PDF or Excel of all or a chosen set of your private companies and funds"
      className="inline-flex items-center gap-1.5 rounded-md bg-champagne-500 px-3 py-1.5 text-[12.5px] font-semibold text-ink-950 ring-focus transition-colors hover:bg-champagne-400">
      <FileDown size={15} aria-hidden /> Generate report
    </button>
    {options && <ReportOptions initial={period} investments={investments} selected={selected} setSelected={setSelected}
      close={close} preview={p => { const value = snapshot(p, keysFor()); setPeriod(p); setOptions(false); setCaptured(value); }} />}
    {captured && <ReportDialog snapshot={captured} close={close} change={() => { setCaptured(undefined); setOptions(true); }} />}
  </>;
}
