import { useState, type FormEvent } from "react";
import { CAUSE_WORD } from "@/lib/enteredCalls";
import { type EnteredProfilesState } from "@/lib/enteredProfiles";
import { PROFILE_LABEL, type ProfileCell, type ProfileFieldId } from "@/lib/investmentProfiles";

type Result = { ok: true } | { ok: false; reason: string };

/** The whole text and its provenance, including on read-only aggregate rows. */
export function profileTitle(c: Extract<ProfileCell, { value: string }>): string {
  const where = c.matchedOn === "entered" ? `Typed on the dashboard (${c.source.replace(/^typed on the dashboard · ?/, "") || "date not recorded"}).`
    : `Supplied in ${c.source}; matched to this investment by ${c.matchedOn}.`;
  return `${c.value}\n\n${where}`;
}

/** Always-open table input. A draft stays local until Save succeeds. */
export function ProfileCellInput({ cell, field, rowName, funds, entered, state, onSave, onRemove }: {
  cell: ProfileCell;
  field: ProfileFieldId;
  rowName: string;
  funds: readonly string[];
  entered: boolean;
  state: EnteredProfilesState;
  onSave: (text: string) => Promise<Result>;
  onRemove: () => Promise<Result>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = cell.value ?? "";
  const dirty = draft !== null && draft !== shown;
  const writable = state.status === "ready";
  const label = `${PROFILE_LABEL[field]} for ${rowName}`;
  const title = state.status === "unavailable" ? state.reason : cell.value !== null ? profileTitle(cell) : cell.reason;

  const save = async (e?: FormEvent, remove = false) => {
    e?.preventDefault();
    if (!writable || busy || (!remove && !dirty)) return;
    setBusy(true); setError(null);
    try {
      const text = (draft ?? shown).trim();
      const result = remove || !text
        ? entered ? await onRemove() : { ok: true as const }
        : await onSave(text);
      if (result.ok) setDraft(null);
      else setError(result.reason);
    } catch {
      setError("Could not save. Your draft is still here; try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} data-pm-profile-form={field} data-pm-profile-funds={funds.join(" ")} data-export-value={cell.value ?? "—"} className="min-w-0">
      <textarea value={draft ?? shown} rows={2} maxLength={2000} disabled={!writable || busy}
        aria-label={label} aria-invalid={error ? true : undefined} title={title} data-pm-profile-input={field}
        placeholder={field === "strategy" ? "Write strategy…" : "Write description…"}
        onChange={(e) => { setDraft(e.target.value === shown ? null : e.target.value); setError(null); }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); e.currentTarget.form?.requestSubmit(); }
          if (e.key === "Escape" && !busy) { setDraft(null); setError(null); }
        }}
        className={`block w-full resize-y rounded border border-ink-600 bg-ink-900/60 px-2 py-1 text-[12px] leading-snug ring-focus placeholder:text-slate-600 disabled:opacity-50 ${cell.matchedOn === "entered" ? "text-champagne-400" : "text-slate-100"}`} />
      {dirty && <div className="mt-1 flex items-center gap-2">
        <button type="submit" disabled={!writable || busy} data-pm-profile-save={field} aria-label={`Save ${label.toLowerCase()}`}
          className="rounded bg-champagne-500 px-2 py-0.5 text-[11px] font-medium text-ink-950 ring-focus disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        <button type="button" disabled={busy} onClick={() => { setDraft(null); setError(null); }} aria-label={`Cancel ${label.toLowerCase()}`}
          className="rounded px-1 text-[11px] text-slate-500 ring-focus hover:text-slate-300 disabled:opacity-50">Cancel</button>
      </div>}
      {!dirty && entered && <button type="button" disabled={!writable || busy} onClick={() => { void save(undefined, true); }}
        data-pm-profile-remove={field} aria-label={`Remove typed ${label.toLowerCase()}`}
        title="Remove the typed text for everyone; show the supplied file's text where available"
        className="mt-1 rounded text-[10.5px] text-slate-500 ring-focus hover:text-loss disabled:opacity-50">{busy ? "Removing…" : "Remove typed text"}</button>}
      {state.status === "loading" && <span className="text-[10.5px] text-slate-500">Loading…</span>}
      {state.status === "unavailable" && <span title={state.reason} data-pm-profile-cause={state.cause} className="text-[10.5px] text-slate-500">{CAUSE_WORD[state.cause]}</span>}
      {error && <p role="alert" className="mt-1 text-[11px] text-loss" data-pm-profile-error>{error}</p>}
    </form>
  );
}
