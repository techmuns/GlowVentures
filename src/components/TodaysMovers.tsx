import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { accountIndex } from "@/lib/accounts";
import { fetchIndices, STRIP_INDEX_IDS, type IndexFeed } from "@/lib/indices";
import { fmtPct, fmtNum, changeColor, DASH } from "@/lib/format";
import { symbolCoverage } from "@/lib/quotes";

// ── TODAY'S MOVERS ───────────────────────────────────────────────────────────
//
// "which are today's movers, which are gainers … what are my gainers, what are
// my losers" and "my stocks and ETFs are up, Sensex is down this much, Nifty".
// Two questions on one card, because the second is only meaningful beside the
// first: a book up 0.4% is good news against an index down 1.1% and bad news
// against one up 2%.
//
// ── THE DAY'S MOVE IS OVER THE PRICED SUBSET, AND SAYS SO ────────────────────
//
// A day change needs a LIVE price and the PREVIOUS CLOSE behind it. The AIF
// folios, the mutual-fund units, the cash sweeps and every name the resolver
// could not place have neither — 214 distinct securities in this book and 139
// that can ever reach the quote feed. Summing the rest in as zero would divide a
// real rupee move by the WHOLE book and report a fraction of the true percentage:
// the classic "blend a missing value in as zero" failure, on the one figure a
// reader compares against an index. So the percentage is struck on the previous
// close of the positions that HAVE one, and the tile names what that covers.
//
// A POSITION WITH NO DAY CHANGE IS NOT A FLAT POSITION. `dayChange` is null when
// the feed gave no previous close, and null never enters a sum or a ranking —
// an unpriced holding must not appear in "today's losers" at ₹0.

type Row = {
  securityKey: string;
  security: string;
  dayChange: number;
  dayChangePct: number;
  marketValue: number;
  entities: string[];
};

const TOP_N = 6;

export function TodaysMovers() {
  const { portfolio, consolidated, quotesStatus, quotesAsOf, fmtFromBase } = usePortfolio();
  const [rank, setRank] = useState<"impact" | "pct">("impact");
  const [indices, setIndices] = useState<IndexFeed | null>(null);
  /**
   * THREE STATES, NOT TWO — the same rule `IndexStrip` already follows.
   *
   * This tile printed "Index levels unavailable — the feed did not respond"
   * whenever `indices` was null, which is true on the FIRST PAINT of every
   * open. A reader was told the feed had failed while the request was still in
   * flight. A failed POLL must not blank a good tile either: the last good
   * levels stay until a fresh set replaces them, and only a first load that
   * never succeeded reports the feed as down.
   */
  const [indexState, setIndexState] = useState<"loading" | "ok" | "down">("loading");

  useEffect(() => {
    let alive = true;
    let seen = false;
    const load = async () => {
      const f = await fetchIndices();
      if (!alive) return;
      if (f?.ok) { seen = true; setIndices(f); setIndexState("ok"); }
      // A FAILED POLL MUST NOT BLANK A GOOD TILE — only a first load that never
      // succeeded reports the feed as down. NOT COVERED BY `check:pages`, and
      // recorded here rather than left to look tested: reaching it needs one
      // successful response followed by a failure, and the poll is 60s apart.
      // It is the same guard `IndexStrip` carries for the same reason.
      else if (!seen) setIndexState("down");
    };
    load();
    const id = window.setInterval(() => { if (!document.hidden) load(); }, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const model = useMemo(() => {
    if (!portfolio) return null;
    const accts = accountIndex(portfolio.accounts);
    // CONSOLIDATED: each dedupeGroup once, because this is a whole-book figure.
    // One name reported under two members must move the book once.
    const byKey = new Map<string, Row>();
    for (const p of consolidated) {
      if (typeof p.dayChange !== "number" || !Number.isFinite(p.dayChange)) continue;
      if (typeof p.dayChangePct !== "number" || !Number.isFinite(p.dayChangePct)) continue;
      const owner = accts.get(p.accountId)?.owner ?? null;
      const cur = byKey.get(p.securityKey);
      if (cur) {
        // The same security in several accounts is ONE mover. Its rupee impact
        // adds; its PERCENTAGE is the value-weighted one, re-derived from the
        // combined previous close rather than averaged — averaging two percents
        // over different position sizes is a figure neither statement supports.
        cur.dayChange += p.dayChange;
        cur.marketValue += p.marketValue;
        if (owner && !cur.entities.includes(owner)) cur.entities.push(owner);
      } else {
        byKey.set(p.securityKey, {
          securityKey: p.securityKey, security: p.security,
          dayChange: p.dayChange, dayChangePct: p.dayChangePct,
          marketValue: p.marketValue, entities: owner ? [owner] : [],
        });
      }
    }
    const rows = [...byKey.values()].map((r) => {
      const prev = r.marketValue - r.dayChange;
      return { ...r, dayChangePct: prev > 0 ? (r.dayChange / prev) * 100 : r.dayChangePct };
    });

    const movedValue = rows.reduce((a, r) => a + r.marketValue, 0);
    const dayChange = rows.reduce((a, r) => a + r.dayChange, 0);
    const prevValue = movedValue - dayChange;
    const dayPct = prevValue > 0 ? (dayChange / prevValue) * 100 : null;

    const cov = symbolCoverage(consolidated);
    const distinct = new Set(consolidated.map((p) => p.securityKey)).size;

    const gainers = rows.filter((r) => r.dayChange > 0);
    const losers = rows.filter((r) => r.dayChange < 0);
    const flat = rows.length - gainers.length - losers.length;
    const cmp = rank === "impact"
      ? (a: Row, b: Row) => Math.abs(b.dayChange) - Math.abs(a.dayChange)
      : (a: Row, b: Row) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct);
    return {
      rows, dayChange, dayPct, movedValue, prevValue,
      pricedNames: rows.length, distinct, unpriceable: cov.withoutSymbol,
      gainers: [...gainers].sort(cmp).slice(0, TOP_N),
      losers: [...losers].sort(cmp).slice(0, TOP_N),
      gainCount: gainers.length, lossCount: losers.length, flat,
      gainSum: gainers.reduce((a, r) => a + r.dayChange, 0),
      lossSum: losers.reduce((a, r) => a + r.dayChange, 0),
    };
  }, [portfolio, consolidated, rank]);

  if (!portfolio || !model) return null;

  const clock = quotesAsOf ? new Date(quotesAsOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <Card className="lg:col-span-3" title="Today&rsquo;s movers"
      subtitle={<>
        The day&rsquo;s move on the holdings the feed can price, set beside the four NSE indices.
        {clock ? ` Quotes as of ${clock}.` : ""}
      </>}
      right={
        <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5" role="group" aria-label="Rank movers by">
          {(["impact", "pct"] as const).map((k) => (
            <button key={k} onClick={() => setRank(k)} aria-pressed={rank === k}
              className={["rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                rank === k ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
              {k === "impact" ? "By ₹ impact" : "By % move"}
            </button>
          ))}
        </div>
      }>

      {quotesStatus === "loading" && model.rows.length > 0 && (
        <p className="mb-4 text-[11.5px] text-slate-500">Fetching prices — figures are the last snapshot until they settle.</p>
      )}

      {/*
        AN EMPTY CARD MID-FETCH IS NOT AN ABSENCE, AND MUST NOT SAY IT IS.

        "No holding in this book carries a day change right now" is a claim
        ABOUT THE BOOK, and it used to render whenever there were no priced rows
        — including on the first paint of every cold open, while the feed was
        still in flight. A reader who sees it either believes their book cannot
        be priced or reloads until it goes away. That is the same defect this
        repo already records on the company page, where a panel still fetching
        asserted the security has no live quote: THE CAUSE PICKS THE HEADLINE.

        So the three states are separated. Still fetching says so. The feed
        having failed names the feed. Only a settled feed that priced nothing
        makes the claim about the book — and by then the claim is true.

        With the snapshot cache behind it (`quoteCache.ts`) the first branch is
        reached only on a genuinely cold open: a reload inside the session
        renders the previous figures immediately and never passes through here.
      */}
      {model.rows.length === 0 && quotesStatus === "loading" ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600/70 px-6 py-10 text-center"
             data-testid="movers-loading">
          <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
          <div className="text-sm font-medium text-slate-300">Fetching prices…</div>
          <p className="max-w-xl text-xs leading-relaxed text-slate-500">
            The day&rsquo;s move needs a live price and the previous close behind it. Nothing is shown until they land —
            no figure here has been estimated or carried over from another day.
          </p>
        </div>
      ) : model.rows.length === 0 ? (
        <AbsentSection
          what="No holding in this book carries a day change right now"
          needs={quotesStatus === "unavailable"
            ? "A day change needs a live price AND the previous close behind it, and the quote feed did not respond. Every holding is showing its statement mark; nothing has been substituted. The top bar names the failure."
            : `A day change needs a live price and a previous close. ${model.unpriceable} of ${model.distinct} distinct securities in this book can never have one — the AIF folios, the mutual-fund units, the cash sweeps and the names with no NSE listing.`} />
      ) : (
        <>
          {/* ── The book's own move, and the four indices beside it ───────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
              <div className="label-xs">Book · today</div>
              <div className={`mt-2 text-[22px] font-semibold tabular ${changeColor(model.dayChange)}`}>
                {fmtFromBase(model.dayChange, { compact: true, sign: true })}
              </div>
              <div className={`mt-0.5 text-[13px] font-semibold tabular ${changeColor(model.dayPct)}`}>
                {model.dayPct == null ? DASH : fmtPct(model.dayPct, { sign: true })}
              </div>
              {/* THE COVERAGE IS ON THE TILE, NOT IN A TOOLTIP. This percentage is
                  struck over the priced subset and a reader will compare it with
                  an index; the scope has to be visible at the same glance. */}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500" data-testid="movers-coverage">
                on {fmtFromBase(model.movedValue, { compact: true })} across {model.pricedNames} of {model.distinct} distinct
                names — the rest carry no live quote and are not counted either way
              </p>
            </div>

            <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4 sm:col-span-1 lg:col-span-2">
              <div className="label-xs">NSE indices · today</div>
              {!indices && indexState === "loading" ? (
                <p className="mt-2 text-[11.5px] text-slate-500">Fetching index levels…</p>
              ) : !indices ? (
                <p className="mt-2 text-[11.5px] text-slate-500">
                  Index levels unavailable — the feed did not respond. Nothing has been substituted for a level.
                </p>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
                  {STRIP_INDEX_IDS.map((id) => {
                    const q = indices.indices.find((x) => x.id === id);
                    if (!q) return null;
                    return (
                      <div key={id}>
                        <div className="truncate text-[11px] text-slate-500" title={q.label}>{q.label}</div>
                        <div className="tabular text-[13px] font-semibold text-slate-200">
                          {q.level == null ? DASH : fmtNum(q.level, 2)}
                        </div>
                        <div className={`tabular text-[11.5px] ${changeColor(q.changePct)}`}>
                          {q.changePct == null ? DASH : fmtPct(q.changePct, { sign: true })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {indices && model.dayPct != null && (() => {
                const n500 = indices.indices.find((x) => x.id === "nifty-500");
                if (!n500 || n500.changePct == null) return null;
                const gap = model.dayPct - n500.changePct;
                return (
                  <p className="mt-3 border-t border-ink-700 pt-2 text-[11.5px] text-slate-400" data-testid="movers-vs-index">
                    The priced book is <strong className={changeColor(gap)}>{fmtPct(gap, { sign: true })}</strong> against the
                    Nifty 500 today. Both are one session; neither is a return over any longer window, and the book&rsquo;s
                    figure covers {fmtFromBase(model.movedValue, { compact: true })} of {fmtFromBase(portfolio.totalValue, { compact: true })}.
                  </p>
                );
              })()}
            </div>
          </div>

          {/* ── Gainers and losers ────────────────────────────────────────── */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <MoverList title={`${model.gainCount} gainers`} tone="gain" rows={model.gainers}
              total={model.gainSum} fmt={fmtFromBase} rank={rank} />
            <MoverList title={`${model.lossCount} losers`} tone="loss" rows={model.losers}
              total={model.lossSum} fmt={fmtFromBase} rank={rank} />
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Ranked by {rank === "impact" ? "rupee impact on the book" : "percentage move"}; the other ranking is one click away
            because they answer different questions — a 9% move on a ₹40 L holding is a bigger mover by percent and a smaller
            one by money. {model.flat > 0 && `${model.flat} name(s) closed unchanged and are in neither list. `}
            A name held in more than one account is one mover: its rupee impact adds and its percentage is re-derived from the
            combined previous close, never averaged across positions of different sizes.
          </p>
        </>
      )}
    </Card>
  );
}

function MoverList({ title, tone, rows, total, fmt, rank }: {
  title: string; tone: "gain" | "loss"; rows: Row[]; total: number;
  fmt: (n: number | null | undefined, o?: { compact?: boolean; sign?: boolean }) => string;
  rank: "impact" | "pct";
}) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4" data-testid={`movers-${tone}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="label-xs">{title}</div>
        {/* AN EMPTY LIST HAS NO TOTAL, AND `₹0` IS NOT ONE. Summing an empty
            collection through a money formatter is the exact case §2 names — a
            measured zero and an absent measurement must never look the same —
            and on a day when nothing fell, "0 losers · ₹0" reads as a measured
            ₹0 of losses rather than as an empty set. The dash carries the reason;
            the sentence underneath says what was actually measured. */}
        {rows.length === 0
          ? <Pill><span title="No priced holding moved this way today, so there is no total to sum.">{DASH}</span></Pill>
          : <Pill tone={tone}>{fmt(total, { compact: true, sign: true })}</Pill>}
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-[11.5px] text-slate-500">
          No priced holding moved this way today. That is a measurement over the names the feed prices, not a statement
          about the whole book.
        </p>
      ) : (
        <table className="mt-3 w-full text-[12px]">
          <tbody className="divide-y divide-ink-700">
            {rows.map((r) => (
              <tr key={r.securityKey}>
                <td className="py-1.5 pr-2">
                  <Link to={`/stock/${encodeURIComponent(r.securityKey)}`}
                    className="text-slate-300 transition-colors hover:text-champagne-400"
                    title={r.entities.length ? `Held by ${r.entities.join(", ")}` : undefined}>
                    {r.security}
                  </Link>
                </td>
                <td className={`py-1.5 pr-3 text-right tabular ${rank === "pct" ? "font-semibold" : ""} ${changeColor(r.dayChangePct)}`}>
                  {fmtPct(r.dayChangePct, { sign: true })}
                </td>
                <td className={`py-1.5 text-right tabular ${rank === "impact" ? "font-semibold" : ""} ${changeColor(r.dayChange)}`}>
                  {fmt(r.dayChange, { compact: true, sign: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
