// ── PRIVATE MARKET → WATCHLIST (client #310) ────────────────────────────────
//
// *"Is there a tab for watch list over here? … Can you add it? … Manually
//  [added companies]."* — Pratik, 22 Oct 2026.
//
// Companies and funds the family is WATCHING, not holding — added by hand and
// saved for everyone in the shared store (`src/lib/privateWatchlist.ts`). It is
// the family's own judgement, kept apart from the book: nothing here is counted
// in any holding total. Add, edit and remove; the store's four causes (not set
// up, signed out, no function, error) are worded exactly as the capital calls'.
import { useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { AbsentSection } from "@/components/Absent";
import { ExportableTable } from "@/components/ExportableTable";
import {
  usePrivateWatchlist, addedOn, SWITCH_ON_STEPS,
  type WatchDraft, type WatchItem, type WatchKind, type StoreCause,
} from "@/lib/privateWatchlist";

const EMPTY: WatchDraft = { name: "", kind: "company", legalEntity: "", sector: "", notes: "", addedBy: "" };

const INPUT = "w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-champagne-500 focus:outline-none";
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400";

/** What would fix each store cause — the hover on the absence box. */
const NEEDS: Record<StoreCause, string> = {
  "not-configured": "Add the GLOW_GITHUB_TOKEN secret on the site — the one-time steps are below.",
  "signed-out": "Sign in again.",
  "no-function": "Open this on the deployed site, where the shared store runs.",
  "no-answer": "Nothing was lost — try again in a moment.",
  error: "Nothing was lost — try again in a moment.",
};

export default function PrivateWatchlist() {
  const { state, save, remove } = usePrivateWatchlist();
  const [draft, setDraft] = useState<WatchDraft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<WatchDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const reset = () => { setDraft(EMPTY); setEditingId(null); setError(null); };

  const edit = (item: WatchItem) => {
    setEditingId(item.id);
    setDraft({ id: item.id, name: item.name, kind: item.kind, legalEntity: item.legalEntity, sector: item.sector, notes: item.notes, addedBy: item.addedBy });
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) { setError("Give the company or fund a name."); return; }
    setBusy(true); setError(null);
    const r = await save({ ...draft, name: draft.name.trim() });
    setBusy(false);
    if (r.ok) reset();
    else setError(r.reason);
  };

  const onRemove = async (item: WatchItem) => {
    if (!window.confirm(`Remove ${item.name} from the watchlist?`)) return;
    setBusy(true); setError(null);
    const r = await remove(item.id);
    setBusy(false);
    if (!r.ok) setError(r.reason);
    else if (editingId === item.id) reset();
  };

  // ── The store could not be read: name the cause, and for a store nobody has
  //    connected yet, the one-time steps that connect it. Never an empty tab,
  //    which would read as "nothing is being watched". ──
  if (state.status === "unavailable") {
    return (
      <div className="p-4" data-private-watchlist="unavailable" data-watch-cause={state.cause}>
        <AbsentSection what={state.reason} needs={NEEDS[state.cause]} />
        {state.cause === "not-configured" && (
          <ol className="mt-3 max-w-3xl list-decimal space-y-2 pl-5 text-[12.5px] text-slate-400" data-prose-ok="one-time set-up steps for the shared store, shown only when it is not connected">
            {SWITCH_ON_STEPS.map((step, i) => <li key={i}>{step}</li>)}
          </ol>
        )}
      </div>
    );
  }

  const items = state.status === "ready" ? state.items : [];

  return (
    <div className="p-4" data-private-watchlist={state.status}>
      <p className="mb-3 text-[12.5px] text-slate-400" data-prose-ok="what the watchlist is, once, above its own form">
        Companies and funds you are tracking but do not hold yet. Added by hand and saved for everyone — kept apart from the book, so nothing here is counted in any holding total.
      </p>

      {/* ── ADD / EDIT ──────────────────────────────────────────────────────── */}
      <form onSubmit={submit} className="rounded-lg border border-ink-700 bg-ink-900/40 p-3" data-watch-form={editingId ? "edit" : "add"}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className={LABEL}>Name</span>
            <input className={INPUT} data-watch-field="name" value={draft.name} placeholder="Company or fund name"
              onChange={(e) => set({ name: e.target.value })} required />
          </label>
          <label className="block">
            <span className={LABEL}>Kind</span>
            <select className={INPUT} data-watch-field="kind" value={draft.kind}
              onChange={(e) => set({ kind: e.target.value as WatchKind })}>
              <option value="company">Company</option>
              <option value="fund">Fund</option>
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Brand / legal entity</span>
            <input className={INPUT} data-watch-field="legalEntity" value={draft.legalEntity} placeholder="Optional"
              onChange={(e) => set({ legalEntity: e.target.value })} />
          </label>
          <label className="block">
            <span className={LABEL}>Sector</span>
            <input className={INPUT} data-watch-field="sector" value={draft.sector} placeholder="Optional"
              onChange={(e) => set({ sector: e.target.value })} />
          </label>
          <label className="block">
            <span className={LABEL}>Added by</span>
            <input className={INPUT} data-watch-field="addedBy" value={draft.addedBy} placeholder="Your name (optional)"
              onChange={(e) => set({ addedBy: e.target.value })} />
          </label>
          <label className="block lg:col-span-1 sm:col-span-2">
            <span className={LABEL}>Notes</span>
            <input className={INPUT} data-watch-field="notes" value={draft.notes} placeholder="Why you are watching it (optional)"
              onChange={(e) => set({ notes: e.target.value })} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="submit" disabled={busy || !draft.name.trim()} data-watch-submit
            className="inline-flex items-center gap-1.5 rounded-md bg-champagne-500 px-3 py-1.5 text-[12.5px] font-semibold text-ink-950 transition-colors hover:bg-champagne-400 disabled:opacity-50">
            {editingId ? <><Pencil size={13} aria-hidden /> Save changes</> : <><Plus size={13} aria-hidden /> Add to watchlist</>}
          </button>
          {editingId && (
            <button type="button" onClick={reset} data-watch-cancel
              className="inline-flex items-center gap-1 rounded-md border border-ink-700 px-2.5 py-1.5 text-[12.5px] text-slate-300 hover:bg-ink-700/60">
              <X size={13} aria-hidden /> Cancel
            </button>
          )}
          {error && <span className="text-[12.5px] text-rose-400" data-watch-error role="alert">{error}</span>}
        </div>
      </form>

      {/* ── THE LIST ────────────────────────────────────────────────────────── */}
      {items.length === 0 ? (
        <p className="mt-6 text-[13px] text-slate-400" data-watch-empty data-prose-ok="the watchlist is genuinely empty — this is a measured empty state, not a missing figure">
          No companies on the watchlist yet. Add one above and it is saved for everyone.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto" data-navigation-scroll="privatewatchlist-1">
          <ExportableTable exportName="Private market — watchlist" className="min-w-full text-[13px]" data-watch-table data-table-static="a hand-kept list, newest first; it is not a figure table to rearrange">
            <thead className="border-b border-ink-700 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Brand / entity</th>
                <th className="px-3 py-2">Sector</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2">Added</th>
                <th className="px-3 py-2 text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {items.map((item) => (
                <tr key={item.id} data-watch-item={item.id}>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-100">{item.name}</span>
                    <span className="ml-2 rounded bg-ink-700/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300" data-watch-kind={item.kind}>
                      {item.kind}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-300">{item.legalEntity || <span className="text-slate-600">—</span>}</td>
                  <td className="px-3 py-2 text-slate-300">{item.sector || <span className="text-slate-600">—</span>}</td>
                  <td className="px-3 py-2 text-slate-400">{item.notes || <span className="text-slate-600">—</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-400">
                    {item.addedBy ? <span>{item.addedBy} · </span> : null}{addedOn(item.updatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => edit(item)} disabled={busy} title="Edit" aria-label={`Edit ${item.name}`}
                        className="rounded p-1 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200 disabled:opacity-50" data-watch-edit={item.id}>
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button type="button" onClick={() => onRemove(item)} disabled={busy} title="Remove" aria-label={`Remove ${item.name}`}
                        className="rounded p-1 text-slate-400 hover:bg-ink-700/60 hover:text-rose-400 disabled:opacity-50" data-watch-remove={item.id}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </ExportableTable>
        </div>
      )}
    </div>
  );
}
