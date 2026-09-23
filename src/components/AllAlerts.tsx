import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Pencil, Plus, X } from "lucide-react";
import { Card } from "@/components/Card";
import { SortHeader, Tr } from "@/components/SortHeader";
import { AbsentCell } from "@/components/Absent";
import { AlertStatusText, KIND_TONE, KindPill, distanceText, priceSource } from "@/components/AlertBits";
import { ResearchSummaryText } from "@/components/ResearchStatus";
import { usePortfolio } from "@/context/PortfolioContext";
import { currentHoldings } from "@/lib/analytics";
import { fmtCurrency, fmtDateTime } from "@/lib/format";
import { fundNavFor } from "@/lib/fundNavs";
import { ALERT_DEF, distanceOf, type AlertRow, type AlertStatus } from "@/lib/priceAlerts";
import { symbolFor } from "@/lib/quotes";
import { sortRows, useTableView, type Accessor } from "@/lib/tableView";
import { usePriceAlerts } from "@/lib/usePriceAlerts";
import { readEntry, writeEntry, type WatchEntry } from "@/lib/watchlist";

/**
 * ── ALL ALERTS — MORNING CIO'S FOURTH TAB ───────────────────────────────────
 *
 * *"in morning CIO can you make an ALL alerts tab where in a beautiful table
 * format whenever the alerts which have been set are triggered they show simply
 * and ofcourse should look like an alert for entry exit or whatever."*
 *
 * ONE TABLE, ONE ROW PER ALERT. A holding with a Buy at and a Stop loss is two
 * rows, because they are two things that can fire separately; one row with two
 * statuses in it is a cell a reader has to decode.
 *
 * WHAT HAS FIRED COMES FIRST AND LOOKS LIKE AN ALERT — a bell, the alert's own
 * words ("Stop loss hit", "Buy level reached"), its colour, and a tinted row
 * with a bar at its edge — then what is still being checked, then what is being
 * watched, closest to firing first. That order is the table's own, and the
 * headings still sort it any other way, like every table in this app.
 *
 * AN ALERT WITH NO PRICE TO CHECK IS NEVER "WATCHING". It says it cannot be
 * checked and why, and its Price and Distance cells are absences with that
 * reason. A row reading "Watching" over a price nobody fetched would be a check
 * that was never made passing as one that held — the silence-read-as-all-clear
 * failure this book's alert rule exists to prevent (see `priceAlerts.ts`).
 *
 * NOTHING HERE IS A STATEMENT FIGURE. The levels are the family's own
 * judgements, kept in this browser (`watchlist.ts`), and the price is the live
 * quote or the fund's published NAV. None of it reaches `glowData.ts` or any
 * total on this page.
 */
const COLS = ["holding", "alert", "level", "price", "status", "gap", "actions"] as const;

const STATUS_SORT: Record<AlertStatus, number> = { reached: 0, checking: 1, watching: 2, unchecked: 3 };

/** A row's price, where it has one — the figure every other cell is struck on. */
const priceOf = (r: AlertRow): number | null => (r.now.state === "live" || r.now.state === "nav" ? r.now.price : null);

const ACCESSORS: Record<string, Accessor<AlertRow>> = {
  holding: (r) => r.name,
  alert: (r) => ALERT_DEF[r.kind].label,
  level: (r) => r.level,
  price: priceOf,
  status: (r) => STATUS_SORT[r.status],
  gap: distanceOf,
};

/** Why a row has no price, in the words its cells' hovers carry. */
const noPriceReason = (r: AlertRow) =>
  r.now.state === "none" ? `No price to check against: ${r.now.reason}.`
    : r.now.state === "checking" ? "The live price has not arrived yet." : undefined;

export function AllAlerts() {
  const { rows, counts } = usePriceAlerts();
  const { convertFromBase, displayCurrency, quotesStatus, quotesAsOf, quoteFeeds } = usePortfolio();
  const view = useTableView("cio-alerts", COLS);
  const shown = useMemo(() => sortRows(rows, view.sort, ACCESSORS), [rows, view.sort]);
  const perUnit = (n: number) => fmtCurrency(convertFromBase(n), displayCurrency);

  /**
   * REMOVING AN ALERT TAKES TWO CLICKS. The first turns the cross into
   * "Remove?"; the second, within four seconds, clears the level. A level the
   * family set is their own record and there is no undo, so one stray click
   * must not be enough — and a confirm dialog would be the heaviest thing on an
   * otherwise quiet page.
   */
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(null), 4000);
    return () => window.clearTimeout(t);
  }, [confirming]);
  const remove = (r: AlertRow) => {
    writeEntry({ ...readEntry(r.securityKey), [ALERT_DEF[r.kind].field]: null } as WatchEntry);
    setConfirming(null);
  };

  const feedLine = quotesStatus === "live"
    ? `Live prices${quoteFeeds.length ? ` from ${quoteFeeds.join(" and ")}` : ""}${quotesAsOf ? `, updated ${fmtDateTime(quotesAsOf)}` : ""}. Funds are checked against their published NAV.`
    : quotesStatus === "loading" ? "Fetching live prices…"
      : "Live prices are not reaching the dashboard right now, so alerts on shares can't be checked. Funds are still checked against their published NAV.";

  return (
    <Card pad={false} title="Your price alerts"
      subtitle={counts.total === 0
        ? "Set a level on any holding and it shows here the moment the price gets there."
        : (
          <span data-alert-summary data-reached={counts.reached} data-watching={counts.watching}
            data-checking={counts.checking} data-unchecked={counts.unchecked} data-total={counts.total}>
            <span className={counts.reached ? "font-semibold text-slate-100" : ""}>{counts.reached} reached</span>
            {" · "}{counts.watching} watching
            {counts.checking > 0 && <> · {counts.checking} checking</>}
            {counts.unchecked > 0 && <> · {counts.unchecked} not checked</>}
          </span>
        )}
      right={<AddAlert />}>
      {rows.length === 0 ? (
        <div data-alerts-empty className="flex flex-col items-center gap-2 px-6 pb-12 pt-6 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-champagne-500/30 bg-champagne-500/10 text-champagne-400">
            <Bell className="h-5 w-5" />
          </div>
          <div className="mt-2 text-sm font-medium text-slate-200">No price alerts yet</div>
          <p className="max-w-md text-xs leading-relaxed text-slate-400">
            Find a holding with <span className="font-medium text-slate-200">New alert</span> above, then type the
            price you would buy at, sell at, or your stop loss. When the price gets there, it shows up here.
          </p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm" data-table="all-alerts">
            <thead className="border-b border-ink-700/70">
              <Tr view={view}>
                <SortHeader col="holding" view={view} align="left" pad="px-5 py-2.5">Holding</SortHeader>
                <SortHeader col="alert" view={view} align="left">Alert</SortHeader>
                <SortHeader col="level" view={view}>Your level</SortHeader>
                <SortHeader col="price" view={view}>Price now</SortHeader>
                <SortHeader col="status" view={view} align="left">Status</SortHeader>
                <SortHeader col="gap" view={view}>Distance</SortHeader>
                <SortHeader col="actions" view={view} sortable={false} pad="px-5 py-2.5"
                  title="Change or remove an alert · drag the handle, or focus it and press ← or →, to move this column">
                  Edit
                </SortHeader>
              </Tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {shown.map((r) => {
                const def = ALERT_DEF[r.kind];
                const tone = KIND_TONE[r.kind];
                const reached = r.status === "reached";
                const price = priceOf(r);
                const dist = distanceText(r, def.dir);
                const why = noPriceReason(r);
                const href = `/stock/${encodeURIComponent(r.securityKey)}#alerts`;
                return (
                  <Tr view={view} key={r.id} data-alert-row={r.id} data-alert-kind={r.kind} data-alert-status={r.status}
                    data-alert-key={r.securityKey} data-alert-level={r.level} data-alert-price={price ?? ""}
                    data-alert-source={r.now.state} className={reached ? tone.tint : undefined}>
                    <td className="relative px-5 py-3">
                      {/* THE EDGE BAR marks a row that has fired, in its kind's
                          colour, so the fired rows read as a block when the
                          reader has sorted the table some other way. */}
                      {reached && <span aria-hidden className={`absolute inset-y-1.5 left-0 w-[3px] rounded-r ${tone.dot}`} />}
                      <Link to={href} className="font-medium text-slate-100 transition-colors hover:text-champagne-400">{r.name}</Link>
                    </td>
                    <td className="px-4 py-3"><KindPill kind={r.kind} /></td>
                    <td className="mono whitespace-nowrap px-4 py-3 text-right text-slate-200">{perUnit(r.level)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {price !== null
                        ? <><span className="mono text-slate-100">{perUnit(price)}</span>
                            <span className="ml-1.5 text-[10.5px] text-slate-500">{priceSource(r.now)}</span></>
                        : <AbsentCell reason={why} />}
                    </td>
                    <td className="px-4 py-3" data-alert-status-cell>
                      <AlertStatusText status={r.status} kind={r.kind} reason={why} />
                    </td>
                    <td className="mono whitespace-nowrap px-4 py-3 text-right">
                      {dist ? <span className={reached ? `font-medium ${tone.text}` : "text-slate-300"}>{dist}</span>
                        : <AbsentCell reason={why} />}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-1">
                        <Link to={href} data-alert-edit title={`Change the ${def.label} alert on ${r.name}`}
                          aria-label={`Change the ${def.label} alert on ${r.name}`}
                          className="rounded p-1 text-slate-500 transition-colors hover:text-slate-200">
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                        {confirming === r.id ? (
                          <button type="button" data-alert-remove-confirm onClick={() => remove(r)}
                            className="rounded border border-loss/40 bg-loss/10 px-1.5 py-0.5 text-[11px] font-medium text-loss">
                            Remove?
                          </button>
                        ) : (
                          <button type="button" data-alert-remove onClick={() => setConfirming(r.id)}
                            title={`Remove the ${def.label} alert on ${r.name}`} aria-label={`Remove the ${def.label} alert on ${r.name}`}
                            className="rounded p-1 text-slate-500 transition-colors hover:text-slate-200">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </td>
                  </Tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p data-alert-feed={quotesStatus} className="border-t border-ink-700/70 px-5 py-3 text-[11px] leading-relaxed text-slate-500">
        {feedLine} Alerts are saved in this browser.<ResearchSummaryText />
      </p>
    </Card>
  );
}

/**
 * NEW ALERT — find a holding, land on its alert boxes.
 *
 * It offers only holdings an alert can actually be CHECKED on: a quote symbol
 * or a published NAV. An alert on an AIF or an unlisted share would sit on this
 * table saying it can never be checked, which is honest and useless; the
 * holding's own page still takes one for a reader who wants it anyway.
 *
 * It navigates rather than taking a price inline, so there is ONE form for a
 * level — the one on the holding's page, which shows the price and the distance
 * while it is typed — rather than two that could drift apart.
 */
function AddAlert() {
  const { consolidated, fmtFromBase } = usePortfolio();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);

  const options = useMemo(() => {
    const by = new Map<string, { key: string; name: string; value: number }>();
    for (const p of currentHoldings(consolidated)) {
      if (!symbolFor(p) && !fundNavFor(p)?.usableForValue) continue;
      const e = by.get(p.securityKey);
      if (e) e.value += p.marketValue;
      else by.set(p.securityKey, { key: p.securityKey, name: p.security, value: p.marketValue });
    }
    return [...by.values()].sort((a, b) => b.value - a.value);
  }, [consolidated]);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? options.filter((o) => o.name.toLowerCase().includes(t)) : options).slice(0, 8);
  }, [options, q]);

  useEffect(() => { setHi(0); }, [q]);

  const go = (key: string) => {
    setOpen(false);
    setQ("");
    navigate(`/stock/${encodeURIComponent(key)}#alerts`);
  };

  return (
    <div className="relative w-64 shrink-0" data-alert-add>
      <div className="flex items-center rounded-md border border-ink-600/70 bg-ink-800/40 focus-within:border-champagne-400/50">
        <Plus className="ml-2 h-3.5 w-3.5 shrink-0 text-champagne-400" aria-hidden />
        <input
          type="text" autoComplete="off" value={q} placeholder="New alert — find a holding"
          aria-label="New alert — find a holding" data-alert-add-input
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            if (e.key === "Enter" && matches[hi]) { e.preventDefault(); go(matches[hi].key); }
            if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
          }}
          className="w-full min-w-0 bg-transparent px-2 py-1.5 text-[12.5px] text-slate-200 placeholder:text-slate-500 focus:outline-none"
        />
      </div>
      {open && (
        <div role="listbox" data-alert-add-list
          className="absolute right-0 z-30 mt-1 w-full overflow-hidden rounded-md border border-ink-700 bg-ink-800 py-1 shadow-card">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-slate-500">No holding with a live price or NAV matches.</div>
          ) : matches.map((m, i) => (
            <button key={m.key} type="button" role="option" aria-selected={i === hi} data-alert-add-option={m.key}
              onMouseDown={(e) => { e.preventDefault(); go(m.key); }}
              onMouseEnter={() => setHi(i)}
              className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[12.5px] ${
                i === hi ? "bg-ink-700/60 text-slate-100" : "text-slate-300"}`}>
              <span className="truncate">{m.name}</span>
              <span className="mono shrink-0 text-[11px] text-slate-500">{fmtFromBase(m.value, { compact: true })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
