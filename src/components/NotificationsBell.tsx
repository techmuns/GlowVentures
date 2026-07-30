import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ExternalLink } from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";
import { Pill } from "@/components/Pill";
import { topHoldingsForNews, getHoldingsNews, type NewsArticle } from "@/lib/news";

const BELL_MAX = 8;

export function NotificationsBell() {
  const { portfolio } = usePortfolio();
  const [open, setOpen] = useState(false);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "off">("loading");
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const holdings = useMemo(() => (portfolio ? topHoldingsForNews(portfolio, 24) : []), [portfolio]);

  useEffect(() => {
    let alive = true;
    if (!holdings.length) { setStatus("ready"); setArticles([]); return; }
    setStatus("loading");
    getHoldingsNews(holdings)
      .then((res) => {
        if (!alive) return;
        if (res.ok && res.articles) { setArticles(res.articles); setStatus("ready"); }
        else setStatus("off");
      })
      .catch(() => { if (alive) setStatus("off"); });
    return () => { alive = false; };
  }, [holdings]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const top = articles.slice(0, BELL_MAX);
  const count = articles.length;
  const goNews = () => { setOpen(false); navigate("/news"); };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="btn-ghost relative h-9 px-2.5" title="Latest holdings news"
        aria-label={`Holdings news${count ? `, ${count} stories` : ""}`} aria-haspopup="menu" aria-expanded={open}>
        <Bell className="h-4 w-4" />
        {status === "ready" && count > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-champagne-500 px-1 text-[10px] font-semibold leading-none text-ink-950">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[22rem] overflow-hidden rounded-lg border border-ink-700 bg-ink-800 shadow-glow">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-100">Latest holdings news</span>
            {status === "ready" && count > 0 && <Pill tone="info">{count}</Pill>}
          </div>
          <div className="max-h-[24rem] overflow-auto">
            {status === "loading" && (
              <div className="px-4 py-10 text-center text-sm text-slate-500">Loading the latest news…</div>
            )}
            {status === "off" && (
              <div className="px-4 py-10 text-center text-sm text-slate-500">News feed isn't available right now.</div>
            )}
            {status === "ready" && count === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-500">No fresh news across your holdings.</div>
            )}
            {status === "ready" && count > 0 && (
              <ul className="divide-y divide-ink-700/70">
                {top.map((a, i) => (
                  <li key={`${a.url}-${i}`}>
                    <a href={a.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
                      className="group block px-4 py-2.5 transition-colors hover:bg-ink-700/40">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        {a.source && <span className="font-medium text-slate-400">{a.source}</span>}
                        {a.source && a.age && <span>·</span>}
                        {a.age && <span>{a.age}</span>}
                        <span className="ml-auto shrink-0"><Pill tone="info">{a.holding}</Pill></span>
                      </div>
                      <div className="mt-1 flex items-start gap-1.5">
                        <span className="line-clamp-2 text-[13px] font-medium text-slate-100 transition-colors group-hover:text-champagne-400">{a.title}</span>
                        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-slate-600 transition-colors group-hover:text-champagne-400" />
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={goNews} className="block w-full border-t border-ink-700 px-4 py-2.5 text-center text-xs font-medium text-champagne-400 transition-colors hover:bg-ink-700/40">
            Open Holdings News →
          </button>
        </div>
      )}
    </div>
  );
}
