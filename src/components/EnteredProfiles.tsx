import { type FormEvent, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { CAUSE_WORD, SWITCH_ON_STEPS } from "@/lib/enteredCalls";
import { enteredOf, type EnteredProfile, type EnteredProfilesState } from "@/lib/enteredProfiles";
import { PROFILE_FIELDS, PROFILE_LABEL, type InvestmentProfile, type ProfileCell, type ProfileFieldId } from "@/lib/investmentProfiles";

type Result = { ok: true } | { ok: false; reason: string };

/** The hover on a cell's text: the whole text, where it came from, and that a click edits it. */
export function profileTitle(c: Extract<ProfileCell, { value: string }>, editable: boolean): string {
  const where = c.matchedOn === "entered" ? `Typed on the dashboard (${c.source.replace(/^typed on the dashboard · ?/, "") || "date not recorded"}).`
    : `Supplied in ${c.source}; matched to this investment by ${c.matchedOn}.`;
  return `${c.value}\n\n${where}${editable ? " Click to edit." : ""}`;
}

/**
 * ── ONE STRATEGY OR DESCRIPTION CELL, AS A BUTTON ──────────────────────────
 *
 * *"just like the capital call cells"* — the same four states, for the same
 * reasons (`EnteredCalls.tsx`): text the cell has (typed or supplied) is the
 * button; a cell with none is "Add" where the store can save, and names the
 * store's cause in a word where it cannot — never a dash that reads as
 * "nothing to say" when the truth is "nothing CAN be saved yet".
 */
export function ProfileCellButton({ cell, field, rowName, state, open, onOpen }: {
  cell: ProfileCell;
  field: ProfileFieldId;
  rowName: string;
  state: EnteredProfilesState;
  open: boolean;
  onOpen: () => void;
}) {
  const cls = "rounded px-1.5 py-0.5 text-left text-[12px] ring-focus transition-colors hover:bg-ink-700/60";
  if (cell.value != null) {
    return (
      <button type="button" onClick={onOpen} aria-expanded={open} data-pm-profile-edit={field} data-pm-profile-state="text"
        title={profileTitle(cell, true)} className={`${cls} -mx-1.5 block w-[calc(100%+0.75rem)]`}>
        <span className={`line-clamp-3 whitespace-pre-line ${cell.matchedOn === "entered" ? "text-champagne-400" : ""}`}>{cell.value}</span>
      </button>
    );
  }
  if (state.status === "loading") return <span className="text-[11px] text-slate-500" data-pm-profile-state="loading">Loading…</span>;
  if (state.status === "unavailable") {
    return (
      <button type="button" onClick={onOpen} aria-expanded={open} data-pm-profile-edit={field}
        data-pm-profile-state="unavailable" data-pm-profile-cause={state.cause}
        title={`${cell.reason}. ${state.reason}`} className={`${cls} whitespace-nowrap text-slate-500 hover:text-slate-300`}>
        {CAUSE_WORD[state.cause]}
      </button>
    );
  }
  return (
    <button type="button" onClick={onOpen} aria-expanded={open} data-pm-profile-edit={field} data-pm-profile-state="empty"
      title={`${cell.reason}. Add the ${PROFILE_LABEL[field].toLowerCase()} for ${rowName}.`}
      className={`${cls} inline-flex items-center gap-1 text-slate-500 hover:text-champagne-400`}>
      <Plus className="h-3 w-3" /> Add
    </button>
  );
}

/**
 * ── THE EDITOR, OPENED UNDER THE ROW ────────────────────────────────────────
 *
 * Both fields at once, the clicked one focused: they describe one investment.
 * A row over several fund lines of one company saves to each of them, and says
 * how many. "Remove typed text" takes the dashboard's text away for everyone
 * and shows the supplied file's again, where there is one.
 */
export function ProfileEditor({ keys, name, profile, entered, state, focus, onSave, onRemove, onClose }: {
  keys: readonly string[];
  name: string;
  /** The cells as the row shows them now — typed text laid over the file's. */
  profile: InvestmentProfile;
  entered: readonly EnteredProfile[];
  state: EnteredProfilesState;
  focus: ProfileFieldId;
  onSave: (keys: readonly string[], field: ProfileFieldId, name: string, text: string) => Promise<Result>;
  onRemove: (keys: readonly string[], field: ProfileFieldId) => Promise<Result>;
  onClose: () => void;
}) {
  const shown = (f: ProfileFieldId) => profile[f].value ?? "";
  const [text, setText] = useState<Record<ProfileFieldId, string>>({ strategy: shown("strategy"), description: shown("description") });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = { strategy: useRef<HTMLTextAreaElement>(null), description: useRef<HTMLTextAreaElement>(null) };
  const writable = state.status === "ready";
  useEffect(() => { if (writable) refs[focus].current?.focus(); }, [writable, focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const typed = (f: ProfileFieldId) => keys.some((k) => enteredOf(entered, k, f));
  const changed = PROFILE_FIELDS.filter((f) => text[f].trim() !== shown(f).trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    for (const f of changed) {
      const t = text[f].trim();
      // Emptying a field the dashboard filled removes the typed text; emptying
      // one only a file filled has nothing of the dashboard's to remove.
      const r = t ? await onSave(keys, f, name, t) : typed(f) ? await onRemove(keys, f) : { ok: true as const };
      if (!r.ok) { setBusy(false); setError(r.reason); return; }
    }
    setBusy(false);
    onClose();
  };
  const removeTyped = async (f: ProfileFieldId) => {
    setBusy(true); setError(null);
    const r = await onRemove(keys, f);
    setBusy(false);
    if (!r.ok) setError(r.reason);
    else onClose();
  };

  const input = "w-full rounded-md border border-ink-600 bg-ink-900/60 px-2 py-1.5 text-[12.5px] leading-snug text-slate-100 ring-focus placeholder:text-slate-600 disabled:opacity-50";
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-800 p-3" data-pm-profile-editor-body={keys.join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12.5px] font-medium text-slate-200">Strategy and description · {name}</div>
          {writable && (
            <div className="text-[11px] text-slate-500">
              Saved for everyone who opens this dashboard{keys.length > 1 ? `, on each of the ${keys.length} investments under this row` : ""}.
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} title="Close" aria-label="Close"
          className="grid h-6 w-6 place-items-center rounded text-slate-500 ring-focus hover:bg-ink-700/60 hover:text-slate-200">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {state.status === "unavailable" && (
        <p className="mt-2 text-[12px] text-amber-400" data-pm-profile-unavailable={state.cause}>{state.reason}</p>
      )}
      {state.status === "unavailable" && state.cause === "not-configured" && (
        <details className="mt-2 rounded-md border border-ink-700/70 px-3 py-2 text-[12px] text-slate-400" data-pm-profile-setup>
          <summary className="cursor-pointer text-slate-300">How to switch saving on — once, for everyone</summary>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5" data-prose-ok="setup steps">
            {SWITCH_ON_STEPS.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </details>
      )}
      {state.status === "loading" && <p className="mt-2 text-[12px] text-slate-500">Loading…</p>}
      <form onSubmit={submit} className="mt-3 grid gap-3 md:grid-cols-2" data-pm-profile-form={keys.join(" ")}>
        {PROFILE_FIELDS.map((f) => (
          <label key={f} className="flex flex-col gap-1">
            <span className="flex items-center justify-between gap-2">
              <span className="label-xs">{PROFILE_LABEL[f]}</span>
              {typed(f) && (
                <button type="button" disabled={!writable || busy} onClick={() => removeTyped(f)} data-pm-profile-remove={f}
                  title={`Remove the ${PROFILE_LABEL[f].toLowerCase()} typed here, for everyone — the supplied file's text shows again where there is one`}
                  className="rounded px-1 text-[11px] text-slate-500 ring-focus hover:text-loss disabled:opacity-50">Remove typed text</button>
              )}
            </span>
            <textarea ref={refs[f]} value={text[f]} rows={4} maxLength={2000} disabled={!writable || busy}
              onChange={(e) => setText((t) => ({ ...t, [f]: e.target.value }))}
              placeholder={f === "strategy" ? "How the fund invests — stage, sectors, geography" : "What the company does, and for whom"}
              className={input} data-pm-profile-input={f} />
            <span className="text-[10.5px] text-slate-500" title={profile[f].value != null ? profile[f].source : profile[f].reason}>
              {profile[f].value == null ? "Nothing supplied yet"
                : profile[f].matchedOn === "entered" ? "Typed on the dashboard" : "From a supplied file"}
            </span>
          </label>
        ))}
        <div className="flex items-center gap-2 md:col-span-2">
          <button type="submit" disabled={!writable || busy || !changed.length} data-pm-profile-save
            className="rounded-md bg-champagne-500 px-3 py-1 text-[12.5px] font-medium text-ink-950 ring-focus hover:bg-champagne-400 disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" disabled={busy} onClick={onClose}
            className="rounded-md border border-ink-600 px-3 py-1 text-[12.5px] text-slate-300 ring-focus hover:bg-ink-700/60">Cancel</button>
        </div>
      </form>
      {error && <p className="mt-2 text-[12px] text-loss" data-pm-profile-error>{error}</p>}
    </div>
  );
}
