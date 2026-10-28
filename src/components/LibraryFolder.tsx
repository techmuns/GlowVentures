import { Folder, FileText, FileSpreadsheet } from "lucide-react";
import { Pill } from "@/components/Pill";
import type { LibraryDoc } from "@/lib/statementLibrary";

// THE PIECES THE STATEMENT LIBRARY AND THE PORTFOLIO LIBRARY SHARE — one icon per
// file format, one status pill per document, one folder tile on the grid — so the
// two libraries draw a statement and a folder the same way.

export const statementFileIcon = (format: string) =>
  format === "XLSX" || format === "XLS" || format === "CSV"
    ? <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-400/80" />
    : <FileText className="h-4 w-4 shrink-0 text-slate-500" />;

/** A statement's ingest status, shown as a toned pill so a reader can scan it. */
export function StatusPill({ status }: { status: LibraryDoc["status"] }) {
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

/** One folder on the grid — a desktop-style icon that opens on double-click
 *  (and on Enter / Space when focused); a single click selects it. */
export function FolderTile({ label, docCount, formats, status, selected, onSelect, onOpen, data }: {
  label: string; docCount: number; formats: string[]; status: Record<LibraryDoc["status"], number>;
  selected: boolean; onSelect: () => void; onOpen: () => void;
  /** The tile's `data-*` handles, for the page checks. */
  data: Record<`data-${string}`, string | number>;
}) {
  const missing = status["never-arrived"];
  const flagged = status.partial + status.failed + missing;
  return (
    <button type="button"
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      title={`${label} — ${docCount} ${docCount === 1 ? "file" : "files"}. Double-click to open.`}
      {...data}
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
        <div className="line-clamp-2 text-[12.5px] font-medium leading-tight text-slate-200">{label}</div>
        <div className="mt-1 text-[11px] text-slate-500">
          {docCount} {docCount === 1 ? "file" : "files"}
          <span className="text-slate-600"> · {formats.join(", ")}</span>
        </div>
      </div>
    </button>
  );
}
