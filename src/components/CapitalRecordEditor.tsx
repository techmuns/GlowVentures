import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { saveTableInputs, useTableInputs } from '@/lib/tableInputStore';
import { validateInputChanges, type InputChange, type InputRecord } from '@/lib/tableInputs';
import { parseRupees, rupeeText } from '@/lib/capitalEntry';

const texts = (record: InputRecord) => Object.fromEntries(record.fields.map(f => [f.key, rupeeText(record.values[f.key])]));

/** Related capital balances are one correction, including any restores. */
export function CapitalRecordEditor({ record, initialChanges = [], onSaved, onBusyChange }: {
  record: InputRecord; initialChanges?: InputChange[]; onSaved?: (record: InputRecord) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const state = useTableInputs(), prefix = useId();
  const [base, setBase] = useState(() => {
    const snapshot = { ...record, values: { ...record.values }, versions: { ...record.versions } };
    for (const c of initialChanges) { snapshot.source = c.source; snapshot.versions[c.field] = c.version; }
    return snapshot;
  });
  const [draft, setDraft] = useState(() => {
    const values = texts(record);
    for (const c of initialChanges) values[c.field] = rupeeText(c.reset ? record.originalValues?.[c.field] ?? null : c.value);
    return values;
  });
  const [resets, setResets] = useState(() => new Set(initialChanges.filter(c => c.reset).map(c => c.field)));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const stale = base.source !== record.source || record.fields.some(f => (base.versions[f.key] ?? '') !== (record.versions[f.key] ?? ''));
  const writable = state.status === 'ready' && state.catalog.some(r => r.id === record.id);
  const changes: InputChange[] = record.fields.flatMap(f => {
    const value = parseRupees(draft[f.key] ?? '');
    return resets.has(f.key) || value !== base.values[f.key]
      ? [{ id: record.id, field: f.key, value, version: base.versions[f.key] ?? '', source: base.source, ...(resets.has(f.key) ? { reset: true } : {}) }] : [];
  });
  const latest = (fresh: InputRecord) => { setBase(fresh); setDraft(texts(fresh)); setResets(new Set()); setError(''); };
  const save = async () => {
    if (busy || !writable || stale || !changes.length) return;
    const invalid = validateInputChanges(changes, [record]);
    if (invalid) { setError(invalid); return; }
    setBusy(true); onBusyChange?.(true); setError('');
    try {
      const next = await saveTableInputs(changes), fresh = next.catalog.find(r => r.id === record.id)!;
      latest(fresh); onSaved?.(fresh);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); onBusyChange?.(false); }
  };
  return <div data-capital-record-editor data-capital-record-id={record.id} className="min-w-0" onClick={e => e.stopPropagation()}>
    <p className="mb-3 text-xs text-slate-400">Edit related capital amounts together, then save once. Leave amounts the source does not supply blank.</p>
    <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">{record.fields.map(f => <div key={f.key} className="min-w-0">
      <label htmlFor={`${prefix}-${f.key}`} className="mb-1 block text-xs text-slate-400">{f.label}</label>
      <input id={`${prefix}-${f.key}`} data-capital-field={f.key} inputMode="decimal" value={draft[f.key] ?? ''} disabled={!writable || busy}
        onChange={e => { setDraft(d => ({ ...d, [f.key]: e.target.value })); setResets(r => new Set([...r].filter(k => k !== f.key))); setError(''); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void save(); } }}
        placeholder="Add amount" className={`w-full min-w-0 rounded border border-ink-600 bg-ink-900 p-2 text-right text-xs tabular-nums ring-focus ${base.values[f.key] == null ? 'border-amber-500/70' : ''}`} />
      {base.versions[f.key] && <button type="button" disabled={busy || !writable} aria-label={`Restore original ${f.label.toLowerCase()}`}
        onClick={() => { setDraft(d => ({ ...d, [f.key]: rupeeText(base.originalValues?.[f.key] ?? null) })); setResets(r => new Set([...r, f.key])); setError(''); }}
        className="mt-1 rounded text-[10px] text-slate-400 underline ring-focus">{resets.has(f.key) ? 'Original staged' : 'Restore original'}</button>}
    </div>)}</div>
    {stale && <p role="alert" className="mt-3 text-xs text-amber-600">These amounts changed while you were editing. <button type="button" className="underline ring-focus" onClick={() => latest(record)}>Use latest amounts</button></p>}
    {error && <p role="alert" className="mt-3 text-xs text-loss">{error}</p>}
    <button type="button" data-capital-save disabled={busy || !writable || stale || !changes.length} onClick={() => { void save(); }}
      className="mt-3 rounded bg-emerald-600 px-3 py-1.5 text-xs text-white ring-focus disabled:opacity-40">{busy ? 'Saving…' : 'Save capital amounts'}</button>
  </div>;
}

export function CapitalRecordDialog({ record, initialChanges, close, onSaved }: {
  record: InputRecord; initialChanges?: InputChange[]; close: () => void; onSaved?: (record: InputRecord) => void;
}) {
  const state = useTableInputs(), panel = useRef<HTMLDivElement>(null), title = useId();
  const [busy, setBusy] = useState(false);
  const actions = useRef({ busy, close });
  useEffect(() => { actions.current = { busy, close }; }, [busy, close]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; panel.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !actions.current.busy) { e.stopPropagation(); actions.current.close(); }
      if (e.key === 'Tab') {
        const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? []), first = controls[0], last = controls.at(-1);
        if (!controls.length) { e.preventDefault(); panel.current?.focus(); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key); return () => { window.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  const current = state.catalog.find(r => r.id === record.id) ?? record;
  return createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget && !busy) close(); }}>
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={title} className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-ink-600 bg-ink-900 p-5 text-slate-200 shadow-xl">
      <div className="mb-2 flex items-start justify-between gap-3"><h2 id={title} className="text-lg font-semibold">Edit capital amounts</h2><button type="button" disabled={busy} aria-label="Close capital editor" className="rounded px-2 ring-focus" onClick={close}>×</button></div>
      <p className="mb-3 text-xs text-slate-400">{current.label} · {current.account} · {current.asOf || 'Date not recorded'} · INR</p>
      <CapitalRecordEditor record={current} initialChanges={initialChanges} onBusyChange={setBusy} onSaved={fresh => { onSaved?.(fresh); close(); }} />
    </div>
  </div>, document.body);
}
