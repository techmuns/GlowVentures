import { useEffect, useRef, useState, type DragEvent } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { ExportableTable } from "@/components/ExportableTable";
import { saveProperties, type Property } from "@/lib/realEstate";
import { buildPropertyWorkbook, readPropertyWorkbook, planPropertyUpload, MAX_FILE_BYTES, MAX_UPLOAD_ROWS, type UploadPlan, type PlanRow } from "../../shared/propertySheet.mjs";
// ExcelJS is large; it loads when a template is downloaded or a file is read.
const excel = async () => { const mod = await import("exceljs"); return (mod.default ?? mod) as typeof import("exceljs"); };
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ACTION: Record<PlanRow["action"], { label: string; tone: string }> = {
  new: { label: "New", tone: "text-gain" }, update: { label: "Update", tone: "text-champagne-400" },
  unchanged: { label: "Unchanged", tone: "text-slate-500" }, error: { label: "Problem", tone: "text-loss" },
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Bulk entry: a template with the Add Property form's fields, and an upload that checks every row before saving any. */
export function PropertyBulkEntry({ shown, all, members, ready, onSaved }: {
  /** The properties the page shows under the member selection: what "with current properties" fills in. */
  shown: Property[];
  /** Every saved property: what an upload's IDs and duplicates are checked against. */
  all: Property[];
  members: { ownerId: string; label: string }[]; ready: boolean; onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "template" | "reading" | "saving">("");
  const [plan, setPlan] = useState<UploadPlan | null>(null);
  const [file, setFile] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open && dialog.current?.open) dialog.current.close(); }, [open]);
  const close = () => { if (busy === "saving") return; setOpen(false); setPlan(null); setFile(""); setError(""); setSaved(""); };
  const download = async (properties: Property[]) => {
    setBusy("template"); setError("");
    try {
      const bytes = await buildPropertyWorkbook(await excel(), { properties, members }).xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([bytes], { type: XLSX }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `Glow_Real_Estate_${properties.length ? "Properties" : "Template"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError("The template could not be created. Try again."); }
    finally { setBusy(""); }
  };
  const read = async (picked: File | undefined) => {
    if (!picked) return;
    setPlan(null); setSaved(""); setError(""); setFile(picked.name);
    if (!/\.xlsx$/i.test(picked.name)) { setError("Upload the template as an Excel Workbook (.xlsx). Save a .xls or .csv file as .xlsx first."); return; }
    if (picked.size > MAX_FILE_BYTES) { setError(`The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Upload the template with the property rows only.`); return; }
    setBusy("reading");
    try { setPlan(planPropertyUpload(await readPropertyWorkbook(await excel(), await picked.arrayBuffer()), { existing: all, members })); }
    catch { setError("The file could not be read. Download the template again and copy the rows into it."); }
    finally { setBusy(""); if (input.current) input.current.value = ""; }
  };
  const save = async () => {
    if (!plan?.ready) return;
    setBusy("saving"); setError("");
    const reply = await saveProperties(plan.items);
    setBusy("");
    if (!reply.ok) { setError(reply.message); return; }
    setSaved(`Saved ${[plan.counts.new ? plural(plan.counts.new, "new property", "new properties") : "", plan.counts.update ? plural(plan.counts.update, "update") : ""].filter(Boolean).join(" and ")}.`);
    setPlan(null); onSaved();
  };
  const drop = (e: DragEvent) => { e.preventDefault(); if (!busy) void read(e.dataTransfer.files[0]); };
  const saving = plan ? plan.counts.new + plan.counts.update : 0;
  return <>
    <button type="button" className="btn-ghost" disabled={!ready} onClick={() => setOpen(true)}><FileSpreadsheet className="h-4 w-4" />Bulk entry</button>
    <dialog ref={dialog} aria-labelledby="bulk-entry-title" data-bulk-entry onCancel={e => { e.preventDefault(); close(); }} onClose={() => { if (open) close(); }} className="property-dialog card w-[min(62rem,calc(100%-2rem))] max-h-[90vh] overflow-y-auto p-5 text-slate-200 backdrop:bg-black/50">
      {open && <>
        <div className="mb-5 flex items-start justify-between gap-4"><h2 id="bulk-entry-title" className="font-display text-lg font-bold text-slate-100">Bulk entry</h2><button type="button" className="btn-ghost" aria-label="Close bulk entry" disabled={busy === "saving"} onClick={close}><X className="h-4 w-4" /></button></div>
        <section className="flex flex-wrap items-center gap-2">
          <h3 className="h-section mr-2">Template</h3>
          <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => void download([])}><Download className="h-4 w-4" />Download template</button>
          {shown.length > 0 && <button type="button" className="btn-ghost" disabled={!!busy} title="Each property keeps its Property ID, so its row updates it on upload." onClick={() => void download(shown)}><Download className="h-4 w-4" />Download with {plural(shown.length, "current property", "current properties")}</button>}
          {busy === "template" && <span role="status" className="text-xs text-slate-400">Preparing the template…</span>}
        </section>
        <section className="mt-5 border-t border-ink-700 pt-4" onDragOver={e => e.preventDefault()} onDrop={drop}>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="h-section mr-2">Upload</h3>
            <label title={`One .xlsx file of up to ${MAX_UPLOAD_ROWS} properties. Every row is checked before anything is saved.`} className={`btn-primary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}><Upload className="h-4 w-4" />{plan || error ? "Choose another file" : "Choose filled template"}
              <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="Filled property template" disabled={!!busy} onChange={e => void read(e.target.files?.[0])} /></label>
            {file && <span className="text-xs text-slate-400">{file}</span>}
            {busy === "reading" && <span role="status" className="text-xs text-slate-400">Checking every row…</span>}
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-loss">{error}</p>}
          {saved && <p role="status" data-bulk-saved className="mt-3 text-sm text-gain">{saved}</p>}
        </section>
        {plan && <section className="mt-5 border-t border-ink-700 pt-4" aria-label="Upload review">
          <p data-bulk-summary className="text-sm text-slate-200">{[plural(plan.rows.length, "row"), plural(plan.counts.new, "new", "new"), plural(plan.counts.update, "update"), plural(plan.counts.unchanged, "unchanged", "unchanged"), plural(plan.counts.error, "problem")].join(" · ")}</p>
          {plan.fileErrors.length > 0 && <ul role="alert" className="mt-3 list-disc space-y-1 pl-5 text-sm text-loss">{plan.fileErrors.map(e => <li key={e}>{e}</li>)}</ul>}
          {plan.notes.length > 0 && <ul className="mt-2 space-y-1 text-xs text-slate-500">{plan.notes.map(n => <li key={n}>{n}</li>)}</ul>}
          {!plan.ready && (plan.counts.error > 0 || plan.fileErrors.length > 0) && <p role="alert" data-prose-ok="an upload with a problem row saves nothing; the reader must know to fix the file" className="mt-3 text-sm text-loss">Nothing is saved until every row reads cleanly. Fix the rows marked Problem in the file and upload it again.</p>}
          {!plan.ready && !plan.counts.error && !plan.fileErrors.length && plan.rows.length > 0 && <p role="status" data-prose-ok="explains why Save is unavailable" className="mt-3 text-sm text-slate-400">Every row matches what is already saved.</p>}
          {plan.rows.length > 0 && <div className="mt-3 overflow-x-auto"><ExportableTable exportName="Real Estate — Upload review" className="min-w-full text-[13px]" data-table-static="upload review rows follow the file's order">
            <thead className="border-b border-ink-700 text-left"><tr>{["Row", "Property", "Result", "Details"].map(h => <th key={h} className={`label-xs px-3 py-2 ${h === "Details" ? "min-w-[18rem]" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{plan.rows.map(r => <tr key={r.row} data-bulk-row={r.row} data-bulk-action={r.action} className="border-b border-ink-700/50 align-top">
              <td className="px-3 py-2 mono tabular text-slate-400">{r.row}</td>
              <td className="px-3 py-2 text-slate-100">{r.label}</td>
              <td className={`px-3 py-2 whitespace-nowrap ${ACTION[r.action].tone}`}>{ACTION[r.action].label}</td>
              <td className="px-3 py-2 text-xs">
                {r.errors.map(e => <p key={e} className="text-loss">{e}</p>)}
                {r.changes.map(c => <p key={c.field} className="text-slate-300">{c.field}: <span className="text-slate-500">{c.before}</span> → {c.after}</p>)}
                {r.notes.map(n => <p key={n} className="text-slate-500">{n}</p>)}
              </td>
            </tr>)}</tbody>
          </ExportableTable></div>}
          <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-ink-700 bg-ink-900 py-3">
            <button type="button" className="btn-ghost" disabled={busy === "saving"} onClick={() => { setPlan(null); setFile(""); }}>Discard</button>
            {plan.ready && <button type="button" className="btn-primary" disabled={!!busy} onClick={() => void save()}>{busy === "saving" ? "Saving…" : `Save ${plural(saving, "property", "properties")}`}</button>}
          </div>
        </section>}
      </>}
    </dialog>
  </>;
}
