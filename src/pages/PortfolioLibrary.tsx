import { statementAsset } from "@/lib/runtimeBook";
import { useNavigationState, useNavigationValue, nullableStringNavigation } from "@/lib/useNavigationState";
import { ExportableTable } from "@/components/ExportableTable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Folder, ChevronLeft, Search, ShieldAlert, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { StatementPreview, useFilePreview, prepareStatementPreview } from "@/components/StatementPreview";
import { FolderTile, StatusPill, statementFileIcon } from "@/components/LibraryFolder";
import { AbsentSection, DASH } from "@/components/Absent";
import { fmtDate } from "@/lib/format";
import { loadStatementSecurities } from "@/lib/ledger";
import { buildSecurityLibrary, type ManifestEntry, type SecurityFolder, type LibraryDoc } from "@/lib/statementLibrary";
import { bucketLabel, UNSTATED_BUCKET } from "@/lib/analytics";
import { bucketOrd } from "@/lib/groupAxis";

/**
 * ── THE PORTFOLIO LIBRARY: EVERY STATEMENT, ONE FOLDER PER SECURITY ─────────
 *
 * *"make another tab below the statement library called the portfolio library,
 * which basically organizes all statements by portfolio name … folders need to
 * be stock names … view-only … all the uploads will be done in the statement
 * library only"* — the family, 28 Oct 2026.
 *
 * The Statement Library's documents, filed by the security each one carries a
 * row for (`statement-securities.json`, prepared on the build server by
 * `deriveStatementSecurities`), so a statement naming several securities sits in
 * each of their folders. It reads the same manifest as the Statement Library and
 * opens the same preview; it uploads nothing.
 */

/** The open folder lives in the address (`?stock=`), so it is linkable and Back closes it. */
const STOCK_PARAM = "stock";
/**
 * The category tab lives there too (`?category=`): Direct Equity, PMS mandates,
 * ETF, Mutual Fund, AIF… — the Portfolio Monitor's sections, decided per folder
 * by `holdingBucket` (`deriveStatementSecurities`). A folder can sit in several.
 */
const CATEGORY_PARAM = "category";
const ALL = "All";
const CATEGORY_TITLE: Record<string, string> = {
  [ALL]: "Every security a statement names",
  [UNSTATED_BUCKET]: "The statements naming these securities print no asset class, so no category is claimed for them",
};

/** One format's files inside an opened folder — the Statement Library's table, plus the provider. */
function FormatBlock({ format, docs }: { format: string; docs: LibraryDoc[] }) {
  const preview = useFilePreview();
  useEffect(() => {
    if (format !== "PDF") return;
    if ("requestIdleCallback" in window) {
      const idle = window.requestIdleCallback(prepareStatementPreview, { timeout: 1000 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = setTimeout(prepareStatementPreview, 200);
    return () => clearTimeout(timer);
  }, [format]);
  const previewing = preview.openKey ? docs.find((d) => d.fileKey === preview.openKey) : undefined;
  return <div data-format-block={format}>
    <div className="mb-2 flex items-center gap-2">
      {statementFileIcon(format)}
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{format}</span>
      <Pill>{docs.length} {docs.length === 1 ? "file" : "files"}</Pill>
    </div>
    <div className="overflow-x-auto rounded-lg border border-ink-700" data-navigation-scroll={`portfolio-library-${format}`}>
      <ExportableTable viewOnly className="min-w-full text-sm" data-table-static="statement files, newest first, as the Statement Library lists them">
        <thead className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr>
          <th className="px-4 py-2.5 font-medium">Document</th>
          <th className="px-4 py-2.5 font-medium">Provider</th>
          <th className="px-4 py-2.5 font-medium">Owner / entity</th>
          <th className="px-4 py-2.5 font-medium">Account</th>
          <th className="px-4 py-2.5 font-medium">As of</th>
          <th className="px-4 py-2.5 font-medium">Status</th>
        </tr></thead>
        <tbody className="divide-y divide-ink-700/70">
          {docs.map((d) => <tr key={d.fileKey} className="cursor-pointer hover:bg-ink-700/40" onClick={() => preview.open(d.fileKey)}
            onPointerEnter={format === "PDF" ? prepareStatementPreview : undefined}
            onFocus={format === "PDF" ? prepareStatementPreview : undefined}
            data-preview-row={d.fileKey} data-xa="portfolio-doc">
            <td className="px-4 py-3 text-slate-200"><span className="inline-flex items-center gap-1.5">
              <button type="button" onClick={(e) => { e.stopPropagation(); preview.open(d.fileKey); }} className="text-left hover:text-accent-400 hover:underline" title={`Open ${d.fileName}`}>{d.reportLabel}</button>
              {d.hasSheets && <Link to={`/audit?file=${encodeURIComponent(d.fileKey)}`} onClick={(e) => e.stopPropagation()} className="text-slate-500 hover:text-accent-400" title="Open this document in Data Audit"><ExternalLink className="h-3.5 w-3.5" /></Link>}
            </span></td>
            <td className="px-4 py-3 text-slate-400">
              <Link to={`/statements?provider=${encodeURIComponent(d.provider)}`} onClick={(e) => e.stopPropagation()} className="hover:text-accent-400 hover:underline" title="Open this provider's folder in the Statement Library">{d.provider}</Link>
            </td>
            <td className="px-4 py-3 text-slate-400">{d.owner ?? DASH}</td>
            <td className="px-4 py-3 mono text-slate-400">{d.accountNo ?? DASH}</td>
            <td className="px-4 py-3 text-slate-400">{d.asOf ? fmtDate(d.asOf) : DASH}</td>
            <td className="px-4 py-3"><StatusPill status={d.status} /></td>
          </tr>)}
        </tbody>
      </ExportableTable>
    </div>
    {previewing && <StatementPreview doc={previewing} onClose={preview.close} />}
  </div>;
}

/** The opened folder: a header naming the security, then one block per file format. */
function OpenFolder({ folder, onBack }: { folder: SecurityFolder; onBack: () => void }) {
  const dateRange = folder.asOfFrom
    ? folder.asOfFrom === folder.asOfTo
      ? fmtDate(folder.asOfFrom)
      : `${fmtDate(folder.asOfFrom)} → ${fmtDate(folder.asOfTo!)}`
    : null;
  // The format this security's statements come in most leads, as in the Statement Library.
  const byFormat = useMemo(() => {
    const map = new Map<string, LibraryDoc[]>();
    for (const d of folder.docs) {
      const list = map.get(d.format);
      if (list) list.push(d); else map.set(d.format, [d]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [folder]);

  return (
    <div data-open-security={folder.securityKey}>
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
              <Link to={`/stock/${encodeURIComponent(folder.securityKey)}`} className="font-display text-base font-semibold text-slate-100 hover:text-accent-400 hover:underline" title="Open this security's page">{folder.name}</Link>
              <Pill tone="info">{folder.docCount} {folder.docCount === 1 ? "file" : "files"}</Pill>
              {folder.formats.map((f) => <Pill key={f}>{f}</Pill>)}
              {folder.categories.map((c) => <span key={c} data-folder-category={c} title={CATEGORY_TITLE[c]}><Pill tone="core">{bucketLabel(c)}</Pill></span>)}
            </div>
            {/* WHAT THIS FOLDER HOLDS — the report types that name this security.
                A list of labels, not a sentence (prose convention). */}
            <div className="mt-1.5 text-xs text-slate-400">
              {folder.reportTypes.map((t, i) => (
                <span key={t.type}>
                  {i > 0 && <span className="text-slate-600"> · </span>}
                  <span title={`${t.count} ${t.count === 1 ? "document" : "documents"}`}>{t.label}{t.count > 1 ? ` ×${t.count}` : ""}</span>
                </span>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              <span title="The providers whose statements name this security">{folder.providers.join(", ")}</span>
              {folder.owners.length > 0 && (
                <span className="text-slate-600"> · <span title="The members and entities these statements are held under">{folder.owners.join(", ")}</span></span>
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

export function PortfolioLibrary() {
  const [status, setStatus] = useState<"loading" | "ready" | "restricted">("loading");
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [securities, setSecurities] = useState<{ securityKey: string; name: string; documents: string[] }[]>([]);
  const [query, setQuery] = useNavigationState<string>("portfolio-library-search", "");
  const [selected, setSelected] = useNavigationValue<string | null>("portfolio-library-selection", null, nullableStringNavigation);
  const [searchParams, setSearchParams] = useSearchParams();
  const openKey = searchParams.get(STOCK_PARAM);
  const categoryParam = searchParams.get(CATEGORY_PARAM) ?? ALL;

  // The same archive index the Statement Library reads, and the build server's
  // index of which of its documents name each security. Either failing shows the
  // restricted notice rather than an empty library.
  const alive = useRef(true);
  const load = useCallback(async () => {
    try {
      const [r, index] = await Promise.all([
        fetch(statementAsset("audit/manifest.json"), { cache: "no-store" }),
        loadStatementSecurities(),
      ]);
      if (!r.ok || !index) throw new Error(String(r.status));
      const m: ManifestEntry[] = await r.json();
      if (!alive.current) return;
      setManifest(m);
      setSecurities(index.securities);
      setStatus("ready");
    } catch {
      if (alive.current) setStatus("restricted");
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; };
  }, [load]);

  const library = useMemo(() => buildSecurityLibrary(manifest, securities), [manifest, securities]);
  const filed = useMemo(() => new Set(library.flatMap((f) => f.docs.map((d) => d.fileKey))).size, [library]);
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library;
    // A security's name, or a provider whose statements name it — "carnelian"
    // finds every stock a Carnelian statement carries.
    return library.filter((f) => f.name.toLowerCase().includes(q) || f.providers.some((p) => p.toLowerCase().includes(q)));
  }, [library, query]);
  // Every category any folder sits in, in the Portfolio Monitor's order; the
  // count beside each is how many of the folders the search leaves are in it.
  const categories = useMemo(() => [...new Set(library.flatMap((f) => f.categories))]
    .sort((a, b) => bucketOrd(a) - bucketOrd(b) || a.localeCompare(b)), [library]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of matching) for (const c of f.categories) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  }, [matching]);
  // A category the library no longer carries (an old link) shows every folder.
  const category = categoryParam === ALL || categories.includes(categoryParam) ? categoryParam : ALL;
  const folders = useMemo(() => category === ALL ? matching : matching.filter((f) => f.categories.includes(category)), [matching, category]);

  const open = (key: string) => setSearchParams((p) => { p.delete("file"); p.set(STOCK_PARAM, key); return p; });
  const back = () => setSearchParams((p) => { p.delete("file"); p.delete(STOCK_PARAM); return p; });
  const pickCategory = (c: string) => setSearchParams((p) => { if (c === ALL) p.delete(CATEGORY_PARAM); else p.set(CATEGORY_PARAM, c); return p; }, { replace: true });

  const current = openKey ? library.find((f) => f.securityKey === openKey) : null;
  const trail = openKey
    ? [{ label: "Admin" }, { label: "Portfolio Library", to: "/portfolios" }, { label: current?.name ?? openKey }]
    : undefined;

  return (
    <div className="mx-auto max-w-5xl" data-portfolio-library>
      <PageHeader eyebrow="Admin" title="Portfolio Library" trail={trail}
        subtitle="Every statement, filed under each stock it names."
        right={status === "ready" && !openKey ? (
          <div className="flex items-center gap-2">
            <Pill>{library.length} securities</Pill>
            <Pill tone="info">{filed} documents</Pill>
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
              <div className="text-sm font-medium text-slate-200">Portfolio library unavailable</div>
              <p className="mt-1 text-xs text-slate-400" data-prose-ok="why the archive did not load">
                We couldn’t open your statements. Try again, or sign in to the dashboard again.
              </p>
              <button type="button" onClick={() => { setStatus("loading"); void load(); }} className="mt-2 text-xs text-accent-400 hover:underline">Try again</button>
            </div>
          </div>
        </Card>
      )}

      {status === "ready" && (openKey
        ? (current
          ? <OpenFolder folder={current} onBack={back} />
          : (
            <>
              <button type="button" onClick={back}
                className="mb-3 inline-flex items-center gap-1 rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-ink-700">
                <ChevronLeft className="h-3.5 w-3.5" /> All folders
              </button>
              <Card>
                <AbsentSection what="No statement names this security"
                  needs="No statement in the archive carries a holding, trade, realised lot or income line for it. Go back to all folders and pick one, or check the link that sent you here." />
              </Card>
            </>
          ))
        : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input type="search" data-publication-transient="true" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by stock or provider…"
                  className="w-full rounded-md border border-ink-600 bg-ink-800 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent-500/50 focus:outline-none" />
              </div>
            </div>

            {categories.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-x-1 gap-y-0.5 border-b border-ink-700" role="tablist"
                aria-label="Show one category" data-category-filter={category}>
                {[ALL, ...categories].map((c) => {
                  const on = category === c;
                  const n = c === ALL ? matching.length : counts.get(c) ?? 0;
                  return (
                    <button key={c} type="button" role="tab" aria-selected={on} onClick={() => pickCategory(c)}
                      data-xa="portfolio-category" data-category={c} data-count={n} data-active={on} title={CATEGORY_TITLE[c]}
                      className={`-mb-px border-b-2 px-2.5 py-1 text-xs transition-colors ring-focus ${on
                        ? "border-champagne-500 font-medium text-champagne-400"
                        : "border-transparent text-slate-400 hover:text-slate-200"}`}>
                      {c === ALL ? ALL : bucketLabel(c)}
                      <span className="ml-1 text-[10px] tabular-nums text-slate-500">{n}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {folders.length === 0 ? (
              <Card>
                <AbsentSection
                  what={query.trim()
                    ? `No security matches "${query}"${category === ALL ? "" : ` in ${bucketLabel(category)}`}`
                    : category === ALL ? "No statement names a security" : `No security in ${bucketLabel(category)}`}
                  needs={query.trim() || category !== ALL
                    ? "Clear the search or pick All to see every security, or search a stock name or a provider such as Carnelian."
                    : "Statements are filed here once one carries a holding, trade, realised lot or income line. Upload them in the Statement Library."} />
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
                onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
                {folders.map((f) => (
                  <FolderTile key={f.securityKey} label={f.name} docCount={f.docCount} formats={f.formats} status={f.status}
                    data={{ "data-xa": "portfolio-folder", "data-security-folder": f.securityKey, "data-doc-count": f.docCount, "data-categories": f.categories.join("|") }}
                    selected={selected === f.securityKey}
                    onSelect={() => setSelected(f.securityKey)}
                    onOpen={() => open(f.securityKey)} />
                ))}
              </div>
            )}
          </>
        ))}
    </div>
  );
}
