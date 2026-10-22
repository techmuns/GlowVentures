import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { saveTableInputs, useTableInputs } from "@/lib/tableInputStore";
import { type InputRecord } from "@/lib/tableInputs";

export const TableEditing = createContext(false);
export const useTableEditing = () => useContext(TableEditing);
export function TableNumberInput({ record, field }: { record: InputRecord; field: string }) {
  const current = record.values[field], version = record.versions[field] ?? "";
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [base, setBase] = useState({ value: current, version, source: record.source });
  const label = record.fields.find(f => f.key === field)!.label;
  const [draft, setDraft] = useState(current == null ? "" : String(current));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const text = (n: number | null) => n == null ? "" : String(n);
  const stale = base.version !== version || base.source !== record.source;
  useEffect(() => {
    if (draft === text(base.value)) {
      setBase({ value: current, version, source: record.source }); setDraft(text(current));
    }
  }, [current, version, record.source]);
  const save = async (reset = false) => {
    const value = draft.trim() === "" ? null : Number(draft.replace(/,/g, ""));
    if (!reset && value !== null && !Number.isFinite(value)) { setError("Enter a number."); return; }
    setBusy(true); setError("");
    try {
      const next = await saveTableInputs([{ id: record.id, field, value, version: base.version, source: base.source, ...(reset ? { reset: true } : {}) }]);
      const fresh = next.catalog.find(r => r.id === record.id)!;
      setBase({ value: fresh.values[field], version: fresh.versions[field] ?? "", source: fresh.source }); setDraft(text(fresh.values[field]));
      input.current?.focus();
    }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); requestAnimationFrame(() => input.current?.focus()); }
  };
  return <div data-number-editor className="min-w-[9rem] text-left" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <label className="sr-only" htmlFor={inputId}>{record.label} — {label}</label>
    <input ref={input} id={inputId} aria-label={`${record.label} — ${label}`} inputMode="decimal" value={draft} disabled={busy}
      onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void save(); } }}
      placeholder="Add number" className={`w-full rounded border border-ink-600 bg-ink-900 p-1.5 text-right text-xs ring-focus ${current == null ? "border-amber-500/70" : ""}`} />
    <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
      <span className="text-slate-500">{record.fields.find(f => f.key === field)?.unit ?? (record.kind === "property" ? "Whole property · INR" : "INR")}</span>
      <button type="button" disabled={busy || draft === text(base.value)} className="rounded px-1 text-emerald-600 ring-focus disabled:opacity-40" onClick={() => { void save(); }}>{busy ? "Saving…" : "Save"}</button>
      {version && record.kind !== "property" && <button type="button" disabled={busy} className="rounded text-slate-400 ring-focus" onClick={() => { void save(true); }}>Restore original</button>}
    </div>
    {stale && <p className="mt-1 whitespace-normal text-[10px] text-amber-600">Saved number changed to {current?.toLocaleString("en-IN") ?? "blank"}. <button type="button" className="underline ring-focus" onClick={() => { setBase({ value: current, version, source: record.source }); setDraft(text(current)); setError(""); }}>Use latest</button></p>}
    {error && <p role="alert" className="mt-1 max-w-xs whitespace-normal text-xs text-loss">{error}</p>}
  </div>;
}
export function EnteredNumbersNotice() {
  const state = useTableInputs();
  const active = state.catalog.reduce((n, r) => n + Object.keys(r.versions).length, 0);
  const stale = state.saved.length - active;
  if (!active && !stale) return null;
  return <div className="mb-3 rounded border border-champagne-400/30 bg-champagne-400/10 px-3 py-2 text-xs text-slate-300" data-entered-numbers>
    {active > 0 && `${active} user-entered number${active === 1 ? " is" : "s are"} applied. Original statements are kept separately.`}
    {stale > 0 && ` ${stale} older correction${stale === 1 ? " was" : "s were"} set aside because the source changed. Check All inputs.`}
    {state.status === "error" && ` ${state.error}`}
  </div>;
}
