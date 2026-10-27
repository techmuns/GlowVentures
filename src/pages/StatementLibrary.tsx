import { useNavigationState, useNavigationValue, booleanNavigation, nullableStringNavigation } from "@/lib/useNavigationState";
import { useTableExportFilter } from "@/lib/tableExportSnapshot";
import { ExportableTable } from "@/components/ExportableTable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import {
  Folder, FolderUp, ChevronLeft, Search, ShieldAlert, ExternalLink, FileText, FileSpreadsheet, UploadCloud, Trash2,
  Loader2, RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { StatementPreview, useFilePreview } from "@/components/StatementPreview";
import { AbsentSection, DASH } from "@/components/Absent";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { buildLibrary, type ManifestEntry, type ProviderFolder, type LibraryDoc } from "@/lib/statementLibrary";
import {
  useStatementInbox, fromDrop, fromInput, planUpload, fileView, SWITCH_ON_STEPS, CAUSE_WORD,
  type PickedFile, type InboxBatch,
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

/** One format's files inside an open folder — "all the files of the same
 *  format", in one labelled block, as a desktop folder groups a file type.
 *  A row opens that file's contents in a preview window. */
function FormatBlock({ format, docs }: { format: string; docs: LibraryDoc[] }) {
  const preview = useFilePreview();
  const previewing = preview.openKey ? docs.find((d) => d.fileKey === preview.openKey) : undefined;
  return (
    <div data-format-block={format}>
      <div className="mb-2 flex items-center gap-2">
        {fileIcon(format)}
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{format}</span>
        <Pill>{docs.length} {docs.length === 1 ? "file" : "files"}</Pill>
      </div>
      {/* Wide on a phone; the table scrolls inside its own container so the page
          body never scrolls sideways (CLAUDE.md, Conventions). */}
      <div className="overflow-x-auto rounded-lg border border-ink-700" data-navigation-scroll="statementlibrary-1">
        <ExportableTable className="min-w-full text-sm"
          data-table-static="one file type inside a provider folder; the Data Audit viewer sorts the rows inside any one document">
          <thead className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Document</th>
              <th className="px-4 py-2.5 font-medium">Owner / entity</th>
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-4 py-2.5 font-medium">As of</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Arrived in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700/70">
            {docs.map((d) => (
              <tr key={d.fileKey} className="cursor-pointer hover:bg-ink-700/40" onClick={() => preview.open(d.fileKey)}
                data-preview-row={d.fileKey}>
                <td className="px-4 py-3 text-slate-200">
                  <span className="inline-flex items-center gap-1.5">
                    <button type="button" onClick={(e) => { e.stopPropagation(); preview.open(d.fileKey); }}
                      className="text-left hover:text-accent-400 hover:underline" title={`Open ${d.fileName}`}>
                      {d.reportLabel}
                    </button>
                    {d.hasSheets && (
                      <Link to={`/audit?file=${encodeURIComponent(d.fileKey)}`} onClick={(e) => e.stopPropagation()}
                        className="text-slate-500 hover:text-accent-400"
                        title="Open this document in Data Audit">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400">{d.owner ?? <span className="text-slate-600" title="This document names no holder">{DASH}</span>}</td>
                <td className="px-4 py-3 mono text-slate-400">{d.accountNo ?? <span className="text-slate-600">{DASH}</span>}</td>
                <td className="px-4 py-3 text-slate-400">{d.asOf ? fmtDate(d.asOf) : <span className="text-slate-600" title="No as-of date on this document">{DASH}</span>}</td>
                <td className="px-4 py-3"><StatusPill status={d.status} /></td>
                <td className="px-4 py-3 text-slate-500" title={`Source file: ${d.fileName}`}>{d.delivery}</td>
              </tr>
            ))}
          </tbody>
        </ExportableTable>
      </div>
      {previewing && <StatementPreview doc={previewing} onClose={preview.close} />}
    </div>
  );
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
      const r = await upload(plan.accepted, (done, of) => setProgress({ done, of }));
      if (!r.ok) { setMsg({ tone: "err", text: r.reason }); return; }
      const notSent = [...plan.skipped, ...r.failed.map((f) => ({ path: f.name, why: f.why }))];
      const tail = notSent.length ? ` ${notSent.length} not uploaded — hover for why.` : "";
      const title = notSent.map((s) => `${s.path}: ${s.why}`).join("\n") || undefined;
      if (!r.saved) { setMsg({ tone: "err", text: `Nothing was saved.${tail}`, title }); return; }
      const n = `${r.saved} statement file${r.saved === 1 ? "" : "s"}`;
      setMsg({
        tone: notSent.length ? "err" : "ok", title,
        text: r.started
          ? `${n} saved to GitHub — being read into the dashboard now.${tail}`
          : `${n} saved to GitHub — the next scheduled intake run reads ${r.saved === 1 ? "it" : "them"} in, within about 20 minutes.${tail}`,
      });
    } catch {
      setMsg({ tone: "err", text: "The files could not be read or uploaded. Try again, or use Files to select them." });
    } finally {
      receiving.current = false;
      setCollecting(false);
      setProgress(null);
    }
  }, [canUpload, upload]);

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
            <div className="text-sm font-medium text-slate-200">Uploading statements — {CAUSE_WORD[state.cause]}</div>
            <p className="mt-1 text-xs text-slate-400" data-prose-ok="why uploading is not available">{state.reason}</p>
            {state.cause === "not-configured" && (
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11.5px] text-slate-500" data-prose-ok="the one-time steps to switch uploading on">
                {SWITCH_ON_STEPS.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}
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
          title="Each statement is saved to GitHub, read into the dashboard, and filed in the folder of the provider that issued it.">
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

const LOG_ROWS = 25;

/**
 * EVERY UPLOAD AND WHAT BECAME OF IT — queued, being read, in its folder,
 * already here, or held with the reason the pipeline gave. A held file is not
 * a holding: it feeds nothing until a reader exists and it is retried.
 */
function UploadLog({ inbox, batches, served, folders, onOpen }: {
  inbox: ReturnType<typeof useStatementInbox>;
  batches: InboxBatch[];
  served: ReadonlySet<string>;
  folders: ReadonlySet<string>;
  onOpen: (provider: string) => void;
}) {
  const [all, setAll] = useNavigationValue("inbox-all", false, booleanNavigation);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rows = useMemo(() => batches.flatMap((b) => b.files.map((f) => ({ b, f, v: fileView(f, served) }))), [batches, served]);
  const exportAll = useTableExportFilter(all, true);
  const shown = exportAll ? rows : rows.slice(0, LOG_ROWS);
  if (!rows.length) return null;
  const tally = (k: string) => rows.filter((r) => r.v.key === k).length;
  const act = async (id: string, run: () => Promise<{ ok: true } | { ok: false; reason: string }>) => {
    setBusy(id); setErr(null);
    const r = await run();
    if (!r.ok) setErr(r.reason);
    setBusy(null);
  };

  return (
    <div data-xa="statement-upload-log" data-upload-rows={rows.length}>
    <Card className="mb-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Uploads</span>
        {tally("reading") + tally("queued") > 0 && <Pill tone="info">{tally("reading") + tally("queued")} reading</Pill>}
        {tally("publishing") > 0 && <Pill tone="info">{tally("publishing")} publishing</Pill>}
        {tally("held") > 0 && <Pill tone="warn">{tally("held")} held</Pill>}
      </div>
      {err && <p className="mb-2 text-xs text-loss" role="status" data-prose-ok="why a retry or removal did not go through">{err}</p>}
      <div className="overflow-x-auto rounded-lg border border-ink-700" data-navigation-scroll="statementlibrary-2">
        <ExportableTable className="min-w-full text-sm"
          data-table-static="the inbox's own log, newest upload first — each file's status as the intake run left it">
          <thead className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">File</th>
              <th className="px-4 py-2.5 font-medium">Uploaded</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Folder</th>
              <th className="px-4 py-2.5 font-medium">Detail</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700/70">
            {shown.map(({ b, f, v }) => {
              const id = `${b.id}/${f.name}`;
              return (
                <tr key={id} className="hover:bg-ink-700/40" data-upload-status={v.key}>
                  <td className="min-w-[220px] px-4 py-3 text-slate-200">
                    <span className="inline-flex items-center gap-1.5" title={f.name}>
                      {fileIcon((f.name.split(".").pop() ?? "").toUpperCase())}
                      <span className="break-words">{f.name.split("/").pop()}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">{fmtDateTime(b.uploadedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Pill tone={v.tone} icon={v.key === "reading" || v.key === "publishing" ? <Loader2 className="h-3 w-3 animate-spin" /> : undefined}>
                      <span title={v.title}>{v.label}</span>
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {f.status === "landed" && f.providers?.length
                      ? f.providers.map((p, i) => (
                        <span key={p}>
                          {i > 0 && ", "}
                          {folders.has(p) && v.key === "in-library"
                            ? <button type="button" onClick={() => onOpen(p)} className="text-left text-accent-400 hover:underline">{p}</button>
                            : p}
                        </span>
                      ))
                      : <span className="text-slate-600">{DASH}</span>}
                  </td>
                  <td className="min-w-[200px] max-w-[320px] px-4 py-3 text-xs text-slate-500">
                    {f.status === "held" || f.status === "duplicate" || (f.status === "landed" && f.reason)
                      ? <span className={`line-clamp-2 ${f.status === "landed" ? "text-amber-400" : ""}`} title={f.reason ?? undefined}>{f.reason}</span>
                      : f.status === "landed" && f.landedAs?.length
                        ? <span className="mono line-clamp-2 break-all" title={f.landedAs.join("\n")}>{f.landedAs.join(", ")}</span>
                        : <span className="text-slate-600">{DASH}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <span className="inline-flex items-center gap-1">
                      {f.run && (
                        <a href={f.run} target="_blank" rel="noreferrer" aria-label="Intake run log"
                          className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-ink-700 hover:text-accent-400" title="Open the intake run's log on GitHub">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {f.status === "held" && (
                        <button type="button" disabled={busy !== null} data-upload-retry aria-label="Retry"
                          onClick={() => act(id, () => inbox.retry(b.id))}
                          className="grid h-6 w-6 place-items-center rounded border border-ink-600 text-slate-400 hover:bg-ink-700 hover:text-slate-200 disabled:opacity-50"
                          title="Retry — read this upload's held files again, after their reader is written or the password is set">
                          {busy === id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        </button>
                      )}
                      {(f.status === "held" || f.status === "queued") && (
                        <button type="button" disabled={busy !== null} aria-label="Remove"
                          onClick={() => act(`${id}#rm`, () => inbox.remove(b.id, f.name))}
                          className="grid h-6 w-6 place-items-center rounded border border-ink-600 text-slate-400 hover:bg-ink-700 hover:text-loss disabled:opacity-50"
                          title="Remove — take this file out of the inbox">
                          {busy === `${id}#rm` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </ExportableTable>
      </div>
      {rows.length > LOG_ROWS && (
        <button type="button" onClick={() => setAll((x) => !x)} className="mt-2 text-xs text-accent-400 hover:underline">
          {all ? "Show the latest only" : `Show all ${rows.length}`}
        </button>
      )}
    </Card>
    </div>
  );
}


/** The opened folder: a header strip naming the provider, then one block per
 *  file format it holds. */
function OpenFolder({ folder, onBack }: { folder: ProviderFolder; onBack: () => void }) {
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
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [folder]);

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
        {byFormat.map(([format, docs]) => <FormatBlock key={format} format={format} docs={docs} />)}
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
  const [query, setQuery] = useNavigationState<string>("library-search", "");
  const [selected, setSelected] = useNavigationValue<string | null>("library-selection", null, nullableStringNavigation);
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
  const folderNames = useMemo(() => new Set(library.folders.map((f) => f.provider)), [library]);
  const batches = inbox.state.status === "ready" ? inbox.state.batches : [];
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
        subtitle="The source statements that feed this book, in a folder per provider. Upload files or whole folders here: each statement is saved to GitHub, read into the book and filed in its provider's folder."
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
      {status === "ready" && <UploadLog inbox={inbox} batches={batches} served={served} folders={folderNames} onOpen={open} />}

      {status === "ready" && (openProvider
        ? (current
          ? <OpenFolder folder={current} onBack={back} />
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
