/**
 * ── A PRIVATE COMPANY'S FUNDING ROUNDS AND VALUATIONS (Stage 10ko) ──────────
 *
 *   *"Make Drill down page for private market investments similar to full drill
 *    down pages for public investments … details on Date of our investment,
 *    valuation - pre money, valuation - post money, latest valuation date and
 *    valuation · subsequent funding rounds - date, our stake, valuation · Show
 *    line chart on valuation progression for each company. Fetch information
 *    like valuation, funding rounds, etc. for all the private investments thru
 *    credible sources and these should be automatically updated."* — the
 *    family, 4 Nov 2026.
 *
 * No statement the family receives prints a company's funding history, so this
 * is the one record in the dashboard that comes from public reporting rather
 * than from the family's own documents: `src/data/privateRounds.json`, written
 * by `npm run build-private-rounds` (which the monthly `private-rounds.yml`
 * workflow runs). Every round in it carries the source that prints it — a
 * filing, the company's own release, or the business press that read the
 * filing — and every figure is the one that source states. A figure no source
 * states is null, and the page renders it absent with that reason.
 *
 * WHAT IS DERIVED HERE, AND ONLY THIS:
 *   pre-money   = post-money − amount raised, where the source prints those two
 *   post-money  = pre-money + amount raised, where the source prints those two
 *   stake       = shares held × the round's price per share ÷ its post-money,
 *                 where the family's own statement carries the share count
 *   change      = latest valuation ÷ the valuation at the family's entry
 * Each derived figure says so on its hover. Nothing here touches the book: a
 * company's valuation never values the family's holding, which stays at the
 * cost its statement carries (`valuedAtCost`).
 */
import STORE from "@/data/privateRounds.json";

export type Money = { value: number; currency: string; alt?: readonly { value: number; currency: string }[] };
export type RoundSource = {
  url: string;
  publisher: string;
  published: string | null;
  /** What the source states, in a few words. */
  supports: string;
  /** A data vendor's public page rather than a filing or the press. */
  aggregator?: boolean;
};
export type RoundKind = "primary" | "secondary" | "ipo" | "rights" | "preferential" | "acquisition" | "mark";
export type FundingRound = {
  /** `YYYY-MM-DD`, or `YYYY-MM` where the source names only the month. */
  date: string;
  dateBasis: string | null;
  round: string;
  kind: RoundKind | string;
  amountRaised: Money | null;
  preMoney: Money | null;
  postMoney: Money | null;
  /** "Valued at …" with no pre/post word on it. */
  valuation: (Money & { basis?: string }) | null;
  pricePerShare: Money | null;
  sharesAllotted: number | null;
  leadInvestors: readonly string[];
  note: string | null;
  sources: readonly RoundSource[];
};
export type FamilyMention = {
  text: string;
  shares?: number | null;
  source: RoundSource;
};
export type PrivateCompany = {
  id: string;
  legalName: string;
  brand: string;
  /** The book's own line keys (`BookFolio.fundKey`) this company's record is for. */
  fundKeys: readonly string[];
  website: string | null;
  sector: string | null;
  listed: { exchange: string; symbol: string; date: string | null } | null;
  rounds: readonly FundingRound[];
  familyMentions: readonly FamilyMention[];
  /** What was searched, and why a figure is missing — the absence's own reason. */
  searchNote: string | null;
  /** The day this company's record was last researched. */
  checkedOn: string;
};
export type PrivateRoundsStore = {
  updatedOn: string;
  method: string;
  companies: readonly PrivateCompany[];
};

export const PRIVATE_ROUNDS = STORE as unknown as PrivateRoundsStore;

const BY_ID = new Map(PRIVATE_ROUNDS.companies.map((c) => [c.id, c]));
const BY_FUND_KEY = new Map(PRIVATE_ROUNDS.companies.flatMap((c) => c.fundKeys.map((k) => [k, c] as const)));

export const privateCompanyById = (id: string): PrivateCompany | null => BY_ID.get(id) ?? null;
export const privateCompanyOf = (fundKey: string | null | undefined): PrivateCompany | null =>
  (fundKey ? BY_FUND_KEY.get(fundKey) : null) ?? null;
/** The one company every key names, or null where they name none or several. */
export function privateCompanyOfKeys(keys: readonly (string | null | undefined)[]): PrivateCompany | null {
  const found = new Set(keys.map(privateCompanyOf));
  return found.size === 1 ? [...found][0] : null;
}
export const privateCompanyHref = (id: string) => `/private-company/${encodeURIComponent(id)}`;

/** A month-only date compares as the first of that month. */
export const dayOf = (d: string) => (d.length === 7 ? `${d}-01` : d);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(dayOf(b)) - Date.parse(dayOf(a))) / 86_400_000);

/** The figure in `currency`, as the source prints it — never converted at a rate. */
export function moneyIn(m: Money | null | undefined, currency: string): number | null {
  if (!m) return null;
  if (m.currency === currency) return m.value;
  return m.alt?.find((a) => a.currency === currency)?.value ?? null;
}

export type Figure = { value: number; derived: string | null };
export type RoundValues = {
  pre: Figure | null;
  post: Figure | null;
  /** The valuation the chart draws: post-money, else a "valued at" with no basis. */
  headline: (Figure & { basis: "post-money" | "unspecified" }) | null;
  raised: number | null;
  price: number | null;
};

export function roundValues(r: FundingRound, currency: string): RoundValues {
  const raised = moneyIn(r.amountRaised, currency);
  const prePrinted = moneyIn(r.preMoney, currency);
  const postPrinted = moneyIn(r.postMoney, currency);
  const pre: Figure | null = prePrinted != null ? { value: prePrinted, derived: null }
    : postPrinted != null && raised != null ? { value: postPrinted - raised, derived: "post-money − amount raised, both as the source prints them" }
    : null;
  const post: Figure | null = postPrinted != null ? { value: postPrinted, derived: null }
    : prePrinted != null && raised != null ? { value: prePrinted + raised, derived: "pre-money + amount raised, both as the source prints them" }
    : null;
  const unspecified = moneyIn(r.valuation, currency);
  const headline = post ? { ...post, basis: "post-money" as const }
    : unspecified != null ? { value: unspecified, derived: null, basis: "unspecified" as const }
    : null;
  return { pre, post, headline, raised, price: moneyIn(r.pricePerShare, currency) };
}

/**
 * THE ONE CURRENCY A COMPANY'S HISTORY IS DRAWN IN — the one most of its rounds
 * print a valuation in. A round printed only in another currency is named as
 * left out of the chart, never converted at a rate no source gives.
 */
export function seriesCurrency(c: PrivateCompany): string {
  const count = new Map<string, number>();
  for (const r of c.rounds) {
    const cs = new Set([r.postMoney, r.preMoney, r.valuation].flatMap((m) => (m ? [m.currency, ...(m.alt ?? []).map((a) => a.currency)] : [])));
    for (const cur of cs) count.set(cur, (count.get(cur) ?? 0) + 1);
  }
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] === "INR" ? -1 : b[0] === "INR" ? 1 : 0));
  return ranked[0]?.[0] ?? "INR";
}

export const sortedRounds = (c: PrivateCompany): FundingRound[] =>
  [...c.rounds].sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)) || a.round.localeCompare(b.round));

export type ValuationPoint = { date: string; value: number; basis: "post-money" | "unspecified"; round: string; derived: string | null };

/** Every round with a valuation in the series currency, oldest first. */
export function valuationPoints(c: PrivateCompany, currency = seriesCurrency(c)): { points: ValuationPoint[]; leftOut: FundingRound[] } {
  const points: ValuationPoint[] = [];
  const leftOut: FundingRound[] = [];
  for (const r of sortedRounds(c)) {
    const v = roundValues(r, currency);
    if (v.headline) points.push({ date: r.date, value: v.headline.value, basis: v.headline.basis, round: r.round, derived: v.headline.derived });
    else if (r.postMoney || r.preMoney || r.valuation) leftOut.push(r);
  }
  return { points, leftOut };
}

/** Within this many days either side, a round is the one the family came in on. */
export const ENTRY_WINDOW_DAYS = 120;

export type EntryRound = {
  round: FundingRound;
  /** `at` — dated within the window of the investment; `before` — the last one before it. */
  match: "at" | "before";
  days: number;
};

/**
 * THE ROUND THE FAMILY'S MONEY WENT IN AT. A round is reported when it is
 * announced or filed, often weeks after the money moves, so the round dated
 * nearest the family's first investment within `ENTRY_WINDOW_DAYS` is the one
 * it came in on; failing that, the last priced round before it — the valuation
 * that stood when the family invested. The hover says which.
 */
export function entryRound(c: PrivateCompany, investedFrom: string | null, currency = seriesCurrency(c)): EntryRound | null {
  if (!investedFrom) return null;
  const priced = sortedRounds(c).filter((r) => roundValues(r, currency).headline);
  let best: EntryRound | null = null;
  for (const r of priced) {
    const d = daysBetween(investedFrom, r.date);
    if (Math.abs(d) <= ENTRY_WINDOW_DAYS && (!best || Math.abs(d) < Math.abs(best.days))) best = { round: r, match: "at", days: d };
  }
  if (best) return best;
  const before = priced.filter((r) => dayOf(r.date) <= dayOf(investedFrom));
  const last = before[before.length - 1];
  return last ? { round: last, match: "before", days: daysBetween(investedFrom, last.date) } : null;
}

export type CompanyMetrics = {
  currency: string;
  entry: EntryRound | null;
  entryValues: RoundValues | null;
  latest: ValuationPoint | null;
  /** Latest valuation ÷ the valuation at entry; null unless both are on one basis. */
  change: number | null;
  subsequent: FundingRound[];
};

export function companyMetrics(c: PrivateCompany, investedFrom: string | null): CompanyMetrics {
  const currency = seriesCurrency(c);
  const entry = entryRound(c, investedFrom, currency);
  const entryValues = entry ? roundValues(entry.round, currency) : null;
  const { points } = valuationPoints(c, currency);
  const latest = points[points.length - 1] ?? null;
  const change = entryValues?.headline && latest && entryValues.headline.basis === latest.basis
    ? latest.value / entryValues.headline.value : null;
  const subsequent = entry
    ? sortedRounds(c).filter((r) => dayOf(r.date) > dayOf(entry.round.date))
    : investedFrom ? sortedRounds(c).filter((r) => dayOf(r.date) > dayOf(investedFrom)) : [];
  return { currency, entry, entryValues, latest, change, subsequent };
}

export type Stake = { pct: number; note: string };
export type StakeTrail = { at: Map<FundingRound, Stake>; why: Map<FundingRound, string> };

/** Within this much of the entry round's price, the family's cost per share is on that round's share basis. */
export const PRICE_MATCH = 0.05;
/** Rounds that issue new shares, and so dilute every holder. A secondary sale or an investor's mark issues none. */
const ISSUES_SHARES = new Set(["primary", "preferential", "rights", "ipo"]);

/**
 * ── THE FAMILY'S STAKE, ROUND BY ROUND ─────────────────────────────────────
 *
 * AT ENTRY: shares held × the entry round's price per share ÷ its post-money —
 * struck ONLY where the family's own cost per share is that round's price
 * (within `PRICE_MATCH`). That match is what proves the statement's share count
 * is on the round's share basis; without it a split, a bonus or a secondary
 * purchase at another price would make the product meaningless (Zepto's rounds
 * print ₹33 and ₹53 a share against the family's ₹31,810).
 *
 * AFTER IT: each later round that issues shares dilutes the stake by its
 * pre-money ÷ post-money — a ratio of the company's own valuations, so no share
 * count or price is needed and a split in between cannot move it. A secondary
 * sale or a mark issues no shares and leaves the stake as it was. A round that
 * issues shares and prints no pre- and post-money breaks the chain: every
 * round from it on is absent with that round named. Assumes the family bought
 * no more shares after entry, which the hover says.
 */
export function stakeTrail(c: PrivateCompany, shares: number | null, cost: number | null, investedFrom: string | null, currency = seriesCurrency(c)): StakeTrail {
  const at = new Map<FundingRound, Stake>();
  const why = new Map<FundingRound, string>();
  const rounds = sortedRounds(c);
  const entry = entryRound(c, investedFrom, currency);
  const before = (r: FundingRound) => !!investedFrom && dayOf(r.date) < dayOf(investedFrom) && r !== entry?.round;
  const fail = (reason: string) => { for (const r of rounds) why.set(r, before(r) ? "before the family's first investment — it held no shares then" : reason); return { at, why }; };
  if (shares == null || shares <= 0 || cost == null) return fail("the family's statement for this holding carries no share count, so its fraction of the company cannot be struck");
  if (!entry) return fail("no priced round is dated at or before the family's investment to strike a stake on");
  const ev = roundValues(entry.round, currency);
  if (ev.price == null || !ev.post) return fail(`the entry round (${entry.round.round}) prints no ${ev.price == null ? "price per share" : "post-money valuation"} to strike a stake on`);
  const paid = cost / shares;
  if (Math.abs(paid / ev.price - 1) > PRICE_MATCH) {
    return fail(`the family paid ${Math.round(paid).toLocaleString("en-IN")} a share against the entry round's ${ev.price.toLocaleString("en-IN")} — a purchase on another price or share basis, so the round's figures cannot strike its stake`);
  }
  let pct = (shares * ev.price / ev.post.value) * 100;
  let broken: string | null = null;
  const trail: string[] = [`${shares.toLocaleString("en-IN")} shares × ${entry.round.round}'s price ÷ its post-money${ev.post.derived ? ` (${ev.post.derived})` : ""}`];
  for (const r of rounds) {
    if (before(r)) { why.set(r, "before the family's first investment — it held no shares then"); continue; }
    if (r === entry.round) { at.set(r, { pct, note: `${trail[0]}. The family's cost per share is this round's price, so the share count is on its basis.` }); continue; }
    if (dayOf(r.date) < dayOf(entry.round.date)) { why.set(r, "before the round the family came in on"); continue; }
    if (broken) { why.set(r, broken); continue; }
    if (ISSUES_SHARES.has(String(r.kind))) {
      const v = roundValues(r, currency);
      if (!v.pre || !v.post) { broken = `${r.round} issued shares and its source prints no pre- and post-money to dilute the stake through`; why.set(r, broken); continue; }
      pct *= v.pre.value / v.post.value;
      trail.push(`× ${r.round}'s pre ÷ post-money`);
    }
    at.set(r, { pct, note: `${trail.join(" ")}. Assumes the family bought no shares after entry.` });
  }
  return { at, why };
}

/**
 * A valuation in its own currency: rupees through the page's display-currency
 * formatter (`fmtFromBase`, the book's base is INR), any other currency as the
 * source printed it — never converted at a rate no source gives.
 */
export function fmtValuation(v: number | null | undefined, currency: string, fmtFromBase: (n: number, o?: { compact?: boolean }) => string): string | null {
  if (v == null) return null;
  return currency === "INR" ? fmtFromBase(v, { compact: true })
    : new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 2 }).format(v);
}

/** The company a set of book lines is a holding in, with its metrics from their first investment date. */
export function companyValuationOf(folios: readonly { fundKey: string; invested?: { from: string } | null }[]): { company: PrivateCompany; m: CompanyMetrics } | null {
  const company = privateCompanyOfKeys(folios.map((f) => f.fundKey));
  if (!company) return null;
  const from = folios.map((f) => f.invested?.from).filter((d): d is string => !!d).sort((a, b) => dayOf(a).localeCompare(dayOf(b)))[0] ?? null;
  return { company, m: companyMetrics(company, from) };
}

/** "Series B · Mar 2024" — month precision where the source gives only a month. */
export function roundDateLabel(d: string): string {
  const [y, m, day] = d.split("-");
  const month = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return day ? `${Number(day)} ${month} ${y}` : `${month} ${y}`;
}
