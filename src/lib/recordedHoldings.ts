/**
 * WHAT A STATEMENT RECORDS AND NOTHING VALUES, FILED UNDER ONE COMPANY.
 *
 * `BOOK_UNVALUED_HOLDINGS` carries a holding a statement records with a
 * quantity and no value this book may use — a depository's last-movement price,
 * a face value, a unit count. The live layer values some of them (a share the
 * quote feed prices, a fund AMFI publishes a NAV for); the rest stay recorded
 * and unvalued. Either way the family holds them, so a page about the company
 * must never say it is "fully exited".
 *
 * THE HOME KEY IS WHERE THE LIVE LAYER WOULD FILE THE LINE, so a line shown as
 * recorded and the same line once priced stand under one company:
 *   1. a mutual fund or an ETF keeps its OWN key — the fund overlay does, and
 *      merging a clipped scheme name into the AMC's would hide the extractor
 *      join `docs/BOOK-REPORT.md` names;
 *   2. otherwise the book's key for that ISIN, or for the NSE symbol it
 *      resolves where exactly one key carries it (`bookKeyForShare`);
 *   3. otherwise the fullest-named recorded line carrying the same ISIN, so two
 *      statements spelling one unlisted company are one page;
 *   4. otherwise its own key.
 * Joined by identifier only, never by a name.
 */
import { BOOK_POSITIONS, BOOK_UNVALUED_HOLDINGS } from "../data/glowData";
import { bookKeyForShare } from "./depositoryShares";
import type { Position, UnvaluedStatementHolding } from "./types";

export type RecordedLine = UnvaluedStatementHolding & { quantity: number; homeKey: string };

const isinOf = (x: { isin?: string | null }) => x.isin?.trim().toUpperCase() || null;
const OWN_KEY_CLASSES = new Set(["Mutual Fund", "ETF"]);

export function recordedLines(
  unvalued: readonly UnvaluedStatementHolding[] = BOOK_UNVALUED_HOLDINGS,
  positions: readonly Position[] = BOOK_POSITIONS,
): RecordedLine[] {
  // A line another statement reports at the same units is that statement's.
  const held = unvalued.filter((u) => !u.sameUnitsReportedBy && typeof u.quantity === "number" && u.quantity > 0);
  const twin = new Map<string, UnvaluedStatementHolding>();
  for (const u of held) {
    const isin = isinOf(u);
    if (!isin) continue;
    const t = twin.get(isin);
    if (!t || u.security.length > t.security.length
      || (u.security.length === t.security.length && u.securityKey < t.securityKey)) twin.set(isin, u);
  }
  return held.map((u) => {
    const isin = isinOf(u);
    const ownKey = !isin || (u.assetClass !== null && OWN_KEY_CLASSES.has(u.assetClass));
    const homeKey = ownKey ? u.securityKey
      : bookKeyForShare(isin, u.securityKey, positions) ?? twin.get(isin)?.securityKey ?? u.securityKey;
    return { ...u, quantity: u.quantity as number, homeKey };
  });
}

const RECORDED = recordedLines();
export const allRecordedLines = (): readonly RecordedLine[] => RECORDED;

/** The key a page for this security stands under — its lines' one home, else itself. */
export function homeKeyOf(key: string, lines: readonly RecordedLine[] = RECORDED): string {
  const homes = new Set(lines.filter((l) => l.securityKey === key).map((l) => l.homeKey));
  return homes.size === 1 ? [...homes][0] : key;
}

/** True where a row of `live` already carries the line: same account, same ISIN (or key, with none). */
export function carriedBy(l: RecordedLine, live: readonly Position[]): boolean {
  const isin = isinOf(l);
  return live.some((p) => p.accountId === l.accountId && (isin ? isinOf(p) === isin : p.securityKey === l.securityKey));
}

/** The lines a page stands over that no row of the live book already carries. */
export function recordedFor(
  pageKey: string,
  live: readonly Position[],
  lines: readonly RecordedLine[] = RECORDED,
): RecordedLine[] {
  const home = homeKeyOf(pageKey, lines);
  return lines.filter((l) => l.homeKey === home && !carriedBy(l, live));
}
