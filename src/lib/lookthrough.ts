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
import { displayFiledName, stripFilingMarks } from "./format";
import { currentHoldings, isCompanyShare, isFundVehicle } from "./analytics";
import { UPSTOX_INSTRUMENTS } from "../../shared/upstoxInstruments.mjs";
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
  /** Shares the FUND holds — not the family's. Absent on a debt line. */
  shares: number | null;
  /** The underlying's own ISIN. Present on every row the AMC filed. */
  isin: string | null;
  /**
   * WHAT THE INSTRUMENT IS, as the AMC filed it — `Equity`, `Debt`, `Other`,
   * `Gold`, `Silver`, `Cash & equiv`. The store used to carry the equity
   * section alone, so this had no reason to exist and a liquid fund had no rows
   * at all; it is what lets an NCD, a commercial paper and a share of one issuer
   * be told apart on the row that sums them.
   */
  assetClass: string | null;
  /** The AMC's own sector label — not this book's GICS taxonomy. Equity only. */
  sector: string | null;
  /**
   * THE CREDIT RATING ON A DEBT LINE, and never in the sector column.
   *
   * The AMC files both under one `industry` heading — `Finance` on a share,
   * `CRISIL - AAA` on a bond — so publishing them under one name would print a
   * rating where a reader reads a sector. Split on the row's own class at
   * ingest; each renders under its own heading.
   */
  rating: string | null;
  /** The FUND's own market value in this line, in ₹ crore, where it filed one. */
  marketValueCr: number | null;
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
   * WHAT THE PUBLISHED ROWS COVER — `Whole portfolio` where the AMC filed every
   * asset class, `Equity Holdings` where only the equity read of that filing
   * exists. Two of this book's schemes are the second, and the card says which
   * rather than letting a reader take an equity list for the whole fund.
   */
  section: string | null;
  /**
   * THE AMC'S OWN FIGURE FOR HOW MUCH OF THE SCHEME THE ROWS ACCOUNT FOR.
   *
   * Never 100, and not meant to be: a filing rounds and holds cash it does not
   * itemise. 89% to 99% across this book. Printed rather than implied, because
   * rows that add to 94% of a fund under no caption read as the whole of it.
   */
  coveragePct: number | null;
  /** The filing's own class split, as it stated it. */
  allocation: { class: string; pct: number }[] | null;
  holdings: LookthroughHolding[];
  counts: { holdings: number; byClass: Record<string, number> };
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
  /**
   * THE NAV AND ITS DAY MOVE, IN THE INDEX ITSELF.
   *
   * A page showing ONE fund could fetch the scheme's own file for this; a card
   * showing EVERY fund at once cannot — 20 scheme files is 632 KB, on the
   * landing page, to render 20 numbers. It rides here instead, at ~120 bytes a
   * scheme, so `loadFundNavs` is one fetch.
   *
   * OPTIONAL BECAUSE A STORE PREDATING IT IS NOT A BROKEN STORE. Absent, a
   * caller has a scheme with no NAV and says so, exactly as it does for a
   * holding the store never resolved.
   */
  nav?: FundNav;
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
 * ── EVERY SCHEME'S NAV, IN ONE FETCH ────────────────────────────────────────
 *
 * `loadLookthrough` answers "what does THIS fund hold" and pulls the scheme's
 * own 30 KB file to do it. Morning CIO's daily-NAV movers asks the opposite
 * question — "what did EVERY fund's NAV do" — over 20 schemes at once, and
 * pulling those files would cost 632 KB on the landing page.
 *
 * The index carries `nav` for exactly that, so this is one request, memoised
 * beside the index itself. Keyed on `securityKey`, so a caller joins on the
 * book's own identity rather than on a scheme code it would have to look up.
 *
 * A STORE THAT DOES NOT ANSWER RETURNS NULL, NOT AN EMPTY MAP. An empty map is
 * "the store answered and knows no NAVs", which is a claim about the funds; a
 * failed fetch is a fact about the fetch, and the two send a reader to
 * completely different places.
 */
export async function loadFundNavs(): Promise<Map<string, SchemeMatch> | null> {
  const idx = await loadIndex();
  if (!idx) return null;
  return new Map(Object.entries(idx.schemes ?? {}));
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
 * Sum of the disclosed weights, over every instrument the filing carries.
 *
 * It does not reach 100% and is not meant to — see `coveragePct`, which is the
 * AMC's own statement of the same gap. The card prints both rather than
 * implying the rows account for the whole scheme.
 */
export const disclosedWeight = (pf: FundPortfolio): number =>
  (pf.holdings ?? []).reduce((a, h) => a + (h.pctAum ?? 0), 0);

/**
 * ── ONE ISSUER, HOWEVER MANY INSTRUMENTS IT FILED ──────────────────────────
 *
 * *"It could be a bond. It could be an NCD. If I type it, it has to first pick
 * up… I want to see how much LIC housing I hold through my mutual fund exposure
 * and through which mutual fund."*
 *
 * LIC Housing Finance is inside six of this family's funds under FOURTEEN
 * different ISINs — a share, twelve NCDs at different coupons and maturities,
 * and commercial paper. Keyed on the ISIN each line is its own company and the
 * answer to that question is 0.6%; keyed on the NAME the debt lines do not even
 * agree with each other, because an AMC files `7.95% LIC Housing Finance
 * Limited (29/01/2028) **` beside `LIC Housing Finance Ltd.^`.
 *
 * AN INDIAN ISIN CARRIES ITS ISSUER IN CHARACTERS 1-7. `INE115A` is LIC Housing
 * Finance whether the next two say `01` (equity), `07` (a debenture) or `14`
 * (commercial paper). That is a STRUCTURAL identifier, not a resemblance — the
 * same standing the ISIN tier already has over the name tiers here — and it
 * bridges spellings no name rule may: `NABARD` to `National Bank for
 * Agriculture and Rural Development`, `REC Limited.` to `Rural Electrification
 * Corporation`, on the identifier both filings print.
 *
 * MEASURED BEFORE IT WAS RELIED ON, because the failure it could cause is
 * merging two companies: across the store's 1,052 distinct ISINs it forms 557
 * issuer groups, 34 of which carry more than one spelling — and every one of
 * those 34 is one company written two ways. Not one merges two companies.
 */
export const issuerOf = (isin: string): string => isin.slice(0, 7).toUpperCase();

/**
 * ── THE ISSUER, NOT THE INSTRUMENT ──────────────────────────────────────────
 *
 *   *"Make sure that the name of all the entities is written correctly…
 *    Otherwise 2 separate names of the same company does not make sense."*
 *
 * A fund's filing names every debt line by the INSTRUMENT — its coupon, its
 * maturity and the filer's footnote marks: `8.30% Aditya Birla Capital Ltd.
 * (16/09/2026) **`, `7.18% GOI MAT 140833`, `91 DAY T-BILL 05.11.26`. The issuer
 * tier made those one ROW per issuer, and named the row by whichever line was
 * shortest — so a company the family holds as a share showed up a second time,
 * in the pick-list and on the table, under one of its certificates of deposit:
 * `Karur Vysya Bank Ltd. (17/11/2026) **#` beside `Karur Vysya Bank Ltd.`.
 *
 * This removes what names the INSTRUMENT and leaves what names the ISSUER: the
 * coupon, a bracketed or trailing maturity, `(ZCB)`, the `MAT`/`ISD` date codes
 * government paper carries, a dangling dash and the footnote marks. It only
 * ever REMOVES, like `stripDepositoryTail`, and it is for the ROW's name and
 * its join — the instrument lines under a row keep their own names, because
 * there the coupon and the maturity ARE the name. A bracket that is not a date
 * stays: `Tata Teleservices (Maharastra) Ltd.` is a different company from
 * `Tata Teleservices Ltd.`, and the date rule cannot reach it.
 */
export function issuerNameOf(name: string): string {
  const raw = stripFilingMarks(String(name ?? ""));
  const out = stripFilingMarks(
    raw
      // `7.95% …`, and the doubled `9.99% % Gujarat SDL` one AMC prints
      .replace(/^\s*\d+(?:\.\d+)?\s*%(?:\s*%)?\s*/, "")
      // `(29/01/2028)`, `(MD 04/02/2027)`
      .replace(/\(\s*(?:MD\s+)?\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\s*\)/gi, " ")
      .replace(/\(\s*ZCB\s*\)/gi, " ")
      // `MAT 140833`, `ISD 171225`, `MAT 19112026`
      .replace(/\b(?:MAT|ISD)\s*\d{6}(?:\d{2})?\b/gi, " ")
      // a trailing `05.11.26`
      .replace(/\s+\d{1,2}\.\d{1,2}\.\d{2,4}\s*$/, " "),
  ).replace(/\s+-\s*$/, "").replace(/\s{2,}/g, " ").trim();
  return out || raw;
}

/**
 * ── WHO ISSUED GOVERNMENT PAPER, SAID ONCE ──────────────────────────────────
 *
 * Government securities carry NO ISIN in this store — 177 lines, and not one —
 * so the issuer tier cannot group them and each bond stood as its own "company":
 * `Government of India (24/07/2037)`, `7.18% GOI MAT 140833`, `91 DAY T-BILL
 * 05.11.26` and `91 Days Treasury Bills` were twenty-odd rows for one issuer.
 * Four readings, each a DEFINITION rather than a resemblance:
 *
 *   • `GOI` is how one AMC spells the Government of India on every line, and
 *     `GOI STRIPS` are that government's own securities, stripped;
 *   • a TREASURY BILL is issued by the Government of India and nobody else;
 *   • an `SDL` is a State Development Loan — the state government's paper — and
 *     another AMC files the same issuers as `State Government of Maharashtra`;
 *   • a line carrying a government-security date code (`MAT 060848`) that names
 *     a state and no company is that state's loan without the word `SDL` —
 *     measured, exactly six lines, every one Madhya Pradesh or Maharashtra.
 *
 * `Government Securities`, which one filing prints with no issuer at all, is
 * deliberately NOT folded in: it does not say which government, and a heading
 * asserting one would be a classification nobody made. It stands as its own row.
 */
export function issuerKeyOf(name: string): string {
  const bare = issuerNameOf(name);
  if (/^(?:GOI|GOI\s+STRIPS|Government\s+of\s+India)$/i.test(bare)
    || /\b(?:T-?\s?BILLS?|TBILLS?|TREASURY\s+BILLS?)\b/i.test(bare)) return "government-of-india";
  const sdl = bare.match(/^(.+?)\s+SDL$/i);
  if (sdl) return `state-government-of-${securityKeyOf(sdl[1])}`;
  if (/\bMAT\s*\d{6}/i.test(String(name ?? "")) && !/\b(?:Ltd|Limited|Bank|Corp|Corporation|Finance|Co)\b/i.test(bare)) {
    return `state-government-of-${securityKeyOf(bare)}`;
  }
  return securityKeyOf(bare);
}

/**
 * ── WHICH ISIN IS THIS BOOK'S COMPANY — its own, or its listing's ────────────
 *
 * The look-through joins a fund's line to a company the book holds on the
 * ISIN, and it could only use an ISIN the book's own statements printed. A PMS
 * statement prints none, so every company the family holds ONLY through a
 * mandate — Jammu & Kashmir Bank, LIC, Great Eastern Shipping, Vedanta —
 * joined to nothing, and the same company stood twice: once as the book's row
 * and once as a fund's (`The Jammu & Kashmir Bank Limited`, and its CDs).
 *
 * THE LISTING SUPPLIES IT, through two joins this app already trusts with
 * money. `nseSymbols.json` is the book key's NSE trading symbol, which is what
 * the quote feed PRICES the holding by; `UPSTOX_INSTRUMENTS` is that symbol's
 * instrument in the price source's own list, `NSE_EQ|<ISIN>`, which the feed
 * must echo back before a price is used. A wrong link in that chain would
 * already be moving the family's market value, so reading the ISIN off it adds
 * no new trust — and it is still an identifier, never a name.
 *
 * THE BOOK'S OWN ISIN WINS. Where a statement printed one it is used as printed,
 * and a listing ISIN another book key already claims is refused rather than
 * reassigned: one security under two keys is the defect `build-book` counts,
 * and this must not manufacture it on the derived side.
 */
export function bookIsinBridge(positions: readonly Position[]): {
  index: Map<string, string>;
  fromListing: number;
  refused: string[];
} {
  const index = new Map<string, string>();
  for (const p of positions) {
    if (!isCompanyShare(p) || !p.isin) continue;
    const k = p.isin.trim().toUpperCase();
    if (k && !index.has(k)) index.set(k, p.securityKey);
  }
  let fromListing = 0;
  const refused: string[] = [];
  const seen = new Set<string>();
  for (const p of positions) {
    if (!isCompanyShare(p) || seen.has(p.securityKey)) continue;
    seen.add(p.securityKey);
    const sym = KEY_TO_SYMBOL[p.securityKey];
    const inst = sym ? UPSTOX_INSTRUMENTS[sym] : undefined;
    const isin = inst && /^NSE_EQ\|/.test(inst.key) ? inst.key.slice(7).trim().toUpperCase() : "";
    if (!/^IN[EF][A-Z0-9]{9}$/.test(isin)) continue;
    const owner = index.get(isin);
    if (owner === p.securityKey) continue;
    if (owner) { refused.push(`${p.securityKey} → ${isin} (already ${owner})`); continue; }
    index.set(isin, p.securityKey);
    fromListing++;
  }
  return { index, fromListing, refused };
}

/**
 * THE FUNDS THE LOOK-THROUGH READS — the ones the family holds TODAY, clubbed.
 *
 * Struck over the DEDUPED set, so a fund two members' statements both report is
 * one vehicle at the value the book carries for both: this feeds a DERIVED
 * exposure, and a fund counted twice would double the share derived from it.
 * Clubbed on `securityKey`, so one scheme held by three members is one vehicle
 * with one disclosure. And CURRENT holdings only: a scheme redeemed to nil is
 * not a fund this family holds, and must not count in "N of your M funds".
 *
 * ONE DEFINITION, SHARED WITH THE SUITE — the reason `bookIsinBridge` is shared
 * too. The suite used to take every fund vehicle the book ever carried, and
 * that is not a smaller set of the same joins, it is a DIFFERENT join. The
 * issuer prefix a line is filed under is decided over every filing loaded, a
 * ₹0 fund's included — and HDFC Small Cap, redeemed to nil in folio 16180583,
 * files City Union's SHARE. So in the suite City Union's certificates of
 * deposit joined the book's company by that share's ISIN, while the page, which
 * never loads a redeemed fund, needed the issuer seed to make the same join.
 * The bug pass switched the seed off: the page offered `City Union Bank Ltd.`
 * as a second company and failed, and the suite passed.
 */
export function heldFundVehicles(consolidated: readonly Position[]): HeldFund[] {
  const m = new Map<string, HeldFund>();
  for (const p of currentHoldings(consolidated)) {
    if (!isFundVehicle(p)) continue;
    const e = m.get(p.securityKey)
      ?? { securityKey: p.securityKey, name: p.security, marketValue: 0, assetClass: p.assetClass };
    e.marketValue += p.marketValue;
    m.set(p.securityKey, e);
  }
  return [...m.values()];
}

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
   * EVERY INSTRUMENT OF THIS ISSUER THIS FUND FILED, largest first — one share
   * line, or twelve NCDs at their own coupons and maturities. The row's `value`
   * is their sum, and a reader who acts on "how much LIC Housing do I hold
   * through this fund" is entitled to see what it is made of.
   */
  instruments: { name: string; isin: string | null; assetClass: string | null; rating: string | null; pctAum: number; value: number }[];
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
   * WHAT THE ISSUER WAS HELD AS, across every fund — `Equity`, `Debt` or both.
   * A company reached only through its bonds must not be filed as equity, and
   * the row that sums a share and an NCD has to say it did.
   */
  classes: string[];
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
       * `disclosedValue - total`: the part of a disclosed fund that NO LINE in
       * the filing accounted for — its cash sleeve, a gold or silver ETF's
       * metal, a line carrying neither an ISIN nor a usable name, and the
       * disclosure's own rounding.
       *
       * IT WAS `nonEquityValue` AND THE NAME STOPPED BEING TRUE. While the store
       * carried the equity section alone this really was the debt and cash
       * remainder — ₹45.7 Cr of it. The store now reads each AMC's whole monthly
       * filing, so the debt sleeve is INSIDE `total`, the remainder is ₹32.7 Cr,
       * and a field called "non-equity" would be describing something it is not.
       * A caption that misdescribes its own figure is the failure this book keeps
       * paying for; a FIELD that does is the same thing one layer down, where
       * every caller inherits it.
       */
      unaccountedValue: number;
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

/** What placed a company, and where. `null` where none of the three could. */
export type CompanySector = { sector: string; from: CompanyExposure["sectorFrom"] };

/**
 * ── THE SECTOR INDEX: `securityKey` → the sector, by whichever tier placed it ─
 *
 * A PROJECTION of `companyExposure` and deliberately not a second resolver. The
 * three tiers and their order live in exactly one function; this hands back the
 * half of its answer a caller wants when it is classifying rows of its own
 * rather than ranking companies.
 *
 * It exists because Family & Entities asks the SAME question about a company
 * that Sector Composition does — what sector is this in — over a DIFFERENT set:
 * one entity's own positions, valued as that entity's statements print them.
 * Re-deriving the tiers there would have been a second place for a company to
 * land in a sector this page puts somewhere else, which is the failure
 * `companyExposure` itself was extracted for. So the classification is shared
 * and the VALUES are not: nothing derived crosses over, because the caller looks
 * up `sector` and never `derived` or `total`.
 *
 * THE INDEX IS BUILT OVER THE WHOLE BOOK, not over the caller's subset, for one
 * measurable reason: tier 3 resolves through the NSE symbol a position carries,
 * and a company held in two accounts can print it on one row and not the other.
 * Narrowing the input can therefore only ever place FEWER companies — and a
 * sector is a property of a COMPANY, so which entity happens to be selected must
 * not be able to change it.
 */
export function companySectorIndex(
  /** Consolidated COMPANY SHARES — the same set `companyExposure` takes. */
  positions: Position[],
  exposure: StockExposureState,
): Map<string, CompanySector> {
  const m = new Map<string, CompanySector>();
  for (const e of companyExposure(positions, exposure)) m.set(e.key, { sector: e.sector, from: e.sectorFrom });
  return m;
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
 *     `unaccountedValue` are returned so a caller can state exactly what it does
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
/**
 * How well an ISIN identifies its ISSUER rather than one of its instruments.
 * Lower is better: one the book itself carries, then the equity series, then
 * anything else. It never invents an identifier — every candidate was filed.
 */
/** Lexicographic, so a row's name is chosen by a rule rather than by read order. */
const compareScore = (a: readonly (number | string)[], b: readonly (number | string)[]): number => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};
const rankIsin = (isin: string, book: ReadonlyMap<string, string>): number =>
  book.has(isin) ? 0 : /^IN[EF][A-Z0-9]{5}01/.test(isin) ? 1 : 2;

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
  /**
   * EVERY company the book holds, identifier or not — so an issuer whose name
   * is a book company's can be told apart from one whose name merely resembles
   * another line's. Defaults to the keys the ISIN index already names.
   */
  bookCompanyKeys: ReadonlySet<string> = new Set(isinToBookKey.values()),
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
  /**
   * ── A NAME AN AMC FILED *WITH* AN ISIN KEYS THE SAME AS ONE IT DID NOT ─────
   *
   * 18% of the disclosed lines carry no ISIN, and the same company arrives both
   * ways: one scheme files `ICICI Bank Ltd.` with INE090A01021, another files
   * `ICICI Bank Ltd.` with nothing. On a single pass the first lands on the
   * BOOK's key (joined by identifier) and the second on its own normalised name
   * — so the family's own question, how much of this company do I hold, gets
   * two answers. Measured: it split ICICI Bank, State Bank of India, Axis Bank
   * and IndusInd Bank.
   *
   * So the ISIN-BEARING FILINGS ARE READ FIRST and each records the key for its
   * ISSUER name; an ISIN-less filing of that name then follows it. The evidence
   * is the store's own — one AMC supplied the identifier for the name another
   * omitted — so this is not a fuzzy tier and not a re-derivation of the BOOK's
   * identity. Where no filing carries an ISIN, the name still stands alone.
   */
  const nameToKey = new Map<string, string>();
  /**
   * ── ONE KEY PER ISSUER, decided over every filing before a row is placed ───
   *
   * An Indian ISIN carries its issuer in characters 1-7 (see `issuerOf`), so
   * every instrument of one issuer is one ROW — and which row is decided here,
   * strongest evidence first:
   *
   *   1. a line whose OWN ISIN is the book's — the company the family holds;
   *   2. the book holds a share of the SAME ISSUER — Karur Vysya's certificates
   *      of deposit (`INE036D16…`) are Karur Vysya Bank (`INE036D01028`), and
   *      no fund here files its share for the first tier to catch. Only a
   *      company prefix (`INE`), and only where it names ONE book key: a
   *      warrant and a share of one company are two holdings, and a prefix both
   *      carry is decided by the equity series or not at all;
   *   3. otherwise the ISSUER NAME the filings give (`issuerKeyOf`) — which is
   *      also what joins a company carrying two issuer codes: Aditya Birla
   *      Finance's NCDs kept `INE860H` when it merged into Aditya Birla Capital
   *      (`INE674K`), and every filing now names them Aditya Birla Capital.
   *
   * WHY THIS WAS THREE ROWS FOR ONE COMPANY BEFORE. The first line READ decided
   * the key, and a debt line keyed on its own name — coupon, maturity, footnote
   * marks and all. Karur Vysya's CD, J&K Bank's CD and a Tata Capital NCD each
   * became a "company" beside the one the family holds or the one another
   * filing names, and the pick-list offered both.
   */
  const prefixKey = new Map<string, string>();
  /**
   * THE ROW'S NAME, chosen once every line is placed rather than by whichever
   * line was read first: a spelling that states the row's own key (`Government
   * of India` for the government's row, not `91 Days Treasury Bills`), then the
   * best identifier behind it, then one the filer cased, then the shortest.
   */
  type NameScore = [number, number, number, number, number, string];
  const nameFor = new Map<string, { raw: string; isin: string | null; score: NameScore }>();
  /**
   * ── A NAME PRINTED IN CAPITALS BORROWS ITS CASE FROM ANOTHER FILING ───────
   *
   *   "Make sure that the name of all the entities is written correctly neither
   *    in all full cap nor in all small cap."
   *
   * 142 of the store's 2,362 disclosed lines are printed entirely in capitals —
   * HDFC Balanced Advantage files `KAYNES TECHNOLOGY INDIA LIMITED` — and they
   * reached the pick-list, the rows and the breakouts exactly so. A title-caser
   * cannot do this alone: it does not know that `KPIT` is a name and `DAY` is a
   * word. So where ANOTHER filing in the same store prints the same ISIN, or a
   * name that normalises to the same key, in its own case, that spelling is
   * used — the same identifier, cased by somebody who knew. Measured: that
   * rescues 61 of the 142 lines, and the rest title-case through the measured
   * acronym list in `format.ts`. The KEY is never taken from the borrowed name —
   * every join below is still struck on the filing's own.
   */
  const casedByIsin = new Map<string, string>();
  const casedByName = new Map<string, string>();
  for (const { pf } of loaded) {
    for (const h of pf?.holdings ?? []) {
      if (!h.name || !/[a-z]/.test(h.name)) continue;
      const isin = (h.isin ?? "").trim().toUpperCase();
      if (isin && !casedByIsin.has(isin)) casedByIsin.set(isin, h.name);
      const k = securityKeyOf(h.name);
      if (k && !casedByName.has(k)) casedByName.set(k, h.name);
    }
  }
  const cased = (name: string, isin: string | null): string => {
    if (/[a-z]/.test(name)) return name;
    return (isin ? casedByIsin.get(isin) : undefined) ?? casedByName.get(securityKeyOf(name)) ?? name;
  };
  /** An instrument line, as filed: coupon and maturity kept, the marks gone. */
  const shown = (name: string, isin: string | null): string => displayFiledName(cased(name, isin));
  /** An issuer row: the instrument's own words removed. */
  const issuerShown = (name: string, isin: string | null): string => displayFiledName(issuerNameOf(cased(name, isin)));

  const fenced = (isin: string | null, name: string): boolean =>
    (!!isin && ringFenced.isins.has(isin))
    || ringFenced.keys.has(securityKeyOf(name)) || ringFenced.keys.has(issuerKeyOf(name));
  const isEquitySeries = (isin: string): boolean => /^IN[EF][A-Z0-9]{5}01/.test(isin);

  // 2. The book's own issuers — the prefix of every company ISIN the book carries.
  const bookIssuer = new Map<string, string>();
  {
    const cand = new Map<string, Map<string, boolean>>();
    for (const [isin, key] of isinToBookKey) {
      if (!/^INE/.test(isin)) continue;
      const pre = issuerOf(isin);
      const m = cand.get(pre) ?? new Map<string, boolean>();
      m.set(key, (m.get(key) ?? false) || isEquitySeries(isin));
      cand.set(pre, m);
    }
    for (const [pre, m] of cand) {
      const keys = [...m.keys()];
      const equity = keys.filter((k) => m.get(k));
      const pick = keys.length === 1 ? keys[0] : equity.length === 1 ? equity[0] : null;
      if (pick) bookIssuer.set(pre, pick);
    }
  }
  const bookKeys = bookCompanyKeys;

  type Line = { isin: string; name: string; key: string };
  const byPrefix = new Map<string, Line[]>();
  for (const { pf } of loaded) {
    if (!pf) continue;
    for (const h of pf.holdings ?? []) {
      const isin = (h.isin ?? "").trim().toUpperCase();
      if (!isin || !(h.pctAum > 0)) continue;
      const key = issuerKeyOf(h.name);
      if (!key || fenced(isin, h.name)) continue;
      const pre = issuerOf(isin);
      (byPrefix.get(pre) ?? byPrefix.set(pre, []).get(pre)!).push({ isin, name: h.name, key });
    }
  }
  // Deterministic, and the equity line first: it names the company rather than
  // one of its papers.
  const lineOrder = (a: Line, b: Line): number =>
    Number(isEquitySeries(b.isin)) - Number(isEquitySeries(a.isin))
    || issuerNameOf(a.name).length - issuerNameOf(b.name).length
    || a.key.localeCompare(b.key);
  for (const [pre, lines] of byPrefix) {
    lines.sort(lineOrder);
    const direct = lines.filter((l) => isinToBookKey.has(l.isin))
      .sort((a, b) => Number(isEquitySeries(b.isin)) - Number(isEquitySeries(a.isin)))[0];
    let key = direct ? isinToBookKey.get(direct.isin)! : bookIssuer.get(pre);
    if (!key) {
      const inBook = [...new Set(lines.map((l) => l.key).filter((k) => bookKeys.has(k)))];
      key = inBook.length === 1 ? inBook[0] : lines[0].key;
    }
    prefixKey.set(pre, key);
  }
  // A contested issuer NAME goes to the book's key over anyone else's.
  for (const [pre, lines] of byPrefix) {
    const k = prefixKey.get(pre)!;
    for (const l of lines) {
      const prev = nameToKey.get(l.key);
      if (!prev || (!bookKeys.has(prev) && bookKeys.has(k))) nameToKey.set(l.key, k);
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
    /**
     * EVERY INSTRUMENT OF AN ISSUER ADDS; THE SAME ISIN TWICE DOES NOT.
     *
     * This used to keep ONE disclosed line per fund per company and drop the
     * rest, which was right while the store carried the equity section alone —
     * there the only repeat was a second share class. On the whole filing it is
     * the difference between an answer and a wrong answer: HDFC Balanced
     * Advantage files TWELVE separate LIC Housing NCDs, and keeping the first
     * reports 0.6% of that fund against a true 1.74%. A row is now one issuer
     * and its `instruments` are what it is made of.
     *
     * `seenHere` still drops an exact repeat — the same ISIN filed twice in one
     * scheme is one holding printed twice, not two.
     */
    const seenHere = new Set<string>();
    for (const h of pf.holdings ?? []) {
      if (!(h.pctAum > 0)) continue;
      const isin = (h.isin ?? "").trim().toUpperCase() || null;
      const nameKey = securityKeyOf(h.name);
      if (!nameKey && !isin) continue;
      if (fenced(isin, h.name)) continue;
      const issuerKey = issuerKeyOf(h.name);
      const key = isin
        ? isinToBookKey.get(isin) ?? prefixKey.get(issuerOf(isin)) ?? issuerKey
        : nameToKey.get(issuerKey) ?? issuerKey;
      const dedupeOn = isin ?? `name:${nameKey}`;
      if (seenHere.has(dedupeOn)) continue;

      const value = familyValue(f.marketValue, h.pctAum);
      // A FUND THE FAMILY HOLDS AT ₹0 GIVES ₹0 OF EVERYTHING INSIDE IT. Five
      // schemes here are redeemed to nil, and carrying their disclosed lines
      // would draw 40 companies at an exposure of exactly nothing — a COMPUTED
      // zero, so not a fabrication, but a row that says the family holds a
      // company when what it holds is none of it. The line is dropped; a company
      // any funded scheme also discloses keeps that scheme's share.
      if (!(value > 0)) continue;
      seenHere.add(dedupeOn);
      total += value;
      const e = byKey.get(key) ?? { key, name: "", isin, rows: [], total: 0, classes: [], sector: null };
      {
        const bare = issuerNameOf(h.name);
        const score: NameScore = [
          issuerKeyOf(h.name) === key && securityKeyOf(bare) === key ? 0 : 1,
          !isin ? 3 : isinToBookKey.has(isin) ? 0 : isEquitySeries(isin) ? 1 : 2,
          /[a-z]/.test(h.name) ? 0 : 1,
          bare.length,
          // …then the spelling its filer CASED most fully: `Tata Capital Ltd.`
          // over `TATA Capital Ltd.`, which is the same company shouted.
          -(bare.match(/[a-z]/g)?.length ?? 0),
          bare,
        ];
        const prev = nameFor.get(key);
        if (!prev || compareScore(score, prev.score) < 0) nameFor.set(key, { raw: h.name, isin, score });
      }
      // ONE ROW PER FUND PER ISSUER, gaining an instrument rather than a row.
      let row = e.rows.find((r) => r.fundKey === f.securityKey);
      if (!row) {
        row = {
          fundKey: f.securityKey,
          fundName: f.name,
          holdingValue: f.marketValue,
          pctAum: 0,
          value: 0,
          instruments: [],
          via: isin ? "isin" : "name",
          // THE ROW'S SECTOR IS THE FIRST EQUITY LINE'S OWN LABEL. A debt line
          // files a credit RATING in that column, so taking whichever line came
          // first would put `CRISIL - AAA` where a sector belongs — the two facts
          // this reader splits at the source, arriving one level up.
          sector: null,
          holdingsAsOf: pf.holdingsAsOf ?? null,
          sourceKind: pf.holdingsSource?.kind ?? null,
        };
        e.rows.push(row);
      }
      row.pctAum += h.pctAum;
      row.value += value;
      if (!row.sector && h.sector) row.sector = h.sector;
      row.instruments.push({ name: shown(h.name, isin), isin, assetClass: h.assetClass ?? null, rating: h.rating ?? null, pctAum: h.pctAum, value });
      e.total += value;
      if (h.assetClass && !e.classes.includes(h.assetClass)) e.classes.push(h.assetClass);
      /**
       * THE ISSUER'S ISIN IS THE ONE THAT NAMES THE ISSUER, not whichever line
       * was read first. A row now spans every instrument this family reaches an
       * issuer through, and LIC Housing's arrive as a share (INE115A01026), an
       * NCD (INE115A07QY1) and a commercial paper maturing in three weeks
       * (INE115A14FW4) — all real identifiers, and only the first still
       * identifies the company after that paper matures. So the BOOK's own is
       * taken where the book carries one, then the `01` equity series, and a
       * debt identifier only where the issuer is reached through nothing else.
       * The issuer is the same in every case; this decides which of its names
       * a reader can search on.
       */
      if (isin && (!e.isin || rankIsin(isin, isinToBookKey) < rankIsin(e.isin, isinToBookKey))) e.isin = isin;
      byKey.set(key, e);
    }
  }

  for (const e of byKey.values()) {
    const n = nameFor.get(e.key);
    e.name = n ? issuerShown(n.raw, n.isin) : e.key;
    e.rows.sort((a, b) => b.value - a.value);
    for (const r of e.rows) r.instruments.sort((a, b) => b.value - a.value);
    e.classes.sort();
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
    unaccountedValue: disclosedValue - total,
  };
}
