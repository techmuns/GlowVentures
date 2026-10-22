import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { saveTableInputs, useTableInputs } from "@/lib/tableInputStore";
import type { InputChange } from "@/lib/tableInputs";
import { TableNumberInput } from "./TableNumberInput";

export function TableInputDialog({ close, changes, complete, recordIds }: { close: () => void; changes?: InputChange[]; complete?: () => void; recordIds?: string[] }) {
  const state = useTableInputs();
  const [query, setQuery] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) close();
      if (e.key === "Tab") {
        const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? []);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); previous?.focus(); };
  }, [close, busy]);
  const apply = async () => {
    setBusy(true); setError("");
    try { await saveTableInputs(changes!); complete?.(); close(); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  const matching = state.catalog.filter(r => (!recordIds?.length || recordIds.includes(r.id)) && `${r.label} ${r.account}`.toLowerCase().includes(query.toLowerCase()));
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget && !busy) close(); }}>
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="table-input-title" className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-ink-600 bg-ink-900 p-5 text-slate-200 shadow-xl">
      <div className="flex items-start justify-between gap-4"><h2 id="table-input-title" className="text-lg font-semibold">{changes ? "Review Excel changes" : "Edit investment numbers"}</h2><button type="button" disabled={busy} onClick={close} aria-label="Close number editor" className="rounded ring-focus"><X className="h-5 w-5" /></button></div>
      <p className="my-2 text-sm text-slate-400">All money is in rupees (INR). Keep the format; only fill in or correct numbers. Yellow cells are missing data. Totals and returns are calculated.</p>
      {error && <p role="alert" className="my-2 text-sm text-loss">{error}</p>}
      {state.status !== "ready" && <p role="alert" className="my-2 text-sm text-loss">{state.status === "loading" ? "Loading saved numbers…" : state.error}</p>}
      {changes ? <>
        <p className="my-2 text-sm">{changes.length} number{changes.length === 1 ? "" : "s"} will be saved for everyone.</p>
        <ul className="overflow-auto text-sm">{changes.slice(0, 100).map(c => {
          const r = state.catalog.find(r => r.id === c.id)!;
          return <li key={`${c.id}:${c.field}`} className="grid grid-cols-[2fr_1fr_1fr] gap-3 border-t border-ink-700 py-3"><div>{r?.label}<small className="block text-slate-500">{r?.account}</small></div><div>{r?.fields.find(f => f.key === c.field)?.label}</div><div className="text-right"><span className="text-slate-500">{r?.values[c.field]?.toLocaleString("en-IN") ?? "Blank"}</span> → {c.value?.toLocaleString("en-IN") ?? "Blank"}</div></li>;
        })}{changes.length > 100 && <li className="p-2 text-xs">Showing the first 100 changes.</li>}</ul>
        <button type="button" onClick={() => { void apply(); }} disabled={busy || state.status !== "ready"} className="mt-4 self-end rounded bg-emerald-600 px-4 py-2 text-sm text-white ring-focus disabled:opacity-50">{busy ? "Saving…" : `Save ${changes.length} changes`}</button>
      </> : <>
        <input aria-label="Find investment inputs" placeholder="Search an investment, account or property" value={query} onChange={e => setQuery(e.target.value)} className="my-3 rounded border border-ink-600 bg-ink-800 p-2 text-sm ring-focus" />
        <div className="overflow-auto text-xs">{matching.slice(0, 40).map(r => <fieldset key={r.id} className="mb-4 rounded border border-ink-700 p-3"><legend className="px-1 text-sm font-medium">{r.label} {r.kind === "private-capital" ? "— Capital details" : ""}</legend><div className="mb-3 text-slate-500">{r.account} · As of {r.asOf || "date not recorded"}</div><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{r.fields.map(f => <div key={f.key}><div className="mb-1 text-slate-400">{f.label}</div><TableNumberInput key={`${r.id}:${f.key}:${r.versions[f.key] ?? ""}:${r.values[f.key]}`} record={r} field={f.key} /></div>)}</div></fieldset>)}
          {!matching.length && <p className="p-4">No matching investments.</p>}{matching.length > 40 && <p className="p-2 text-xs text-slate-500">Showing 40 of {matching.length}. Search to find more.</p>}</div>
      </>}
    </div>
  </div>, document.body);
}
