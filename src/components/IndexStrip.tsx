import { useEffect, useState } from "react";
import { fetchIndices, indexReason, STRIP_INDEX_IDS, type IndexFeed, type IndexQuote } from "@/lib/indices";
import { fmtNum, fmtPct, changeColor } from "@/lib/format";

// THE PERSISTENT INDEX STRIP — the level and the day's move for Nifty 50,
// Nifty 500, Nifty Midcap 150 and Nifty Smallcap 250, on every route.
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

function Cell({ q }: { q: IndexQuote }) {
  const up = (q.changePct ?? 0) > 0;
  const title = q.ok
    ? [
        `${q.name ?? q.label} · ${q.exchange ?? "NSE"} · index points`,
        q.prevCloseDate ? `previous close ${fmtNum(q.prevClose ?? 0, 2)} on ${q.prevCloseDate}` : null,
        q.dayLow != null && q.dayHigh != null ? `day ${fmtNum(q.dayLow, 2)} – ${fmtNum(q.dayHigh, 2)}` : null,
        q.low52 != null && q.high52 != null ? `52w ${fmtNum(q.low52, 2)} – ${fmtNum(q.high52, 2)}` : null,
        q.asOf ? `as of ${new Date(q.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : null,
      ].filter(Boolean).join(" · ")
    : indexReason(q);

  return (
    <div className="flex min-w-0 shrink-0 items-baseline gap-2 whitespace-nowrap px-3 first:pl-0" title={title}>
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

export function IndexStrip() {
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
    ? STRIP_INDEX_IDS.map((id) => feed.indices.find((q) => q.id === id)).filter((q): q is IndexQuote => !!q)
    : [];

  return (
    <div data-testid="index-strip"
      className="flex h-9 shrink-0 items-center gap-0 overflow-x-auto border-b border-ink-700 bg-ink-900/60 px-6 backdrop-blur">
      {state === "loading" && <span className="text-[11px] text-slate-500">Fetching index levels…</span>}
      {state === "down" && (
        <span className="text-[11px] text-slate-500"
          title="The index feed runs as a server-side function on the deployed site and is not available in local preview. Nothing has been substituted for a level.">
          Index levels unavailable — the feed did not respond
        </span>
      )}
      {rows.map((q) => <Cell key={q.id} q={q} />)}
      {state === "ok" && feed && (
        <span className="ml-auto shrink-0 pl-4 text-[10px] text-slate-500"
          title={`${feed.source} · ${feed.resolved} of ${feed.requested} indices resolved · fetched ${new Date(feed.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}>
          {feed.resolved < feed.requested ? `${feed.resolved}/${feed.requested} live` : "NSE · live"}
        </span>
      )}
    </div>
  );
}
