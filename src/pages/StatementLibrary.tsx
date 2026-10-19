import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Folder, ChevronLeft, Search, ShieldAlert, ExternalLink, FileText, FileSpreadsheet, UploadCloud, Trash2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentSection, DASH } from "@/components/Absent";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { buildLibrary, type ManifestEntry, type ProviderFolder, type LibraryDoc } from "@/lib/statementLibrary";
import { useStatementUploads, uploadsOf, fmtSize, SWITCH_ON_STEPS, CAUSE_WORD } from "@/lib/statementUploads";

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
  const tone = status === "partial" ? "warn" : status === "encrypted" ? "info" : "loss";
  const why = status === "partial"
    ? "Some sections of this document could not be read — see Data Audit for what it carried"
    : status === "encrypted"
      ? "Sealed — opens with the account's password during ingest"
      : "This document could not be read; it feeds no figure";
  return <Pill tone={tone} className="capitalize"><span title={why}>{status}</span></Pill>;
}

/** One format's files inside an open folder — "all the files of the same
 *  format", in one labelled block, as a desktop folder groups a file type. */
function FormatBlock({ format, docs }: { format: string; docs: LibraryDoc[] }) {
  return (
    <div data-format-block={format}>
      <div className="mb-2 flex items-center gap-2">
        {fileIcon(format)}
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{format}</span>
        <Pill>{docs.length} {docs.length === 1 ? "file" : "files"}</Pill>
      </div>
      {/* Wide on a phone; the table scrolls inside its own container so the page
          body never scrolls sideways (CLAUDE.md, Conventions). */}
      <div className="overflow-x-auto rounded-lg border border-ink-700">
        <table className="min-w-full text-sm"
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
              <tr key={d.fileKey} className="hover:bg-ink-700/40">
                <td className="px-4 py-3 text-slate-200">
                  <span className="inline-flex items-center gap-1.5">
                    {d.reportLabel}
                    {d.hasSheets && (
                      <Link to={`/audit?file=${encodeURIComponent(d.fileKey)}`}
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
        </table>
      </div>
    </div>
  );
}

const ACCEPT = ".pdf,.xlsx,.xlsm,.xls,.csv,.zip";
const ALLOWED_UPLOAD = new Set(["pdf", "xlsx", "xlsm", "xls", "csv", "zip"]);
const uploadExt = (name: string) => {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
};

/** The drop box behind a folder: upload new statements for this provider, and
 *  see the ones already staged for the next rebuild. */
function DropBox({ provider }: { provider: string }) {
  const { state, upload, remove } = useStatementUploads();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(0);
  const [msg, setMsg] = useState<{ tone: "err" | "ok"; text: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const staged = state.status === "ready" ? uploadsOf(state.uploads, provider) : [];

  const send = async (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    const good = list.filter((f) => ALLOWED_UPLOAD.has(uploadExt(f.name)));
    const bad = list.length - good.length;
    setMsg(null);
    let ok = 0; let failure = "";
    setBusy((n) => n + good.length);
    for (const f of good) {
      const r = await upload(provider, f);
      if (r.ok) ok++; else failure = r.reason;
      setBusy((n) => Math.max(0, n - 1));
    }
    if (failure) setMsg({ tone: "err", text: failure });
    else if (ok) setMsg({ tone: "ok", text: `${ok} file${ok === 1 ? "" : "s"} staged — ${ok === 1 ? "it" : "they"} will reach the dashboard at the next rebuild.` });
    else if (bad) setMsg({ tone: "err", text: `Not a statement file — only PDF, Excel (xlsx/xls), CSV or a ZIP of them can be uploaded.` });
  };

  // The store is not reachable — say which cause, and for a store nobody has
  // connected give the one-time set-up steps rather than a dead drop zone.
  if (state.status === "unavailable") {
    const notConfigured = state.cause === "not-configured";
    return (
      <Card className="mb-5" data-upload-box data-upload-state={state.cause}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400"><UploadCloud className="h-5 w-5" /></div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-200">Uploading statements — {CAUSE_WORD[state.cause]}</div>
            <p className="mt-1 text-xs text-slate-400" data-prose-ok="why the drop box is not available">{state.reason}</p>
            {notConfigured && (
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11.5px] text-slate-500" data-prose-ok="the one-time steps to switch the drop box on">
                {SWITCH_ON_STEPS.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}
          </div>
        </div>
      </Card>
    );
  }

  const disabled = busy > 0;
  return (
    <Card className="mb-5" data-upload-box data-upload-state="ready">
      <div className="mb-2 flex items-center gap-2">
        <UploadCloud className="h-4 w-4 text-champagne-400" />
        <span className="text-sm font-semibold text-slate-200">Add statements to {provider}</span>
      </div>
      {/* HOW A DROPPED FILE REACHES THE BOOK — on the face, because a staged file
          is NOT a holding until a rebuild reads it (the no-fabrication rule). */}
      <p className="mb-3 text-[11.5px] text-slate-500" data-prose-ok="what happens to an uploaded statement">
        A file you add here is held for this provider and read into the dashboard at the next book rebuild — it is not
        a live figure until then.
      </p>

      <button type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void send(e.dataTransfer.files); }}
        className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-7 text-center transition-colors
          ${drag ? "border-champagne-500/60 bg-champagne-500/10" : "border-ink-600 hover:border-ink-500 hover:bg-ink-700/30"}`}>
        {disabled
          ? <Loader2 className="h-6 w-6 animate-spin text-champagne-400" />
          : <UploadCloud className="h-6 w-6 text-slate-500" />}
        <span className="text-sm text-slate-300">{disabled ? "Uploading…" : "Drop statements here, or click to choose"}</span>
        <span className="text-[11px] text-slate-500">PDF, Excel, CSV or a ZIP · up to 50 MB each</span>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden"
          onChange={(e) => { void send(e.target.files ?? []); e.target.value = ""; }} />
      </button>

      {msg && (
        <p className={`mt-2 text-xs ${msg.tone === "err" ? "text-loss" : "text-gain"}`} role="status"
          data-prose-ok="the result of an upload">{msg.text}</p>
      )}

      {staged.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Waiting for the next rebuild</span>
            <Pill tone="warn">{staged.length}</Pill>
          </div>
          <div className="overflow-x-auto rounded-lg border border-ink-700">
            <table className="min-w-full text-sm" data-table-static="statements staged for this provider, newest first — they are read into the book at the next rebuild">
              <thead className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">File</th>
                  <th className="px-4 py-2.5 font-medium">Size</th>
                  <th className="px-4 py-2.5 font-medium">Uploaded</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {staged.map((u) => (
                  <tr key={u.key} className="hover:bg-ink-700/40">
                    <td className="px-4 py-3 text-slate-200">
                      <span className="inline-flex items-center gap-1.5">
                        {fileIcon((uploadExt(u.fileName) || "").toUpperCase())}
                        <span className="break-all">{u.fileName}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 mono text-slate-400">{fmtSize(u.size)}</td>
                    <td className="px-4 py-3 text-slate-400">{u.uploadedAt ? fmtDateTime(u.uploadedAt) : DASH}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" disabled={removing === u.key}
                        onClick={async () => { setRemoving(u.key); await remove(u.key); setRemoving(null); }}
                        className="inline-flex items-center gap-1 rounded border border-ink-600 px-2 py-1 text-[11px] text-slate-400 hover:bg-ink-700 hover:text-loss disabled:opacity-50"
                        title="Remove this staged file">
                        {removing === u.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
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

      <DropBox provider={folder.provider} />

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
  const flagged = folder.status.partial + folder.status.failed;
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
            title={`${flagged} document${flagged === 1 ? "" : "s"} did not fully read`} />
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
  const openProvider = searchParams.get(PROVIDER_PARAM);

  useEffect(() => {
    let alive = true;
    fetch(`${BASE}audit/manifest.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((m: ManifestEntry[]) => {
        if (!alive) return;
        setManifest(m);
        setStatus("ready");
      })
      .catch(() => alive && setStatus("restricted"));
    return () => { alive = false; };
  }, []);

  const library = useMemo(() => buildLibrary(manifest), [manifest]);
  const folders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library.folders;
    // Match the provider name OR any report type it holds, so "demat" or
    // "dividend" finds the folders that carry one even when the broker's name
    // does not contain the word.
    return library.folders.filter((f) =>
      f.provider.toLowerCase().includes(q) || f.reportTypes.some((t) => t.label.toLowerCase().includes(q)));
  }, [library, query]);

  const open = (provider: string) => setSearchParams((p) => { p.set(PROVIDER_PARAM, provider); return p; });
  const back = () => setSearchParams((p) => { p.delete(PROVIDER_PARAM); return p; });

  const current = openProvider ? library.folders.find((f) => f.provider === openProvider) : null;
  const trail = openProvider
    ? [{ label: "Admin" }, { label: "Statement Library", to: "/statements" }, { label: openProvider }]
    : undefined;

  return (
    <div className="mx-auto max-w-5xl" data-statement-library>
      <PageHeader eyebrow="Admin" title="Statement Library" trail={trail}
        subtitle="The source statements that feed this book, in a folder per provider — double-click a folder to open it, see its files grouped by type, and drop new statements into it. An uploaded file is staged under its provider and read into the book at the next rebuild."
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
            {/* HOW A NEW STATEMENT IS ADDED — the family's reason for this page.
                A direct upload that rebuilds the book is not wired yet; until it
                is, a new drop goes through the offline ingest. Tagged so the
                no-explainer sweep allows this one actionable line. */}
            <p className="mb-4 text-xs text-slate-500" data-prose-ok="how a new statement reaches the dashboard">
              Each folder is a provider the family receives statements from — double-click to open it. Open a folder to
              drop new statements straight into it; they are staged under that provider and read into the dashboard at
              the next book rebuild.
            </p>

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
