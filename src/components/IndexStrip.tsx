import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { fetchIndices, indexReason, FAMILY_INDEX_IDS, type IndexFeed, type IndexQuote } from "@/lib/indices";
import { BENCHMARKS } from "@/lib/benchmarks";
import { fmtNum, fmtPct, changeColor } from "@/lib/format";

// THE PERSISTENT INDEX STRIP — the level and the day's move for every benchmark
// the NAV card can be set against, on every route, running as a ticker.
//
// *"Add all benchmarks here and make it moving strip like they have in TV"* —
// the family, 16 Nov 2026. It opens on the four they first named (Nifty 50,
// Nifty 500, Nifty Midcap 150, Nifty Smallcap 250) and then runs the rest of
// `BENCHMARKS` in the catalogue's order, so a benchmark added there joins the
// ticker without a second list to keep in step. The scroll is CSS on
// `transform` alone (`.index-ticker` in `index.css`): it pauses under the
// pointer so a cell's hover can be read, and stands still for a reader who has
// asked for reduced motion.
//
// It sits BETWEEN the top bar and `<main>` rather than inside a page, because
// "at all times" is the request. It is also outside `<main>` deliberately: every
// page-content invariant in `check:pages` reads the main region, and a strip
// repeated on 40 routes would otherwise have to be excluded from each of them
// one at a time.
//
// AN INDEX LEVEL IS NOT MONEY AND DOES NOT CONVERT. These are index points, not
// rupees, so `fmtFromBase` is deliberately not used: running 23,090.75 through
// the display-currency converter would divide the Nifty 500 by the USD rate and
// print a number that is not a level of anything. The unit is stated on the
// strip's own tooltip rather than assumed.
//
// AND A ZERO DAY IS A MEASUREMENT. An index that closed flat moved 0.00%, and an
// index whose previous settled close the feed could not supply moved an unknown
// amount. Those must not look alike, so the second renders an em dash with the
// reason rather than a zero — `Absent.tsx`'s rule, applied to a feed value.

/** 60s, matching the Function's own cache: a faster poll cannot see new data. */
const POLL_MS = 60_000;

/**
 * The ticker's order: the family's four first, as they named them, then every
 * other benchmark. Each id is a `BenchmarkKey`, and `/api/indices` carries one
 * row per benchmark under the same key (`indicesFunction.test.ts`).
 */
export const TICKER_INDEX_IDS: readonly string[] = [
  ...FAMILY_INDEX_IDS,
  ...BENCHMARKS.map((b) => b.key).filter((k) => !(FAMILY_INDEX_IDS as readonly string[]).includes(k)),
];

/**
 * Seconds per cell for one full pass — about 45 px/s at the cell's width, slow
 * enough to read a level in passing. Struck per cell rather than measured, so a
 * poll that widens a figure by one digit never retimes (and so jumps) the scroll.
 */
const SECONDS_PER_CELL = 6;

/**
 * ── "LIVE" AND "TODAY" ARE CLAIMS ABOUT A SESSION, AND THE FEED NAMES IT ─────
 *
 * The strip read "NSE · live" and the movers tile "NSE indices · today" whatever
 * the session was. Before 09:15 IST, at weekends and on holidays the feed
 * returns the LAST COMPLETED session's level and move by design (trap 3 in
 * `functions/api/indices.js`), so both labels asserted a live, same-day move
 * that is a day or more old (MNT-19). Every index carries the session its level
 * belongs to; the label is struck on it.
 *
 * `today` is the INDIAN date, because the session is the exchange's: at 01:00
 * IST the UTC date is still yesterday's and a UTC comparison would call last
 * night's close "today".
 */
export function istDate(t: number = Date.now()): string {
  return new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10);
}

/** The newest session the resolved indices carry, and whether it is today's. */
export function indexSession(feed: Pick<IndexFeed, "indices"> | null, now: number = Date.now()):
  { date: string | null; today: boolean } {
  const dates = (feed?.indices ?? []).filter((q) => q.ok && q.level != null)
    .map((q) => q.sessionDate).filter((d): d is string => !!d).sort();
  const date = dates.length ? dates[dates.length - 1] : null;
  return { date, today: date != null && date === istDate(now) };
}

function Cell({ q }: { q: IndexQuote }) {
  const up = (q.changePct ?? 0) > 0;
  const title = q.ok
    ? [
        `${q.name ?? q.label} · ${q.exchange ?? "NSE"} · index points`,
        // BOTH ENDS OF THE MOVE ARE NAMED. The strip printed +0.00% on all four
        // indices while the level was being differenced against its OWN
        // session's close; a reader could not see it because only one of the two
        // dates was ever stated. See trap 3 in `functions/api/indices.js`.
        q.sessionDate ? `session ${q.sessionDate}` : null,
        q.prevCloseDate ? `previous close ${fmtNum(q.prevClose ?? 0, 2)} on ${q.prevCloseDate}` : null,
        q.dayLow != null && q.dayHigh != null ? `day ${fmtNum(q.dayLow, 2)} – ${fmtNum(q.dayHigh, 2)}` : null,
        q.low52 != null && q.high52 != null ? `52w ${fmtNum(q.low52, 2)} – ${fmtNum(q.high52, 2)}` : null,
        q.asOf ? `as of ${new Date(q.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : null,
      ].filter(Boolean).join(" · ")
    : indexReason(q);

  return (
    <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap px-5" title={title} data-index-id={q.id}>
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500">{q.label}</span>
      {q.level == null ? (
        // Not "0", and not blank: the level is absent and the tooltip says why.
        <span className="text-xs text-slate-500">—</span>
      ) : (
        <>
          <span className="tabular text-xs font-semibold text-slate-200">{fmtNum(q.level, 2)}</span>
          {q.changePct == null ? (
            <span className="tabular text-[11px] text-slate-500" title="The feed supplied a level but no previous settled close, so the day's move cannot be measured.">—</span>
          ) : (
            <span className={`tabular text-[11px] ${changeColor(q.changePct)}`}>
              {up ? "▲" : q.changePct < 0 ? "▼" : "•"} {fmtNum(Math.abs(q.change ?? 0), 2)} ({fmtPct(q.changePct, { sign: true })})
            </span>
          )}
        </>
      )}
    </div>
  );
}

/**
 * `aside` sits at the strip's right end — the
 * shell's saved-numbers notice rides here rather than as a band of its own, so
 * it costs no page any height (Stage 10jb).
 */
export function IndexStrip({ aside }: { aside?: ReactNode } = {}) {
  const [feed, setFeed] = useState<IndexFeed | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "down">("loading");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const f = await fetchIndices();
      if (!alive) return;
      // A FAILED POLL MUST NOT BLANK A GOOD STRIP. The last good levels stay on
      // screen with their own as-of in the tooltip; only a first load that never
      // succeeded renders the unavailable state. Same rule the research panel
      // follows for a held copy: stale with an honest stamp beats nothing.
      if (f && f.ok) { setFeed(f); setState("ok"); }
      else if (!feed) setState("down");
    };
    load();
    const id = window.setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const onShow = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { alive = false; window.clearInterval(id); document.removeEventListener("visibilitychange", onShow); };
    // `feed` is read inside `load` only to decide whether a failure may blank the
    // strip; re-subscribing on every poll would restart the interval each minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = feed
    ? TICKER_INDEX_IDS.map((id) => feed.indices.find((q) => q.id === id)).filter((q): q is IndexQuote => !!q)
    : [];

  return (
    <div data-testid="index-strip"
      className="flex h-9 shrink-0 items-center border-b border-ink-700 bg-ink-900/60 backdrop-blur">
      {state === "loading" && <span className="px-6 text-[11px] text-slate-500">Fetching index levels…</span>}
      {state === "down" && (
        <span className="px-6 text-[11px] text-slate-500"
          title="The index feed runs as a server-side function on the deployed site and is not available in local preview. Nothing has been substituted for a level.">
          Index levels unavailable — the feed did not respond
        </span>
      )}
      {rows.length > 0 && <Ticker rows={rows} />}
      {/* THE "NSE · close <date>" / "NSE · live" LABEL IS GONE AT THE FAMILY'S
          REQUEST (Stage 10ng); `aside` takes the freed width. Each cell still
          names its own session on its hover. */}
      {/* The ticker keeps the strip: the notice takes at most 40% of it and
          truncates, its whole sentence on its own hover. */}
      {aside && <div className="ml-auto flex min-w-0 max-w-[40%] shrink-0 items-center pl-4 pr-6 empty:hidden">{aside}</div>}
    </div>
  );
}

/**
 * THE TICKER — two identical runs of cells side by side, each at least the
 * strip's width, each sliding left by its own width and starting over. When the
 * first run has gone, the second stands exactly where it began, so the loop has
 * no seam and no jump. The second run is decoration for the eye: it is hidden
 * from assistive technology, and `data-ticker-run` names it so nothing that
 * reads the strip counts an index twice.
 */
function Ticker({ rows }: { rows: IndexQuote[] }) {
  const style = { "--ticker-duration": `${rows.length * SECONDS_PER_CELL}s` } as CSSProperties;
  return (
    <div className="index-ticker h-full min-w-0 flex-1" style={style} data-ticker>
      <div className="index-ticker-run" data-ticker-run="primary">
        {rows.map((q) => <Cell key={q.id} q={q} />)}
      </div>
      <div className="index-ticker-run" data-ticker-run="repeat" aria-hidden="true">
        {rows.map((q) => <Cell key={q.id} q={q} />)}
      </div>
    </div>
  );
}
