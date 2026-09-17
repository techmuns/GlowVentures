// RETURN ATTRIBUTION — the one definition of what each figure on that card means.
//
// *"What was the attribution to those returns? So what did the benchmark do?
// What did I do? What did my portfolio do? In this last year, return
// attribution… which were the biggest detractors of returns?"*
//
// Four questions, and the corpus answers three of them from primary documents.
// This module is where each answer is defined ONCE, for the same reason
// `holdingBucket`, `costCoversSet` and `accountHasOpeningValue` are single
// functions: a page that re-derives "which holding detracted" beside a card that
// already states it is two chances for one screen to contradict itself.
//
// The bridge itself is GENERATED — `BOOK_ATTRIBUTION`, struck in
// `attributionFrom` in build-book.mjs off the same snapshots the NAV series is
// drawn from. Nothing here re-measures it; this turns it into rows.
//
// ── NO PAGE RENDERS THIS TODAY, AND THAT IS SAID RATHER THAN LEFT TO BE FOUND ─
//
// *"remove return attribution section from the dashboard UI."* The card that was
// this module's only caller is deleted. The module is KEPT, deliberately, and on
// two grounds rather than sentiment:
//
//   1. `BOOK_ATTRIBUTION` is still GENERATED on every `build-book` — removing it
//      from the generator would rewrite `glowData.ts`, which is a re-measurement
//      of the book rather than a UI change the family asked for. A generated
//      artefact with no check is worse than one with no renderer.
//   2. `__tests__/attribution.test.ts` is that check, and it is ALSO where the
//      chain-linked NAV series is asserted — that it starts before the panel is
//      complete, that the extension is load-bearing, that the raw line is
//      undefined until the panel completes. `NavVsIndex` still draws all of it.
//      Deleting this module would take those assertions with it.
//
// So this is a DOCUMENTED no-caller, which is not the failure this repo names —
// that failure is the SILENT orphan a future session finds exported and wires
// back believing it load-bearing. The same treatment `src/lib/series.ts` carries
// for the same reason. If the card ever returns, nothing here needs rewriting.
import type { Attribution, AttributionRow, AccountReturnBlock } from "./types";

/** One step of the bridge from the opening value to the closing one. */
export type BridgeStep = {
  key: string;
  label: string;
  value: number;
  /** Whether the step is PERFORMANCE. Only the price step is. */
  performance: boolean;
  why: string;
};

/**
 * THE BRIDGE, IN THE ORDER IT IS READ — and the labels say which term is
 * performance and which is money moving.
 *
 * The distinction is the whole point of decomposing at all. V.E.C 128005 runs
 * ₹9.24 Cr → ₹20.29 Cr over its window and essentially all of it is the
 * ₹11.24 Cr of Fund Deposits `accountXirr.test.ts` already gates that account
 * for; a two-term split would leave that sitting inside a performance figure.
 */
export function bridgeSteps(a: Attribution): BridgeStep[] {
  return [
    { key: "price", label: "Price", value: a.priceEffect, performance: true,
      why: "What the units held at the start of each window earned: opening quantity × the change in the statement's own mark. This is the only step that is performance." },
    { key: "trading", label: "Trading", value: a.tradeEffect, performance: false,
      why: "Units bought or sold inside a window, valued at the closing mark. Money moving between a holding and cash, not a return." },
    { key: "entered", label: "Bought in", value: a.enteredValue, performance: false,
      why: "Positions that appear on the closing statement and not the opening one, at their whole closing value. What they earned before they were reported is not on either statement." },
    { key: "exited", label: "Sold out", value: -a.exitedValue, performance: false,
      why: "Positions on the opening statement and not the closing one, at their whole opening value. What they realised is on the capital gain statement, not here." },
    ...(Math.abs(a.undecomposedValue) > 0.5
      ? [{ key: "undecomposed", label: "Not split", value: a.undecomposedValue, performance: false,
          why: "Held at both ends and carrying no per-unit price at one of them — a cash sleeve, or fund units marked at a total value. The change is real; no price/trading split exists for it, and assigning it to either would put money nobody measured into a figure a reader acts on." }]
      : []),
  ];
}

/** One company's total price effect, across every account that holds it. */
export type Contributor = {
  securityKey: string;
  security: string;
  priceEffect: number;
  openValue: number;
  /** Weighted return over the window — the price effect over what it was struck on. */
  returnPct: number | null;
  accounts: number;
  from: string;
  to: string;
};

/**
 * A NAME HELD IN SEVERAL ACCOUNTS IS ONE CONTRIBUTOR.
 *
 * The same rule Today's movers already applies: the rupee impact ADDS and the
 * percentage is re-derived from the combined opening value, never averaged
 * across positions of different sizes. Ather Energy sits in both V.E.C folios
 * and contributed ₹33.69 L in one and ₹24.07 L in the other; ranked per row it
 * would take two of the top five slots and understate its own impact in both.
 *
 * The window shown is the OUTER span of the rows behind it, because two accounts
 * mark on different dates and a single pair of dates would be true of neither.
 */
export function contributorsOf(a: Attribution): Contributor[] {
  const by = new Map<string, Contributor>();
  for (const r of a.rows) {
    if (r.kind !== "held" || r.priceEffect === null || r.openValue === null) continue;
    const cur = by.get(r.securityKey);
    if (!cur) {
      by.set(r.securityKey, {
        securityKey: r.securityKey, security: r.security,
        priceEffect: r.priceEffect, openValue: r.openValue,
        returnPct: null, accounts: 1, from: r.from, to: r.to,
      });
      continue;
    }
    cur.priceEffect += r.priceEffect;
    cur.openValue += r.openValue;
    cur.accounts++;
    if (r.from < cur.from) cur.from = r.from;
    if (r.to > cur.to) cur.to = r.to;
  }
  const out = [...by.values()];
  for (const c of out) c.returnPct = c.openValue > 0 ? (c.priceEffect / c.openValue) * 100 : null;
  return out.sort((x, y) => y.priceEffect - x.priceEffect
    || x.security.localeCompare(y.security));
}

/**
 * THE MANAGERS' OWN PUBLISHED YEAR, EACH AGAINST ITS OWN BENCHMARK.
 *
 * *"In this last year…"* — and this book's own dated series is eleven weeks, so
 * it cannot answer that. What CAN is the archive: eight accounts publish a
 * one-year return AND their benchmark's one-year return ON THE SAME DOCUMENT,
 * over the same window, struck by the manager who runs the mandate. That is a
 * primary-source answer to *"what did the benchmark do? what did I do?"* over
 * exactly the period asked about.
 *
 * BOTH FIGURES MUST COME FROM ONE BLOCK. A portfolio return from the fact sheet
 * set beside a benchmark from the performance history would be two windows in
 * one row — Green Lantern's fact sheet closes 27 July and its performance
 * history 10 August, and the S&P BSE 500's one-year reads 1.22% on the first
 * and 5.89% on the second. Pairing across documents would have printed a 14.93
 * pp active return where the document says 10.30.
 *
 * AND THEY ARE NEVER AVERAGED INTO A BOOK FIGURE. Different fee bases
 * (Goldstandard after fees, Carnelian before), different benchmarks (N50TRI,
 * S&P BSE 500 TRI, NSmCap250TRI) and different end dates. A weighted mean of
 * those is a number no document supports, and the card says so rather than
 * printing one.
 */
export type ManagerYear = {
  accountId: string;
  portfolioPct: number;
  benchmarks: { name: string; pct: number }[];
  /** Portfolio less the FIRST benchmark — both off the same document. */
  activePct: number;
  feeBasis: string | null;
  source: string;
  reportType: string;
};

const BLOCK_RANK = ["performance-history", "fact-sheet", "investor-report"];

export function managerYears(
  blocks: Record<string, AccountReturnBlock[]>,
): ManagerYear[] {
  const out: ManagerYear[] = [];
  for (const [accountId, list] of Object.entries(blocks)) {
    const usable = list.filter((b) => {
      const port = b.series.find((s) => !s.isBenchmark && s.y1 !== null);
      const bench = b.series.find((s) => s.isBenchmark && s.y1 !== null);
      return port && bench;
    });
    if (!usable.length) continue;
    // One block per account: the report type that publishes the trailing
    // periods, and `source` rides along so the row names the document it is off.
    const pick = usable.slice().sort((x, y) => {
      const rx = BLOCK_RANK.indexOf(x.reportType), ry = BLOCK_RANK.indexOf(y.reportType);
      return (rx < 0 ? 99 : rx) - (ry < 0 ? 99 : ry) || x.source.localeCompare(y.source);
    })[0];
    const port = pick.series.find((s) => !s.isBenchmark && s.y1 !== null);
    const benchmarks = pick.series
      .filter((s) => s.isBenchmark && s.y1 !== null)
      .map((s) => ({ name: s.series, pct: s.y1 as number }));
    if (!port || !benchmarks.length) continue;
    out.push({
      accountId,
      portfolioPct: port.y1 as number,
      benchmarks,
      activePct: (port.y1 as number) - benchmarks[0].pct,
      feeBasis: port.feeBasis ?? null,
      source: pick.source,
      reportType: pick.reportType,
    });
  }
  return out.sort((a, b) => b.activePct - a.activePct);
}

/** The window's own return on the price step alone — performance, net of flows. */
export function priceReturnPct(a: Attribution): number | null {
  return a.openValue > 0 ? (a.priceEffect / a.openValue) * 100 : null;
}

/** Rows a page shows per account, sorted by what moved most. */
export function accountRows(a: Attribution): Attribution["accounts"] {
  return a.accounts.slice().sort((x, y) => Math.abs(y.priceEffect) - Math.abs(x.priceEffect));
}

export type { AttributionRow };
