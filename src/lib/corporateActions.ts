import type { Account, Position } from "./types";
import { applyQuotes, listingIsinFor, symbolFor, quoteSymbolFor, type QuoteFeed } from "./quotes";
import { requestDeadline } from "./requestDeadline";
import { isCounted } from "./analytics";
import { fifoReturnPct } from "../../shared/fifo.mjs";
import { validActionFeed, type ActionFeed, type ResearchAction } from "../../shared/corporateActions.mjs";
export type { ActionFeed, ResearchAction } from "../../shared/corporateActions.mjs";

export type ActionLine = {
  action: ResearchAction;
  status: "in-statement" | "upcoming" | "adjusted" | "declared" | "elective" | "needs-review";
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
  /**
   * WHY A LIVE QUOTE THAT ARRIVED WAS HELD BACK, in the gate's own words — null
   * where no quote arrived for this security, or where the price went live.
   * Read it through `liveWithheldReason`; see there.
   */
  liveWithheld: string | null;
};
export const positionActionKey = (p: Pick<Position, "accountId" | "securityKey">) => `${p.accountId}|${p.securityKey}`;
export const marketDay = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 19_800_000).toISOString().slice(0, 10) : "";
};

/** Exact identifiers only. A conflicting ISIN is evidence against a ticker match. */
export function actionsFor(p: Position, feed: ActionFeed | null): ResearchAction[] {
  if (!feed) return [];
  const symbol = symbolFor(p), isin = listingIsinFor(p);
  return feed.rows.filter((r) => (isin && r.isin === isin) || (symbol && r.ticker === symbol))
    .sort((a, b) => (a.exDate || "9999").localeCompare(b.exDate || "9999") || a.id.localeCompare(b.id));
}

const COVERAGE_GAP = "Event capture does not cover the valuation date";

/**
 * ── A BUYBACK IS AN OFFER TO BUY, NOT A SHARE EVENT (Stage 10gr) ────────────
 *
 * *"Why in the daily movers for direct equity … only one holding is shown as
 * percentage move, and why is it saying shares count unverified?"* — the
 * family, 22 Oct 2026. The one name was EMA Partners on Ajay's ICICI NSDL
 * demat: a tender-offer buyback went ex on 30 Apr, after the 31 Mar statement,
 * and the gate filed it beside a demerger or a rights issue — events that
 * change a holder's shares, or the exchange's price basis, without the holder
 * doing anything. A buyback does neither. The company buys only the shares a
 * holder chooses to tender (or sells it on the market), and a tender is a SALE,
 * which the account's own record carries like any other (`realizedLotsAfter`,
 * `rolledForward`; ASK's tape prints one as `Buyback Shares`, a disposal). So a
 * buyback leaves the statement's quantity standing on exactly the terms every
 * other carried holding stands on — no trades after the statement unless the
 * account records one — and a recorded sale still withholds the price.
 */
export const isHolderElective = (type: ResearchAction["type"]) => type === "buyback";
const HOLDER_ELECTIVE = "A buyback changes the holding only through shares tendered, which is a sale the account's own record carries";

/**
 * Whether the exchange's previous close may still be on the pre-event basis on
 * this event's ex-date. A dividend and a buyback leave the basis alone.
 */
export const movesCloseBasis = (type: ResearchAction["type"]) => type !== "dividend" && !isHolderElective(type);

/**
 * HOW FAR BEHIND THE VALUATION DATE A CAPTURE MAY BE AND STILL COVER ITS SHARE
 * EVENTS — three calendar days: an overnight lag, or a Friday capture read on
 * Monday.
 *
 * *"Why is this data not showing"* — 24 Sep 2026, 10:50 IST, Today's movers
 * empty. Every company share needed a capture dated TODAY before it could be
 * marked live. Glow Central Research captures once a day, after the market
 * opens (04:43 UTC, 10:13 IST, that day), and the committed fallback was dated
 * the day before. So every morning from the open until the new capture reached
 * the browser — and all day wherever the live proxy did not answer — no company
 * share in the book had a live price or a day move. The gate was right about
 * WHAT it guards and wrong about how stale a capture must be to hide it.
 *
 * What it guards is a split or bonus pairing a pre-split quantity with a
 * post-split price. Those cannot appear unannounced overnight: SEBI LODR
 * Regulation 42(2) requires the record date to be notified to the exchange at
 * least seven working days ahead, and the capture carries forthcoming share
 * events — measured on the 24 Sep capture, six splits and bonuses 1 to 32 days
 * ahead, and on the 23 Sep one, BUILDPRO's 8 Oct split. A split effective
 * within three days of a capture was announced before it and is in it.
 *
 * A DIVIDEND IS NOT GIVEN THE SAME ROOM. It changes no quantity, only the
 * total return, and a missing one would read as zero income — so the income
 * side still needs a capture that covers the day, and the total return is
 * withheld until one does.
 */
export const SHARE_EVENT_LEAD_DAYS = 3;

/** Whole days between the capture's coverage and `through`; Infinity where it cannot say. */
function captureLagDays(feed: ActionFeed, through: string): number {
  if (!feed.verifiedThrough || !through || through > feed.requestedTo) return Infinity;
  const days = (Date.parse(through) - Date.parse(feed.verifiedThrough)) / 86_400_000;
  return Number.isFinite(days) ? Math.max(0, Math.round(days)) : Infinity;
}

/**
 * A forward projection of the statement's holdings, NOT a trading ledger.
 * Only events AFTER that account's dated closing are applied, exactly once.
 * Cash here is a gross entitlement, never a claimed bank receipt or book asset.
 */
export function projectActions(p: Position & { quantity: number }, statementDate: string, through: string, feed: ActionFeed | null): ActionReturn {
  const result: ActionReturn = {
    accountId: p.accountId, securityKey: p.securityKey, statementDate, through,
    statementQuantity: p.quantity, adjustedQuantity: p.quantity, factor: 1,
    openingValue: p.marketValue, closingValue: p.marketValue,
    priceReturnPct: null, totalReturnPct: null, dividendEntitlement: null,
    quantityIssues: [], incomeIssues: [], lines: [], capturedAt: feed?.capturedAt ?? null,
    liveWithheld: null,
  };
  const qi = result.quantityIssues, di = result.incomeIssues;
  if ((p.realizedLotsAfter ?? 0) > 0) qi.push("Sales are recorded after this statement; a newer holding balance is required");
  if (!feed) { di.push("Corporate-action feed unavailable"); return result; }
  if (!statementDate || !through || through < statementDate) di.push("No comparable dated valuation");
  if (feed.symbols && !feed.symbols.includes(symbolFor(p) || "") && !feed.isins.includes(listingIsinFor(p) || "")) di.push("Security outside the saved feed's coverage");
  if (statementDate < feed.requestedFrom) di.push("Statement predates the available event history");
  const lag = captureLagDays(feed, through);
  if (lag > 0) di.push(COVERAGE_GAP);
  // Missing coverage can hide a share event too, not only a dividend. Never
  // pair a potentially pre-split quantity with a post-split live price.
  //
  // EXCEPT A CAPTURE A DAY OR TWO BEHIND, which cannot hide one. See
  // `SHARE_EVENT_LEAD_DAYS`: a split or bonus is announced well before its
  // ex-date and the capture lists it ahead, so a short lag withholds the
  // DIVIDEND side (above, still in `di`) and not the live price.
  qi.push(...di.filter((issue) => issue !== COVERAGE_GAP || lag > SHARE_EVENT_LEAD_DAYS));
  let quantity = p.quantity, cash = 0;
  const events = actionsFor(p, feed);
  const seen = new Map<string, ResearchAction>();
  for (const action of events) {
    const date = action.exDate;
    const line: ActionLine = { action, status: "needs-review", quantity: null, amount: null, reason: null };
    result.lines.push(line);
    if (date && date <= statementDate) { line.status = "in-statement"; continue; }
    if (date && date > through) { line.status = "upcoming"; continue; }
    if (isHolderElective(action.type)) { line.status = "elective"; line.reason = HOLDER_ELECTIVE; continue; }
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
      // Rights, demergers etc. need choices/allocations this feed cannot
      // supply. Do not combine a pre-action quantity with a new price.
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
  const output = positions.flatMap((stated) => {
    // THE ACCOUNT'S OWN TAPE, PAST ITS STATEMENT (Stage 10dw). Where `build-book`
    // could roll a holding forward — every sale after the statement date on the
    // account's own tape, witnessed by the depository's closing balance or the
    // capital gain lots — the live layer marks THAT quantity rather than
    // withholding the price for want of "a newer holding balance": the newer
    // balance is the account's own record. A holding the tape sold to nil is not
    // held, so it is not a live row. The statement basis is never touched.
    const rf = stated.rolledForward;
    if (rf && rf.quantity === 0) return [];
    const p: Position = rf ? rolledPosition(stated, rf) : stated;
    // A share event multiplies a unit count; a line recorded with none (the
    // review's private investments, Stage 10dh) has nothing to adjust and is
    // never priced live, so it takes the plain overlay, which leaves it alone.
    if (p.assetClass !== "Equity" || !isCounted(p)) return applyQuotes([p], quotes)[0];
    const sym = quoteSymbolFor(p);
    const q = quotes?.quotes[sym || ""];
    /**
     * THE WINDOW OPENS ON THE MARK'S OWN DATE, ROLLED OR NOT (Stage 10fz). It
     * opened on `rf.through` for a rolled holding, while `rolledPosition`
     * values the opening at the STATEMENT's price: Belrise Industries on LKP
     * 98245 read "from 4 Aug 2026" over an opening of 6,500 × ₹186, the
     * 31 Mar mark. And every event between was filed "in-statement" — so a
     * dividend going ex in (31 Mar, 4 Aug] was dropped from the total return
     * while the price fall it causes stayed in the price return. The price base
     * and the event classification now share one date, the statement's. The
     * units are the roll's: a roll that only SOLD leaves units that were held
     * from the statement date, and one that BOUGHT has units with no mark on
     * that date, so it strikes no period return (below).
     */
    const start = dates.get(p.accountId) || "";
    const end = q ? marketDay(q.tradedAt || quotes!.asOf) : start;
    const plan = projectActions(p, start, end, feed);
    if (rf) {
      // A SHARE EVENT INSIDE THE ROLL cannot be projected: the tape's quantity
      // may already carry it (a bonus credited to the demat) while the opening
      // mark is pre-event, so neither applying its factor nor omitting it is safe.
      if (plan.lines.some((l) => (l.action.type === "split" || l.action.type === "bonus")
        && !!l.action.exDate && l.action.exDate > start && l.action.exDate <= rf.through)) {
        plan.quantityIssues.push("A share adjustment falls between the statement and the account's later trades; a newer holding balance is required");
      }
    }
    const boughtSince = !!rf && typeof stated.quantity === "number" && rf.quantity > stated.quantity;
    if (boughtSince) {
      plan.incomeIssues.push("Units bought after the statement have no mark on its date, so no period return is struck");
      plan.dividendEntitlement = null;
    }
    // A quote without a trade timestamp cannot prove it is post-action on
    // the ex-date itself (weekends, pre-open and cached prices matter).
    if (q && !q.tradedAt && plan.lines.some((l) => l.status === "adjusted")) {
      plan.quantityIssues.push("A dated post-action quote is required for adjusted shares");
    }
    if (q && !q.tradedAt && plan.lines.some((l) => l.status === "declared")) {
      plan.incomeIssues.push("A dated post-dividend quote is required for total return");
      plan.dividendEntitlement = null;
    }
    // A quote older than the roll's last trade prices a quantity the account
    // did not yet hold — the roll's date is the floor for the QUOTE, while the
    // window still opens on the statement's.
    if (q && end < (rf?.through ?? start)) plan.quantityIssues.push("Quote predates the holding statement");
    if (!feed) plan.quantityIssues.push("Waiting for corporate-action evidence before marking shares live");
    const blocked = plan.quantityIssues.length > 0;
    // THE GATE'S OWN REASON, kept where the price is decided. A quote that
    // arrived and was held back is a different fact from a quote that never
    // came, and every page used to word both as "no quote" (DL-9).
    plan.liveWithheld = q && blocked ? [...new Set(plan.quantityIssues)].join(". ") : null;
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
      // THE CAUSE PICKS THE WORDS. A security with no NSE symbol can never be
      // priced live, whatever the evidence says, so "withheld pending share
      // reconciliation" was the wrong cause on every one of them (DL-15).
      plan.incomeIssues.push(!sym
        ? "No NSE symbol resolves for this security, so it cannot be priced live and no period return can be struck"
        : !q ? "No live quote arrived for this security in this round, so no period return can be struck"
        : blocked ? "Live valuation withheld pending share reconciliation"
        : "A live quote is required for the period return");
      for (const line of plan.lines) if (line.status === "adjusted" || line.status === "declared") {
        line.status = "needs-review"; line.reason = "Awaiting a comparable post-action quote";
        line.amount = null; line.quantity = null;
      }
    } else {
      plan.closingValue = priced.marketValue;
      if (p.marketValue > 0 && end >= start && !boughtSince) {
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
    return [priced];
  });
  return { positions: output, returns };
}

/**
 * The statement's holding at the quantity its account's own tape carries it
 * to — cost, realised and the cost of the units sold as `build-book` rolled
 * them (null where a sale is not yet settled by a capital-gain lot), valued at
 * the statement's mark until a quote moves it. `realizedLotsAfter` is spent:
 * every one of those sales is inside the roll.
 *
 * A statement that prints a value and no price (ICICI NSDL's Yash Highvoltage,
 * rolled on the review, Stage 10hb) marks a unit at that value over its own
 * units — never the old count's whole value over the new count. And a roll
 * whose sale cash is unverified carries no return.
 */
function rolledPosition(p: Position, rf: NonNullable<Position["rolledForward"]>): Position {
  const quantity = rf.quantity;
  const mark = p.currentPrice ?? (typeof p.quantity === "number" && p.quantity > 0 ? p.marketValue / p.quantity : null);
  const marketValue = mark === null ? p.marketValue : quantity * mark;
  const cost = rf.costBasis;
  const unrealizedPnL = cost === null ? null : marketValue - cost;
  return {
    ...p, quantity, marketValue,
    costBasis: cost,
    avgCost: cost === null || !(quantity > 0) ? null : cost / quantity,
    unrealizedPnL,
    realizedPnL: rf.realizedPnL,
    costOfUnitsSold: rf.costOfUnitsSold,
    realizedLotsAfter: 0,
    // NO `cost > 0` GATE (Stage 10fz). It refused a holding whose remaining
    // units cost nothing — bonus shares left after every bought one was sold,
    // the whole gain realised — though its return on what was deployed is a
    // measurement: `fifoReturnPct` abstains exactly where the cost held plus
    // the cost of the units sold is not positive.
    returnPct: cost === null || unrealizedPnL === null || rf.hprUnavailableReason ? null
      : fifoReturnPct(marketValue, cost, rf.realizedPnL, rf.costOfUnitsSold, p.dividendReceived),
    ...(rf.hprUnavailableReason ? { hprUnavailableReason: rf.hprUnavailableReason } : {}),
  };
}

/**
 * ── WHY THIS POSITION'S LIVE PRICE IS HELD BACK, OR NULL ─────────────────────
 *
 * The corporate-action gate withholds a live quote that DID arrive wherever
 * pairing it with the statement's share count could be wrong: a rights issue
 * or a demerger the feed cannot allocate, sales recorded after the statement,
 * an event capture that does not reach the quote's day, or the evidence still
 * loading. Every page that shows a price used to infer "the feed returned no
 * quote" instead, which sends a reader to wait for a feed that already
 * answered (DL-9).
 *
 * Returns the gate's own sentence for the position, or null where the gate is
 * not what kept it off a live price — no quote arrived for it, it is not an
 * equity (funds are never gated), or it went live. One helper so the company
 * page, the Portfolio Monitor's price hover and the basis pill say the same
 * words about the same position.
 */
export function liveWithheldReason(
  p: Pick<Position, "accountId" | "securityKey">,
  returns: ReadonlyMap<string, ActionReturn>,
): string | null {
  return returns.get(positionActionKey(p))?.liveWithheld ?? null;
}

/** Refresh failure retains the dated capture, never converts unknown income to zero. */
export async function fetchCorporateActions(symbols: string[], isins: string[], signal?: AbortSignal): Promise<{ feed: ActionFeed; retained: boolean; refreshing: boolean } | null> {
  const deadline = requestDeadline(30_000, signal);
  try {
    const params = new URLSearchParams({ symbols: [...new Set(symbols)].sort().join(","), isins: [...new Set(isins)].sort().join(",") });
    const response = await fetch(`/api/corporate-actions?${params}`, { signal: deadline.signal });
    if (!response.ok) return null;
    const body = await response.json();
    return body.ok && validActionFeed(body.feed) ? { feed: body.feed, retained: !!body.retained, refreshing: !!body.refreshing } : null;
  } catch { return null; }
  finally { deadline.dispose(); }
}

export async function savedCorporateActions(signal?: AbortSignal): Promise<ActionFeed | null> {
  const deadline = requestDeadline(15_000, signal);
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/corporate-actions.json`, { signal: deadline.signal });
    if (!response.ok) return null;
    const body = await response.json();
    return validActionFeed(body) ? body : null;
  } catch { return null; }
  finally { deadline.dispose(); }
}
