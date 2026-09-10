// MUTUAL FUND DATA — NAV, its daily change, returns and what the scheme holds —
// read at runtime from the committed store `npm run build-lookthrough` writes
// out of a READ-ONLY checkout of the family's own `techmuns/amfibeas` repo.
//
// It is fetched rather than bundled for the same reason `ledger.ts` fetches the
// audit archive: it is ~300 KB across 20 schemes and only one of them is ever
// wanted at a time, on a page that may never be opened.
//
// ── THE PROVENANCE IS NOT THE BOOK'S, AND EVERY CALLER MUST SAY SO ──────────
//
// Everything else on this site traces to the statement of the institution that
// struck the figure. These holdings trace to the AMC's own monthly SEBI
// portfolio disclosure, as a third party (rupeevest) aggregates it. That is a
// real source and a different one, so:
//
//   • it is never summed into a book total or a concentration figure — the
//     fund's value stays whole, exactly as it did before this store existed.
//     THIS LINE USED TO SAY "an allocation, a sector split" TOO, and it stopped
//     being true when the family asked for a Consolidated sector composition
//     "based on the aggregate securities weightage as per the data from the
//     security filter in the holdings in portfolio monitor" — the Total exposure
//     column, which is this. That is the same widening they made on the holdings
//     table, having been shown the two halves apart first. It is fenced the same
//     way rather than by being refused: `companyExposure` below keeps the two
//     halves as separate fields to the last moment, the view is one a reader
//     picks rather than the default arithmetic of a page, and every surface that
//     adds them says which half is which. A comment asserting an enforcement
//     that no longer happens is worse than no enforcement, so it says what is
//     actually true;
//   • the scheme, the plan matched, and the portfolio's own as-of date ride on
//     every record so the screen can print them;
//   • `pctAum` is the PUBLISHED figure — a share of the FUND. The family's
//     exposure is derived from it here, by `familyValue`, and is labelled as
//     derived wherever it is rendered.
import type { Position } from "./types";
import { securityKeyOf } from "./securityKey";
import { resolveSector, UNCLASSIFIED } from "./sectors";
import nseSymbols from "@/data/nseSymbols.json";
import screenerSectors from "@/data/screenerSectors.json";

const KEY_TO_SYMBOL = nseSymbols as Record<string, string>;
const VENDOR_SECTORS = screenerSectors as Record<
  string,
  { gics: string; screenerSector: string; screenerBroadSector: string | null; screenerIndustry: string | null; joinedBy: string | null }
>;

export type LookthroughHolding = {
  name: string;
  /** Percent of the FUND's AUM, as the AMC disclosed it. */
  pctAum: number;
  /** Shares the FUND holds — not the family's. */
  shares: number | null;
  /** The underlying's own ISIN, where the AMC's filing gives one. */
  isin: string | null;
  /** The AMC's own sector label — not this book's GICS taxonomy. */
  sector: string | null;
};

/** The scheme's NAV and the move since the previous published one. */
export type FundNav = {
  value: number | null;
  date: string | null;
  prev: number | null;
  prevDate: string | null;
  changePct: number | null;
};

/**
 * ONE PERIOD'S RETURN, WITH THE WINDOW IT ACTUALLY SPANS.
 *
 * The label is the SOURCE's (`1M`, `3Y`) and the dates are the MEASUREMENT —
 * and on this data they do not always agree: Helios's `1M` runs 2026-06-19 to
 * 2026-09-01. So both travel together and the screen prints both, because a
 * period label rendered alone is the one figure here a reader could not check.
 * `kind` is the source's own basis: `simple` over a short window, `CAGR` where
 * it annualises.
 */
export type FundReturn = {
  value: number;
  kind: string | null;
  startDate: string | null;
  endDate: string | null;
  startNav: number | null;
  endNav: number | null;
};

export type FundPortfolio = {
  schemecode: string;
  scheme: string | null;
  /** AMFI's full scheme name, which states the plan in words. */
  amfiSchemeName: string | null;
  amc: string | null;
  plan: string | null;
  option: string | null;
  classification: string | null;
  isin: string | null;
  nav: FundNav;
  returns: Record<string, FundReturn>;
  returnsAsOf: string | null;
  fundAumCr: number | null;
  /** The disclosure's own date — NOT the family's statement date. */
  holdingsAsOf: string | null;
  /**
   * WHICH DOCUMENT THE HOLDINGS CAME FROM. `amc` is the fund house's own
   * monthly disclosure page; `aggregator` is a third party's copy of it. One is
   * the filing and the other is somebody's reading of the filing, so the card
   * names which.
   */
  holdingsSource: { kind: "amc" | "aggregator"; url: string | null } | null;
  /**
   * The section the source file covers. It is "Equity Holdings" on every one,
   * which is why a debt or liquid scheme has no rows: it holds no equity, and
   * its debt book is not in this store. The card says that rather than drawing
   * an empty table.
   */
  section: string | null;
  equity: LookthroughHolding[];
  counts: { equity: number };
};

export type SchemeMatch = {
  schemecode: string;
  scheme: string;
  /**
   * The plan this holding's own ISIN resolves to — so NAV and returns are the
   * family's plan, not a near neighbour's. Plans differ in expense ratio, and
   * therefore NAV, not in what the fund owns.
   */
  plan: string;
  isin: string | null;
  /** `isin` · `name` · `name+plan` — see the ingest's tiers. */
  matchedVia: string;
  navDate: string | null;
  holdingsAsOf: string | null;
  holdingsSource: "amc" | "aggregator" | null;
};

type Index = {
  source: Record<string, string>;
  schemes: Record<string, SchemeMatch>;
  unresolved: { securityKey: string; name: string; isin: string | null; reason: string }[];
};

/** `undefined` = still loading · `null` = the store did not respond. */
export type LookthroughState =
  | { status: "loading" }
  | { status: "unreachable" }
  /** The store answered and carries no look-through for this holding. */
  | { status: "none"; reason: string | null }
  | { status: "ok"; match: SchemeMatch; portfolio: FundPortfolio };

const base = () => `${import.meta.env.BASE_URL}lookthrough`;

let indexOnce: Promise<Index | null> | null = null;
const loadIndex = (): Promise<Index | null> => {
  if (!indexOnce) {
    indexOnce = fetch(`${base()}/index.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .catch(() => null);
  }
  return indexOnce;
};

/**
 * The portfolio behind one holding, or the reason there is none.
 *
 * A HOLDING THE STORE DOES NOT COVER IS NOT AN ERROR. Most of them are not funds
 * at all, and a fund can be genuinely unresolved — the caller gets `none` with
 * the store's own reason where it recorded one, and renders an absence rather
 * than a failure. Only a store that does not answer is `unreachable`, which is
 * a fact about the fetch and is worded as one.
 */
export async function loadLookthrough(securityKey: string): Promise<LookthroughState> {
  const idx = await loadIndex();
  if (!idx) return { status: "unreachable" };
  const match = idx.schemes?.[securityKey];
  if (!match) {
    const miss = idx.unresolved?.find((u) => u.securityKey === securityKey);
    return { status: "none", reason: miss?.reason ?? null };
  }
  try {
    const r = await fetch(`${base()}/${match.schemecode}.json`, { cache: "no-store" });
    if (!r.ok) return { status: "unreachable" };
    return { status: "ok", match, portfolio: (await r.json()) as FundPortfolio };
  } catch {
    return { status: "unreachable" };
  }
}

/**
 * THE FAMILY'S SHARE OF ONE UNDERLYING COMPANY — derived, and labelled as such
 * wherever it renders.
 *
 * `pctAum` is a share of the FUND, so this is the family's holding value times
 * that share. It is NOT a figure anybody disclosed about this family, and two
 * things follow that the caller must honour: it is stated as a look-through
 * rather than a position, and it is never added to a book total, which would
 * double-count the fund's own value that is already in the NAV.
 *
 * The two sides are also dated differently — the disclosure is monthly and the
 * holding is valued on its statement's date — so the screen prints both dates.
 */
export const familyValue = (holdingValue: number, pctAum: number): number =>
  (holdingValue * pctAum) / 100;

/**
 * Sum of the disclosed EQUITY weights.
 *
 * It does not reach 100% and is not meant to: the store carries the equity
 * section alone, so a fund's cash and debt sleeves are outside it, as is its own
 * rounding. The card prints this total and names what the remainder is, rather
 * than implying the rows account for the whole scheme.
 */
export const disclosedWeight = (pf: FundPortfolio): number =>
  pf.equity.reduce((a, h) => a + (h.pctAum ?? 0), 0);

/** Whether a holding could ever have a look-through — mirrors the ingest. */
export const canHaveLookthrough = (p: Position): boolean =>
  p.assetClass === "Mutual Fund" || p.assetClass === "ETF";

/**
 * ── THE INVERSE QUESTION: WHICH OF MY FUNDS HOLD THIS NAME? ─────────────────
 *
 *   "If today I want to know that my public market portfolio is a thousand
 *    crores, how much HDFC Bank do I hold in my 1,000 crores? … Then I drill
 *    down, then you tell me direct you hold X Cr through direct equity, and then
 *    you hold another Y crores through these five funds."
 *
 * `loadLookthrough` above answers "what does THIS FUND hold". This answers the
 * other direction, which is the one that question actually asks: given a company
 * and the schemes the family holds, which of them disclose it and what is the
 * family's derived share of each.
 *
 * FOUR THINGS THIS IS NOT, and every one of them is printed beside the figure:
 *
 *   • IT IS NOT A POSITION. `pctAum` is a share of the FUND, disclosed by the
 *     AMC about the fund. The family's exposure is DERIVED from it (`familyValue`)
 *     and is never a holding anybody reported about this family.
 *   • IT IS NEVER ADDED TO A BOOK TOTAL, an allocation or a concentration
 *     figure. The fund's own value already stands for it in the NAV, so summing
 *     both counts the same money twice — the rule this whole store is fenced by.
 *   • IT IS EQUITY-ONLY AND PARTIAL. The store carries the equity section alone,
 *     covers mutual funds and not AIF folios, and leaves a scheme it could not
 *     resolve out entirely. The caller is handed `covered` / `total` and the
 *     names it skipped so it can say which, rather than implying completeness.
 *   • IT IS DATED DIFFERENTLY FROM THE BOOK. A disclosure is monthly; the
 *     holding is valued on its own statement's date. Both ride on every row.
 *
 * THE JOIN IS EXACT OR IT DOES NOT HAPPEN — ISIN first, then this book's own
 * `securityKey` over the disclosed name. There is deliberately no fuzzy tier:
 * a token-overlap rule on this corpus matched KIRANAKART to TATA TECHNOLOGIES
 * and MAN INDUSTRIES to Deep Industries, and inventing an exposure to a company
 * the family does not hold is worse than reporting none.
 */
export type FundExposureRow = {
  /** The FUND's key in this book — what the family actually holds. */
  fundKey: string;
  fundName: string;
  /** What the family holds of the FUND, from its own statement. */
  holdingValue: number;
  /** The disclosed share of the FUND that is this company. */
  pctAum: number;
  /** DERIVED: holdingValue x pctAum. Never a reported figure. */
  value: number;
  /**
   * How the disclosed row was KEYED — never a guess.
   *
   * `isin` means the row carried one and was joined on it, which is the only
   * tier that can bridge a depository's `SBI - EQ` to an AMC's `State Bank of
   * India`. `name` means it carried none and was keyed through this book's own
   * `securityKeyOf`. A reader judging whether to trust a line needs to know
   * which, so it rides on every row rather than being averaged into a badge.
   */
  via: "isin" | "name";
  /** The AMC's own industry label for this line, verbatim — never this book's. */
  sector: string | null;
  holdingsAsOf: string | null;
  sourceKind: string | null;
};

/** A vehicle the family holds that this store could not speak for, and why. */
export type FundExposureSkip = {
  fundKey: string;
  fundName: string;
  marketValue: number;
  reason: string;
};

/** One fund the family holds, as the caller sees it in the book. */
export type HeldFund = {
  securityKey: string;
  name: string;
  marketValue: number;
  assetClass: string;
};

/** One company, and the family's DERIVED exposure to it through the funds. */
export type StockExposure = {
  /** The canonical key — the book's own where the book holds the company. */
  key: string;
  name: string;
  isin: string | null;
  rows: FundExposureRow[];
  /** Σ rows.value. Derived, and never added to a book total by this module. */
  total: number;
  /**
   * THE COMPANY'S GICS SECTOR, resolved from what the AMCs filed — or null.
   *
   * A disclosure prints the AMFI/SEBI INDUSTRY label ("Pharmaceuticals &
   * Biotechnology", "Capital Markets"), and `shared/sectors.mjs` is the one
   * committed map that turns a provider's label into a GICS sector. It is the
   * same map and the same function `build-book` resolves the book's own
   * positions through, so a company held directly and the same company held
   * inside a scheme cannot land in two different sectors.
   *
   * NULL WHERE THE FILINGS DO NOT AGREE OR THE LABEL IS NOT IN THE MAP. Several
   * schemes disclose the same company and each prints its own label; where those
   * resolve to more than one sector there is no answer to pick between them, and
   * picking one would be the index-cycled-classification failure with a fund's
   * letterhead on it. A caller renders these as Unclassified and counts them.
   *
   * A caller that also holds the company in the BOOK should prefer the BOOK's
   * sector: that one is the family's own statement rather than a third party's
   * reading of a fund's filing. `companyExposure` below does exactly that.
   */
  sector: string | null;
};

export type StockExposureState =
  | { status: "loading" }
  | { status: "unreachable" }
  | {
      status: "ok";
      /** canonical key → the company's derived exposure across every fund. */
      byKey: Map<string, StockExposure>;
      /** Derived equity across every fund the store could speak for. */
      total: number;
      covered: number;
      considered: number;
      skipped: FundExposureSkip[];
      /** Value of the funds this store DID speak for. */
      disclosedValue: number;
      /** Value of the funds it could not — the AIF block, and any unresolved scheme. */
      skippedValue: number;
      /**
       * `disclosedValue - total`: the part of a disclosed fund that is NOT
       * disclosed equity — its cash and debt sleeves, a gold or silver ETF's
       * metal, and the disclosure's own rounding. Named rather than dropped,
       * because a reader who sees only the equity half reads the remainder as
       * missing rather than as something else.
       */
      nonEquityValue: number;
    };

/**
 * ── ONE COMPANY, BOTH HALVES, AND ITS SECTOR — read by every surface that adds
 *    the measured and derived sides together ──────────────────────────────────
 *
 * The Portfolio Monitor's stock axis and Sector Composition's Consolidated view
 * are the same question asked twice: what is this family's exposure to a
 * COMPANY, counting the shares their statements report and the shares their
 * funds disclose. Two implementations of that would be two chances for one
 * screen to put a company in a sector the other puts somewhere else, or to size
 * it differently — which is the failure `holdingBucket`, `costCoversSet` and
 * `accountHasOpeningValue` were each extracted for.
 *
 * THE TWO HALVES STAY SEPARATE FIELDS. `measured` is what a document says; only
 * `total` adds the derived half in, so a caller can print either and can never
 * blend them by accident.
 *
 * THE BOOK'S OWN SECTOR WINS WHERE IT HAS ONE. That comes from the family's own
 * statement through `build-book`; the disclosed one is a third party's reading
 * of somebody else's filing. But "Unclassified" is the ABSENCE of an answer
 * rather than an answer, so a book row that carries it falls through to the
 * disclosed sector rather than overriding it with nothing.
 */
export type CompanyExposure = {
  key: string;
  name: string;
  isin: string | null;
  /** Σ market value of the positions the statements report. Never derived. */
  measured: number;
  /** Σ the funds' disclosed share. Derived, and no part of the book's NAV. */
  derived: number;
  /** `measured + derived` — the figure the family asked to be ranked on. */
  total: number;
  /** GICS. Three tiers, strongest first — see `sectorFrom`. */
  sector: string;
  /**
   * WHICH SOURCE PLACED THIS COMPANY, so a caller can count each and a reader
   * is never left to assume. The order is the strength of the evidence and
   * nothing else:
   *
   *   `book`       the family's OWN statement printed a sector for this holding.
   *   `disclosure` a fund they hold filed one against the same ISIN with SEBI.
   *   `vendor`     screener.in publishes one against the NSE symbol NSE itself
   *                issued (`npm run build-sectors`).
   *
   * A LOWER TIER ONLY EVER FILLS AN EMPTY SECTOR — it can never overrule a
   * statement. Measured on the 84 company shares where the book and the vendor
   * both have an answer, they agree on 80; the four that differ are taxonomy
   * judgements (GICS files a cinema under Communication Services and several
   * Indian providers under Consumer Discretionary) and the STATEMENT keeps its
   * answer on every one of them. `docs/SCREENER-SECTORS.md` names them.
   */
  sectorFrom: "book" | "disclosure" | "vendor" | null;
  /** The book rows behind `measured`, for a drill-down. Empty on a derived-only company. */
  positions: Position[];
};

/**
 * The symbol a company resolves to: the one its own statement printed where it
 * did, and `build-symbols`' committed bridge otherwise. Never a name search —
 * `nseSymbols.json` is itself resolved ISIN-first against NSE's own masters.
 */
function symbolFor(key: string, positions: Position[]): string | null {
  for (const p of positions) if (p.symbol) return p.symbol;
  return KEY_TO_SYMBOL[key] ?? null;
}

export function companyExposure(
  /** Consolidated COMPANY SHARES — a sector is a property of a company. */
  positions: Position[],
  exposure: StockExposureState,
): CompanyExposure[] {
  const byKey = new Map<string, CompanyExposure>();
  for (const p of positions) {
    const e = byKey.get(p.securityKey) ?? {
      key: p.securityKey, name: p.security, isin: p.isin ?? null,
      measured: 0, derived: 0, total: 0,
      sector: UNCLASSIFIED, sectorFrom: null, positions: [] as Position[],
    };
    e.measured += p.marketValue;
    e.positions.push(p);
    if (!e.isin && p.isin) e.isin = p.isin;
    if (e.sectorFrom !== "book" && p.sector && p.sector !== UNCLASSIFIED) {
      e.sector = p.sector; e.sectorFrom = "book";
    }
    byKey.set(p.securityKey, e);
  }
  if (exposure.status === "ok") {
    for (const x of exposure.byKey.values()) {
      const e = byKey.get(x.key) ?? {
        key: x.key, name: x.name, isin: x.isin,
        measured: 0, derived: 0, total: 0,
        sector: UNCLASSIFIED, sectorFrom: null, positions: [] as Position[],
      };
      e.derived += x.total;
      if (!e.isin && x.isin) e.isin = x.isin;
      if (e.sectorFrom === null && x.sector) { e.sector = x.sector; e.sectorFrom = "disclosure"; }
      byKey.set(x.key, e);
    }
  }
  /**
   * ── TIER 3, AND IT RUNS LAST BECAUSE IT IS THE WEAKEST EVIDENCE ────────────
   *
   * A depository statement prints an ISIN, a quantity and a rate and NO
   * industry, so before this every company the family bought in its own demat
   * reached the sector table unplaced — 37 of 37 on the Direct Equity view, a
   * single grey wedge covering the whole of it.
   *
   * `screenerSectors.json` is keyed on the NSE symbol and generated by
   * `npm run build-sectors`, which fetches each company's page, REQUIRES it to
   * name the symbol back, and resolves the label through `shared/sectors.mjs` —
   * the same committed table `build-book` resolves the book's own labels
   * through. Nothing here infers a sector; this reads one somebody published.
   */
  for (const e of byKey.values()) {
    if (e.sectorFrom !== null) continue;
    const symbol = symbolFor(e.key, e.positions);
    const hit = symbol ? VENDOR_SECTORS[symbol] : undefined;
    if (hit && hit.gics && hit.gics !== UNCLASSIFIED) { e.sector = hit.gics; e.sectorFrom = "vendor"; }
  }
  for (const e of byKey.values()) e.total = e.measured + e.derived;
  return [...byKey.values()].sort((a, b) => b.total - a.total);
}

/** The scheme portfolios, memoised: the index must not refetch 20 files per render. */
const portfolioCache = new Map<string, Promise<FundPortfolio | null>>();
const loadPortfolio = (schemecode: string): Promise<FundPortfolio | null> => {
  let hit = portfolioCache.get(schemecode);
  if (!hit) {
    hit = fetch(`${base()}/${schemecode}.json`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<FundPortfolio>) : null))
      .catch(() => null);
    portfolioCache.set(schemecode, hit);
  }
  return hit;
};

/**
 * WHY AN AIF IS SKIPPED IS A FACT ABOUT THE INSTRUMENT, NOT A GAP IN THIS STORE.
 *
 * A mutual fund and an ETF file a monthly SEBI portfolio disclosure; the store
 * carries one for 21 of the 22 this book holds. An AIF files nothing that joins
 * to a folio the family holds, so no drop of the current statements can ever
 * fill it — and told the generic "no disclosure here" a reader goes looking for
 * a store fix that cannot exist. The two send someone to completely different
 * places, which is `upstreamStatus.ts`'s rule arriving through a fund.
 */
const skipReason = (f: HeldFund, indexReason: string | null): string =>
  f.assetClass === "AIF"
    ? "an AIF files no monthly portfolio disclosure that joins to a folio this family holds, so what it owns is not reported to this book at all"
    : indexReason ?? "this store carries no portfolio disclosure for this holding";

/**
 * ── THE INVERSE QUESTION, ANSWERED FOR THE WHOLE BOOK AT ONCE ───────────────
 *
 *   "If today I want to know that my public market portfolio is a thousand
 *    crores, how much HDFC Bank do I hold in my 1,000 crores? … Then I drill
 *    down, then you tell me direct you hold X Cr through direct equity, and then
 *    you hold another Y crores through these five funds."
 *
 * `loadLookthrough` above answers "what does THIS FUND hold". This answers the
 * other direction for EVERY company at once: given the schemes the family holds,
 * which companies do they disclose and what is the family's derived share.
 *
 * IT IS ONE INDEX RATHER THAN ONE CALL PER COMPANY, AND THAT IS THE POINT. The
 * table's row figure and the figure inside that row's expansion are now read
 * from the same map, so they cannot disagree — the failure `drilldown.ts` exists
 * to stop for the book's own numbers, arriving through a derived one. It costs
 * no more than a single expansion did: the same 21 files, memoised.
 *
 * FOUR THINGS THIS IS NOT, and every one of them is printed beside the figure:
 *
 *   • IT IS NOT A POSITION. `pctAum` is a share of the FUND, disclosed by the
 *     AMC about the fund. The family's exposure is DERIVED from it and was
 *     never a holding anybody reported about this family.
 *   • IT IS NEVER ADDED TO NAV, an allocation or a concentration figure. The
 *     fund's own value already stands for it in the book, so summing both counts
 *     the same money twice — the rule this whole store is fenced by. A caller
 *     that shows it beside the book's own figure must say which is which.
 *   • IT IS EQUITY-ONLY AND PARTIAL. `skipped`, `skippedValue` and
 *     `nonEquityValue` are returned so a caller can state exactly what it does
 *     not cover, rather than implying completeness.
 *   • IT IS DATED DIFFERENTLY FROM THE BOOK. A disclosure is monthly; a holding
 *     is valued on its own statement's date. Both ride on every row.
 *
 * THE JOIN IS EXACT OR IT DOES NOT HAPPEN. A disclosed row carrying an ISIN is
 * keyed on it — mapped to the BOOK's own key where the book holds that ISIN, so
 * a depository's `SBI - EQ` and an AMC's `State Bank of India` become one row —
 * and otherwise through this book's own `securityKeyOf`. There is deliberately
 * no fuzzy tier: a token-overlap rule on this corpus matched KIRANAKART to TATA
 * TECHNOLOGIES and MAN INDUSTRIES to Deep Industries, and inventing an exposure
 * to a company the family does not hold is worse than reporting none.
 *
 * WHAT THAT LEAVES, STATED RATHER THAN PAPERED OVER: a book row with no ISIN and
 * a depository's furniture in its name (`RBL BNK-EQ RE 10`) cannot be reached by
 * either tier, so its fund exposure would stand as a SEPARATE row rather than
 * joining it. The caller counts those and says so.
 */
export async function loadStockExposure(
  funds: HeldFund[],
  isinToBookKey: ReadonlyMap<string, string>,
  /**
   * ── THE RING-FENCE REACHES THE DERIVED SIDE TOO ────────────────────────────
   *
   *   "Polycab must not be included in any data set information and any
   *    calculation in any other part of the dashboard."
   *
   * That decision is applied at the BOOK layer, which takes the promoter block
   * out of `BOOK_POSITIONS` — and it would not have held here, because the fence
   * is about a SECURITY and a mutual fund the family holds discloses that same
   * company. Measured on this book: ₹88,891 of Polycab India inside a scheme,
   * which would have drawn a Polycab row on a page the fence says must not name
   * it at all.
   *
   * IT IS DROPPED SILENTLY AND NOT NAMED, which is the one place this file
   * departs from "an absence is stated". Naming it would put the word on the
   * page, which is precisely what the family asked to be rid of. The decision is
   * recorded in CLAUDE.md instead, where the rest of the fence is.
   *
   * Keyed on the ISIN as well as the key, because they do not agree: the
   * depository prints `POLYCAB INDIA LIMITED - EQ` and an AMC files `Polycab
   * India Ltd.`, so the fenced key and the disclosed one normalise apart and
   * only the identifier bridges them.
   */
  ringFenced: { keys: ReadonlySet<string>; isins: ReadonlySet<string> } = { keys: new Set(), isins: new Set() },
): Promise<StockExposureState> {
  const idx = await loadIndex();
  if (!idx) return { status: "unreachable" };

  const loaded = await Promise.all(
    funds.map(async (f) => {
      const match = idx.schemes?.[f.securityKey];
      if (!match) {
        const miss = idx.unresolved?.find((u) => u.securityKey === f.securityKey);
        return { f, pf: null as FundPortfolio | null, skip: skipReason(f, miss?.reason ?? null) };
      }
      const pf = await loadPortfolio(match.schemecode);
      return pf
        ? { f, pf, skip: null as string | null }
        : { f, pf: null as FundPortfolio | null, skip: "the store did not answer for this scheme" };
    }),
  );

  const byKey = new Map<string, StockExposure>();
  const skipped: FundExposureSkip[] = [];
  /** An ISIN the BOOK does not carry still keys consistently across funds. */
  const isinSeen = new Map<string, string>();
  /**
   * ── AND A NAME AN AMC FILED *WITH* AN ISIN KEYS THE SAME AS ONE IT DID NOT ──
   *
   * 18% of the disclosed lines carry no ISIN, and the same company arrives both
   * ways: one scheme files `ICICI Bank Ltd.` with INE090A01021, another files
   * `ICICI Bank Ltd.` with nothing. On a single pass the first lands on the
   * BOOK's key (`icici-bank-eq`, joined by identifier) and the second on its own
   * normalised name — so the family's own question, how much of this company do
   * I hold, gets two answers. Measured: it split ICICI Bank, State Bank of
   * India, Axis Bank and IndusInd Bank.
   *
   * So the ISIN-BEARING FILINGS ARE READ FIRST and each records the key for its
   * normalised name; an ISIN-less filing of that name then follows it. The
   * evidence is the store's own — one AMC supplied the identifier for the name
   * another omitted — so this is not a fuzzy tier and not a re-derivation of the
   * BOOK's identity. Where no filing carries an ISIN, the name still stands
   * alone, exactly as before.
   */
  const nameToKey = new Map<string, string>();
  for (const { pf } of loaded) {
    if (!pf) continue;
    for (const h of pf.equity ?? []) {
      const isin = (h.isin ?? "").trim().toUpperCase();
      if (!isin || !(h.pctAum > 0)) continue;
      const nameKey = securityKeyOf(h.name);
      if (!nameKey || ringFenced.isins.has(isin) || ringFenced.keys.has(nameKey)) continue;
      const key = isinToBookKey.get(isin) ?? isinSeen.get(isin) ?? nameKey;
      if (!isinToBookKey.has(isin)) isinSeen.set(isin, key);
      if (!nameToKey.has(nameKey)) nameToKey.set(nameKey, key);
    }
  }
  let covered = 0;
  let total = 0;
  let disclosedValue = 0;
  let skippedValue = 0;

  for (const { f, pf, skip } of loaded) {
    if (!pf) {
      skipped.push({ fundKey: f.securityKey, fundName: f.name, marketValue: f.marketValue, reason: skip! });
      skippedValue += f.marketValue;
      continue;
    }
    covered += 1;
    disclosedValue += f.marketValue;
    // ONE DISCLOSED LINE PER FUND PER COMPANY. A scheme listing two share
    // classes of one company would otherwise contribute twice to that name.
    const takenHere = new Set<string>();
    for (const h of pf.equity ?? []) {
      if (!(h.pctAum > 0)) continue;
      const isin = (h.isin ?? "").trim().toUpperCase() || null;
      const nameKey = securityKeyOf(h.name);
      if (!nameKey) continue;
      if ((isin && ringFenced.isins.has(isin)) || ringFenced.keys.has(nameKey)) continue;
      let key: string;
      if (isin) {
        key = isinToBookKey.get(isin) ?? isinSeen.get(isin) ?? nameKey;
        if (!isinToBookKey.has(isin)) isinSeen.set(isin, key);
      } else {
        key = nameToKey.get(nameKey) ?? nameKey;
      }
      if (takenHere.has(key)) continue;

      const value = familyValue(f.marketValue, h.pctAum);
      // A FUND THE FAMILY HOLDS AT ₹0 GIVES ₹0 OF EVERYTHING INSIDE IT. Five
      // schemes here are redeemed to nil, and carrying their disclosed lines
      // would draw 40 companies at an exposure of exactly nothing — a COMPUTED
      // zero, so not a fabrication, but a row that says the family holds a
      // company when what it holds is none of it. The line is dropped; a company
      // any funded scheme also discloses keeps that scheme's share.
      if (!(value > 0)) continue;
      takenHere.add(key);
      total += value;
      const e = byKey.get(key) ?? { key, name: h.name, isin, rows: [], total: 0, sector: null };
      e.rows.push({
        fundKey: f.securityKey,
        fundName: f.name,
        holdingValue: f.marketValue,
        pctAum: h.pctAum,
        value,
        via: isin ? "isin" : "name",
        sector: h.sector ?? null,
        holdingsAsOf: pf.holdingsAsOf ?? null,
        sourceKind: pf.holdingsSource?.kind ?? null,
      });
      e.total += value;
      if (!e.isin && isin) e.isin = isin;
      byKey.set(key, e);
    }
  }

  for (const e of byKey.values()) {
    e.rows.sort((a, b) => b.value - a.value);
    // Every GICS sector the filings for this company agree on. One means an
    // answer; none or several means there is not one, and null says so.
    const agreed = new Set<string>();
    for (const r of e.rows) {
      const hit = r.sector ? resolveSector(r.sector) : null;
      if (hit?.matchedBy) agreed.add(hit.sector);
    }
    e.sector = agreed.size === 1 ? [...agreed][0] : null;
  }
  return {
    status: "ok",
    byKey,
    total,
    covered,
    considered: funds.length,
    skipped,
    disclosedValue,
    skippedValue,
    nonEquityValue: disclosedValue - total,
  };
}
