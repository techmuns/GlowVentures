import type { Position } from "./types";
import { priceLooksLikeSameSecurity, symbolFor, type QuoteFeed } from "./quotes";
import { marketDay, positionActionKey, type ActionReturn } from "./corporateActions";

export type DailyMover = {
  securityKey: string; security: string; dayChangePct: number;
  dayChange: number | null; marketValue: number | null; entities: string[];
};

/** Price performance needs two exchange prices, not the owner's share count.
 * Keep the valuation gate on money amounts; one unresolved account makes the
 * whole security's impact unknown, rather than silently summing the others.
 */
export function dailyMovers(
  scope: Position[], quotes: QuoteFeed | null, returns: ReadonlyMap<string, ActionReturn>,
  owners: ReadonlyMap<string, { owner: string }>,
) {
  const sessionFor = (p: Position) => {
    const q = quotes?.quotes[symbolFor(p) || ""];
    if (q?.tradedAt && Date.parse(q.tradedAt) > Date.parse(quotes!.asOf) + 300_000) return "";
    // A fetch timestamp does not identify the exchange session (weekends,
    // holidays and pre-open quotes may still carry the previous session).
    return q?.tradedAt && Number.isFinite(Date.parse(q.tradedAt)) ? marketDay(q.tradedAt) : "";
  };
  const latestSession = scope.map(sessionFor).filter(Boolean).sort().slice(-1)[0] ?? null;
  const rows = new Map<string, DailyMover>();
  const omitted = new Map<string, string>();
  for (const p of scope) {
    const q = quotes?.quotes[symbolFor(p) || ""];
    const plan = returns.get(positionActionKey(p));
    let reason = !symbolFor(p) ? "No exchange symbol" : !q ? "Awaiting a quote" : null;
    if (q && (!Number.isFinite(q.price) || q.price <= 0 || !Number.isFinite(q.prevClose) || !(q.prevClose! > 0))) {
      reason = "Previous close or price unavailable";
    }
    const quoteSession = sessionFor(p);
    if (q?.tradedAt && (!quoteSession || quoteSession !== latestSession)) reason = "Quote belongs to an older or invalid session";
    if (q && ((!p.live && !plan?.liveWithheld) || !priceLooksLikeSameSecurity(q.price, p.currentPrice))) {
      reason = "Quote identity or price needs verification";
    }
    // An exchange close may still be on the pre-split basis on the ex-date.
    // Missing share counts don't prevent a price ranking; an unknown price
    // basis does, so this guard applies to percentages as well as rupees.
    if (q && plan?.lines.some(({ action }) => action.type !== "dividend"
      && (!action.exDate || action.exDate === (quoteSession || marketDay(q.observedAt || quotes!.asOf))))) reason = "Corporate action: previous-close basis needs verification";
    if (reason || !q) { omitted.set(p.securityKey, reason || "Awaiting a quote"); continue; }
    const pct = (q.price / q.prevClose! - 1) * 100;
    if (!Number.isFinite(pct)) { omitted.set(p.securityKey, "Invalid price change"); continue; }
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
  const session = included.length && included.every((p) => sessionFor(p) === latestSession) ? latestSession : null;
  const observations = included.map((p) => {
    const q = quotes!.quotes[symbolFor(p)!];
    return q.observedAt ? Date.parse(q.observedAt) : Date.parse(quotes!.asOf) - (q.ageS || 0) * 1000;
  }).filter(Number.isFinite).sort((a, b) => a - b);
  return { rows: [...rows.values()], session, omitted,
    observedFrom: observations.length ? new Date(observations[0]).toISOString() : null,
    observedTo: observations.length ? new Date(observations[observations.length - 1]).toISOString() : null };
}
