import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, HandCoins, Upload, X } from "lucide-react";
import { saveTableInputs, useTableInputs } from "@/lib/tableInputStore";
import { MAX_TABLE_WORKBOOK_BYTES, validateInputChanges } from "@/lib/tableInputs";
import { COMMITMENT_FIELDS, commitmentChanges, commitmentRows, draftKey, parseRupees, rupeeText, type CommitmentDraft, type CommitmentRow } from "@/lib/commitmentEntry";
import type { BookFolio } from "@/lib/privateBook";
import { fmtCr, fmtDate } from "@/lib/format";

type Show = "funds" | "companies" | "all";
const SHOW: { key: Show; label: string }[] = [{ key: "funds", label: "Funds" }, { key: "companies", label: "Companies" }, { key: "all", label: "All" }];
const FIELD_LABEL: Record<string, string> = { committed: "Committed", undrawn: "Still to call" };
// Fund · As of · the two amounts; on a phone the fund spans the row and the amounts sit side by side under it.
const ROW_GRID = "grid grid-cols-2 items-start gap-x-3 gap-y-1.5 px-3 sm:grid-cols-[minmax(0,1.6fr)_5.5rem_minmax(8rem,1fr)_minmax(8rem,1fr)]";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * ENTER COMMITMENTS — every folio's Committed and Still to call on one sheet,
 * saved together, or filled in Excel and uploaded. It writes the same saved
 * inputs the table's Edit numbers writes, so the table, its tiles and its
 * exports read one record (Stage 10io).
 */
export function CommitmentEntry({ folios }: { folios: readonly BookFolio[] }) {
  const inputs = useTableInputs();
  const dialog = useRef<HTMLDialogElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Map<string, CommitmentDraft>>(() => new Map());
  const [show, setShow] = useState<Show>("funds");
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [busy, setBusy] = useState<"" | "excel" | "reading" | "saving">("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  const rows = useMemo(() => commitmentRows(folios, inputs.catalog), [folios, inputs.catalog]);
  const missing = (r: CommitmentRow) => COMMITMENT_FIELDS.some((f) => r.record.values[f] == null);
  const needle = query.trim().toLowerCase();
  const shown = rows.filter((r) => (show === "all" || r.isFund === (show === "funds"))
    && (!missingOnly || missing(r) || COMMITMENT_FIELDS.some((f) => drafts.has(draftKey(r.record.id, f))))
    && (!needle || `${r.fundName} ${r.owner} ${r.account}`.toLowerCase().includes(needle)));
  const { changes, error: draftError } = commitmentChanges(drafts, inputs.catalog);
  const ready = inputs.status === "ready";

  const edit = (r: CommitmentRow, field: string, text: string) => {
    setMessage(""); setError("");
    setDrafts((prev) => {
      const next = new Map(prev), key = draftKey(r.record.id, field), was = prev.get(key);
      const base = was ?? { version: r.record.versions[field] ?? "", source: r.record.source };
      if (!was || text !== rupeeText(r.record.values[field])) next.set(key, { text, version: base.version, source: base.source });
      else next.delete(key);
      return next;
    });
  };
  const close = () => { if (busy !== "saving") setOpen(false); };
  const save = async () => {
    if (draftError) { setError(draftError); return; }
    if (!changes.length) { setDrafts(new Map()); return; }
    const invalid = validateInputChanges(changes, inputs.catalog);
    if (invalid) { setError(invalid); return; }
    setBusy("saving"); setError("");
    try {
      await saveTableInputs(changes);
      setDrafts(new Map());
      setMessage(`Saved ${plural(changes.length, "number")} for everyone.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };
  const download = async () => {
    setBusy("excel"); setError("");
    try { const { downloadCommitmentWorkbook } = await import("@/lib/commitmentExcel"); await downloadCommitmentWorkbook(shown); }
    catch { setError("The Excel file could not be created. Try again."); }
    finally { setBusy(""); }
  };
  const read = async (file?: File) => {
    if (!file) return;
    setBusy("reading"); setError(""); setMessage("");
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size > MAX_TABLE_WORKBOOK_BYTES) throw new Error("Upload the downloaded .xlsx file, under 64 MB.");
      const { readInputWorkbook } = await import("@/lib/tableInputExcel");
      const found = await readInputWorkbook(await file.arrayBuffer(), inputs.catalog);
      const listed = new Set(rows.map((r) => r.record.id));
      const other = found.filter((c) => !listed.has(c.id) || !(COMMITMENT_FIELDS as readonly string[]).includes(c.field));
      if (other.length) throw new Error(`This file changes ${plural(other.length, "number")} other than a folio's Committed or Still to call. Upload it with Upload Excel above the table.`);
      if (!found.length) { setMessage("No number changes found."); return; }
      setDrafts((prev) => {
        const next = new Map(prev);
        for (const c of found) next.set(draftKey(c.id, c.field), { text: rupeeText(c.value), version: c.version, source: c.source });
        return next;
      });
      setShow("all"); setQuery(""); setMissingOnly(false);
      setMessage(`${plural(found.length, "number")} read from ${file.name}. Check them, then Save.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); if (upload.current) upload.current.value = ""; }
  };

  const cell = (r: CommitmentRow, field: string) => {
    const key = draftKey(r.record.id, field), draft = drafts.get(key);
    const current = r.record.values[field], entered = r.record.versions[field];
    const text = draft?.text ?? rupeeText(current);
    const parsed = parseRupees(text);
    const label = `${r.fundName}, ${r.owner} — ${FIELD_LABEL[field]}`;
    const tone = draft ? "border-sky-500 bg-sky-500/5" : current == null ? "border-amber-500/70" : "border-ink-600";
    return (
      <div key={field} data-commitment-cell={field}>
        <input aria-label={label} inputMode="decimal" value={text} placeholder="Add amount" disabled={!ready || busy === "saving"}
          onChange={(e) => edit(r, field, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }}
          title="Rupees, or with Cr / lakh — 2.5 Cr, 40 lakh. Clear a number to mark it not known."
          data-commitment-input={field} className={`w-full rounded border bg-ink-900 p-1.5 text-right text-xs ring-focus ${tone}`} />
        <div className="mt-0.5 flex justify-between gap-2 text-[10px]">
          <span className={parsed != null && !Number.isFinite(parsed) ? "text-loss" : "text-slate-500"}>
            {parsed == null ? (current == null ? "missing" : "blank") : Number.isFinite(parsed) ? fmtCr(parsed, 2) : "not an amount"}
          </span>
          {draft ? <span className="text-sky-500">unsaved</span>
            : entered ? <span className="text-emerald-600" title={`Entered on the dashboard, ${fmtDate(entered.slice(0, 10))}`}>entered</span>
            : r.record.kind === "capital" && current != null ? <span className="text-slate-500" title="Read from the fund's capital-account statement">statement</span> : null}
        </div>
      </div>
    );
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} disabled={!ready} data-commitment-entry-open
      title="Committed and Still to call for every folio — enter them here, or in Excel and upload"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-ink-600 px-2.5 py-1.5 text-xs ring-focus disabled:opacity-50">
      <HandCoins className="h-3.5 w-3.5" />Enter commitments{drafts.size > 0 && <span className="text-sky-500"> · {drafts.size} unsaved</span>}
    </button>
    {createPortal(
      <dialog ref={dialog} aria-labelledby="commitment-entry-title" data-commitment-entry
        onCancel={(e) => { e.preventDefault(); close(); }} onClose={() => { if (open) setOpen(false); }}
        className="property-dialog card w-[min(64rem,calc(100%-2rem))] max-h-[90vh] p-0 text-slate-200 backdrop:bg-black/50">
        {open && <div className="flex max-h-[90vh] flex-col p-5">
          <div className="mb-3 flex items-start justify-between gap-4">
            <h2 id="commitment-entry-title" className="font-display text-lg font-bold text-slate-100">Capital commitments</h2>
            <button type="button" className="btn-ghost" aria-label="Close capital commitments" disabled={busy === "saving"} onClick={close}><X className="h-4 w-4" /></button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <input aria-label="Find a fund or member" placeholder="Search a fund, member or account" value={query} onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-1 basis-56 rounded border border-ink-600 bg-ink-900 p-1.5 ring-focus" />
            <select aria-label="Show funds, companies or all" value={show} onChange={(e) => setShow(e.target.value as Show)} data-commitment-show={show}
              className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1.5 text-slate-200">
              {SHOW.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-slate-400"><input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} data-commitment-missing />Missing only</label>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost text-xs" disabled={!!busy || !shown.length} onClick={() => { void download(); }} data-commitment-download
                title="The rows listed here, with their saved figures. Fill in Committed and Still to call, then Upload Excel.">
                <Download className="h-3.5 w-3.5" />{busy === "excel" ? "Preparing…" : `Download Excel (${shown.length})`}
              </button>
              <button type="button" className="btn-ghost text-xs" disabled={!!busy || !ready} onClick={() => upload.current?.click()} data-commitment-upload>
                <Upload className="h-3.5 w-3.5" />{busy === "reading" ? "Reading…" : "Upload Excel"}
              </button>
              <input ref={upload} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Upload commitments Excel" className="hidden"
                onChange={(e) => { void read(e.target.files?.[0]); }} />
            </span>
          </div>
          {inputs.status !== "ready" && <p role="alert" className="mb-2 text-sm text-loss">{inputs.status === "loading" ? "Loading saved numbers…" : inputs.error}</p>}
          <div className={`${ROW_GRID} border-b border-ink-700 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500`} aria-hidden>
            <span className="col-span-2 sm:col-span-1">Fund · member · account</span><span className="hidden sm:block">As of</span><span className="text-right">Committed (INR)</span><span className="text-right">Still to call (INR)</span>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-ink-700/60" data-commitment-rows={shown.length}>
            {shown.map((r) => (
              <li key={r.record.id} className={`${ROW_GRID} py-2`} data-commitment-row={r.record.id} data-commitment-fund={r.isFund ? "" : undefined}>
                <div className="col-span-2 min-w-0 text-xs sm:col-span-1">
                  <div className="truncate font-medium text-slate-100" title={r.fundName}>{r.fundName}</div>
                  <div className="truncate text-slate-400" title={`${r.owner} · ${r.account}`}>{r.owner} · {r.account}<span className="sm:hidden"> · {r.asOf ? fmtDate(r.asOf) : "date not recorded"}</span></div>
                </div>
                <div className="hidden pt-1.5 text-xs text-slate-400 sm:block">{r.asOf ? fmtDate(r.asOf) : "—"}</div>
                {COMMITMENT_FIELDS.map((f) => cell(r, f))}
              </li>
            ))}
            {!shown.length && <li className="p-4 text-sm text-slate-400">{rows.length ? "No folio matches." : "No private-market folio to enter."}</li>}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-ink-700 pt-3 text-xs">
            {error && <span role="alert" className="mr-auto text-loss">{error}</span>}
            {!error && message && <span role="status" className="mr-auto text-emerald-600">{message}</span>}
            {drafts.size > 0 && <button type="button" className="rounded px-1 text-slate-400 ring-focus" disabled={busy === "saving"}
              onClick={() => { setDrafts(new Map()); setError(""); setMessage(""); }} data-commitment-discard>Discard</button>}
            <button type="button" onClick={() => { void save(); }} disabled={!ready || !!busy || !drafts.size} data-commitment-save
              className="rounded bg-emerald-600 px-4 py-2 text-sm text-white ring-focus disabled:opacity-50">
              {busy === "saving" ? "Saving…" : `Save ${plural(draftError ? drafts.size : changes.length, "change")}`}
            </button>
          </div>
        </div>}
      </dialog>, document.body)}
  </>;
}
