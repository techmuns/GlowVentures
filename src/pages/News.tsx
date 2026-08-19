import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Newspaper, Megaphone, ExternalLink, RefreshCw, FileText, ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Pill } from "@/components/Pill";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { usePortfolio } from "@/context/PortfolioContext";
import { topHoldingsForNews, getHoldingsNews, type NewsArticle } from "@/lib/news";
import { topHoldingsForAnnouncements, getHoldingsAnnouncements, type Announcement } from "@/lib/announcements";
import { getHoldingsInsider, type InsiderTrade } from "@/lib/insider";

type Mode = "news" | "announcements" | "insider";
type Status = "loading" | "ready" | "not_configured" | "auth" | "error";
// The active feed reports its as-of time + refresh control up to the parent so
// they can sit on the tabs row rather than in a row of their own.
type FeedMeta = { asOf: string | null; refreshing: boolean; refresh: () => void };

function fmtAsOf(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

export function News() {
  const { portfolio } = usePortfolio();
  const [mode, setMode] = useState<Mode>("news");
  // The company filter is shared across all three feeds ("global") — a Set of
  // holding names. Empty = show everything. Kept here in the parent so switching
  // tabs preserves the selection.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // As-of / refresh of the currently-active feed, lifted up for the tabs-row toolbar.
  const [meta, setMeta] = useState<FeedMeta | null>(null);
  const onMeta = useCallback((m: FeedMeta) => setMeta(m), []);

  // Every listed holding, largest first, as the pick-list of companies.
  const companies = useMemo(
    () => (portfolio ? [...new Set(topHoldingsForNews(portfolio).map((h) => h.name))] : []),
    [portfolio],
  );

  if (!portfolio) return null;

  return (
    <div className="flex h-full flex-col">
      {/* The company filter is drawn from `topHoldingsForNews`, which is direct
          equity — so a dropdown labelled "All companies" no longer offers
          "Cash", "Tax Deducted at Source" or a fund folio among them. The
          subtitle says which set the feeds cover rather than leaving a reader
          to notice their AIF is missing from it. */}
      <PageHeader eyebrow="Daily" title="News & Announcements"
        subtitle="Across the companies this book holds directly. A fund folio has no news, filings or insider trades of its own — those belong to the companies its manager holds, which no statement here reports." />

      {/* Company filter + feed tabs + as-of/refresh on one row, freeing the space below */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <MultiSelectFilter
          options={companies}
          selected={selected}
          onChange={setSelected}
          allLabel="All companies"
          unit="companies"
          placeholder="Search companies…"
          className="w-64 max-w-full"
        />
        <div className="inline-flex w-fit flex-wrap items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
          {([["news", "News", Newspaper], ["announcements", "Corporate Announcements", Megaphone], ["insider", "Insider Trades", ArrowLeftRight]] as const).map(([m, label, Icon]) => (
            <button key={m} type="button" onClick={() => { setMode(m); setMeta(null); }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors active:scale-[0.98] ${
                mode === m ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {meta && (
          <div className="ml-auto flex items-center gap-2">
            {meta.asOf && <Pill tone="info">as of {fmtAsOf(meta.asOf)}</Pill>}
            <button onClick={meta.refresh} disabled={meta.refreshing} className="btn-ghost h-9 px-2.5" title="Refresh now">
              <RefreshCw className={`h-4 w-4 ${meta.refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        )}
      </div>
      {mode === "news" ? <NewsFeed selected={selected} onMeta={onMeta} /> : mode === "announcements" ? <AnnouncementsFeed selected={selected} onMeta={onMeta} /> : <InsiderFeed selected={selected} onMeta={onMeta} />}
    </div>
  );
}

// Filter a feed's items to the globally-selected companies (empty set = all).
function byCompany<T extends { holding: string }>(items: T[], selected: Set<string>): T[] {
  if (selected.size === 0) return items;
  return items.filter((it) => selected.has(it.holding));
}

// ── News ─────────────────────────────────────────────────────────────────────
function NewsFeed({ selected, onMeta }: { selected: Set<string>; onMeta: (m: FeedMeta) => void }) {
  const { portfolio } = usePortfolio();
  const [status, setStatus] = useState<Status>("loading");
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [watched, setWatched] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const holdings = useMemo(() => (portfolio ? topHoldingsForNews(portfolio) : []), [portfolio]);
  const [errDetail, setErrDetail] = useState<string | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    if (!holdings.length) { setArticles([]); setStatus("ready"); return; }
    if (refresh) setRefreshing(true); else setStatus("loading");
    const res = await getHoldingsNews(holdings, refresh);
    if (res.ok) { setArticles(res.articles ?? []); setAsOf(res.generatedAt ?? null); setWatched(res.holdingsSearched ?? holdings.length); setErrDetail(null); setStatus("ready"); }
    else if (res.reason === "not_configured") setStatus("not_configured");
    else if (res.reason === "auth") setStatus("auth");
    else { setErrDetail(res.reason === "upstream_error" ? `The news service returned ${res.status || "an error"}${res.status === 401 || res.status === 403 ? " (unauthorized)" : ""}. Try refreshing in a moment.` : null); setStatus("error"); }
    setRefreshing(false);
  }, [holdings]);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => { onMeta({ asOf, refreshing, refresh: () => load(true) }); }, [asOf, refreshing, load, onMeta]);

  const filtered = useMemo(() => byCompany(articles, selected), [articles, selected]);

  return (
    <Feed
      status={status} onRefresh={() => load(true)}
      empty={status === "ready" && articles.length === 0}
      emptyNotice={<Notice icon={Newspaper} title="No recent news" body="Nothing fresh across your holdings right now. The feed refreshes through the day — or check again now." action={<RetryButton onClick={() => load(true)} refreshing={refreshing} />} />}
      notConfigured={<Notice icon={Newspaper} title="News feed isn't switched on yet" body="It will populate automatically once the news API key is configured on the deployment." />}
      loadingText="Fetching the latest news across your holdings…" errorBody={errDetail ?? undefined}
      hasResults={filtered.length > 0} noMatch={articles.length > 0 && filtered.length === 0} noMatchText="No stories from the selected companies."
    >
      <ul className="space-y-3 pb-2">{filtered.map((a, i) => <ArticleRow key={`${a.url}-${i}`} a={a} />)}</ul>
    </Feed>
  );
}

function ArticleRow({ a }: { a: NewsArticle }) {
  return (
    <li>
      <a href={a.url} target="_blank" rel="noopener noreferrer"
        className="group block rounded-xl border border-ink-700 bg-ink-800 p-4 transition-colors hover:border-champagne-500/40 hover:bg-ink-700/40">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          {a.source && <span className="font-medium text-slate-400">{a.source}</span>}
          {a.source && a.age && <span>·</span>}
          {a.age && <span>{a.age}</span>}
          <span className="ml-auto"><Pill tone="info">{a.holding}</Pill></span>
        </div>
        <div className="mt-1.5 flex items-start gap-2">
          <span className="text-sm font-medium text-slate-100 transition-colors group-hover:text-champagne-400">{a.title}</span>
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600 transition-colors group-hover:text-champagne-400" />
        </div>
        {a.description && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{a.description}</p>}
      </a>
    </li>
  );
}

// ── Corporate Announcements ──────────────────────────────────────────────────
function AnnouncementsFeed({ selected, onMeta }: { selected: Set<string>; onMeta: (m: FeedMeta) => void }) {
  const { portfolio } = usePortfolio();
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<Announcement[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [watched, setWatched] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const holdings = useMemo(() => (portfolio ? topHoldingsForAnnouncements(portfolio) : []), [portfolio]);
  const [errDetail, setErrDetail] = useState<string | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    if (!holdings.length) { setItems([]); setStatus("ready"); return; }
    if (refresh) setRefreshing(true); else setStatus("loading");
    const res = await getHoldingsAnnouncements(holdings, refresh);
    if (res.ok) { setItems(res.items ?? []); setAsOf(res.generatedAt ?? null); setWatched(res.symbolsSearched ?? holdings.length); setErrDetail(null); setStatus("ready"); }
    else if (res.reason === "not_configured") setStatus("not_configured");
    else if (res.reason === "auth") setStatus("auth");
    else { setErrDetail(res.reason === "upstream_error" ? `The filings service (birdnest.muns.io) returned ${res.status || "an error"}${res.status === 401 || res.status === 403 ? " — the API token may not authorize this host yet (it's a separate host from news)" : ""}.` : null); setStatus("error"); }
    setRefreshing(false);
  }, [holdings]);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => { onMeta({ asOf, refreshing, refresh: () => load(true) }); }, [asOf, refreshing, load, onMeta]);

  const filtered = useMemo(() => byCompany(items, selected), [items, selected]);

  return (
    <Feed
      status={status} onRefresh={() => load(true)}
      empty={status === "ready" && items.length === 0}
      emptyNotice={<Notice icon={Megaphone} title="No recent filings" body="No exchange announcements from your holdings in the last 180 days. (ETFs and unlisted names don't file announcements.) If that looks wrong, check again." action={<RetryButton onClick={() => load(true)} refreshing={refreshing} />} />}
      notConfigured={<Notice icon={Megaphone} title="Announcements aren't switched on yet" body="They'll populate automatically once the API key is configured on the deployment." />}
      loadingText="Fetching the latest exchange filings for your holdings…" errorTitle="Couldn't load filings" errorBody={errDetail ?? undefined}
      hasResults={filtered.length > 0} noMatch={items.length > 0 && filtered.length === 0} noMatchText="No filings from the selected companies."
    >
      <ul className="space-y-3 pb-2">{filtered.map((a, i) => <AnnouncementRow key={`${a.symbol}-${i}`} a={a} />)}</ul>
    </Feed>
  );
}

function fmtAnnDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return (raw || "").slice(0, 10);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function AnnouncementRow({ a }: { a: Announcement }) {
  const clickable = !!a.attachment;
  const inner = (
    <>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        {a.source && <span className="font-medium text-slate-400">{a.source}</span>}
        {a.source && a.date && <span>·</span>}
        {a.date && <span>{fmtAnnDate(a.date)}</span>}
        <span className="ml-auto"><Pill tone="info">{a.holding}</Pill></span>
      </div>
      <div className="mt-1.5 flex items-start gap-2">
        <span className="text-sm font-medium text-slate-100 group-hover:text-champagne-400">{a.title}</span>
        {clickable && <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600 transition-colors group-hover:text-champagne-400" />}
      </div>
      {a.desc && <p className="mt-1 line-clamp-3 text-xs text-slate-400">{a.desc}</p>}
      {clickable && <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-champagne-400">View filing (PDF) <ExternalLink className="h-3 w-3" /></span>}
    </>
  );
  const cls = "group block rounded-xl border border-ink-700 bg-ink-800 p-4 transition-colors";
  return (
    <li>
      {clickable
        ? <a href={a.attachment} target="_blank" rel="noopener noreferrer" className={`${cls} hover:border-champagne-500/40 hover:bg-ink-700/40`}>{inner}</a>
        : <div className={cls}>{inner}</div>}
    </li>
  );
}

// ── Shared feed shell ────────────────────────────────────────────────────────
function Feed(props: {
  status: Status; onRefresh: () => void;
  empty: boolean; emptyNotice: ReactNode; notConfigured: ReactNode;
  loadingText: string; hasResults: boolean; noMatch: boolean; noMatchText: string;
  children: ReactNode; errorTitle?: string; errorBody?: string;
}) {
  const { status, onRefresh, empty, emptyNotice, notConfigured, loadingText, hasResults, noMatch, noMatchText, children, errorTitle, errorBody } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {status === "loading" && (
          <Centered><RefreshCw className="mb-3 h-5 w-5 animate-spin text-champagne-400" /><span className="text-sm text-slate-500">{loadingText}</span></Centered>
        )}
        {status === "auth" && <Notice icon={RefreshCw} title="Session expired" body="Reload the page and sign in again to load this feed." action={<button onClick={() => location.reload()} className="btn-primary mt-4 text-xs">Reload</button>} />}
        {status === "error" && <Notice icon={RefreshCw} title={errorTitle ?? "Couldn't load this feed"} body={errorBody ?? "Something went wrong. Try again in a moment."} action={<button onClick={onRefresh} className="btn-primary mt-4 text-xs">Retry</button>} />}
        {status === "not_configured" && notConfigured}
        {status === "ready" && empty && emptyNotice}
        {status === "ready" && hasResults && children}
        {status === "ready" && noMatch && <Centered><span className="text-sm text-slate-500">{noMatchText}</span></Centered>}
      </div>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid h-full min-h-[12rem] place-content-center place-items-center text-center">{children}</div>;
}

function Notice({ icon: Icon, title, body, action }: { icon: typeof Newspaper; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid h-full place-items-center py-16 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-champagne-500/30 bg-champagne-500/10 text-champagne-400">
          <Icon className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-100">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{body}</p>
        {action}
      </div>
    </div>
  );
}

// A "Check again" control for empty states — forces a live re-fetch (bypassing the
// daily edge cache), so a genuinely-empty result and a silently-failed one both have
// a way out, even when the top toolbar's refresh is hidden.
function RetryButton({ onClick, refreshing }: { onClick: () => void; refreshing: boolean }) {
  return (
    <button onClick={onClick} disabled={refreshing}
      className="btn-primary mt-4 inline-flex items-center gap-1.5 text-xs disabled:opacity-60">
      <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
      {refreshing ? "Checking…" : "Check again"}
    </button>
  );
}

// ── Insider Trades ───────────────────────────────────────────────────────────
function InsiderFeed({ selected, onMeta }: { selected: Set<string>; onMeta: (m: FeedMeta) => void }) {
  const { portfolio } = usePortfolio();
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<InsiderTrade[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [watched, setWatched] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [errDetail, setErrDetail] = useState<string | null>(null);

  const holdings = useMemo(() => (portfolio ? topHoldingsForAnnouncements(portfolio) : []), [portfolio]);

  const load = useCallback(async (refresh: boolean) => {
    if (!holdings.length) { setItems([]); setStatus("ready"); return; }
    if (refresh) setRefreshing(true); else setStatus("loading");
    const res = await getHoldingsInsider(holdings, refresh);
    if (res.ok) { setItems(res.items ?? []); setAsOf(res.generatedAt ?? null); setWatched(res.symbolsSearched ?? holdings.length); setErrDetail(null); setStatus("ready"); }
    else if (res.reason === "not_configured") setStatus("not_configured");
    else if (res.reason === "auth") setStatus("auth");
    else { setErrDetail(res.reason === "upstream_error" ? `The insider-trades service (devde.muns.io) returned ${res.status || "an error"}${res.status === 401 || res.status === 403 ? " — the API token may not authorize this host yet" : ""}.` : null); setStatus("error"); }
    setRefreshing(false);
  }, [holdings]);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => { onMeta({ asOf, refreshing, refresh: () => load(true) }); }, [asOf, refreshing, load, onMeta]);

  const filtered = useMemo(() => byCompany(items, selected), [items, selected]);

  return (
    <Feed
      status={status} onRefresh={() => load(true)}
      empty={status === "ready" && items.length === 0}
      emptyNotice={<Notice icon={ArrowLeftRight} title="No recent insider trades" body="No disclosed insider transactions from your holdings right now. (ETFs and unlisted names don't file these.) If that looks wrong, check again." action={<RetryButton onClick={() => load(true)} refreshing={refreshing} />} />}
      notConfigured={<Notice icon={ArrowLeftRight} title="Insider trades aren't switched on yet" body="They'll populate automatically once the API key is configured on the deployment." />}
      loadingText="Fetching the latest insider transactions for your holdings…" errorTitle="Couldn't load insider trades" errorBody={errDetail ?? undefined}
      hasResults={filtered.length > 0} noMatch={items.length > 0 && filtered.length === 0} noMatchText="No insider trades from the selected companies."
    >
      <ul className="grid grid-cols-1 gap-3 pb-2 lg:grid-cols-2">{filtered.map((t, i) => <InsiderTradeRow key={`${t.symbol}-${i}`} t={t} />)}</ul>
    </Feed>
  );
}

function fmtInr(n: number): string {
  if (!isFinite(n) || n === 0) return "—";
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `₹${Math.round(n / 1e3)}K`;
  return `₹${Math.round(n)}`;
}
const fmtShares = (n: number) => (isFinite(n) && n > 0 ? n.toLocaleString("en-IN") : "—");
function insiderToneClass(transaction: string): string {
  const t = transaction.toLowerCase();
  if (t.includes("acqui") || t.includes("purchase") || t.includes("buy")) return "text-gain";
  if (t.includes("dispos") || t.includes("sale") || t.includes("sell")) return "text-loss";
  if (t.includes("pledge")) return "text-champagne-500";
  return "text-slate-300";
}

function InsiderTradeRow({ t }: { t: InsiderTrade }) {
  const date = t.broadcastDate || t.toDate || t.fromDate;
  return (
    <li>
      <div className="rounded-xl border border-ink-700 bg-ink-800 p-4">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          {t.source && <span className="font-medium text-slate-400">{t.source}</span>}
          {t.source && date && <span>·</span>}
          {date && <span>{fmtAnnDate(date)}</span>}
          <span className="ml-auto"><Pill tone="info">{t.holding}</Pill></span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-slate-100">{t.insider || "—"}</span>
          {t.category && <span className="text-[11px] text-slate-500">· {t.category}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          <span className={`font-semibold ${insiderToneClass(t.transaction)}`}>{t.transaction || "—"}</span>
          {t.shares > 0 && <span className="mono text-slate-300">{fmtShares(t.shares)} shares</span>}
          {t.value > 0 && <span className="mono text-slate-300">{fmtInr(t.value)}</span>}
          {t.mode && <span className="text-slate-500">{t.mode}</span>}
        </div>
        {(t.postShares > 0 || t.postPct) && (
          <div className="mt-1 text-[11px] text-slate-500">Holds {fmtShares(t.postShares)}{t.postPct ? ` (${t.postPct}%)` : ""} after</div>
        )}
      </div>
    </li>
  );
}
