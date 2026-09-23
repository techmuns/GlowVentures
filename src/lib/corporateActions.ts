import type { Account, Position } from "./types";
import { applyQuotes, symbolFor, type QuoteFeed } from "./quotes";
import { validActionFeed, type ActionFeed, type ResearchAction } from "../../shared/corporateActions.mjs";
export type { ActionFeed, ResearchAction } from "../../shared/corporateActions.mjs";

export type ActionLine = {
  action: ResearchAction;
  status: "in-statement" | "upcoming" | "adjusted" | "declared" | "needs-review";
  quantity: number | null; amount: number | null; reason: string | null;
};
export type ActionReturn = {
  accountId: string; securityKey: string; statementDate: string; through: string;
  statementQuantity: number; adjustedQuantity: number; factor: number;
  openingValue: number; closingValue: number;
  priceReturnPct: number | null; totalReturnPct: number | null;
  dividendEntitlement: number | null;
  quantityIssues: string[]; incomeIssues: string[]; lines: ActionLine[];
  capturedAt: string | null;
};
export const positionActionKey = (p: Pick<Position, "accountId" | "securityKey">) => `${p.accountId}|${p.securityKey}`;
export const marketDay = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 19_800_000).toISOString().slice(0, 10) : "";
};

/** Exact identifiers only. A conflicting ISIN is evidence against a ticker match. */
export function actionsFor(p: Position, feed: ActionFeed | null): ResearchAction[] {
  if (!feed) return [];
  const symbol = symbolFor(p);
  return feed.rows.filter((r) => (p.isin && r.isin === p.isin) || (symbol && r.ticker === symbol))
    .sort((a, b) => (a.exDate || "9999").localeCompare(b.exDate || "9999") || a.id.localeCompare(b.id));
}

/**
 * A forward projection of the statement's holdings, NOT a trading ledger.
 * Only events AFTER that account's dated closing are applied, exactly once.
 * Cash here is a gross entitlement, never a claimed bank receipt or book asset.
 */
export function projectActions(p: Position, statementDate: string, through: string, feed: ActionFeed | null): ActionReturn {
  const result: ActionReturn = {
    accountId: p.accountId, securityKey: p.securityKey, statementDate, through,
    statementQuantity: p.quantity, adjustedQuantity: p.quantity, factor: 1,
    openingValue: p.marketValue, closingValue: p.marketValue,
    priceReturnPct: null, totalReturnPct: null, dividendEntitlement: null,
    quantityIssues: [], incomeIssues: [], lines: [], capturedAt: feed?.capturedAt ?? null,
  };
  const qi = result.quantityIssues, di = result.incomeIssues;
  if ((p.realizedLotsAfter ?? 0) > 0) qi.push("Sales are recorded after this statement; a newer holding balance is required");
  if (!feed) { di.push("Corporate-action feed unavailable"); return result; }
  if (!statementDate || !through || through < statementDate) di.push("No comparable dated valuation");
  if (feed.symbols && !feed.symbols.includes(symbolFor(p) || "") && !feed.isins.includes(p.isin || "")) di.push("Security outside the saved feed's coverage");
  if (statementDate < feed.requestedFrom) di.push("Statement predates the available event history");
  if (!feed.verifiedThrough || through > feed.verifiedThrough || through > feed.requestedTo) di.push("Event capture does not cover the valuation date");
  // Missing coverage can hide a share event too, not only a dividend. Never
  // pair a potentially pre-split quantity with a post-split live price.
  qi.push(...di);
  let quantity = p.quantity, cash = 0;
  const events = actionsFor(p, feed);
  const seen = new Map<string, ResearchAction>();
  for (const action of events) {
    const date = action.exDate;
    const line: ActionLine = { action, status: "needs-review", quantity: null, amount: null, reason: null };
    result.lines.push(line);
    if (date && date <= statementDate) { line.status = "in-statement"; continue; }
    if (date && date > through) { line.status = "upcoming"; continue; }
    let reason = action.issue;
    if (p.isin && action.isin && p.isin !== action.isin) reason = "ISIN differs; confirm the security or its ISIN change";
    // A same-day split and dividend has an ambiguous per-share basis unless
    // the source explicitly establishes which share basis the cash uses.
    if (action.type === "dividend" && events.some((r) => r.exDate === date && ["split", "bonus"].includes(r.type))) reason = "Dividend shares need reconciliation with the same-day share adjustment";
    const key = `${date}|${action.type}`;
    const prior = seen.get(key);
    if (prior) {
      // Even matching amounts can be distinct final/special dividends. The
      // capture already merges sources; anything still duplicated is ambiguous.
      reason = "Multiple same-date events need reconciliation";
    }
    seen.set(key, action);
    if (!date) reason = "Event has no ex-date; its eligibility window is unknown";
    if (action.type === "bonus" || action.type === "split") {
      if (!action.factor) reason ||= "Share ratio unavailable";
      const next = quantity * (action.factor ?? 1);
      if (Math.abs(next - Math.round(next)) > 1e-6) reason ||= "Fractional entitlement needs the credited quantity or cash-in-lieu statement";
      if (reason) { qi.push(reason); line.reason = reason; continue; }
      line.quantity = quantity;
      quantity = next;
      line.status = "adjusted";
    } else if (action.type === "dividend") {
      if (action.cashPerShare === null) reason ||= "Dividend amount unavailable";
      if (qi.length) reason ||= "Earlier share adjustment is unresolved";
      if (reason) { di.push(reason); line.reason = reason; continue; }
      line.quantity = quantity;
      line.amount = quantity * (action.cashPerShare as number);
      cash += line.amount;
      line.status = "declared";
    } else {
      // Rights, buybacks, demergers etc. need choices/allocations this feed
      // cannot supply. Do not combine a pre-action quantity with a new price.
      reason ||= "Action requires a newer holding statement";
      qi.push(reason); line.reason = reason;
    }
  }
  if (!qi.length) {
    result.adjustedQuantity = quantity;
    result.factor = p.quantity > 0 ? quantity / p.quantity : 1;
  } else {
    // No partial chain: a later ambiguity invalidates earlier projected units.
    for (const line of result.lines) if (["adjusted", "declared"].includes(line.status)) {
      line.status = "needs-review"; line.amount = null; line.quantity = null;
      line.reason = "The full share-adjustment chain needs reconciliation";
    }
  }
  if (!di.length && !qi.length) result.dividendEntitlement = cash;
  result.quantityIssues = [...new Set(qi)];
  result.incomeIssues = [...new Set(di)];
  return result;
}

export function applyCorporateActionQuotes(
  positions: Position[], accounts: Account[], quotes: QuoteFeed | null, feed: ActionFeed | null,
): { positions: Position[]; returns: Map<string, ActionReturn> } {
  const dates = new Map(accounts.map((a) => [a.accountId, a.asOf]));
  const returns = new Map<string, ActionReturn>();
  const output = positions.map((p) => {
    if (p.assetClass !== "Equity") return applyQuotes([p], quotes)[0];
    const q = quotes?.quotes[symbolFor(p) || ""];
    const start = dates.get(p.accountId) || "";
    const end = q ? marketDay(q.tradedAt || quotes!.asOf) : start;
    const plan = projectActions(p, start, end, feed);
    // A quote without a trade timestamp cannot prove it is post-action on
    // the ex-date itself (weekends, pre-open and cached prices matter).
    if (q && !q.tradedAt && plan.lines.some((l) => l.status === "adjusted")) {
      plan.quantityIssues.push("A dated post-action quote is required for adjusted shares");
    }
    if (q && !q.tradedAt && plan.lines.some((l) => l.status === "declared")) {
      plan.incomeIssues.push("A dated post-dividend quote is required for total return");
      plan.dividendEntitlement = null;
    }
    if (q && end < start) plan.quantityIssues.push("Quote predates the holding statement");
    if (!feed) plan.quantityIssues.push("Waiting for corporate-action evidence before marking shares live");
    const blocked = plan.quantityIssues.length > 0;
    const f = blocked ? 1 : plan.factor;
    const prepared = { ...p, quantity: p.quantity * f,
      avgCost: p.avgCost === null ? null : p.avgCost / f,
      currentPrice: p.currentPrice === null ? null : p.currentPrice / f };
    let priced = applyQuotes([prepared], blocked ? null : quotes)[0];
    // Never leave adjusted units paired with the old statement's price/value.
    if (!priced.live) {
      priced = { ...p, live: false };
      plan.adjustedQuantity = p.quantity; plan.factor = 1;
      plan.dividendEntitlement = null;
      plan.incomeIssues.push(blocked ? "Live valuation withheld pending share reconciliation" : "A live quote is required for the period return");
      for (const line of plan.lines) if (line.status === "adjusted" || line.status === "declared") {
        line.status = "needs-review"; line.reason = "Awaiting a comparable post-action quote";
        line.amount = null; line.quantity = null;
      }
    } else {
      plan.closingValue = priced.marketValue;
      if (p.marketValue > 0 && end >= start) {
        plan.priceReturnPct = (priced.marketValue / p.marketValue - 1) * 100;
        if (plan.dividendEntitlement !== null) plan.totalReturnPct = ((priced.marketValue + plan.dividendEntitlement) / p.marketValue - 1) * 100;
      }
      // The exchange's previous close may be unadjusted on an ex-date. Do not
      // print a spurious daily jump/drop while its price basis is unverified.
      if (plan.lines.some((l) => l.status === "adjusted" && l.action.exDate === end)) {
        priced = { ...priced, dayChange: null, dayChangePct: null };
      }
    }
    returns.set(positionActionKey(p), plan);
    return priced;
  });
  return { positions: output, returns };
}

/** Refresh failure retains the dated capture, never converts unknown income to zero. */
export async function fetchCorporateActions(symbols: string[], isins: string[], signal?: AbortSignal): Promise<{ feed: ActionFeed; retained: boolean } | null> {
  try {
    const params = new URLSearchParams({ symbols: [...new Set(symbols)].sort().join(","), isins: [...new Set(isins)].sort().join(",") });
    const response = await fetch(`/api/corporate-actions?${params}`, { signal });
    if (!response.ok) return null;
    const body = await response.json();
    return body.ok && validActionFeed(body.feed) ? { feed: body.feed, retained: !!body.retained } : null;
  } catch { return null; }
}

export async function savedCorporateActions(signal?: AbortSignal): Promise<ActionFeed | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/corporate-actions.json`, { signal });
    if (!response.ok) return null;
    const body = await response.json();
    return validActionFeed(body) ? body : null;
  } catch { return null; }
}
