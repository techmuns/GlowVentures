import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileDown, Loader2, X } from 'lucide-react';
import type { CioReportSnapshot, ReportEdition } from '@/lib/cioReport';
import { REPORT_PERIODS, reportPeriod, reportToday, type ReportPeriod } from '@/lib/cioReportPeriod';

const PdfPreview = lazy(() => import('./PdfPreview'));
type Result = { url: string; filename: string; pages: number; bytes: number };
const EDITIONS: [ReportEdition, string, string][] = [
  ['summary', 'Summary report', 'Charts and summary tables'],
  ['detailed', 'Detailed report', 'Adds holding-by-holding tables'],
];
const editionLabel = (e: ReportEdition) => EDITIONS.find(([v]) => v === e)![1];

const TOP_N_CHOICES = [10, 15, 20, 25];
function ReportOptions({ initial, initialEdition, initialTopN, preview, close }: { initial: ReportPeriod; initialEdition: ReportEdition; initialTopN: number;
  preview: (period: ReportPeriod, edition: ReportEdition, topN: number) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const today = reportToday();
  const [edition, setEdition] = useState(initialEdition);
  const [topN, setTopN] = useState(initialTopN);
  const [key, setKey] = useState(initial.key);
  const [year, setYear] = useState(Number(initial.from?.slice(0, 4) ?? today.slice(0, 4)));
  const [quarter, setQuarter] = useState(Math.ceil(Number(initial.from?.slice(5, 7) ?? today.slice(5, 7)) / 3));
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to);
  const [failure, setFailure] = useState('');
  // showModal() moves focus to the first control (the close button), so focus the chosen report type after it.
  useEffect(() => { dialog.current?.showModal(); dialog.current?.querySelector<HTMLInputElement>('input[name="cio-report-edition"]:checked')?.focus(); }, []);
  let chosen: ReportPeriod | undefined, error = '';
  try { chosen = reportPeriod(key, { today, year, quarter, from, to }); } catch (e) { error = (e as Error).message; }
  return createPortal(<dialog ref={dialog} onCancel={close} aria-label="Choose report type and period" className="cio-report-options" data-cio-report-options>
    <form onSubmit={e => { e.preventDefault(); if (chosen) { try { preview(chosen, edition, topN); } catch { setFailure('The selected records could not be prepared. Please retry.'); } } }}>
      <div className="cio-report-options-heading"><div><strong>Export report</strong><p>Choose the report and period for your family office review.</p></div>
        <button type="button" onClick={close} aria-label="Close report options"><X size={20} /></button></div>
      <fieldset className="cio-report-edition" data-cio-report-edition={edition}>
        <legend>Report type</legend>
        <div className="cio-report-edition-options">{EDITIONS.map(([value, label, hint]) =>
          <label key={value}><input type="radio" name="cio-report-edition" value={value} checked={edition === value}
            onChange={() => setEdition(value)} data-cio-report-edition-option={value} />
            <span className="cio-report-edition-dot" aria-hidden /><span><strong>{label}</strong><small>{hint}</small></span></label>)}</div>
      </fieldset>
      <label>Top holdings per chart<select value={topN} onChange={e => setTopN(Number(e.target.value))} data-cio-report-topn={topN}
        title="How many names each “Top holdings” chart lists — e.g. Top 10 by value, or Top 20.">
        {TOP_N_CHOICES.map(n => <option key={n} value={n}>Top {n}</option>)}</select></label>
      <label>Reporting period<select value={key} onChange={e => {
        const next = e.target.value; setKey(next); setFailure('');
        if (next === 'fy') setYear(Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0));
        else if (next === 'quarter' || next === 'year') setYear(Number(today.slice(0, 4)));
        if (next === 'custom' && chosen) { setFrom(chosen.from ?? ''); setTo(chosen.to); }
      }} data-cio-report-period>{REPORT_PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {['quarter', 'fy', 'year'].includes(key) && <div className="cio-report-date-fields">
        <label>{key === 'fy' ? 'Financial year starts in' : 'Year'}<input aria-label="Reporting year" type="number" min="1900" max={Number(today.slice(0, 4))} value={year} onChange={e => setYear(Number(e.target.value))} /></label>
        {key === 'quarter' && <label>Quarter<select aria-label="Reporting quarter" value={quarter} onChange={e => setQuarter(Number(e.target.value))}>{[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}</select></label>}
      </div>}
      <div className="cio-report-date-fields">
        <label>From<input aria-label="Report start date" type="date" max={chosen?.to ?? today} value={key === 'custom' ? from : chosen?.from ?? ''} readOnly={key !== 'custom'} disabled={key === 'history'} onChange={e => setFrom(e.target.value)} /></label>
        <label>To<input aria-label="Report end date" type="date" max={today} min={chosen?.from ?? undefined} value={key === 'custom' ? to : chosen?.to ?? ''} readOnly={key !== 'custom'} onChange={e => setTo(e.target.value)} /></label>
      </div>
      <p className="cio-report-period-note">Financial years run from April to March. Reports include available records within your dates; any gaps in historical coverage are shown in the PDF.</p>
      {(error || failure) && <p role="alert" className="cio-report-period-error">{error || failure}</p>}
      <div className="cio-report-options-footer"><button type="button" onClick={close}>Cancel</button>
        <button type="submit" disabled={!chosen} className="cio-report-download"><FileDown size={15} /> Preview report</button></div>
    </form>
  </dialog>, document.body);
}

function ReportDialog({ snapshot, edition, topN, close, change }: { snapshot: CioReportSnapshot; edition: ReportEdition; topN: number; close: () => void; change: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true, url: string | undefined;
    setResult(undefined); setError('');
    void import('@/lib/exportCioReport').then(m => m.exportCioReport(snapshot, edition, { topN })).then(r => {
      if (!active) return;
      url = URL.createObjectURL(r.blob);
      setResult({ url, filename: r.filename, pages: r.pages, bytes: r.blob.size });
    }).catch(() => { if (active) setError('The report could not be prepared. Please retry.'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [snapshot, edition, topN, attempt]);
  return createPortal(<dialog ref={dialog} onCancel={close} aria-label="Family office report preview"
    className="cio-report-dialog" data-cio-report-preview>
    <div className="cio-report-toolbar">
      <div><strong>{snapshot.brand.name} · {snapshot.period.title}</strong>
        <small>{editionLabel(edition)} · {snapshot.period.label} · {snapshot.scope} · {snapshot.currency} · Prepared by {snapshot.brand.provider}{result ? ` · ${result.pages} pages` : ''}</small></div>
      <div className="cio-report-actions">
        <button type="button" onClick={change}>Change options</button>
        {result && <a href={result.url} download={result.filename} className="cio-report-download"><Download size={15} /> Download PDF</a>}
        <button type="button" onClick={close} aria-label="Close report preview"><X size={20} /></button>
      </div>
    </div>
    <div className="cio-report-document">
      {error ? <div className="cio-report-loading" role="alert"><p>{error}</p>
        <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry report</button></div>
        : result ? <Suspense fallback={<div className="cio-report-loading">Opening PDF…</div>}>
          <PdfPreview key={result.url} url={result.url} file={{ file: result.filename, bytes: result.bytes, encrypted: false, part: null }}
            title={`${snapshot.brand.name} ${snapshot.period.title}`} />
        </Suspense> : <div className="cio-report-loading" role="status"><Loader2 className="animate-spin" size={26} /> Preparing your colour PDF…</div>}
    </div>
  </dialog>, document.body);
}

export function CioReportExport({ snapshot }: { snapshot: (period: ReportPeriod) => CioReportSnapshot }) {
  const button = useRef<HTMLButtonElement>(null);
  const [options, setOptions] = useState(false);
  const [period, setPeriod] = useState(() => reportPeriod('qtd'));
  const [edition, setEdition] = useState<ReportEdition>('detailed');
  const [topN, setTopN] = useState(10);
  const [captured, setCaptured] = useState<CioReportSnapshot>();
  const close = () => { setOptions(false); setCaptured(undefined); requestAnimationFrame(() => button.current?.focus()); };
  return <>
    <button ref={button} type="button" className="cio-report-export" onClick={() => setOptions(true)}
      title="Preview and download a colour PDF with your family's current figures" data-cio-export-report>
      <FileDown size={15} /> Export report
    </button>
    {options && <ReportOptions initial={period} initialEdition={edition} initialTopN={topN} close={close}
      preview={(p, e, n) => { const value = snapshot(p); setPeriod(p); setEdition(e); setTopN(n); setOptions(false); setCaptured(value); }} />}
    {captured && <ReportDialog snapshot={captured} edition={edition} topN={topN} close={close} change={() => { setCaptured(undefined); setOptions(true); }} />}
  </>;
}
