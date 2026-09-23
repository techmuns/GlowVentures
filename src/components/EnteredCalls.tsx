import { type FormEvent, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { fmtDate } from "@/lib/format";
import {
  type CallDraft, type EnteredCall, type EnteredCallsState,
  CAUSE_WORD, SWITCH_ON_STEPS, callsOf, headlineCall, parseRupees,
} from "@/lib/enteredCalls";

type Money = (n: number | null | undefined, sign?: boolean) => string;
type Result = { ok: true } | { ok: false; reason: string };

/**
 * ── ONE CELL OF THE FUND TABLE'S "CAPITAL CALL" COLUMN ─────────────────────
 *
 * *"it simply needs to be a editable coloumn in this table itself which people
 *  can add and edit capital call and save and it stays same for all."*
 *
 * It shows ONE call — the soonest still to come, or the latest if every one is
 * past — and how many more there are, and it is the button that opens the
 * editor under the row. Four states and each looks different, because they are
 * four different facts:
 *
 *   loading      the list has not arrived yet — never a dash, which would say
 *                there is nothing;
 *   unavailable  the store could not be read. The cell NAMES the cause in a
 *                word ("Not set up", "Signed out") and opens the editor, where
 *                the whole reason is. It was an em dash with the reason in a
 *                hover, and a column of dashes read as "nothing entered" —
 *                *"which is empty right now"* — so it says what it is;
 *   no call      an "Add" button — nothing has been entered for this fund;
 *   a call       its amount and date, in the colour this page gives a figure
 *                the FAMILY entered rather than one a statement printed.
 */
export function CallCell({ fund, fundName, state, today, open, onToggle, money }: {
  fund: string;
  fundName: string;
  state: EnteredCallsState;
  today: string;
  open: boolean;
  onToggle: () => void;
  money: Money;
}) {
  if (state.status === "loading") {
    return <span className="text-[11px] text-slate-500" data-pm-call-state="loading">Loading…</span>;
  }
  const cls = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] ring-focus transition-colors hover:bg-ink-700/60";
  if (state.status === "unavailable") {
    // NEVER "Add": a button that promises a save the store cannot make is the
    // control that looks live and does nothing. It opens the editor, which
    // says why and keeps Save switched off.
    return (
      <button type="button" onClick={onToggle} aria-expanded={open}
        data-pm-call-state="unavailable" data-pm-call-cause={state.cause}
        title={state.reason}
        className={`${cls} whitespace-nowrap text-slate-500 hover:text-slate-300`}>
        {CAUSE_WORD[state.cause]}
      </button>
    );
  }
  const head = headlineCall(state.calls, fund, today);
  if (!head) {
    return (
      <button type="button" onClick={onToggle} aria-expanded={open}
        data-pm-call-add={fund} data-pm-call-state="empty"
        title={`Add a capital call for ${fundName}`}
        className={`${cls} text-slate-500 hover:text-champagne-400`}>
        <Plus className="h-3 w-3" /> Add
      </button>
    );
  }
  /* TWO LINES, AMOUNT OVER DATE. It is a cell in a twelve-column table, and one
     line of "₹2.5 Cr · 23 Oct 2026 +1" was the widest thing in it — wide enough
     to push the As of column off the card. The amount is what a reader scans
     for, so it is the line in the figure's colour. */
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      data-pm-call={fund} data-pm-call-state="ready"
      data-call-amount={head.call.amount} data-call-date={head.call.date} data-call-more={head.more}
      title={`${head.past ? "Latest call entered (already past)" : "Next call entered"} — open to add, edit or delete`}
      className={`inline-flex flex-col items-start rounded px-1.5 py-0.5 text-left text-[12px] leading-tight ring-focus transition-colors hover:bg-ink-700/60 tabular ${head.past ? "text-slate-400" : "text-champagne-400"}`}>
      <span>{money(head.call.amount)}</span>
      <span className="text-[10.5px] text-slate-500">
        {fmtDate(head.call.date)}
        {head.past && <> · past</>}
        {head.more > 0 && <> · +{head.more}</>}
      </span>
    </button>
  );
}

/** A rupee figure written the way the family types one, so an edit round-trips. */
export function rupeesText(amount: number): string {
  const trim = (n: number) => String(Math.round(n * 10000) / 10000);
  if (amount >= 1e7) return `${trim(amount / 1e7)} Cr`;
  if (amount >= 1e5) return `${trim(amount / 1e5)} L`;
  return trim(amount);
}

/**
 * ── THE EDITOR, OPENED UNDER THE ROW ────────────────────────────────────────
 *
 * A row under the fund rather than a floating panel: it cannot be clipped by
 * the table's own horizontal scroll, it reads as belonging to the fund above
 * it, and it is the same shape as the folio panel beside it — "all views on
 * the master table itself".
 *
 * Every call for the fund is listed with its date, amount and note, and each
 * can be edited or deleted. A delete asks once more, because it removes the
 * call from every screen that opens the dashboard, not only this one.
 */
export function CallEditor({ fund, fundName, state, onSave, onDelete, onClose, money }: {
  fund: string;
  fundName: string;
  state: EnteredCallsState;
  onSave: (d: CallDraft) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
  onClose: () => void;
  money: Money;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const calls: EnteredCall[] = state.status === "ready" ? callsOf(state.calls, fund) : [];
  const writable = state.status === "ready";

  useEffect(() => { if (writable) dateRef.current?.focus(); }, [writable]);

  const reset = () => { setEditing(null); setDate(""); setAmount(""); setNote(""); setError(null); };
  const startEdit = (c: EnteredCall) => {
    setEditing(c.id); setDate(c.date); setAmount(rupeesText(c.amount)); setNote(c.note); setError(null); setConfirm(null);
    dateRef.current?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError("Give the date the call is due."); return; }
    const rupees = parseRupees(amount);
    if (rupees == null) { setError("Give the amount in rupees — for example 2 Cr, 50 L or 25000000."); return; }
    setBusy(true); setError(null);
    const r = await onSave({ id: editing ?? undefined, fund, fundName, date, amount: rupees, note: note.trim() });
    setBusy(false);
    if (r.ok) reset(); else setError(r.reason);
  };

  const remove = async (id: string) => {
    setBusy(true); setError(null);
    const r = await onDelete(id);
    setBusy(false); setConfirm(null);
    if (!r.ok) setError(r.reason);
    else if (editing === id) reset();
  };

  const input = "rounded-md border border-ink-600 bg-ink-900/60 px-2 py-1 text-[12.5px] text-slate-100 ring-focus placeholder:text-slate-600 disabled:opacity-50";

  return (
    <div className="rounded-lg border border-ink-700 bg-ink-800 p-3" data-pm-call-editor-body={fund}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12.5px] font-medium text-slate-200">Capital calls · {fundName}</div>
          {/* ONLY WHERE IT IS TRUE. With the store switched off nothing here is
              saved for anyone, and this line would say otherwise. */}
          {writable && <div className="text-[11px] text-slate-500">Saved for everyone who opens this dashboard.</div>}
        </div>
        <button type="button" onClick={onClose} title="Close" aria-label="Close"
          className="grid h-6 w-6 place-items-center rounded text-slate-500 ring-focus hover:bg-ink-700/60 hover:text-slate-200">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {state.status === "unavailable" && (
        <p className="mt-2 text-[12px] text-amber-400" data-pm-call-unavailable={state.cause}>{state.reason}</p>
      )}
      {/* THE ONE-TIME SET-UP, for the one cause it fixes. Folded, because the
          family reads this page and the steps are for whoever manages the site;
          a signed-out reader is never shown them. */}
      {state.status === "unavailable" && state.cause === "not-configured" && (
        <details className="mt-2 rounded-md border border-ink-700/70 px-3 py-2 text-[12px] text-slate-400" data-pm-call-setup>
          <summary className="cursor-pointer text-slate-300">How to switch saving on — once, for everyone</summary>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5">
            {SWITCH_ON_STEPS.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </details>
      )}
      {state.status === "loading" && <p className="mt-2 text-[12px] text-slate-500">Loading…</p>}

      {calls.length > 0 && (
        <ul className="mt-2 divide-y divide-ink-700/60 rounded-md border border-ink-700/70" data-pm-call-list={fund}>
          {calls.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-[12.5px]" data-pm-call-row={c.id}>
              <span className="w-28 text-slate-300">{fmtDate(c.date)}</span>
              <span className="w-28 mono text-champagne-400">{money(c.amount)}</span>
              <span className="min-w-0 flex-1 truncate text-slate-400" title={c.note || undefined}>{c.note}</span>
              {confirm === c.id ? (
                <span className="flex items-center gap-2 text-[12px]">
                  <span className="text-amber-400">Delete for everyone?</span>
                  <button type="button" disabled={busy} onClick={() => remove(c.id)} data-pm-call-delete-yes={c.id}
                    className="rounded px-1.5 py-0.5 text-loss ring-focus hover:bg-ink-700/60 disabled:opacity-50">Delete</button>
                  <button type="button" disabled={busy} onClick={() => setConfirm(null)}
                    className="rounded px-1.5 py-0.5 text-slate-400 ring-focus hover:bg-ink-700/60">Keep</button>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[12px]">
                  <button type="button" disabled={busy} onClick={() => startEdit(c)} data-pm-call-edit={c.id}
                    className="rounded px-1.5 py-0.5 text-slate-400 ring-focus hover:bg-ink-700/60 hover:text-slate-200 disabled:opacity-50">Edit</button>
                  <button type="button" disabled={busy} onClick={() => { setConfirm(c.id); setError(null); }} data-pm-call-delete={c.id}
                    className="rounded px-1.5 py-0.5 text-slate-400 ring-focus hover:bg-ink-700/60 hover:text-loss disabled:opacity-50">Delete</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3" data-pm-call-form={fund}>
        <label className="flex flex-col gap-1">
          <span className="label-xs">Due date</span>
          <input ref={dateRef} type="date" value={date} onChange={(e) => setDate(e.target.value)}
            disabled={!writable || busy} required className={input} data-pm-call-input="date" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-xs">Amount (₹)</span>
          <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
            disabled={!writable || busy} placeholder="e.g. 2 Cr or 50 L" required className={`${input} w-36`}
            data-pm-call-input="amount" />
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <span className="label-xs">Note (optional)</span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={240}
            disabled={!writable || busy} placeholder="e.g. drawdown notice received" className={input}
            data-pm-call-input="note" />
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={!writable || busy} data-pm-call-save
            className="rounded-md bg-champagne-500 px-3 py-1 text-[12.5px] font-medium text-ink-950 ring-focus hover:bg-champagne-400 disabled:opacity-50">
            {busy ? "Saving…" : editing ? "Save changes" : "Add call"}
          </button>
          {editing && (
            <button type="button" disabled={busy} onClick={reset}
              className="rounded-md border border-ink-600 px-3 py-1 text-[12.5px] text-slate-300 ring-focus hover:bg-ink-700/60">
              Cancel edit
            </button>
          )}
        </div>
      </form>
      {error && <p className="mt-2 text-[12px] text-loss" data-pm-call-error>{error}</p>}
    </div>
  );
}
