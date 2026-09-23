import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Sparkles, CornerDownLeft, Clock } from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";
import { buildSearchIndex, searchEntries, looksLikeQuestion, type SearchEntry, type SearchHit } from "@/lib/searchIndex";
import { openMunsWith } from "@/components/MunsChat";
import { AbsentFromBook } from "@/components/Absent";

// ── THE SEARCH BOX IN THE TOP BAR ────────────────────────────────────────────
//
//   *"this whole thing needs to be a very smart search bar which takes me to
//    exactly where i want to go when i type the data in this"*
//
// The slot held a button that opened the Muns chat — and before that, an
// `<input>` that searched nothing. It is a real search now, over everything the
// book carries and every page and tab the app has (`searchIndex.ts`), and Muns
// is still one keystroke away: the last row asks it the question as typed, and
// a query that reads as a QUESTION puts that row first.
//
// ── WHAT THE KEYBOARD DOES ───────────────────────────────────────────────────
//
//   `/` or Ctrl/⌘+K   focus the box from anywhere on the page
//   ↑ ↓               move through the results
//   Enter             open the highlighted result (the best one by default)
//   Esc               clear the box, and a second Esc leaves it
//
// ── NOTHING HERE IS A FIGURE A READER COULD MISTAKE FOR ONE ─────────────────
//
// Each row's second line is derived from the book — a holding's value and
// share, a mandate's account and size — through the same `fmtFromBase` every
// page uses, so a search result never states a figure in a different currency
// or on a different basis from the page it opens.

const RECENT_KEY = "glow:search-recent";
const RECENT_MAX = 6;
type Recent = { id: string; label: string; href: string; chip: string };

/** Per-browser, like the nav's width — and a blocked store just means no recents. */
function readRecent(): Recent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((r) => r && typeof r.href === "string" && typeof r.label === "string" && typeof r.id === "string").slice(0, RECENT_MAX)
      : [];
  } catch { return []; }
}
function writeRecent(list: Recent[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* private mode */ }
}

/** Where a reader might start when the box is empty — found in the index by id. */
const SUGGESTED = ["page:/monitor", "view:transactions", "page:/private-market", "fig:uncalled", "page:/family", "view:security"];

type Row =
  | { type: "hit"; entry: SearchEntry; matched: string }
  | { type: "recent"; recent: Recent }
  | { type: "suggest"; entry: SearchEntry }
  | { type: "ask"; question: string };

const isTypingIn = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
};

export function SmartSearch() {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<Recent[]>(readRecent);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const index = useMemo(
    () => (portfolio ? buildSearchIndex({
      positions: portfolio.positions, consolidated, accounts: portfolio.accounts, money: (n) => fmtFromBase(n, { compact: true }),
    }) : []),
    [portfolio, consolidated, fmtFromBase],
  );

  const query = q.trim();
  const hits: SearchHit[] = useMemo(() => (query ? searchEntries(index, query, 10) : []), [index, query]);
  const rows: Row[] = useMemo(() => {
    if (!query) {
      const byId = new Map(index.map((e) => [e.id, e]));
      // A recent that no longer resolves — a mandate closed, a page removed —
      // is dropped rather than offered as a link to nothing.
      const rec = recent.filter((r) => byId.has(r.id)).map((r) => ({ type: "recent" as const, recent: r }));
      const sug = SUGGESTED.filter((id) => byId.has(id) && !recent.some((r) => r.id === id))
        .map((id) => ({ type: "suggest" as const, entry: byId.get(id)! }));
      return [...rec, ...sug];
    }
    const list: Row[] = hits.map((h) => ({ type: "hit", entry: h.entry, matched: h.matched }));
    const ask: Row = { type: "ask", question: query };
    return looksLikeQuestion(query) ? [ask, ...list] : [...list, ask];
  }, [query, hits, index, recent]);

  useEffect(() => { setActive(0); }, [query]);

  // Keep the highlighted row in view as the arrows move it.
  useEffect(() => {
    listRef.current?.querySelector(`[data-search-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // `/` and Ctrl/⌘+K from anywhere — never while the reader is typing elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault(); inputRef.current?.focus(); setOpen(true); return;
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingIn(e.target)) {
        e.preventDefault(); inputRef.current?.focus(); setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A click anywhere else closes the list and leaves what was typed.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const remember = useCallback((r: Recent) => {
    setRecent((prev) => {
      const next = [r, ...prev.filter((x) => x.id !== r.id)].slice(0, RECENT_MAX);
      writeRecent(next);
      return next;
    });
  }, []);

  const finish = () => { setQ(""); setOpen(false); inputRef.current?.blur(); };

  const choose = (row: Row | undefined) => {
    if (!row) return;
    if (row.type === "ask") { openMunsWith(row.question); finish(); return; }
    const target = row.type === "recent" ? row.recent : { id: row.entry.id, label: row.entry.label, href: row.entry.href, chip: row.entry.chip };
    remember(target);
    navigate(target.href);
    finish();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(rows.length - 1, 0))); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
    if (e.key === "Enter") { e.preventDefault(); choose(rows[active]); return; }
    if (e.key === "Escape") {
      e.preventDefault();
      if (q) setQ(""); else { setOpen(false); inputRef.current?.blur(); }
      return;
    }
    if (e.key === "Tab") setOpen(false);
  };

  const heading = !query ? (recent.length ? "Recent" : "Try") : null;

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1" data-testid="smart-search">
      <div className="flex items-center gap-2 rounded-md border border-ink-700 bg-ink-800 py-1.5 pl-3 pr-2 ring-focus focus-within:border-champagne-500/40">
        <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <input ref={inputRef} value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox" aria-expanded={open} aria-controls="smart-search-list" aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `smart-search-opt-${active}` : undefined}
          aria-label="Search the book, the pages and the tabs, or ask Muns"
          data-testid="smart-search-input"
          placeholder="Search a stock, fund, person, account or page — or ask a question"
          className="min-w-0 flex-1 bg-transparent py-0.5 text-sm text-slate-200 placeholder-slate-500 outline-none" />
        <kbd className="hidden shrink-0 rounded border border-ink-600 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline"
          title="Press / or Ctrl+K from anywhere to search">/</kbd>
      </div>

      {open && rows.length > 0 && (
        /* ABSOLUTE, INSIDE THE BAR — and deliberately not `fixed`. The top bar
           carries `backdrop-blur`, which makes it the containing block for a
           fixed child (the trap the Muns dialog fell into and is portalled out
           of). An absolute list below its own box has no such problem, and it
           is sized in rem, never `vh`: `#root` carries `--app-zoom` and a
           viewport unit is not rescaled by it. */
        <div ref={listRef} id="smart-search-list" role="listbox" data-testid="smart-search-panel"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[32rem] overflow-y-auto rounded-lg border border-ink-700 bg-ink-800 py-1 shadow-xl shadow-black/40">
          {heading && <div className="px-3 pb-1 pt-1.5 text-[10.5px] font-medium uppercase tracking-wide text-slate-500">{heading}</div>}
          {query && hits.length === 0 && (
            <div data-search-empty className="px-3 py-2 text-[12px] text-slate-400">
              Nothing in this book or on these pages matches &ldquo;{query}&rdquo;. Muns can still take the question.
              {/* …AND WHERE THE BOOK KNOWS WHY, IT SAYS SO — the rule Stage 10bu
                  set for every search over holdings, on the one in the top bar.
                  The family searched for BSE: it is theirs on their own
                  consolidated review and on no statement in `source/`, and
                  "nothing matches" on its own reads as the dashboard having lost
                  it. Only in the EMPTY state, as on the other three searches: a
                  query that finds a holding is answered by that holding, and a
                  note beside it could deny a position the book carries under
                  another spelling. `AbsentFromBook` renders nothing when no
                  review line answers, so a typo still gets the plain line. */}
              <AbsentFromBook query={query} className="mt-2" />
            </div>
          )}
          {rows.map((row, i) => {
            const on = i === active;
            const cls = `flex cursor-pointer items-start gap-2.5 px-3 py-2 ${on ? "bg-ink-700/60" : ""}`;
            const common = {
              id: `smart-search-opt-${i}`, role: "option", "aria-selected": on,
              "data-search-index": i,
              onMouseEnter: () => setActive(i),
              onMouseDown: (e: React.MouseEvent) => { e.preventDefault(); choose(row); },
            } as const;
            if (row.type === "ask") {
              return (
                <div key="ask" {...common} data-search-result="ask" data-search-kind="ask" data-search-href=""
                  className={`${cls} border-t border-ink-700/60`}>
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border border-champagne-500/40 px-1.5 py-px text-[10px] uppercase tracking-wide text-champagne-400">
                    <Sparkles className="h-3 w-3" aria-hidden /> Ask Muns
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-100">&ldquo;{row.question}&rdquo;</span>
                    <span className="block truncate text-[11.5px] text-slate-500">An AI answer from a snapshot of this book — not a statement figure</span>
                  </span>
                  {on && <CornerDownLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />}
                </div>
              );
            }
            const e = row.type === "recent"
              ? { id: row.recent.id, chip: row.recent.chip, label: row.recent.label, detail: "", href: row.recent.href, kind: "recent" }
              : { ...row.entry };
            const detail = row.type === "recent" ? (index.find((x) => x.id === row.recent.id)?.detail ?? "") : row.entry.detail;
            return (
              <div key={`${row.type}:${e.id}`} {...common}
                data-search-result={e.id}
                data-search-kind={row.type === "recent" ? index.find((x) => x.id === row.recent.id)?.kind ?? "recent" : row.entry.kind}
                data-search-href={e.href}
                title={row.type === "hit" ? `Matched on: ${row.matched}` : undefined}
                className={cls}>
                <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border border-ink-600 px-1.5 py-px text-[10px] uppercase tracking-wide text-slate-400">
                  {row.type === "recent" && <Clock className="h-3 w-3" aria-hidden />}
                  {e.chip}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-100">{e.label}</span>
                  {detail && <span className="block truncate text-[11.5px] text-slate-500" data-search-detail>{detail}</span>}
                </span>
                {on && <CornerDownLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />}
              </div>
            );
          })}
          <div className="mt-1 border-t border-ink-700/60 px-3 pb-0.5 pt-1.5 text-[10.5px] text-slate-500">
            ↑ ↓ to move · Enter to open · Esc to close · <span className="text-slate-400">/</span> or Ctrl+K from anywhere
          </div>
        </div>
      )}
    </div>
  );
}
