import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Library, Folder, FolderOpen, ChevronDown, Search, ShieldAlert, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentSection, DASH } from "@/components/Absent";
import { fmtDate } from "@/lib/format";
import { buildLibrary, type ManifestEntry, type ProviderFolder, type LibraryDoc } from "@/lib/statementLibrary";

// The library reads the SAME archive index the Data Audit viewer does —
// public/audit/manifest.json, written by the ingest pipeline and served at
// /audit/* in dev, preview and production. On the hosted site those requests sit
// behind the edge password gate (functions/_middleware.js); a failed fetch shows
// the restricted notice rather than an empty page.
const BASE = import.meta.env.BASE_URL;

/** A statement's ingest status, shown as a toned pill so a reader can scan it. */
function StatusPill({ status }: { status: LibraryDoc["status"] }) {
  // "ok" is the quiet default; the three exceptions carry a tone because they
  // are what a reader is scanning for — a document that only partly read, one
  // that did not read, or one still sealed.
  if (status === "ok") return <span className="text-[11px] text-slate-500" title="Read in full">Read</span>;
  const tone = status === "partial" ? "warn" : status === "encrypted" ? "info" : "loss";
  const why = status === "partial"
    ? "Some sections of this document could not be read — see Data Audit for what it carried"
    : status === "encrypted"
      ? "Sealed — opens with the account's password during ingest"
      : "This document could not be read; it feeds no figure";
  return <Pill tone={tone} className="capitalize"><span title={why}>{status}</span></Pill>;
}

/** The expandable contents of one provider's folder: every document it has sent. */
function FolderBody({ folder }: { folder: ProviderFolder }) {
  return (
    // Wide on a phone; the table scrolls inside its own container so the page
    // body never scrolls sideways (CLAUDE.md, Conventions).
    <div className="overflow-x-auto border-t border-ink-700">
      <table className="min-w-full text-sm"
        data-table-static="a file listing grouped by provider; the Data Audit viewer sorts the rows inside any one document">
        <thead className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-2.5 font-medium">Document</th>
            <th className="px-4 py-2.5 font-medium">Owner / entity</th>
            <th className="px-4 py-2.5 font-medium">Account</th>
            <th className="px-4 py-2.5 font-medium">As of</th>
            <th className="px-4 py-2.5 font-medium">Format</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-5 py-2.5 font-medium">Arrived in</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-700/70">
          {folder.docs.map((d) => (
            <tr key={d.fileKey} className="hover:bg-ink-700/40">
              <td className="px-5 py-3 text-slate-200">
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
              <td className="px-4 py-3"><span className="mono text-[11px] text-slate-400">{d.format}</span></td>
              <td className="px-4 py-3"><StatusPill status={d.status} /></td>
              <td className="px-5 py-3 text-slate-500" title={`Source file: ${d.fileName}`}>{d.delivery}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One provider's folder — the header is always visible, the files fold open. */
function FolderCard({ folder, open, onToggle }: { folder: ProviderFolder; open: boolean; onToggle: () => void }) {
  const s = folder.status;
  const dateRange = folder.asOfFrom
    ? folder.asOfFrom === folder.asOfTo
      ? fmtDate(folder.asOfFrom)
      : `${fmtDate(folder.asOfFrom)} → ${fmtDate(folder.asOfTo!)}`
    : null;
  return (
    <Card pad={false} className="overflow-hidden"
      data-provider-folder={folder.provider} data-doc-count={folder.docCount}
      data-folder-formats={folder.formats.join(",")}>
      <button type="button" onClick={onToggle}
        className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-ink-700/30"
        aria-expanded={open}>
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border border-champagne-500/30 bg-champagne-500/10 text-champagne-400">
          {open ? <FolderOpen className="h-5 w-5" /> : <Folder className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-sm font-semibold text-slate-100">{folder.provider}</span>
            <Pill tone="info">{folder.docCount} {folder.docCount === 1 ? "file" : "files"}</Pill>
            {folder.formats.map((f) => <Pill key={f}>{f}</Pill>)}
            {s.partial > 0 && <Pill tone="warn"><span title="Documents that only partly read">{s.partial} partial</span></Pill>}
            {s.failed > 0 && <Pill tone="loss"><span title="Documents that could not be read">{s.failed} unread</span></Pill>}
          </div>
          {/* WHAT THIS FOLDER HOLDS — the family asked each folder to state its
              file type plainly, so the report types this provider sends sit on
              the face rather than behind the fold. A list of labels, not a
              sentence (see the prose convention). */}
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
              <span title="The members and entities this provider's statements are held under">
                {folder.owners.join(", ")}
              </span>
            )}
            {dateRange && <span className="text-slate-600"> · {dateRange}</span>}
          </div>
        </div>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <FolderBody folder={folder} />}
    </Card>
  );
}

export function StatementLibrary() {
  const [status, setStatus] = useState<"loading" | "ready" | "restricted">("loading");
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

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

  const toggle = (provider: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(provider)) next.delete(provider); else next.add(provider);
    return next;
  });
  const allOpen = folders.length > 0 && folders.every((f) => open.has(f.provider));
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(folders.map((f) => f.provider)));

  return (
    <div className="mx-auto max-w-5xl" data-statement-library>
      <PageHeader eyebrow="Admin" title="Statement Library"
        subtitle="The source statements that feed this book, one folder per provider, with the file type each folder holds. New statements from a provider belong in its folder; the book is rebuilt from them offline."
        right={status === "ready" ? (
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

      {status === "ready" && (
        <>
          {/* HOW A NEW STATEMENT IS ADDED — the family's reason for this page, so
              it sits on the face. A direct upload that rebuilds the book is not
              wired yet; until it is, a new drop goes through the offline ingest.
              Tagged so the no-explainer sweep allows this one actionable line. */}
          <p className="mb-4 text-xs text-slate-500" data-prose-ok="how a new statement reaches the dashboard">
            Each folder below is a provider the family receives statements from. A new statement belongs in its
            provider's folder and reaches the dashboard when the book is rebuilt from the source archive — direct
            upload from this page is not wired yet.
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by provider or file type…"
                className="w-full rounded-md border border-ink-600 bg-ink-800 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent-500/50 focus:outline-none" />
            </div>
            {folders.length > 0 && (
              <button type="button" onClick={toggleAll}
                className="rounded-md border border-ink-600 bg-ink-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-ink-700">
                {allOpen ? "Collapse all" : "Expand all"}
              </button>
            )}
          </div>

          {folders.length === 0 ? (
            <Card>
              <AbsentSection what={`No provider matches "${query}"`}
                needs="Clear the filter to see every provider, or search a provider name or a file type such as holdings, capital gains or dividend." />
            </Card>
          ) : (
            <div className="space-y-3">
              {folders.map((f) => (
                <FolderCard key={f.provider} folder={f} open={open.has(f.provider)} onToggle={() => toggle(f.provider)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
