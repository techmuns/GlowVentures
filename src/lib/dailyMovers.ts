import type { Position } from "./types";
import { priceLooksLikeSameSecurity, symbolFor, type Quote, type QuoteFeed } from "./quotes";
import { marketDay, positionActionKey, type ActionReturn } from "./corporateActions";

export type DailyMover = {
  securityKey: string; security: string; dayChangePct: number;
  dayChange: number | null; marketValue: number | null; entities: string[];
};

/**
 * THE EXCHANGE SESSION A QUOTE BELONGS TO, or "" where it cannot be read.
 *
 * A fetch timestamp does not identify the session — weekends, holidays and
 * pre-open quotes may still carry the previous one — and a trade stamped more
 * than five minutes after the feed's own as-of is not a trade this feed saw.
 */
export function quoteSession(quotes: QuoteFeed | null, symbol: string | null): string {
  const q = quotes?.quotes[symbol || ""];
  if (q?.tradedAt && Date.parse(q.tradedAt) > Date.parse(quotes!.asOf) + 300_000) return "";
  return q?.tradedAt && Number.isFinite(Date.parse(q.tradedAt)) ? marketDay(q.tradedAt) : "";
}

/** The newest session any of these symbols was traded in. */
export function latestQuoteSession(
  quotes: QuoteFeed | null, symbols: Iterable<string | null>,
): string | null {
  return [...symbols].map((s) => quoteSession(quotes, s)).filter(Boolean).sort().slice(-1)[0] ?? null;
}

/**
 * WHETHER A PRICE MOVE CAN BE STRUCK ON A SYMBOL AT ALL — the half of the gate
 * that needs no holding, so a line a FUND disclosed is held to exactly the rules
 * a row the family's own statement reports is held to. The other half is about a
 * POSITION — that the quote is the security this book carries a mark for, and
 * that its previous close is not on a pre-split basis — and stays below.
 *
 * The reasons are in override order, which is the order the chain below assigns
 * them in: a symbol, then a quote, then usable prices, then the session.
 */
export function symbolMove(
  quotes: QuoteFeed | null, symbol: string | null, session: string | null,
): { pct: number; quote: Quote } | { reason: string } {
  if (!symbol) return { reason: "No exchange symbol" };
  const q = quotes?.quotes[symbol];
  if (!q) return { reason: "Awaiting a quote" };
  let reason: string | null = null;
  if (!Number.isFinite(q.price) || q.price <= 0 || !Number.isFinite(q.prevClose) || !(q.prevClose! > 0)) {
    reason = "Previous close or price unavailable";
  }
  const own = quoteSession(quotes, symbol);
  if (q.tradedAt && (!own || own !== session)) reason = "Quote belongs to an older or invalid session";
  if (reason) return { reason };
  const pct = (q.price / q.prevClose! - 1) * 100;
  return Number.isFinite(pct) ? { pct, quote: q } : { reason: "Invalid price change" };
}

/** Price performance needs two exchange prices, not the owner's share count.
 * Keep the valuation gate on money amounts; one unresolved account makes the
 * whole security's impact unknown, rather than silently summing the others.
 *
 * `opts.session` pins the session every quote is held to. A caller ranking two
 * halves of one card — the shares a mandate reports beside the companies a fund
 * disclosed — resolves it over BOTH sets and passes it, so neither half can be
 * struck on a session the other is not on.
 */
export function dailyMovers(
  scope: Position[], quotes: QuoteFeed | null, returns: ReadonlyMap<string, ActionReturn>,
  owners: ReadonlyMap<string, { owner: string }>,
  opts: { session?: string | null } = {},
) {
  const latestSession = opts.session !== undefined
    ? opts.session
    : latestQuoteSession(quotes, scope.map((p) => symbolFor(p)));
  const rows = new Map<string, DailyMover>();
  const omitted = new Map<string, string>();
  for (const p of scope) {
    const q = quotes?.quotes[symbolFor(p) || ""];
    const plan = returns.get(positionActionKey(p));
    const move = symbolMove(quotes, symbolFor(p), latestSession);
    let reason = "reason" in move ? move.reason : null;
    const quoteSess = quoteSession(quotes, symbolFor(p));
    if (q && ((!p.live && !plan?.liveWithheld) || !priceLooksLikeSameSecurity(q.price, p.currentPrice))) {
      reason = "Quote identity or price needs verification";
    }
    // An exchange close may still be on the pre-split basis on the ex-date.
    // Missing share counts don't prevent a price ranking; an unknown price
    // basis does, so this guard applies to percentages as well as rupees.
    if (q && plan?.lines.some(({ action }) => action.type !== "dividend"
      && (!action.exDate || action.exDate === (quoteSess || marketDay(q.observedAt || quotes!.asOf))))) reason = "Corporate action: previous-close basis needs verification";
    if (reason || !("pct" in move)) { omitted.set(p.securityKey, reason || "Awaiting a quote"); continue; }
    const pct = move.pct;
    const impact = p.live && Number.isFinite(p.dayChange) && Number.isFinite(p.dayChangePct) ? p.dayChange! : null;
    const value = impact === null ? null : p.marketValue;
    const owner = owners.get(p.accountId)?.owner;
    const previous = rows.get(p.securityKey);
    if (previous) {
      previous.dayChange = previous.dayChange === null || impact === null ? null : previous.dayChange + impact;
      previous.marketValue = previous.marketValue === null || value === null ? null : previous.marketValue + value;
      if (owner && !previous.entities.includes(owner)) previous.entities.push(owner);
    } else {
      rows.set(p.securityKey, { securityKey: p.securityKey, security: p.security, dayChangePct: pct,
        dayChange: impact, marketValue: value, entities: owner ? [owner] : [] });
    }
  }
  // Never claim a complete security when one account's quote/basis was refused.
  for (const key of omitted.keys()) rows.delete(key);
  const included = scope.filter((p) => rows.has(p.securityKey));
  const session = included.length && included.every((p) => quoteSession(quotes, symbolFor(p)) === latestSession) ? latestSession : null;
  const observations = included.map((p) => {
    const q = quotes!.quotes[symbolFor(p)!];
    return q.observedAt ? Date.parse(q.observedAt) : Date.parse(quotes!.asOf) - (q.ageS || 0) * 1000;
  }).filter(Number.isFinite).sort((a, b) => a - b);
  return { rows: [...rows.values()], session, omitted,
    observedFrom: observations.length ? new Date(observations[0]).toISOString() : null,
    observedTo: observations.length ? new Date(observations[observations.length - 1]).toISOString() : null };
}
