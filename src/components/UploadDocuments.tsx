import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { UploadCloud, X, Loader2, FileText, FolderOpen, CircleCheck, ShieldAlert } from "lucide-react";
import { Pill } from "@/components/Pill";
import { statementFileIcon } from "@/components/LibraryFolder";
import { fmtDateTime } from "@/lib/format";
import {
  fromDrop, fromInput, planUpload, fileView, uploadedFileHref, settledView,
  type useStatementInbox, type InboxSubject, type InboxFile, type PickedFile,
} from "@/lib/statementUploads";
import { holdingDocumentsOf, documentMatches, subjectFolderHref } from "@/lib/holdingDocuments";
import { MAX_FILE_BYTES } from "../../shared/statementInbox.mjs";

/**
 * ── UPLOAD DOCUMENTS (Stage 10kx) ─────────────────────────────────────────
 *
 * *"add a "Upload documents" button where we can choose the company or fund
 * and upload any kind of file related to it"* — the family, 4 Nov 2026.
 *
 * The Statement Library's inbox, with the holding named: each file is filed
 * under the chosen Private Market row (`InboxSubject`). A statement (PDF, Excel,
 * ZIP) is read into the book by the same intake run as any upload; any other
 * file is kept as the holding's document. Both appear in the holding's
 * Portfolio Library folder and the Statement Library's recent uploads, linked
 * to the file itself.
 */
const MAX_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024));

export function UploadDocuments({ subjects, inbox }: {
  subjects: readonly InboxSubject[];
  inbox: ReturnType<typeof useStatementInbox>;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} data-upload-documents
      className="btn-ghost h-8 px-3 text-xs" title="Upload any file for a company or fund in this book">
      <UploadCloud className="h-4 w-4 text-champagne-400" /> Upload documents
    </button>
    {open && <UploadDialog subjects={subjects} inbox={inbox} onClose={() => setOpen(false)} />}
  </>;
}

function UploadDialog({ subjects, inbox, onClose }: {
  subjects: readonly InboxSubject[];
  inbox: ReturnType<typeof useStatementInbox>;
  onClose: () => void;
}) {
  const { state, upload } = inbox;
  const [subjectKey, setSubjectKey] = useState("");
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: "err" | "ok"; text: string; title?: string } | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const subject = subjects.find((s) => s.key === subjectKey) ?? null;
  const plan = useMemo(() => planUpload(picked, true), [picked]);
  const ready = state.status === "ready";
  const busy = !!progress;

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [busy, onClose]);

  const add = useCallback((more: PickedFile[]) => {
    setMsg(null);
    setPicked((prev) => {
      const seen = new Set(prev.map((p) => `${p.path}\u0000${p.file.size}`));
      return [...prev, ...more.filter((p) => !seen.has(`${p.path}\u0000${p.file.size}`))];
    });
  }, []);

  const send = async () => {
    if (!subject || !plan.accepted.length || busy || !ready) return;
    setMsg(null);
    setProgress({ done: 0, of: plan.accepted.length });
    try {
      const r = await upload(plan.accepted, (done, of) => setProgress({ done, of }), undefined, subject);
      if (!r.ok) { setMsg({ tone: "err", text: r.reason }); return; }
      const notSent = [...plan.skipped, ...r.failed.map((f) => ({ path: f.name, why: f.why }))];
      const title = notSent.map((s) => `${s.path}: ${s.why}`).join("\n") || undefined;
      if (!r.saved) { setMsg({ tone: "err", text: "Nothing was saved.", title }); return; }
      setPicked([]);
      setMsg({
        tone: notSent.length ? "err" : "ok", title,
        text: `${r.saved} file${r.saved === 1 ? "" : "s"} saved under ${subject.label}.${notSent.length ? ` ${notSent.length} not uploaded — hover for why.` : ""}`,
      });
    } catch {
      setMsg({ tone: "err", text: "The files could not be uploaded. Try again." });
    } finally {
      setProgress(null);
    }
  };

  const batches = state.status === "ready" ? state.batches : [];
  const documents = useMemo(() => subject
    ? holdingDocumentsOf(batches).filter((d) => documentMatches(d, [subject.key]))
    : [], [batches, subject]);
  const companies = subjects.filter((s) => s.kind === "company");
  const funds = subjects.filter((s) => s.kind === "fund");

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-6 backdrop-blur-xl"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Upload documents" data-upload-documents-dialog
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-ink-700 px-4 py-3">
          <UploadCloud className="h-4 w-4 text-champagne-400" />
          <div className="text-sm font-semibold text-slate-100">Upload documents</div>
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost ml-auto h-8 px-2" title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Company or fund</span>
            <select value={subjectKey} onChange={(e) => { setSubjectKey(e.target.value); setMsg(null); }} disabled={busy}
              data-upload-subject
              className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-200 focus:border-accent-500/50 focus:outline-none">
              <option value="">Choose…</option>
              {companies.length > 0 && <optgroup label="Companies">
                {companies.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </optgroup>}
              {funds.length > 0 && <optgroup label="Funds">
                {funds.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </optgroup>}
            </select>
          </label>

          {state.status === "unavailable" ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300" data-upload-state={state.cause}>
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span data-prose-ok="why uploading is not available">{state.reason}</span>
              <button type="button" onClick={() => void inbox.reload()} className="ml-auto shrink-0 text-accent-400 hover:underline">Try again</button>
            </div>
          ) : (
            <button type="button" disabled={busy || !ready}
              onClick={() => filesRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) { const dt = e.dataTransfer; void fromDrop(dt).then(add); } }}
              data-upload-documents-drop
              className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors disabled:cursor-wait ${drag ? "border-champagne-500 bg-champagne-500/10" : "border-ink-600 hover:border-ink-500 hover:bg-ink-700/30"}`}>
              {progress ? <Loader2 className="h-6 w-6 animate-spin text-champagne-400" /> : <UploadCloud className="h-6 w-6 text-slate-500" />}
              <span className="text-sm text-slate-300">
                {progress ? `Uploading ${progress.done} of ${progress.of}…` : state.status === "loading" ? "Checking upload access…" : "Drop files here, or click to choose"}
              </span>
              <span className="text-[11px] text-slate-500"
                title="A statement (PDF, Excel or ZIP) is read into the book; any other file is kept as this holding's document.">
                Any file · up to {MAX_MB} MB each
              </span>
            </button>
          )}
          <input ref={filesRef} type="file" multiple className="hidden"
            onChange={(e) => { add(fromInput(e.target.files ?? [])); e.target.value = ""; }} />

          {picked.length > 0 && (
            <ul className="divide-y divide-ink-700/70 rounded-lg border border-ink-700 text-sm" data-upload-picked={plan.accepted.length}>
              {plan.accepted.map((f) => (
                <li key={f.name} className="flex items-center gap-2 px-3 py-2 text-slate-300">
                  {statementFileIcon(f.name.split(".").pop()?.toUpperCase() ?? "")}
                  <span className="min-w-0 flex-1 truncate" title={f.name}>{f.name}</span>
                  <button type="button" disabled={busy} onClick={() => setPicked((prev) => prev.filter((p) => p.file !== f.file))}
                    className="text-slate-500 hover:text-slate-300" title="Leave this file out"><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
              {plan.skipped.map((s) => (
                <li key={s.path} className="flex items-center gap-2 px-3 py-2 text-xs text-loss" title={s.why}>
                  <ShieldAlert className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{s.path}</span><span>Not uploaded</span>
                </li>
              ))}
            </ul>
          )}

          {msg && <p className={`text-xs ${msg.tone === "err" ? "text-loss" : "text-gain"}`} role="status" title={msg.title}
            data-prose-ok="the result of an upload">{msg.text}</p>}

          {subject && documents.length > 0 && (
            <div data-upload-documents-list={subject.key}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Documents for {subject.label}</span>
                <Pill>{documents.length}</Pill>
                <Link to={subjectFolderHref(subject)} onClick={onClose}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-accent-400 hover:underline" title="Open this holding's folder in the Portfolio Library">
                  <FolderOpen className="h-3.5 w-3.5" /> Open folder
                </Link>
              </div>
              <ul className="divide-y divide-ink-700/70 rounded-lg border border-ink-700 text-sm">
                {documents.map((d) => <DocumentLine key={`${d.batch}/${d.file.name}`} doc={d} onNavigate={onClose} />)}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-ink-700 px-4 py-3">
          <span className="text-xs text-slate-500">
            {subject ? `${plan.accepted.length} file${plan.accepted.length === 1 ? "" : "s"} for ${subject.label}` : "Choose the company or fund first"}
          </span>
          <button type="button" onClick={() => void send()} data-upload-documents-send
            disabled={!subject || !plan.accepted.length || busy || !ready}
            className="btn-primary ml-auto h-8 px-3 text-xs disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />} Upload
          </button>
        </div>
      </div>
    </div>,
    document.getElementById("root") ?? document.body,
  );
}

/** One uploaded file: its name opens it, its status says where it is. */
export function DocumentLine({ doc, onNavigate }: {
  doc: { batch: string; uploadedAt: string; file: InboxFile };
  onNavigate?: () => void;
}) {
  const view = fileView(doc.file, new Set(doc.file.docKeys ?? []));
  const href = uploadedFileHref(doc.batch, doc.file);
  const base = doc.file.name.split("/").pop() ?? doc.file.name;
  const done = settledView(view);
  const held = view.key === "held";
  const name = <span className="inline-flex min-w-0 items-center gap-1.5">
    {statementFileIcon(base.split(".").pop()?.toUpperCase() ?? "")}
    <span className="truncate">{base}</span>
  </span>;
  return <li className="flex items-center gap-3 px-3 py-2" data-holding-document={doc.file.name} data-upload-status={view.key}>
    <span className="min-w-0 flex-1 text-slate-200" title={doc.file.name}>
      {href
        ? href.startsWith("/api/")
          ? <a href={href} target="_blank" rel="noopener" className="hover:text-accent-400 hover:underline">{name}</a>
          : <Link to={href} onClick={onNavigate} className="hover:text-accent-400 hover:underline">{name}</Link>
        : name}
    </span>
    <span className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(doc.uploadedAt)}</span>
    <span title={view.title} className={`inline-flex items-center gap-1 whitespace-nowrap text-xs ${done ? "text-gain" : held ? "text-loss" : "text-accent-400"}`}>
      {done ? <CircleCheck className="h-3.5 w-3.5" /> : held ? <ShieldAlert className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
      {view.label}
    </span>
  </li>;
}
