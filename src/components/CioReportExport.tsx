import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileDown, Loader2, X } from 'lucide-react';
import type { CioReportSnapshot } from '@/lib/cioReport';

const PdfPreview = lazy(() => import('./PdfPreview'));
type Result = { url: string; filename: string; pages: number; bytes: number };

function ReportDialog({ snapshot, close }: { snapshot: CioReportSnapshot; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true, url: string | undefined;
    setResult(undefined); setError('');
    void import('@/lib/exportCioReport').then(m => m.exportCioReport(snapshot)).then(r => {
      if (!active) return;
      url = URL.createObjectURL(r.blob);
      setResult({ url, filename: r.filename, pages: r.pages, bytes: r.blob.size });
    }).catch(() => { if (active) setError('The report could not be prepared. Please retry.'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [snapshot, attempt]);
  return createPortal(<dialog ref={dialog} onCancel={close} aria-label="Family office report preview"
    className="cio-report-dialog" data-cio-report-preview>
    <div className="cio-report-toolbar">
      <div><strong>{snapshot.brand.name} · Quarterly Review</strong>
        <small>{snapshot.scope} · {snapshot.currency} · Prepared by {snapshot.brand.provider}{result ? ` · ${result.pages} pages` : ''}</small></div>
      <div className="cio-report-actions">
        {result && <a href={result.url} download={result.filename} className="cio-report-download"><Download size={15} /> Download PDF</a>}
        <button type="button" onClick={close} aria-label="Close report preview"><X size={20} /></button>
      </div>
    </div>
    <div className="cio-report-document">
      {error ? <div className="cio-report-loading" role="alert"><p>{error}</p>
        <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry report</button></div>
        : result ? <Suspense fallback={<div className="cio-report-loading">Opening PDF…</div>}>
          <PdfPreview key={result.url} url={result.url} file={{ file: result.filename, bytes: result.bytes, encrypted: false, part: null }}
            title={`${snapshot.brand.name} quarterly review`} />
        </Suspense> : <div className="cio-report-loading" role="status"><Loader2 className="animate-spin" size={26} /> Preparing your colour PDF…</div>}
    </div>
  </dialog>, document.body);
}

export function CioReportExport({ snapshot }: { snapshot: () => CioReportSnapshot }) {
  const [captured, setCaptured] = useState<CioReportSnapshot>();
  return <>
    <button type="button" className="cio-report-export" onClick={() => setCaptured(snapshot())}
      title="Preview and download a colour PDF with your family's current figures" data-cio-export-report>
      <FileDown size={15} /> Export report
    </button>
    {captured && <ReportDialog snapshot={captured} close={() => setCaptured(undefined)} />}
  </>;
}
