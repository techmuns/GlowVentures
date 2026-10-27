import { ExportableTable } from "@/components/ExportableTable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import {
  Folder, FolderUp, ChevronLeft, Search, ShieldAlert, ExternalLink, FileText, FileSpreadsheet, UploadCloud,
  Loader2, CircleCheck,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { StatementPreview, useFilePreview } from "@/components/StatementPreview";
import { AbsentSection, DASH } from "@/components/Absent";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { buildLibrary, type ManifestEntry, type ProviderFolder, type LibraryDoc } from "@/lib/statementLibrary";
import {
  useStatementInbox, fromDrop, fromInput, planUpload, fileView, uploadDocumentKeys,
  type PickedFile, type InboxFile, type FileView,
} from "@/lib/statementUploads";
import { MAX_FILE_BYTES } from "../../shared/statementInbox.mjs";

// The library reads the SAME archive index the Data Audit viewer does —
// public/audit/manifest.json, written by the ingest pipeline and served at
// /audit/* in dev, preview and production. On the hosted site those requests sit
// behind the edge password gate (functions/_middleware.js); a failed fetch shows
// the restricted notice rather than an empty page.
const BASE = import.meta.env.BASE_URL;

/** Which open folder a reader is in lives in the address (`?provider=`), so the
 *  folder is linkable, the browser's Back button closes it, and the breadcrumb's
 *  "Statement Library" segment reopens the grid — the same "state in the URL"
 *  this app uses for drill-downs and member scope. */
const PROVIDER_PARAM = "provider";

const fileIcon = (format: string) =>
  format === "XLSX" || format === "XLS" || format === "CSV"
    ? <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-400/80" />
    : <FileText className="h-4 w-4 shrink-0 text-slate-500" />;

/** A statement's ingest status, shown as a toned pill so a reader can scan it. */
function StatusPill({ status }: { status: LibraryDoc["status"] }) {
  if (status === "ok") return <span className="text-[11px] text-slate-500" title="Read in full">Read</span>;
  if (status === "held-out") {
    return <Pill tone="default"><span title="Read in full and deliberately not a statement source: no institution issued it, so no book figure is taken from it">Held out</span></Pill>;
  }
  if (status === "never-arrived") {
    return <Pill tone="warn"><span title="A mail server removed this attachment in transit and left a short notice under its name — the statement itself never arrived. Ask the sender to re-send it (a download link, or zipped) and upload it here.">Never arrived</span></Pill>;
  }
  const tone = status === "partial" ? "warn" : status === "encrypted" ? "info" : "loss";
  const why = status === "partial"
    ? "Some sections of this document could not be read — see Data Audit for what it carried"
    : status === "encrypted"
      ? "Sealed — opens with the account's password during ingest"
      : "This document could not be read; it feeds no figure";
  return <Pill tone={tone} className="capitalize"><span title={why}>{status}</span></Pill>;
}

type UploadRow = {
  id: string; name: string; uploadedAt: string; batch?: string; file?: InboxFile;
  providers: string[]; destination?: string; fileKeys: string[];
  view: Omit<FileView, "key"> & { key: FileView["key"] | "uploading" };
};

function UploadStatus({ row }: { row: UploadRow }) {
  const done = row.view.key === "in-library" || row.view.key === "duplicate";
  const moving = !done && row.view.key !== "held";
  return <div title={row.view.title} role="status" className={`min-w-[155px] text-xs ${done ? "text-gain" : moving ? "text-accent-400" : "text-loss"}`}>
    <span className="inline-flex items-center gap-1.5">
      {done ? <CircleCheck className="h-4 w-4" data-upload-complete /> : moving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
      {row.view.label}
    </span>
    {moving && <div className="statement-upload-track mt-1.5" role="progressbar" aria-label={`${row.name}: ${row.view.title}`} />}
  </div>;
}

function UploadActions({ row, inbox }: { row: UploadRow; inbox: ReturnType<typeof useStatementInbox> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (remove = false) => {
    if (!row.batch || busy) return;
    setBusy(true); setError(null);
    const result = remove ? await inbox.remove(row.batch, row.name) : await inbox.retry(row.batch);
    if (!result.ok) setError(result.reason);
    setBusy(false);
  };
  return <>
    {row.view.key === "held" && <p className="mt-1 text-xs text-slate-500">{row.view.title}</p>}
    {(row.file?.status === "held" || row.file?.status === "queued") && <span className="mt-1 inline-flex items-center gap-3 text-xs">
      {row.file.status === "held" && <button type="button" disabled={busy} onClick={() => void act()} data-upload-retry className="text-accent-400 hover:underline disabled:opacity-50">Try again</button>}
      <button type="button" disabled={busy} onClick={() => void act(true)} className="text-slate-500 hover:underline disabled:opacity-50">Remove</button>
    </span>}
    {error && <p className="mt-1 text-xs text-loss" role="alert">{error}</p>}
  </>;
}

/** Pending files occupy the same table; completed uploads decorate their actual
 * archive rows instead of becoming a second document. */
function FormatBlock({ format, docs, uploads = [], inbox, onOpen }: {
  format: string; docs: LibraryDoc[]; uploads?: UploadRow[];
  inbox: ReturnType<typeof useStatementInbox>; onOpen?: (provider: string) => void;
}) {
  const preview = useFilePreview();
  const previewing = preview.openKey ? docs.find(d => d.fileKey === preview.openKey) : undefined;
  const completed = (row: UploadRow) => row.view.key === "in-library" || row.view.key === "duplicate";
  const receiptFor = (doc: LibraryDoc) => uploads.find(row => completed(row) && row.fileKeys.includes(doc.fileKey));
  const orderedDocs = [...docs].sort((a, b) => (receiptFor(b)?.uploadedAt ?? "").localeCompare(receiptFor(a)?.uploadedAt ?? ""));
  const receipts = uploads.filter(row => !completed(row) || !row.fileKeys.some(key => docs.some(d => d.fileKey === key)));
  return <div data-format-block={format}>
    <div className="mb-2 flex items-center gap-2">
      {fileIcon(format)}
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{format}</span>
      {docs.length > 0 && <Pill>{docs.length} {docs.length === 1 ? "file" : "files"}</Pill>}
    </div>
    <div className="overflow-x-auto rounded-lg border border-ink-700">
      <ExportableTable className="min-w-full text-sm" data-table-static="statement files, with uploads at the top until their archive rows are ready">
        <thead className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr>
          <th className="px-4 py-2.5 font-medium">Document</th>
          <th className="px-4 py-2.5 font-medium">Owner / entity</th>
          <th className="px-4 py-2.5 font-medium">Account</th>
          <th className="px-4 py-2.5 font-medium">As of</th>
          <th className="px-4 py-2.5 font-medium">Status</th>
          <th className="px-4 py-2.5 font-medium">{onOpen ? "Folder" : "Arrived in"}</th>
        </tr></thead>
        <tbody className="divide-y divide-ink-700/70">
          {receipts.map(row => <tr key={row.id} data-upload-status={row.view.key} data-upload-row={row.id}>
            <td className="min-w-[230px] px-4 py-3 text-slate-200">
              <span className="inline-flex items-center gap-1.5" title={row.name}>{fileIcon(row.name.split(".").pop()?.toUpperCase() ?? "")}<span className="break-words">{row.name.split("/").pop()}</span></span>
              <UploadActions row={row} inbox={inbox} />
            </td>
            <td className="px-4 py-3 text-slate-500">{DASH}</td>
            <td className="px-4 py-3 text-slate-500">{DASH}</td>
            <td className="px-4 py-3 text-slate-500">{DASH}</td>
            <td className="px-4 py-3"><UploadStatus row={row} /></td>
            <td className="px-4 py-3 text-xs text-slate-500">
              {onOpen ? row.providers.map(provider => completed(row) && row.fileKeys.length
                ? <button key={provider} type="button" onClick={() => onOpen(provider)} className="mr-2 text-accent-400 hover:underline">{provider}</button>
                : <span key={provider}>{provider}</span>) : fmtDateTime(row.uploadedAt)}
            </td>
          </tr>)}
          {orderedDocs.map(d => {
            const receipt = receiptFor(d);
            return <tr key={d.fileKey} className={`cursor-pointer hover:bg-ink-700/40 ${receipt ? "bg-emerald-500/5" : ""}`} onClick={() => preview.open(d.fileKey)} data-preview-row={d.fileKey} data-upload-status={receipt?.view.key}>
              <td className="px-4 py-3 text-slate-200"><span className="inline-flex items-center gap-1.5">
                <button type="button" onClick={e => { e.stopPropagation(); preview.open(d.fileKey); }} className="text-left hover:text-accent-400 hover:underline" title={`Open ${d.fileName}`}>{d.reportLabel}</button>
                {d.hasSheets && <Link to={`/audit?file=${encodeURIComponent(d.fileKey)}`} onClick={e => e.stopPropagation()} className="text-slate-500 hover:text-accent-400" title="Open this document in Data Audit"><ExternalLink className="h-3.5 w-3.5" /></Link>}
              </span></td>
              <td className="px-4 py-3 text-slate-400">{d.owner ?? DASH}</td>
              <td className="px-4 py-3 mono text-slate-400">{d.accountNo ?? DASH}</td>
              <td className="px-4 py-3 text-slate-400">{d.asOf ? fmtDate(d.asOf) : DASH}</td>
              <td className="px-4 py-3">{receipt ? <UploadStatus row={receipt} /> : <StatusPill status={d.status} />}</td>
              <td className="px-4 py-3 text-slate-500" title={`Source file: ${d.fileName}`}>{d.delivery}</td>
            </tr>;
          })}
        </tbody>
      </ExportableTable>
    </div>
    {previewing && <StatementPreview doc={previewing} onClose={preview.close} />}
  </div>;
}

/** What the file chooser offers — the types the ingest pipeline reads. */
const ACCEPT = ".pdf,.xlsx,.xls,.zip";
const MAX_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024));

/**
 * One upload for the whole library, including an open provider folder. File
 * drags anywhere in this document use the same intake as the file/folder
 * choosers. The statement's own provider still determines where it is filed.
 */
function UploadPanel({ inbox, provider, archiveStatus }: {
  inbox: ReturnType<typeof useStatementInbox>; provider?: string; archiveStatus: "loading" | "ready" | "restricted";
}) {
  const { state, upload } = inbox;
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [msg, setMsg] = useState<{ tone: "err" | "ok"; text: string; title?: string } | null>(null);
  // Lock synchronously: a second drop can arrive before React paints progress.
  const receiving = useRef(false);
  const canUpload = archiveStatus === "ready" && state.status === "ready";

  const pick = useCallback(async (read: () => PickedFile[] | Promise<PickedFile[]>) => {
    if (receiving.current || !canUpload) return;
    receiving.current = true;
    setCollecting(true);
    setMsg(null);
    try {
      // Read entries inside the original drop event, before the browser protects
      // its DataTransfer. Directory traversal can then finish asynchronously.
      const picked = await read();
      if (!picked.length) return;
      const plan = planUpload(picked);
      const skippedTitle = plan.skipped.map((s) => `${s.path}: ${s.why}`).join("\n") || undefined;
      if (!plan.accepted.length) {
        setMsg({
          tone: "err", title: skippedTitle,
          text: plan.skipped.length
            ? `Nothing to upload — ${plan.skipped.length === 1 ? plan.skipped[0].why : `none of the ${plan.skipped.length} files is a statement file (PDF, Excel or ZIP).`}`
            : "Nothing to upload — the folder holds only system files.",
        });
        return;
      }
      setProgress({ done: 0, of: plan.accepted.length });
      const r = await upload(plan.accepted, (done, of) => setProgress({ done, of }), provider);
      if (!r.ok) { setMsg({ tone: "err", text: r.reason }); return; }
      const notSent = [...plan.skipped, ...r.failed.map((f) => ({ path: f.name, why: f.why }))];
      const tail = notSent.length ? ` ${notSent.length} not uploaded — hover for why.` : "";
      const title = notSent.map((s) => `${s.path}: ${s.why}`).join("\n") || undefined;
      if (!r.saved) { setMsg({ tone: "err", text: `Nothing was saved.${tail}`, title }); return; }
      setMsg(notSent.length ? { tone: "err", title, text: `${notSent.length} file${notSent.length === 1 ? " was" : "s were"} not uploaded. Choose the files again to retry.` } : null);
    } catch {
      setMsg({ tone: "err", text: "The files could not be read or uploaded. Try again, or use Files to select them." });
    } finally {
      receiving.current = false;
      setCollecting(false);
      setProgress(null);
    }
  }, [canUpload, upload, provider]);

  useEffect(() => {
    let depth = 0;
    const files = (e: DragEvent) => !!e.dataTransfer && (
      Array.from(e.dataTransfer.types).includes("Files") ||
      Array.from(e.dataTransfer.items).some((item) => item.kind === "file")
    );
    const reset = () => { depth = 0; setDrag(false); };
    const enter = (e: DragEvent) => {
      if (!files(e)) return;
      e.preventDefault();
      depth++;
      setDrag(true);
    };
    const over = (e: DragEvent) => {
      if (!files(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = canUpload && !receiving.current ? "copy" : "none";
      setDrag(true);
    };
    const leave = () => { if (--depth <= 0) reset(); };
    const drop = (e: DragEvent) => {
      if (!files(e)) return;
      e.preventDefault();
      // This is the only file-drop owner, including over a table or the box.
      e.stopPropagation();
      reset();
      const data = e.dataTransfer!;
      void pick(() => fromDrop(data));
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") reset(); };
    const hidden = () => { if (document.hidden) reset(); };
    document.addEventListener("dragenter", enter, true);
    document.addEventListener("dragover", over, true);
    document.addEventListener("dragleave", leave, true);
    document.addEventListener("drop", drop, true);
    document.addEventListener("dragend", reset, true);
    document.addEventListener("keydown", key, true);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", reset);
    return () => {
      document.removeEventListener("dragenter", enter, true);
      document.removeEventListener("dragover", over, true);
      document.removeEventListener("dragleave", leave, true);
      document.removeEventListener("drop", drop, true);
      document.removeEventListener("dragend", reset, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", reset);
    };
  }, [pick, canUpload]);

  const busy = !!progress || collecting || state.status === "loading";
  // Outside the zoomed #root: the overlay must cover the actual iframe viewport.
  // Pointer events pass through, so child transitions cannot flicker the target.
  const overlay = drag && createPortal(
    <div className="statement-drop-overlay" data-statement-drop-overlay role="status" aria-live="polite">
      <div className="statement-drop-frame">
        <div className="statement-drop-message">
          <UploadCloud className="h-10 w-10" />
          <strong>{archiveStatus === "restricted" ? "Statement archive unavailable" : archiveStatus === "loading" ? "Opening statement archive…" : state.status === "unavailable" ? "Uploads unavailable" : state.status === "loading" ? "Checking upload access…" : busy ? "Please wait for the current upload" : "Drop statements here"}</strong>
          <span>{provider ?? "Statement Library"}</span>
          <small>{archiveStatus === "restricted" ? "Reload the dashboard to open the archive before uploading." : state.status === "unavailable" ? state.reason : `PDF, Excel or ZIP · up to ${MAX_MB} MB each`}</small>
        </div>
      </div>
    </div>, document.body,
  );

  // Keep the drop guard mounted even while the archive is opening or failed.
  // Those states accept no uploads, but must never navigate to a dropped PDF.
  if (archiveStatus !== "ready") return <>{overlay}</>;

  // The service is not reachable — say which cause, and for a site with no
  // token give the one-time set-up steps rather than a drop zone that drops.
  if (state.status === "unavailable") {
    return (
      <>{overlay}
      <div data-xa="statement-upload" data-upload-state={state.cause}>
      <Card className="mb-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400"><UploadCloud className="h-5 w-5" /></div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-200">Statement uploads unavailable</div>
            <p className="mt-1 text-xs text-slate-400" data-prose-ok="why uploading is not available">{state.reason}</p>
            <button type="button" onClick={() => void inbox.reload()} className="mt-2 text-xs text-accent-400 hover:underline">Try again</button>

          </div>
        </div>
      </Card>
      </div>
      </>
    );
  }

  return (
    <>{overlay}
    <div data-xa="statement-upload" data-upload-state={state.status} data-publication-busy={!!progress || collecting ? "true" : undefined}>
    <Card className="mb-5">
      <div className={`${provider ? "" : "mb-3"} flex flex-wrap items-center gap-2`}>
        <UploadCloud className="h-4 w-4 text-champagne-400" />
        <span className="text-sm font-semibold text-slate-200">Upload statements</span>
        {provider && <span className="text-xs text-slate-400">{progress ? `Uploading ${progress.done} of ${progress.of}…` : collecting ? "Reading files…" : "Drop files anywhere in this folder"}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" disabled={busy} onClick={() => filesRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-ink-700 disabled:opacity-50">
            <FileText className="h-3.5 w-3.5" /> Files
          </button>
          <button type="button" disabled={busy} onClick={() => folderRef.current?.click()} data-upload-folder
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-ink-700 disabled:opacity-50">
            <FolderUp className="h-3.5 w-3.5" /> Folder
          </button>
        </div>
      </div>

      {!provider && <button type="button" disabled={busy}
        onClick={() => filesRef.current?.click()}
        data-upload-drop
        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-ink-600 px-4 py-7 text-center transition-colors hover:border-ink-500 hover:bg-ink-700/30 disabled:cursor-wait">
        {progress
          ? <Loader2 className="h-6 w-6 animate-spin text-champagne-400" />
          : <UploadCloud className="h-6 w-6 text-slate-500" />}
        <span className="text-sm text-slate-300">
          {progress ? `Uploading ${progress.done} of ${progress.of}…` : collecting ? "Reading files…" : "Drop statements or whole folders anywhere on this page"}
        </span>
        <span className="text-[11px] text-slate-500"
          title="Each statement is analysed and added to its provider folder automatically.">
          PDF, Excel or ZIP · up to {MAX_MB} MB each
        </span>
      </button>}
      <input ref={filesRef} type="file" multiple accept={ACCEPT} className="hidden"
        onChange={(e) => { const picked = fromInput(e.target.files ?? []); void pick(() => picked); e.target.value = ""; }} />
      {/* `webkitdirectory` is not in React's attribute types; set on the element. */}
      <input ref={(el) => { folderRef.current = el; el?.setAttribute("webkitdirectory", ""); el?.setAttribute("directory", ""); }}
        type="file" multiple className="hidden"
        onChange={(e) => { const picked = fromInput(e.target.files ?? []); void pick(() => picked); e.target.value = ""; }} />

      {msg && (
        <p className={`mt-2 text-xs ${msg.tone === "err" ? "text-loss" : "text-gain"}`} role="status" title={msg.title}
          data-prose-ok="the result of an upload">{msg.text}</p>
      )}
    </Card>
    </div>
    </>
  );
}

/** The opened folder: a header strip naming the provider, then one block per
 *  file format it holds. */
function OpenFolder({ folder, onBack, uploads, inbox }: { folder: ProviderFolder; onBack: () => void; uploads: UploadRow[]; inbox: ReturnType<typeof useStatementInbox> }) {
  const dateRange = folder.asOfFrom
    ? folder.asOfFrom === folder.asOfTo
      ? fmtDate(folder.asOfFrom)
      : `${fmtDate(folder.asOfFrom)} → ${fmtDate(folder.asOfTo!)}`
    : null;
  // Files grouped by format, each block ordered by how many files it holds —
  // the format a provider sends most of leads, like a folder sorted by kind.
  const byFormat = useMemo(() => {
    const map = new Map<string, LibraryDoc[]>();
    for (const d of folder.docs) {
      const list = map.get(d.format);
      if (list) list.push(d); else map.set(d.format, [d]);
    }
    for (const row of uploads) {
      if (row.fileKeys.some(key => folder.docs.some(d => d.fileKey === key))) continue;
      const format = row.name.split(".").pop()?.toUpperCase() ?? "Files";
      if (!map.has(format)) map.set(format, []);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [folder, uploads]);

  return (
    <div data-open-folder={folder.provider}>
      <button type="button" onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-ink-700">
        <ChevronLeft className="h-3.5 w-3.5" /> All folders
      </button>

      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-champagne-500/30 bg-champagne-500/10 text-champagne-400">
            <Folder className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-display text-base font-semibold text-slate-100">{folder.provider}</span>
              <Pill tone="info">{folder.docCount} {folder.docCount === 1 ? "file" : "files"}</Pill>
              {folder.formats.map((f) => <Pill key={f}>{f}</Pill>)}
            </div>
            {/* WHAT THIS FOLDER HOLDS — the report types this provider sends,
                on the face. A list of labels, not a sentence (prose convention). */}
            <div className="mt-1.5 text-xs text-slate-400">
              {folder.reportTypes.map((t, i) => (
                <span key={t.type}>
                  {i > 0 && <span className="text-slate-600"> · </span>}
                  <span title={`${t.count} ${t.count === 1 ? "document" : "documents"}`}>{t.label}{t.count > 1 ? ` ×${t.count}` : ""}</span>
                </span>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {folder.owners.length > 0 && (
                <span title="The members and entities this provider's statements are held under">{folder.owners.join(", ")}</span>
              )}
              {dateRange && <span className="text-slate-600"> · {dateRange}</span>}
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-5">
        {byFormat.map(([format, docs]) => <FormatBlock key={format} format={format} docs={docs} inbox={inbox} uploads={uploads.filter(row => row.fileKeys.some(key => docs.some(d => d.fileKey === key)) || (!row.fileKeys.some(key => folder.docs.some(d => d.fileKey === key)) && row.name.split(".").pop()?.toUpperCase() === format))} />)}
      </div>
    </div>
  );
}

/** One folder on the grid — a desktop-style icon that opens on double-click
 *  (and on Enter / Space when focused); a single click selects it. */
function FolderTile({ folder, selected, onSelect, onOpen }: {
  folder: ProviderFolder; selected: boolean; onSelect: () => void; onOpen: () => void;
}) {
  const missing = folder.status["never-arrived"];
  const flagged = folder.status.partial + folder.status.failed + missing;
  return (
    <button type="button"
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      title={`${folder.provider} — ${folder.docCount} ${folder.docCount === 1 ? "file" : "files"}. Double-click to open.`}
      data-provider-folder={folder.provider} data-doc-count={folder.docCount}
      className={`group flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors
        ${selected ? "border-champagne-500/50 bg-champagne-500/10" : "border-transparent hover:border-ink-600 hover:bg-ink-700/40"}`}>
      <div className="relative">
        <Folder className="h-12 w-12 text-champagne-400/90 group-hover:text-champagne-300" strokeWidth={1.25} />
        {flagged > 0 && (
          <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-[var(--row-alt)]"
            title={missing
              ? `${missing} statement${missing === 1 ? "" : "s"} never arrived (a mail server removed the attachment)${flagged > missing ? `; ${flagged - missing} more did not fully read` : ""}`
              : `${flagged} document${flagged === 1 ? "" : "s"} did not fully read`} />
        )}
      </div>
      <div className="min-w-0">
        <div className="line-clamp-2 text-[12.5px] font-medium leading-tight text-slate-200">{folder.provider}</div>
        <div className="mt-1 text-[11px] text-slate-500">
          {folder.docCount} {folder.docCount === 1 ? "file" : "files"}
          <span className="text-slate-600"> · {folder.formats.join(", ")}</span>
        </div>
      </div>
    </button>
  );
}

export function StatementLibrary() {
  const [status, setStatus] = useState<"loading" | "ready" | "restricted">("loading");
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedDocument = manifest.find(d => d.docKey === searchParams.get('file') || d.sourcePath === searchParams.get('path'));
  const openProvider = linkedDocument?.provider ?? searchParams.get(PROVIDER_PARAM);
  useEffect(() => {
    if (linkedDocument && searchParams.get('file') !== linkedDocument.docKey) setSearchParams(p => {
      p.set('file', linkedDocument.docKey); p.delete('path'); return p;
    }, { replace: true });
  }, [linkedDocument, searchParams, setSearchParams]);
  const inbox = useStatementInbox();

  const alive = useRef(true);
  const loadManifest = useCallback(async (first: boolean) => {
    try {
      const r = await fetch(`${BASE}audit/manifest.json`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const m: ManifestEntry[] = await r.json();
      if (!alive.current) return;
      setManifest(m);
      setStatus("ready");
    } catch {
      // A refresh that fails keeps the library already on screen.
      if (alive.current && first) setStatus("restricted");
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void loadManifest(true);
    return () => { alive.current = false; };
  }, [loadManifest]);

  const library = useMemo(() => buildLibrary(manifest), [manifest]);
  /** The documents this copy of the site serves — a landed upload is in its folder once its are here. */
  const served = useMemo(() => new Set(manifest.map((e) => e.docKey)), [manifest]);
  const batches = inbox.state.status === "ready" ? inbox.state.batches : [];
  const uploads: UploadRow[] = [
    ...inbox.sending.map(f => ({ ...f, providers: [], destination: f.provider, fileKeys: [], view: { key: "uploading" as const, label: "Uploading", tone: "info" as const, title: "Uploading your statement to your family office dashboard." } })),
    ...batches.flatMap(batch => batch.files.map(file => {
      const keys = uploadDocumentKeys(file, manifest);
      const documents = manifest.filter(d => keys.includes(d.docKey));
      return { id: `${batch.id}/${file.name}`, name: file.name, uploadedAt: batch.uploadedAt, batch: batch.id, file,
        providers: file.providers?.length ? file.providers : [...new Set(documents.map(d => d.provider))],
        destination: inbox.locations[batch.id], fileKeys: documents.map(d => d.fileKey), view: fileView(file, served) };
    })),
  ];
  // A landed upload is live once the redeploy from its commit is: until then
  // the archive is read again every so often, so it appears in its folder
  // without a reload.
  const publishing = batches.some((b) => b.files.some((f) => f.status === "landed" && fileView(f, served).key === "publishing"));
  useEffect(() => {
    if (!publishing) return;
    const t = window.setInterval(() => { void loadManifest(false); }, 30_000);
    return () => window.clearInterval(t);
  }, [publishing, loadManifest]);
  const folders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library.folders;
    // Match the provider name OR any report type it holds, so "demat" or
    // "dividend" finds the folders that carry one even when the broker's name
    // does not contain the word.
    return library.folders.filter((f) =>
      f.provider.toLowerCase().includes(q) || f.reportTypes.some((t) => t.label.toLowerCase().includes(q)));
  }, [library, query]);

  const open = (provider: string) => setSearchParams((p) => {
    p.delete("file"); p.delete("path"); p.set(PROVIDER_PARAM, provider); return p;
  });
  const back = () => setSearchParams((p) => {
    p.delete("file"); p.delete("path"); p.delete(PROVIDER_PARAM); return p;
  });

  const current = openProvider ? library.folders.find((f) => f.provider === openProvider) : null;
  const trail = openProvider
    ? [{ label: "Admin" }, { label: "Statement Library", to: "/statements" }, { label: openProvider }]
    : undefined;

  return (
    <div className="mx-auto max-w-5xl" data-statement-library>
      <PageHeader eyebrow="Admin" title="Statement Library" trail={trail}
        subtitle="Upload statements for automatic analysis and filing."
        right={status === "ready" && !openProvider ? (
          <div className="flex items-center gap-2">
            <Pill>{library.totalProviders} providers</Pill>
            <Pill tone="info">{library.totalDocs} documents</Pill>
          </div>
        ) : undefined} />

      {status === "loading" && (
        <Card><div role="status" className="py-10 text-center text-sm text-slate-400">Opening the statement archive…</div></Card>
      )}

      {status === "restricted" && (
        <Card>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid h-10 w-10 place-items-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400"><ShieldAlert className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-medium text-slate-200">The statement archive is password-protected</div>
              <p className="mt-1 text-xs text-slate-400" data-prose-ok="why the archive did not load">
                The archive under <span className="mono text-slate-300">public/audit/</span> sits behind the site's edge
                password gate and could not be fetched. Sign in to the dashboard to browse the library.
              </p>
            </div>
          </div>
        </Card>
      )}

      <UploadPanel inbox={inbox} provider={current?.provider} archiveStatus={status} />


      {status === "ready" && (openProvider
        ? (current
          ? <OpenFolder folder={current} onBack={back} inbox={inbox} uploads={uploads.filter(row => row.providers.length ? row.providers.includes(current.provider) : !row.destination || row.destination === current.provider)} />
          : (
            <>
              <button type="button" onClick={back}
                className="mb-3 inline-flex items-center gap-1 rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-ink-700">
                <ChevronLeft className="h-3.5 w-3.5" /> All folders
              </button>
              <Card>
                <AbsentSection what={`No folder named "${openProvider}"`}
                  needs="This provider is not in the archive. Go back to all folders and pick one, or check the link that sent you here." />
              </Card>
            </>
          ))
        : (
          <>
            {uploads.length > 0 && <div className="mb-5"><FormatBlock format="Recent statements" docs={[]} uploads={uploads} inbox={inbox} onOpen={open} /></div>}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by provider or file type…"
                  className="w-full rounded-md border border-ink-600 bg-ink-800 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent-500/50 focus:outline-none" />
              </div>
            </div>

            {folders.length === 0 ? (
              <Card>
                <AbsentSection what={`No provider matches "${query}"`}
                  needs="Clear the filter to see every provider, or search a provider name or a file type such as holdings, capital gains or dividend." />
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
                onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
                {folders.map((f) => (
                  <FolderTile key={f.provider} folder={f}
                    selected={selected === f.provider}
                    onSelect={() => setSelected(f.provider)}
                    onOpen={() => open(f.provider)} />
                ))}
              </div>
            )}
          </>
        ))}
    </div>
  );
}
