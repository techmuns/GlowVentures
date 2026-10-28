import { useState, type FormEvent } from "react";
import { saveTableInputs, useTableInputs } from "@/lib/tableInputStore";
import { validateInputChanges, type InputChange, type InputRecord } from "@/lib/tableInputs";
import { parseRupees, rupeeText } from "@/lib/capitalEntry";

type Draft = { text: string; version: string; source: string };

/**
 * A folio's Committed, Called, Paid in or Still to call, typed in its own cell
 * in the Strategy / Description cells' format (`ProfileCellInput`): always
 * open, Save and Cancel once it changes, and a typed figure removable. It
 * writes the table inputs' store, so Edit numbers, Excel and every total read
 * the same figure (Stage 10ir). Amounts are rupees; `2.5 Cr` and `40 lakh` work.
 */
export function CapitalCellInput({ record, field, rowName, display }: {
  record: InputRecord;
  field: string;
  rowName: string;
  /** The figure as the table prints it, shown while the cell is not being typed in. */
  display: (n: number) => string;
}) {
  const inputs = useTableInputs();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = record.values[field] ?? null;
  const entered = record.versions[field] ?? "";
  const exact = rupeeText(current);
  const dirty = draft !== null && draft.text !== exact;
  const writable = inputs.status === "ready";
  const label = `${record.fields.find((f) => f.key === field)?.label ?? field} for ${rowName}`;
  const typed = draft ? parseRupees(draft.text) : null;

  const save = async (e?: FormEvent, remove = false) => {
    e?.preventDefault();
    if (!writable || busy || (!remove && !dirty)) return;
    const value = remove ? null : typed;
    if (value !== null && !Number.isFinite(value)) { setError("Enter an amount in rupees, or as 2.5 Cr / 40 lakh."); return; }
    const base = draft ?? { version: entered, source: record.source };
    // Clearing a typed figure restores the original; clearing a statement's records it as not known.
    const change: InputChange = { id: record.id, field, value, version: base.version, source: base.source, ...(value === null && base.version ? { reset: true } : {}) };
    if (value === null && !change.reset && record.kind === "capital" && field === "committed") { setError("The statement's commitment cannot be cleared; type the correct figure instead."); return; }
    const invalid = validateInputChanges([change], inputs.catalog);
    if (invalid) { setError(/changed since/.test(invalid) ? "This figure was saved by someone else while you typed. Cancel to see it." : invalid); return; }
    setBusy(true); setError(null);
    try {
      await saveTableInputs([change]);
      setDraft(null);
    } catch (err) {
      setError((err as Error).message || "Could not save. Your figure is still here; try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} data-pm-capital-form={field} data-no-row-toggle className="min-w-0">
      <input value={dirty ? draft.text : focused || current == null ? exact : display(current)} inputMode="decimal" disabled={!writable || busy}
        aria-label={label} aria-invalid={error ? true : undefined} data-pm-capital-input={field}
        title={entered ? `Typed on the dashboard, ${entered.slice(0, 10)}. Amounts are in rupees (INR).` : "Amounts are in rupees (INR); 2.5 Cr and 40 lakh work too."}
        placeholder="Add amount…"
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={(e) => { const text = e.target.value; setDraft((d) => ({ text, version: d?.version ?? entered, source: d?.source ?? record.source })); setError(null); }}
        onKeyDown={(e) => { if (e.key === "Escape" && !busy) { setDraft(null); setError(null); } }}
        className={`block w-full rounded border border-ink-600 bg-ink-900/60 px-2 py-1 text-right text-[12px] leading-snug tabular-nums ring-focus placeholder:text-slate-600 disabled:opacity-50 ${entered ? "text-champagne-400" : "text-slate-100"}`} />
      {dirty && <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
        <span className={`basis-full text-right text-[10.5px] ${typed != null && !Number.isFinite(typed) ? "text-loss" : "text-slate-500"}`} data-pm-capital-preview>
          {typed == null ? "blank" : Number.isFinite(typed) ? `₹${rupeeText(typed)}` : "not an amount"}
        </span>
        <button type="submit" disabled={!writable || busy} data-pm-capital-save={field} aria-label={`Save ${label.toLowerCase()}`}
          className="rounded bg-champagne-500 px-2 py-0.5 text-[11px] font-medium text-ink-950 ring-focus disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        <button type="button" disabled={busy} onClick={() => { setDraft(null); setError(null); }} aria-label={`Cancel ${label.toLowerCase()}`}
          className="rounded px-1 text-[11px] text-slate-500 ring-focus hover:text-slate-300 disabled:opacity-50">Cancel</button>
      </div>}
      {!dirty && entered && <button type="button" disabled={!writable || busy} onClick={() => { void save(undefined, true); }}
        data-pm-capital-remove={field} aria-label={`Remove typed ${label.toLowerCase()}`}
        title="Remove the typed figure for everyone; show the statement's figure where there is one"
        className="mt-1 rounded text-[10.5px] text-slate-500 ring-focus hover:text-loss disabled:opacity-50">{busy ? "Removing…" : "Remove typed figure"}</button>}
      {inputs.status === "loading" && <span className="text-[10.5px] text-slate-500">Loading…</span>}
      {inputs.status === "error" && <span title={inputs.error} className="text-[10.5px] text-slate-500">Unavailable</span>}
      {error && <p role="alert" className="mt-1 whitespace-normal text-left text-[11px] text-loss" data-pm-capital-error>{error}</p>}
    </form>
  );
}
