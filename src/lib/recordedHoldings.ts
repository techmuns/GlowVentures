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
import { securityLabel } from "./securityLabel";
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

/**
 * THE RECORDED LINE AN ACCOUNT HOLDS OF A COMPANY, by the key a page stands
 * under — so a note about that account's depository window can give the line's
 * own reason (a last movement's price, a face value) rather than one written
 * for an account that prints no rate at all.
 */
export function recordedLineFor(
  accountId: string,
  pageKey: string,
  lines: readonly RecordedLine[] = RECORDED,
): RecordedLine | null {
  const home = homeKeyOf(pageKey, lines);
  return lines.find((l) => l.accountId === accountId && l.homeKey === home) ?? null;
}

/**
 * ── THE COMPANIES A FUND'S LINE MAY JOIN TO (Stage 10cy) ────────────────────
 *
 * Every company share the book values, THEN every one a statement records and
 * nothing values, under the key the live layer would file it by (`homeKey`).
 *
 * Without the second half, a company the family holds only as a recorded line
 * joined to nothing, and the look-through filed its funds' lines under the
 * FILING's name for it: Ankita's 4,875 Kaynes stood on the Portfolio Monitor as
 * `kaynes-technology-india` until a live quote made the demat line a row, and
 * as `kaynes-technology` after — one company under two keys, decided by
 * whether the quote feed had answered. Its company page drew none of the funds
 * that hold it, a second page stood for the funds' spelling, and Ajay's window
 * that sold it out, keyed on the book's own company, reached no row at all.
 *
 * The book's rows come FIRST, so a statement's own ISIN still wins, and a
 * recorded line only fills an ISIN nothing valued carries. Nothing here is a
 * value: the join decides WHICH ROW a fund's derived share stands on.
 */
export function lookthroughCompanies(
  consolidated: readonly Position[],
  lines: readonly RecordedLine[] = RECORDED,
): Array<Pick<Position, "securityKey" | "isin" | "assetClass">> {
  return [
    ...consolidated.filter((p) => p.assetClass === "Equity"),
    ...lines.filter((l) => l.assetClass === "Equity")
      .map((l) => ({ securityKey: l.homeKey, isin: l.isin ?? null, assetClass: "Equity" as const })),
  ];
}

/**
 * THE NAME A RECORDED COMPANY IS SHOWN UNDER — one of the spellings the
 * family's own statements printed for it (`securityLabel`), taken from the line
 * that stands under the home key itself where there is one. A company the family
 * holds only as a recorded line is still THEIRS, so a row or an option standing
 * for it wears their statement's name, never a fund's filing: without this the
 * Portfolio Monitor offered `Kaynes Technology India Limited` — HDFC Balanced
 * Advantage's spelling — for Ankita's own 4,875 shares, and the company page one
 * click away named it `Kaynes Technology`.
 */
export function recordedLabel(homeKey: string, lines: readonly RecordedLine[] = RECORDED): string | null {
  const ls = lines.filter((l) => l.homeKey === homeKey);
  if (!ls.length) return null;
  return securityLabel(homeKey, (ls.find((l) => l.securityKey === homeKey) ?? ls[0]).security);
}

export type RecordedGroup = { homeKey: string; label: string; units: number; lines: RecordedLine[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * THE RECORDED HOLDINGS A SEARCH NAMES, one per company, where the live book
 * has no row for it. A search that finds no option says so, and must not stay
 * silent about a holding a statement records: "No holdings match Kaynes" to a
 * family holding 4,875 shares of it reads as the dashboard having lost them.
 * Matched on any spelling a statement printed, by substring — never fuzzily.
 */
export function recordedMatching(
  query: string,
  live: readonly Position[],
  lines: readonly RecordedLine[] = RECORDED,
): RecordedGroup[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const liveKeys = new Set(live.map((p) => p.securityKey));
  const groups = new Map<string, RecordedLine[]>();
  for (const l of lines) {
    if (liveKeys.has(l.homeKey) || carriedBy(l, live)) continue;
    groups.set(l.homeKey, [...(groups.get(l.homeKey) ?? []), l]);
  }
  return [...groups].map(([homeKey, ls]) => ({
    homeKey,
    label: recordedLabel(homeKey, lines) ?? securityLabel(homeKey, ls[0].security),
    units: ls.reduce((a, l) => a + l.quantity, 0),
    lines: ls,
  })).filter((g) => [g.label, ...g.lines.map((l) => l.security)].some((n) => norm(n).includes(q)));
}
