import { createContext, isValidElement, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { BOOK_ACCOUNTS } from '@/data/glowData';
import { holdingSourceTrace, statementSourceHref, type SourceMetric, type SourceTrace, type TracePosition } from '@/lib/sourceTrace';
import { readModel } from '@/lib/readModel';

export const SourceTraceContext = createContext<SourceTrace | null>(null);
export const useSourceTrace = () => useContext(SourceTraceContext);
const accounts = new Map(BOOK_ACCOUNTS.map(a => [a.accountId, a]));
const LINK = 'pointer-events-auto cursor-pointer text-inherit underline decoration-dotted decoration-slate-500/50 underline-offset-[3px] hover:decoration-champagne-500';

export function SourceDetails({ trace }: { trace: SourceTrace }) {
  const [related, setRelated] = useState<SourceTrace['sources']>([]);
  useEffect(() => {
    if (!['costBasis', 'avgCost', 'unrealizedPnL'].includes(trace.metric)) return;
    let alive = true;
    type Evidence = { record?: { document: string; pointer: string }; supportingRecords?: { document: string; pointer: string }[] };
    readModel<Evidence[]>('provenance/positions.json').then(records => {
      const added = trace.sources.flatMap(source => {
        const selected = records?.find(r => r.record?.document === source.document && r.record?.pointer === source.pointer);
        return (selected?.supportingRecords ?? []).filter(r => !r.pointer.startsWith('/holdings/')).map(r => ({ ...source, ...r, field: undefined, value: undefined,
          note: `Related dated source record · ${r.pointer}` }));
      });
      if (alive) setRelated([...new Map(added.map(s => [JSON.stringify(s), s])).values()]);
    });
    return () => { alive = false; };
  }, [trace]);
  return <div data-source-details={trace.metric} className="whitespace-normal text-left text-xs">
    {trace.notes.map(note => <p key={note} className="mb-2 text-slate-400" data-prose-ok="source calculation and coverage">{note}</p>)}
    <ul className="space-y-3">
      {[...trace.sources, ...related].map((source, i) => {
        const href = statementSourceHref(source), account = accounts.get(source.accountId);
        const date = source.document?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
        const label = [account?.owner, source.document ? account?.provider : source.label, account ? `a/c …${account.accountNo.slice(-6)}` : null, date].filter(Boolean).join(' · ');
        return <li key={i}>
          {href ? <Link to={href} data-source-document={source.document} data-source-pointer={source.pointer} className={LINK}
            title={`${source.label}${source.pointer ? ` · ${source.pointer}` : ''}`}>{label || source.label}</Link>
            : <span>{source.label}</span>}
          {typeof source.value === 'number' && <div className="mono mt-0.5 text-slate-300">{source.value.toLocaleString('en-IN', { maximumFractionDigits: 8 })}</div>}
          {source.note && <div className="mt-0.5 text-slate-500">{source.note}</div>}
        </li>;
      })}
    </ul>
  </div>;
}

export function SourceValue({ positions, metric, children, trace: supplied }: {
  positions?: readonly TracePosition[]; metric?: SourceMetric; children: ReactNode; trace?: SourceTrace;
}) {
  const trace = supplied ?? holdingSourceTrace(positions ?? [], metric ?? 'statement');
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && (button.current?.contains(e.target as Node) || panel.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); window.removeEventListener('resize', close); };
  }, [open]);
  if (!trace.sources.length) return <>{children}</>;
  const only = trace.sources.length === 1 && !trace.derived && !trace.missing ? trace.sources[0] : null;
  const href = only && statementSourceHref(only);
  if (href) return <Link to={href} className={LINK} onClick={e => e.stopPropagation()}
    data-source-metric={trace.metric} data-source-document={only!.document} data-source-pointer={only!.pointer}
    title={`Open the supporting statement in Statement Library · ${only!.pointer ?? only!.sheet ?? ''}`}>{children}</Link>;
  return <>
    <button ref={button} type="button" className={LINK} aria-expanded={open} aria-label={`Trace ${trace.title.toLowerCase()}`}
      data-source-metric={trace.metric} title={`Trace ${trace.title.toLowerCase()} to its sources`}
      onClick={e => {
        e.stopPropagation(); const r = button.current!.getBoundingClientRect();
        setPos({ top: Math.min(r.bottom + 5, window.innerHeight - 340), left: Math.max(12, Math.min(r.left, window.innerWidth - 380)) }); setOpen(v => !v);
      }}>{children}</button>
    {open && createPortal(<div ref={panel} role="dialog" aria-label={`${trace.title} sources`} data-export-ignore
      style={{ position: 'fixed', ...pos }} className="z-[60] max-h-[320px] w-[360px] overflow-auto rounded-lg border border-ink-600 bg-ink-800 p-3.5 text-slate-200 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm font-medium"><span>{trace.title} · Sources</span>
        <button type="button" onClick={() => { setOpen(false); button.current?.focus(); }} aria-label="Close sources">×</button></div>
      <SourceDetails trace={trace} />
    </div>, document.getElementById('root') ?? document.body)}
  </>;
}
SourceValue.sourceTraceControl = true;

function hasNumber(node: ReactNode): boolean {
  if (typeof node === 'number') return Number.isFinite(node);
  if (typeof node === 'string') return /\d/.test(node);
  if (Array.isArray(node)) return node.some(hasNumber);
  return isValidElement<{ children?: ReactNode }>(node) && hasNumber(node.props.children);
}
function hasAction(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(hasAction);
  if (!isValidElement<{ children?: ReactNode }>(node)) return false;
  return node.type === Link || typeof node.type === 'string' && ['a', 'button', 'input', 'select'].includes(node.type)
    || !!(node.type as { sourceTraceControl?: boolean }).sourceTraceControl || hasAction(node.props.children);
}
function hasDeclaredFeed(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(hasDeclaredFeed);
  return isValidElement<{ children?: ReactNode; 'data-cmp-source'?: string }>(node)
    && (!!node.props['data-cmp-source'] || hasDeclaredFeed(node.props.children));
}
/** Shared table seam: declared column identity survives sorting and dragging.
 * Never turn an absence, editor, export, or existing action into a nested link. */
export function SourceCell({ positions, metric, children }: { positions: readonly TracePosition[]; metric: SourceMetric; children: ReactNode }) {
  if (!positions.length || metric !== 'statement' && !hasNumber(children)) return <>{children}</>;
  // The displayed exchange quote can be newer than the price the corporate-
  // action gate permits for valuation. Its own feed label is authoritative.
  if (metric === 'currentPrice' && hasDeclaredFeed(children)) return <>{children}</>;
  const trace = holdingSourceTrace(positions, metric);
  return <SourceTraceContext.Provider value={trace}>
    {hasAction(children) ? children : <SourceValue trace={trace}>{children}</SourceValue>}
  </SourceTraceContext.Provider>;
}
