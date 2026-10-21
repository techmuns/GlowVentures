/**
 * THE HOLDINGS INSIDE THE AIFs AND THE PMS MANDATES, RANKED BY THE DAY'S MOVE.
 *
 * *"we will not show that particular AIF or the PMS that is having the highest
 * gain or lose but we will show the holding inside all of the AIF and PMS which
 * are having the highest daily gain or lose."* — the family, 7 Oct 2026.
 *
 * So a wrapper is never a row. What a row IS comes from two different kinds of
 * document, and the two must never be added into one figure:
 *
 *  - **A PMS MANDATE REPORTS EVERY SHARE.** The family owns them and the manager
 *    picked them, so they are ordinary `BOOK_POSITIONS` rows and both the day's
 *    move and the rupee impact are MEASURED — through the same `dailyMovers`
 *    gate the Direct Equity card is struck on, with nothing relaxed.
 *  - **AN AIF REPORTS A FOLIO.** One fund in this book discloses its own
 *    portfolio, and it prints a NAME and a WEIGHT and nothing else. So the
 *    family's exposure to a company inside it is DERIVED — `familyValue`, the
 *    units they hold times the fund's own weight — and it carries **NO RUPEE DAY
 *    IMPACT**: the fund's units are not marked daily at the underlying's live
 *    prices, and the weight is a month old. The PERCENTAGE is the exchange's own
 *    figure for the company, the same number either half would use, which is the
 *    whole reason one row can carry both halves without mixing a measurement.
 *
 * It is deliberately NOT routed through `companyExposure` or the look-through
 * store. That store is the AMCs' monthly filings, with an ISIN and a value per
 * line, and it is what every stock-axis figure rests on; folding an AIF's
 * weights into it changes that partition (Stage 10df).
 *
 * THE AIF SCOPE IS THE ALLOCATION ROW'S, `holdingBucket` = AIF, so the coverage
 * this card states can be checked against the figure Morning CIO prints two
 * cards up. An AIF the family's review carries AT COST is in its own bucket and
 * is not in that denominator — it has no mark to be a share of, and it discloses
 * nothing either way.
 */
import type { Account, Position } from "./types";
import { MANDATE_BUCKET, currentHoldings, holdingBucket, mandateLabel } from "./analytics";
import { accountIndex, engagementOf } from "./accounts";
import { dailyMovers, latestQuoteSession, quoteSession, symbolMove } from "./dailyMovers";
import { priceLooksLikeSameSecurity, symbolFor, symbolForKey, type QuoteFeed } from "./quotes";
import { marketDay, type ActionFeed, type ActionReturn } from "./corporateActions";
import { familyValue } from "./lookthrough";
import { securityLabel } from "./securityLabel";
import type { FundDisclosureData } from "./fundDisclosures";

/** One wording for one refusal, so the two halves cannot word it apart. */
const ACTION_BASIS = "Corporate action: previous-close basis needs verification";

/** A fund that discloses this company, and the weight IT put on it. */
export type InsideVia = { fund: string; pct: number | null; asOf: string };

export type InsideMoverRow = {
  securityKey: string;
  security: string;
  /** The exchange's own move, the same figure for both halves of the row. */
  dayChangePct: number;
  /** REPORTED — the family's own statement rows inside a PMS mandate. */
  mandateValue: number | null;
  mandateDayChange: number | null;
  entities: string[];
  /** DERIVED — the family's share of what an AIF disclosed. In no book total. */
  fundValue: number | null;
  /** Why there is no derived figure, where there is none. Never a bare absence. */
  fundValueWhy: string | null;
  via: InsideVia[];
};

/**
 * ONE LINE INSIDE A VEHICLE — a share a mandate reports, or a company a fund
 * disclosed. A mandate line carries a MEASURED rupee value and move; a fund line
 * carries the fund's own WEIGHT and the exchange's percentage, and no rupees.
 */
export type InsideVehicleLine = {
  securityKey: string;
  security: string;
  /** MEASURED — the statement row's live value. Null on a fund line. */
  value: number | null;
  /** A fund line's weight in the fund, as the fund printed it. */
  weightPct: number | null;
  dayChangePct: number | null;
  /** MEASURED rupee move. Null on a fund line, and where it is withheld. */
  dayChange: number | null;
  /** Why the move, or its rupee half, is not shown. Null where both are. */
  why: string | null;
};

/**
 * A MANDATE OR A FUND, AS A ROW OF ITS OWN (Stage 10do). The family asked to see
 * each vehicle's own day — *"movement at mandate level and drill-down into
 * underlying holdings"* — beside the company ranking, never instead of it.
 *
 *  - A mandate's move is MEASURED: the rupee change of the shares the feed
 *    priced, over their value at the previous close. It covers those shares and
 *    nothing else, and says how much of the mandate that is.
 *  - A disclosing fund's move is DERIVED: the fund's own weights times each
 *    company's exchange move, over the weight priced. A fund's NAV is struck once
 *    a day after the close, so this is what its disclosed book did — never what
 *    its NAV did, and never a rupee figure.
 *  - A fund that discloses nothing has no move at all, and says so.
 */
export type InsideVehicle = {
  key: string;
  kind: "mandate" | "fund";
  basis: "measured" | "derived" | "none";
  name: string;
  sub: string;
  value: number;
  dayChangePct: number | null;
  /** MEASURED only. Never on a fund row. */
  dayChange: number | null;
  /** Mandate: value of the priced lines. Fund: weight of NAV priced, in %. */
  covered: number;
  /** Mandate: the mandate's value. Fund: weight of NAV the fund named, in %. */
  coverageOf: number;
  pricedLines: number;
  lines: number;
  asOf: string | null;
  why: string | null;
  children: InsideVehicleLine[];
};

export type InsideMovers = {
  rows: InsideMoverRow[];
  /** One row per mandate account and per AIF fund — see `InsideVehicle`. */
  vehicles: InsideVehicle[];
  session: string | null;
  observedFrom: string | null;
  observedTo: string | null;
  /** A company refused, in the gate's own words. */
  omitted: Map<string, string>;
  /**
   * EVERY SYMBOL THIS CARD WAITS ON — both halves. `/api/quotes` prices a
   * bounded slice per request, so a ranking struck before the last of them lands
   * is a ranking over a subset (Stage 10an). The card holds on this and nothing
   * wider: waiting on the whole book would make it wait on names it never draws.
   */
  scopeSymbols: string[];
  /**
   * HOW MANY COMPANIES THIS SCOPE COVERS — the mandates' shares and the
   * companies the funds disclose, each counted once. A count of the SCOPE, not
   * of prices, so it is known before a single quote lands.
   */
  companies: number;
  /** The PMS half's own scope, so no caller re-derives it. */
  mandate: {
    positions: number; names: number; value: number;
    priced: number; pricedValue: number;
    /** Names a quote can never reach, with their value. */
    unpriced: { security: string; value: number }[];
  };
  /** The AIF half's. */
  fund: {
    funds: number; value: number;
    disclosing: {
      fund: string; asOf: string; value: number;
      /** The named lines' OWN sum — never 100 less a residual. */
      pctCovered: number;
      lines: number; priced: number; pricedPct: number;
    }[];
    /** Every AIF folio that publishes nothing this book can join. */
    silent: { fund: string; value: number }[];
    /** A disclosed line no quote reached, with the weight it carries. */
    unpriced: { security: string; pct: number | null; reason: string }[];
    /** What the drawn rows' derived halves add to. */
    derivedValue: number;
    /** Identity struck against this book's own mark, or passed for want of one. */
    verified: number; vacuous: number;
  };
};

/** A company's own mark and identifier, from whichever of its rows reports one. */
function bookIdentity(positions: readonly Position[]) {
  const marks = new Map<string, number>();
  const isins = new Map<string, string>();
  const names = new Map<string, string>();
  for (const p of positions) {
    if (p.currentPrice != null && p.currentPrice > 0 && !marks.has(p.securityKey)) marks.set(p.securityKey, p.currentPrice);
    if (p.isin && !isins.has(p.securityKey)) isins.set(p.securityKey, p.isin);
    if (!names.has(p.securityKey)) names.set(p.securityKey, p.security);
  }
  return { marks, isins, names };
}

export function insideMovers(args: {
  positions: Position[];
  accounts: Account[];
  quotes: QuoteFeed | null;
  returns: ReadonlyMap<string, ActionReturn>;
  actions: ActionFeed | null;
  disclosures: FundDisclosureData | null;
}): InsideMovers {
  const { positions, accounts, quotes, returns, actions, disclosures } = args;
  const idx = accountIndex(accounts);
  const held = currentHoldings(positions);
  const bucketOf = (p: Position) => holdingBucket(p, engagementOf(idx, p));
  const mandate = held.filter((p) => bucketOf(p) === MANDATE_BUCKET);
  const aifRows = held.filter((p) => bucketOf(p) === "AIF");
  const identity = bookIdentity(positions);

  // ONE SYMBOL PER COMPANY. A mandate row may carry its own `symbol`, which is
  // the stronger evidence, so the disclosed half must use the same one or the
  // two halves would be struck on two quotes and could disagree on a figure
  // that is one figure.
  const symbolByKey = new Map<string, string>();
  for (const p of mandate) {
    const s = symbolFor(p);
    if (s && !symbolByKey.has(p.securityKey)) symbolByKey.set(p.securityKey, s);
  }
  const symbolOf = (key: string) => symbolByKey.get(key) ?? symbolForKey(key);

  const funds = disclosures?.funds ?? [];
  const valueOfKeys = (keys: readonly string[]) => {
    const set = new Set(keys);
    return held.filter((p) => set.has(p.securityKey)).reduce((a, p) => a + p.marketValue, 0);
  };
  const disclosed = funds
    .map((f) => ({ ...f, unitsValue: valueOfKeys(f.fundKeys) }))
    .filter((f) => aifRows.some((p) => f.fundKeys.includes(p.securityKey)));
  const disclosedKeys = new Set(disclosed.flatMap((f) => f.lines.map((l) => l.securityKey)));

  // THE SESSION IS RESOLVED OVER BOTH HALVES, so neither can be struck on a
  // session the other is not on.
  const session = latestQuoteSession(quotes, [
    ...mandate.map((p) => symbolFor(p)),
    ...[...disclosedKeys].map(symbolOf),
  ]);

  const mv = dailyMovers(mandate, quotes, returns, idx, { session });
  const omitted = new Map(mv.omitted);

  /**
   * A CORPORATE ACTION ON THE EX-DATE IS A FACT ABOUT THE SECURITY AND THE DAY,
   * so it is read off the FEED by identifier and applied to BOTH halves.
   *
   * The mandate half's own `dailyMovers` call checks the same thing — but it
   * checks it through the per-ACCOUNT `returns` plan a caller builds from this
   * very feed, and a company a fund merely disclosed has no account and so no
   * plan. Read here it needs none. It is applied to the mandate rows as well,
   * rather than left to that plan, because a company must not be drawn on one
   * half's say-so when the other half's input happened to be empty: the two
   * halves share one quote, so a previous close on the pre-split basis is as
   * suspect on either.
   */
  const actionSuspect = (key: string): boolean => {
    const symbol = symbolOf(key);
    const q = symbol ? quotes?.quotes[symbol] : undefined;
    if (!q) return false;
    const isin = identity.isins.get(key) ?? null;
    const day = quoteSession(quotes, symbol) || marketDay(q.observedAt || quotes!.asOf);
    return (actions?.rows ?? []).some((r) =>
      ((isin && r.isin === isin) || (symbol && r.ticker === symbol))
      && r.type !== "dividend" && (!r.exDate || r.exDate === day));
  };
  for (const r of mv.rows) {
    if (!omitted.has(r.securityKey) && actionSuspect(r.securityKey)) {
      omitted.set(r.securityKey, ACTION_BASIS);
    }
  }

  // The disclosed half's gate, ONCE PER COMPANY. Its percentage is the whole of
  // what it contributes, so a company whose percentage is refused is refused —
  // the same rule `dailyMovers` applies across an account's rows.
  const pctByKey = new Map<string, number>();
  const unpriced: InsideMovers["fund"]["unpriced"] = [];
  let verified = 0;
  let vacuous = 0;
  const weightOf = (key: string) => {
    const pcts = disclosed.flatMap((f) => f.lines.filter((l) => l.securityKey === key).map((l) => l.pctNetAssets));
    const named = pcts.filter((p): p is number => p != null);
    return named.length ? named.reduce((a, b) => a + b, 0) : null;
  };
  for (const key of disclosedKeys) {
    const nameOf = () => {
      const line = disclosed.flatMap((f) => f.lines).find((l) => l.securityKey === key)!;
      return securityLabel(key, identity.names.get(key) ?? line.security);
    };
    if (omitted.has(key)) { unpriced.push({ security: nameOf(), pct: weightOf(key), reason: omitted.get(key)! }); continue; }
    const symbol = symbolOf(key);
    const move = symbolMove(quotes, symbol, session);
    if ("reason" in move) {
      omitted.set(key, move.reason);
      unpriced.push({ security: nameOf(), pct: weightOf(key), reason: move.reason });
      continue;
    }
    // THE IDENTITY CHECK IS STRUCK AGAINST THIS BOOK'S OWN MARK where it carries
    // one for the company — the same witness `dailyMovers` uses, the same
    // company. Where it does not, `priceLooksLikeSameSecurity` passes for want
    // of anything to compare against, which is the standing convention and is
    // counted and stated rather than left to be assumed.
    const mark = identity.marks.get(key) ?? null;
    if (!priceLooksLikeSameSecurity(move.quote.price, mark)) {
      omitted.set(key, "Quote identity or price needs verification");
      unpriced.push({ security: nameOf(), pct: weightOf(key), reason: "Quote identity or price needs verification" });
      continue;
    }
    if (actionSuspect(key)) {
      omitted.set(key, ACTION_BASIS);
      unpriced.push({ security: nameOf(), pct: weightOf(key), reason: ACTION_BASIS });
      continue;
    }
    if (mark != null) verified++; else vacuous++;
    pctByKey.set(key, move.pct);
  }

  // A company the mandate half refused is refused here too — its percentage is
  // the same quote's, so it is as suspect on the disclosed half.
  for (const key of omitted.keys()) pctByKey.delete(key);

  const rows = new Map<string, InsideMoverRow>();
  for (const r of mv.rows) {
    if (omitted.has(r.securityKey)) continue;
    rows.set(r.securityKey, {
      securityKey: r.securityKey, security: securityLabel(r.securityKey, r.security),
      dayChangePct: r.dayChangePct, mandateValue: r.marketValue, mandateDayChange: r.dayChange,
      entities: r.entities, fundValue: null, fundValueWhy: null, via: [],
    });
  }
  let derivedValue = 0;
  for (const f of disclosed) {
    for (const l of f.lines) {
      const pct = pctByKey.get(l.securityKey);
      if (pct === undefined) continue;
      let row = rows.get(l.securityKey);
      if (!row) {
        row = {
          securityKey: l.securityKey,
          security: securityLabel(l.securityKey, identity.names.get(l.securityKey) ?? l.security),
          dayChangePct: pct, mandateValue: null, mandateDayChange: null, entities: [],
          fundValue: null, fundValueWhy: null, via: [],
        };
        rows.set(l.securityKey, row);
      }
      row.via.push({ fund: f.fund, pct: l.pctNetAssets, asOf: f.asOf });
      // A WEIGHT THAT ROUNDS TO NOTHING IS NOT A ZERO EXPOSURE. The fund prints
      // two decimals, so 0.00% is "below the printing precision" rather than
      // "none of it" — the figure is withheld and the reason given, and the row
      // still stands on the move, which is measured either way.
      if (l.pctNetAssets == null) {
        row.fundValueWhy ??= `${f.fund} prints no weight for this line`;
      } else if (!(l.pctNetAssets > 0)) {
        row.fundValueWhy ??= `${f.fund} prints a weight of 0.00%, below what its own two decimals can state`;
      } else if (!(f.unitsValue > 0)) {
        row.fundValueWhy ??= `the family's units in ${f.fund} are valued at nothing`;
      } else {
        const v = familyValue(f.unitsValue, l.pctNetAssets);
        row.fundValue = (row.fundValue ?? 0) + v;
        derivedValue += v;
      }
    }
  }

  const includedSymbols = [...rows.keys()].map(symbolOf).filter(Boolean) as string[];
  const scopeSymbols = [...new Set(
    [...mandate.map((p) => symbolFor(p)), ...[...disclosedKeys].map(symbolOf)]
      .filter((s): s is string => Boolean(s)),
  )];
  const observations = includedSymbols.map((s) => {
    const q = quotes?.quotes[s];
    if (!q) return NaN;
    return q.observedAt ? Date.parse(q.observedAt) : Date.parse(quotes!.asOf) - (q.ageS || 0) * 1000;
  }).filter(Number.isFinite).sort((a, b) => a - b);

  const mandateKeys = new Set(mandate.map((p) => p.securityKey));
  const unpricedMandate = new Map<string, number>();
  for (const p of mandate) {
    if (rows.has(p.securityKey)) continue;
    const name = securityLabel(p.securityKey, p.security);
    unpricedMandate.set(name, (unpricedMandate.get(name) ?? 0) + p.marketValue);
  }
  const priced = mandate.filter((p) => rows.get(p.securityKey)?.mandateValue != null || rows.has(p.securityKey));

  const disclosingKeys = new Set(disclosed.flatMap((f) => f.fundKeys));
  const silent = new Map<string, number>();
  for (const p of aifRows) {
    if (disclosingKeys.has(p.securityKey)) continue;
    const name = securityLabel(p.securityKey, p.security);
    silent.set(name, (silent.get(name) ?? 0) + p.marketValue);
  }

  // ── THE VEHICLES ─────────────────────────────────────────────────────────
  const vehicles: InsideVehicle[] = [];
  const byAccount = new Map<string, Position[]>();
  for (const p of mandate) {
    const list = byAccount.get(p.accountId) ?? [];
    list.push(p);
    byAccount.set(p.accountId, list);
  }
  for (const [accountId, ps] of byAccount) {
    const account = idx.get(accountId);
    const children: InsideVehicleLine[] = ps.map((p) => {
      const row = rows.get(p.securityKey);
      const security = securityLabel(p.securityKey, p.security);
      if (!row) {
        return { securityKey: p.securityKey, security, value: p.marketValue, weightPct: null,
          dayChangePct: null, dayChange: null,
          why: omitted.get(p.securityKey) ?? (symbolFor(p) ? "Awaiting a quote" : "No NSE listing, so no live quote") };
      }
      const impact = p.live && Number.isFinite(p.dayChange) && Number.isFinite(p.dayChangePct) ? p.dayChange! : null;
      return { securityKey: p.securityKey, security, value: p.marketValue, weightPct: null,
        dayChangePct: row.dayChangePct, dayChange: impact,
        why: impact === null ? "Share count unverified, so the rupee move is withheld" : null };
    });
    const priced = children.filter((c) => c.dayChange !== null);
    const change = priced.reduce((a, c) => a + c.dayChange!, 0);
    const pricedValue = priced.reduce((a, c) => a + (c.value ?? 0), 0);
    const prev = pricedValue - change;
    const value = ps.reduce((a, p) => a + p.marketValue, 0);
    vehicles.push({
      key: `mandate:${accountId}`, kind: "mandate", basis: priced.length ? "measured" : "none",
      name: mandateLabel(account), sub: account?.owner ?? "",
      value,
      dayChangePct: priced.length && prev > 0 ? (change / prev) * 100 : null,
      dayChange: priced.length ? change : null,
      covered: pricedValue, coverageOf: value,
      pricedLines: priced.length, lines: children.length, asOf: null,
      why: priced.length ? null : "No share in this mandate carries a live day move",
      children: children.sort((a, b) => (b.dayChangePct ?? -Infinity) - (a.dayChangePct ?? -Infinity)),
    });
  }
  for (const f of disclosed) {
    const owners = new Set(held.filter((p) => f.fundKeys.includes(p.securityKey))
      .map((p) => idx.get(p.accountId)?.owner).filter(Boolean) as string[]);
    const children: InsideVehicleLine[] = f.lines.map((l) => {
      const pct = pctByKey.get(l.securityKey);
      const security = securityLabel(l.securityKey, identity.names.get(l.securityKey) ?? l.security);
      return { securityKey: l.securityKey, security, value: null, weightPct: l.pctNetAssets,
        dayChangePct: pct ?? null, dayChange: null,
        why: pct === undefined ? (omitted.get(l.securityKey) ?? "Awaiting a quote") : null };
    });
    const weighed = children.filter((c) => c.dayChangePct !== null && c.weightPct != null && c.weightPct > 0);
    const w = weighed.reduce((a, c) => a + c.weightPct!, 0);
    vehicles.push({
      key: `fund:${f.fund}`, kind: "fund", basis: w > 0 ? "derived" : "none",
      name: f.fund, sub: [...owners].join(", "),
      value: f.unitsValue,
      dayChangePct: w > 0 ? weighed.reduce((a, c) => a + c.weightPct! * c.dayChangePct!, 0) / w : null,
      dayChange: null,
      covered: w, coverageOf: f.pctCovered,
      pricedLines: weighed.length, lines: children.length, asOf: f.asOf,
      why: w > 0 ? null : "No company this fund disclosed carries a live day move",
      children: children.sort((a, b) => (b.weightPct ?? -Infinity) - (a.weightPct ?? -Infinity)),
    });
  }
  const silentByKey = new Map<string, Position[]>();
  for (const p of aifRows) {
    if (disclosingKeys.has(p.securityKey)) continue;
    const list = silentByKey.get(p.securityKey) ?? [];
    list.push(p);
    silentByKey.set(p.securityKey, list);
  }
  for (const [key, ps] of silentByKey) {
    vehicles.push({
      key: `fund:${key}`, kind: "fund", basis: "none",
      name: securityLabel(key, ps[0].security),
      sub: [...new Set(ps.map((p) => idx.get(p.accountId)?.owner).filter(Boolean) as string[])].join(", "),
      value: ps.reduce((a, p) => a + p.marketValue, 0),
      dayChangePct: null, dayChange: null, covered: 0, coverageOf: 0,
      pricedLines: 0, lines: 0, asOf: null,
      why: "An AIF publishes no daily NAV, and this one discloses no portfolio this book can join",
      children: [],
    });
  }

  return {
    rows: [...rows.values()],
    vehicles,
    session: mv.session !== null || !mv.rows.length ? session : mv.session,
    observedFrom: observations.length ? new Date(observations[0]).toISOString() : null,
    observedTo: observations.length ? new Date(observations[observations.length - 1]).toISOString() : null,
    omitted,
    scopeSymbols,
    companies: new Set([...mandateKeys, ...disclosedKeys]).size,
    mandate: {
      positions: mandate.length, names: mandateKeys.size,
      value: mandate.reduce((a, p) => a + p.marketValue, 0),
      priced: [...mandateKeys].filter((k) => rows.has(k)).length,
      pricedValue: priced.reduce((a, p) => a + p.marketValue, 0),
      unpriced: [...unpricedMandate].map(([security, value]) => ({ security, value }))
        .sort((a, b) => b.value - a.value),
    },
    fund: {
      funds: new Set(aifRows.map((p) => p.securityKey)).size,
      value: aifRows.reduce((a, p) => a + p.marketValue, 0),
      disclosing: disclosed.map((f) => ({
        fund: f.fund, asOf: f.asOf, value: f.unitsValue, pctCovered: f.pctCovered,
        lines: f.lines.length,
        priced: f.lines.filter((l) => pctByKey.has(l.securityKey)).length,
        pricedPct: f.lines.filter((l) => pctByKey.has(l.securityKey))
          .reduce((a, l) => a + (l.pctNetAssets ?? 0), 0),
      })).sort((a, b) => b.value - a.value),
      silent: [...silent].map(([fund, value]) => ({ fund, value })).sort((a, b) => b.value - a.value),
      unpriced: unpriced.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)),
      derivedValue, verified, vacuous,
    },
  };
}
