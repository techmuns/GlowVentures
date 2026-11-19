import { type FormEvent, useEffect, useRef, useState } from "react";
import { ExternalLink, FolderOpen, Pencil, Plus, X } from "lucide-react";
import {
  CAUSE_WORD, SWITCH_ON_STEPS,
} from "@/lib/enteredCalls";
import {
  type HoldingLink, type HoldingLinkDraft, type HoldingLinksState, isHttpUrl, linkFor, linkHost,
} from "@/lib/holdingLinks";
import {
  type HoldingShares, type HoldingSharesDraft, type HoldingSharesState, parseShares, sharesFor, sharesText,
} from "@/lib/holdingShares";

/**
 * ── THE FAMILY'S OWN RECORDS ON A PRIVATE COMPANY'S PAGE ────────────────────
 *
 * Two things the family types on a private holding and keeps for everyone — the
 * documents-folder link (#420) and the share count the statement omits (#434) —
 * both saved to the shared store, both with the capital calls' four causes
 * (`enteredCalls.ts`). The editors sit in a card on the Position tab, where the
 * holding's own facts are; the documents link is echoed read-only in the header
 * for a quick way in.
 */

type Result = { ok: true } | { ok: false; reason: string };
type Unready = { status: "loading" } | { status: "unavailable"; reason: string; cause: "not-configured" | "signed-out" | "no-function" | "no-answer" | "error" };

const input = "rounded-md border border-ink-600 bg-ink-900/60 px-2 py-1 text-[12.5px] text-slate-100 ring-focus placeholder:text-slate-600 disabled:opacity-50";
const saveBtn = "rounded-md bg-champagne-500 px-3 py-1 text-[12.5px] font-medium text-ink-950 ring-focus hover:bg-champagne-400 disabled:opacity-50";
const ghostBtn = "rounded-md border border-ink-600 px-3 py-1 text-[12.5px] text-slate-300 ring-focus hover:bg-ink-700/60 disabled:opacity-50";

/**
 * The reason the store could not be read, and — for the one cause whoever runs
 * the site fixes — the one-time set-up steps, folded (the family reads this page;
 * a signed-out reader is never shown them). The same copy as the capital calls,
 * so one outage is never worded two ways.
 */
export function StoreUnavailableNote({ state, what }: { state: Unready; what: string }) {
  if (state.status === "loading") return <p className="mt-1 text-[12px] text-slate-500">Loading…</p>;
  return (
    <>
      <p className="mt-1 text-[12px] text-amber-400" data-pc-store-unavailable={state.cause}>{state.reason}</p>
      {state.cause === "not-configured" && (
        <details className="mt-2 rounded-md border border-ink-700/70 px-3 py-2 text-[12px] text-slate-400" data-navigation-details={`holding-inputs-${what}`}>
          <summary className="cursor-pointer text-slate-300">How to switch saving on — once, for everyone</summary>
          {/* `data-prose-ok`: a PROCEDURE opened on purpose, inside a fold closed
              until then — shortening it loses the menu names. */}
          <ol className="mt-1.5 list-decimal space-y-1 pl-5" data-prose-ok="setup steps">
            {SWITCH_ON_STEPS.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </details>
      )}
    </>
  );
}

/* ── #420 · THE DOCUMENTS-FOLDER LINK, READ-ONLY IN THE HEADER ─────────────── */

/** The quick "open the folder" link echoed in the company header when one is set. */
export function DocumentsFolderLink({ link }: { link: HoldingLink }) {
  return (
    <a href={link.url} target="_blank" rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-[12px] text-champagne-400 ring-focus hover:underline"
      data-pc-docs-link={link.key}
      title={`${link.label || "Documents folder"} — opens ${linkHost(link.url)} in a new tab${link.note ? `. ${link.note}` : ""}`}>
      <FolderOpen className="h-3.5 w-3.5" /> {link.label || "Documents folder"} <ExternalLink className="h-3 w-3 opacity-70" />
    </a>
  );
}

/* ── #420 · THE DOCUMENTS-FOLDER ROW, VIEW + EDITOR ────────────────────────── */

export function DocumentsFolderRow({ companyKey, companyName, state, onSave, onDelete }: {
  companyKey: string;
  companyName: string;
  state: HoldingLinksState;
  onSave: (d: HoldingLinkDraft) => Promise<Result>;
  onDelete: (key: string) => Promise<Result>;
}) {
  const existing = state.status === "ready" ? linkFor(state.links, companyKey) : null;
  const writable = state.status === "ready";
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [urlText, setUrlText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  const start = () => {
    setLabel(existing?.label ?? ""); setUrlText(existing?.url ?? ""); setNote(existing?.note ?? "");
    setError(null); setConfirm(false); setOpen(true);
  };
  useEffect(() => { if (open) urlRef.current?.focus(); }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isHttpUrl(urlText.trim())) { setError("Give the folder's web address — an https link, for example to your OneDrive or shared-drive folder."); return; }
    setBusy(true); setError(null);
    const r = await onSave({ key: companyKey, label: label.trim(), url: urlText.trim(), note: note.trim() });
    setBusy(false);
    if (r.ok) setOpen(false); else setError(r.reason);
  };
  const remove = async () => {
    setBusy(true); setError(null);
    const r = await onDelete(companyKey);
    setBusy(false); setConfirm(false);
    if (r.ok) setOpen(false); else setError(r.reason);
  };

  return (
    <div className="py-2" data-pc-docs-row={companyKey}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-36 shrink-0 text-[12px] font-medium text-slate-300" title="A link to the cloud folder — OneDrive, a shared drive — where this holding's documents are kept. Saved for everyone; it is a pointer, nothing is read from it.">Documents folder</span>
        {existing
          ? <DocumentsFolderLink link={existing} />
          : <span className="text-[12px] text-slate-500" data-pc-docs-empty>No folder link saved{writable ? "" : " — "}{!writable && (state.status === "unavailable" ? CAUSE_WORD[state.cause] : "loading…")}</span>}
        <span className="flex-1" />
        {writable && (
          <button type="button" onClick={() => (open ? setOpen(false) : start())} data-pc-docs-edit={companyKey}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-slate-400 ring-focus hover:bg-ink-700/60 hover:text-slate-200">
            {existing ? <><Pencil className="h-3 w-3" /> Edit</> : <><Plus className="h-3 w-3" /> Add link</>}
          </button>
        )}
        {!writable && !open && (
          <button type="button" onClick={() => setOpen(true)} data-pc-docs-why
            className="rounded px-1.5 py-0.5 text-[12px] text-slate-500 ring-focus hover:bg-ink-700/60 hover:text-slate-300">
            Why can't I save?
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-ink-700 bg-ink-800 p-3" data-pc-docs-editor={companyKey}>
          {!writable && <StoreUnavailableNote state={state} what="docs" />}
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
              <span className="label-xs">Folder link</span>
              <input ref={urlRef} type="url" value={urlText} onChange={(e) => setUrlText(e.target.value)}
                disabled={!writable || busy} required placeholder="https://… (OneDrive, shared drive, Drive)"
                className={input} data-pc-docs-input="url" />
            </label>
            <label className="flex w-40 flex-col gap-1">
              <span className="label-xs">Label (optional)</span>
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160}
                disabled={!writable || busy} placeholder="e.g. Deal docs" className={input} data-pc-docs-input="label" />
            </label>
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <span className="label-xs">Note (optional)</span>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={240}
                disabled={!writable || busy} placeholder="e.g. SHA, term sheet, CA workings" className={input} data-pc-docs-input="note" />
            </label>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={!writable || busy} className={saveBtn} data-pc-docs-save>
                {busy ? "Saving…" : existing ? "Save link" : "Add link"}
              </button>
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className={ghostBtn}>Cancel</button>
            </div>
          </form>
          {writable && <p className="mt-2 text-[11px] text-slate-500">Saved for everyone who opens this dashboard.</p>}
          {existing && writable && (
            <div className="mt-2 border-t border-ink-700/60 pt-2 text-[12px]">
              {confirm ? (
                <span className="flex items-center gap-2">
                  <span className="text-amber-400">Remove this link for everyone?</span>
                  <button type="button" disabled={busy} onClick={remove} data-pc-docs-delete-yes
                    className="rounded px-1.5 py-0.5 text-loss ring-focus hover:bg-ink-700/60 disabled:opacity-50">Remove</button>
                  <button type="button" disabled={busy} onClick={() => setConfirm(false)}
                    className="rounded px-1.5 py-0.5 text-slate-400 ring-focus hover:bg-ink-700/60">Keep</button>
                </span>
              ) : (
                <button type="button" disabled={busy} onClick={() => { setConfirm(true); setError(null); }} data-pc-docs-delete
                  className="rounded px-1.5 py-0.5 text-slate-400 ring-focus hover:bg-ink-700/60 hover:text-loss disabled:opacity-50">Remove link</button>
              )}
            </div>
          )}
          {error && <p className="mt-2 text-[12px] text-loss" data-pc-docs-error>{error}</p>}
        </div>
      )}
    </div>
  );
}

/* ── #434 · THE SHARE-COUNT ROW, VIEW + EDITOR ─────────────────────────────── */

export function ShareCountRow({ companyKey, companyName, statementShares, state, onSave, onDelete }: {
  companyKey: string;
  companyName: string;
  /** The share count the statement itself carries, if any — the row explains that it wins. */
  statementShares: number | null;
  state: HoldingSharesState;
  onSave: (d: HoldingSharesDraft) => Promise<Result>;
  onDelete: (key: string) => Promise<Result>;
}) {
  const existing = state.status === "ready" ? sharesFor(state.records, companyKey) : null;
  const writable = state.status === "ready";
  const [open, setOpen] = useState(false);
  const [countText, setCountText] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const countRef = useRef<HTMLInputElement>(null);

  const start = () => {
    setCountText(existing ? sharesText(existing.shares) : ""); setSource(existing?.source ?? "");
    setError(null); setConfirm(false); setOpen(true);
  };
  useEffect(() => { if (open) countRef.current?.focus(); }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseShares(countText);
    if (n == null) { setError("Give the number of shares — for example 1,20,000 or 120000."); return; }
    if (!source.trim()) { setError("Say where this count is from — a CAS, an MGT-7 filing, an allotment letter, or that you entered it by hand."); return; }
    setBusy(true); setError(null);
    const r = await onSave({ key: companyKey, label: companyName, shares: n, source: source.trim() });
    setBusy(false);
    if (r.ok) setOpen(false); else setError(r.reason);
  };
  const remove = async () => {
    setBusy(true); setError(null);
    const r = await onDelete(companyKey);
    setBusy(false); setConfirm(false);
    if (r.ok) setOpen(false); else setError(r.reason);
  };

  // The statement's own count wins; an entered one is for where it carries none.
  if (statementShares != null) {
    return (
      <div className="py-2" data-pc-shares-row={companyKey} data-pc-shares-statement="">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-36 shrink-0 text-[12px] font-medium text-slate-300">Share count</span>
          <span className="text-[12px] text-slate-400" title="This holding's statement carries its own share count, so there is nothing to enter — it is used as printed.">
            {sharesText(statementShares)} <span className="text-slate-500">· from the statement</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="py-2" data-pc-shares-row={companyKey}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-36 shrink-0 text-[12px] font-medium text-slate-300" title="The statement carries no share count for this holding, so the stake cannot be struck. Read it off a depository CAS, an MGT-7 the company filed, or an allotment letter, and enter it here. Saved for everyone; labelled as an entered count wherever it is used.">Share count</span>
        {existing
          ? <span className="text-[12px] text-slate-200" data-pc-shares-value={existing.shares}>
              {sharesText(existing.shares)} <span className="text-slate-500" title={`Source: ${existing.source}`} data-pc-shares-source>· {existing.source}</span>
            </span>
          : <span className="text-[12px] text-slate-500" data-pc-shares-empty>None entered — the statement carries no count{writable ? "" : (state.status === "unavailable" ? ` · ${CAUSE_WORD[state.cause]}` : " · loading…")}</span>}
        <span className="flex-1" />
        {writable && (
          <button type="button" onClick={() => (open ? setOpen(false) : start())} data-pc-shares-edit={companyKey}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-slate-400 ring-focus hover:bg-ink-700/60 hover:text-slate-200">
            {existing ? <><Pencil className="h-3 w-3" /> Edit</> : <><Plus className="h-3 w-3" /> Add count</>}
          </button>
        )}
        {!writable && !open && (
          <button type="button" onClick={() => setOpen(true)} data-pc-shares-why
            className="rounded px-1.5 py-0.5 text-[12px] text-slate-500 ring-focus hover:bg-ink-700/60 hover:text-slate-300">
            Why can't I save?
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-ink-700 bg-ink-800 p-3" data-pc-shares-editor={companyKey}>
          {!writable && <StoreUnavailableNote state={state} what="shares" />}
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <label className="flex w-40 flex-col gap-1">
              <span className="label-xs">Shares held</span>
              <input ref={countRef} type="text" inputMode="decimal" value={countText} onChange={(e) => setCountText(e.target.value)}
                disabled={!writable || busy} required placeholder="e.g. 1,20,000" className={input} data-pc-shares-input="count" />
            </label>
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
              <span className="label-xs">Source (required)</span>
              <input type="text" value={source} onChange={(e) => setSource(e.target.value)} maxLength={160}
                disabled={!writable || busy} required placeholder="e.g. CAS 31 Mar 2026, MGT-7 FY24, allotment letter"
                className={input} data-pc-shares-input="source" />
            </label>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={!writable || busy} className={saveBtn} data-pc-shares-save>
                {busy ? "Saving…" : existing ? "Save count" : "Add count"}
              </button>
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className={ghostBtn}>Cancel</button>
            </div>
          </form>
          {writable && <p className="mt-2 text-[11px] text-slate-500">Saved for everyone who opens this dashboard. The stake it strikes is labelled as an entered count, not a statement figure.</p>}
          {existing && writable && (
            <div className="mt-2 border-t border-ink-700/60 pt-2 text-[12px]">
              {confirm ? (
                <span className="flex items-center gap-2">
                  <span className="text-amber-400">Remove this count for everyone?</span>
                  <button type="button" disabled={busy} onClick={remove} data-pc-shares-delete-yes
                    className="rounded px-1.5 py-0.5 text-loss ring-focus hover:bg-ink-700/60 disabled:opacity-50">Remove</button>
                  <button type="button" disabled={busy} onClick={() => setConfirm(false)}
                    className="rounded px-1.5 py-0.5 text-slate-400 ring-focus hover:bg-ink-700/60">Keep</button>
                </span>
              ) : (
                <button type="button" disabled={busy} onClick={() => { setConfirm(true); setError(null); }} data-pc-shares-delete
                  className="rounded px-1.5 py-0.5 text-slate-400 ring-focus hover:bg-ink-700/60 hover:text-loss disabled:opacity-50">Remove count</button>
              )}
            </div>
          )}
          {error && <p className="mt-2 text-[12px] text-loss" data-pc-shares-error>{error}</p>}
        </div>
      )}
    </div>
  );
}
