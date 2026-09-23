/**
 * ── PRICE ALERTS: WHICH PRICE IS CHECKED, AND WHAT HAS BEEN REACHED ─────────
 *
 * *"Does these alerts actually work, can you make this much simpler to fill in
 * for the customer and also in morning CIO can you make an ALL alerts tab where
 * in a beautiful table format whenever the alerts which have been set are
 * triggered they show simply and ofcourse should look like an alert for entry
 * exit or whatever."*
 *
 * They half worked, and the three ways they did not are each fixed HERE rather
 * than in a page, so the stock page's alert boxes and Morning CIO's All alerts
 * table cannot disagree about whether one alert has fired:
 *
 *  1. AN ALERT WAS SEEN ONLY ON ITS OWN STOCK'S PAGE. The old `firedAlerts` ran
 *     inside the Investment tools card and nowhere else, so an alert "fired"
 *     for a reader who happened to open that one company and for nobody else.
 *     That is a note, not an alert.
 *  2. THE BUY LEVEL NEVER FIRED. `entryPrice` was stored, labelled "the level at
 *     which we would add", and missing from `firedAlerts` — a buy level that
 *     reaches its price and says nothing.
 *  3. IT FIRED ON A STALE MARK. With no live quote it compared the level with
 *     the STATEMENT's own price, weeks old, and admitted it in a parenthesis —
 *     which is exactly what this book's alert rule forbids (CLAUDE.md, "The
 *     alert engine — silence is read as all-clear"): a rule whose inputs are
 *     incomplete does not fire, and does not pass either.
 *
 * ── WHICH PRICE, DECIDED IN ONE PLACE ───────────────────────────────────────
 *
 * `priceNowFor` answers it, strongest first: an intraday QUOTE where the feed
 * priced the holding; the fund's own published NAV where AMFI priced it (a fund
 * has no intraday price — its NAV IS its price, struck once a day and dated,
 * Stage 10bn); and otherwise NOTHING, with the reason. A statement mark is never
 * checked: it is the price on the day the statement was drawn, and "has it
 * reached my level" is a question about now.
 *
 * "CHECKING" IS ITS OWN STATE, NOT "NO PRICE". While the feed has still to
 * answer for a symbol, saying the holding has no live price would be a claim
 * about the holding made before the answer arrived — Today's movers' own defect
 * (Stage 10r), arriving in a new table.
 *
 * ── ONE FIELD PER KIND, AND NOTHING NEW IN THE STORE ─────────────────────────
 *
 * The five kinds are the five price levels `watchlist.ts` already stores, under
 * the words an investor uses for them. Nothing the family typed moves: a level
 * they set as "Alert below" is the Stop loss now and fires exactly as before,
 * and "Entry price" is "Buy at" — which now fires, where it never did.
 *
 * PURE. No React, no storage, no feed: every input is an argument, so the
 * suite (`priceAlerts.test.ts`) exercises every state without a browser and
 * the two surfaces that draw alerts call the same function.
 */
import type { AssetClass, Position } from "./types";
import type { Watchlist } from "./watchlist";

export type AlertKind = "entry" | "exit" | "below" | "target" | "above";
export type AlertField = "entryPrice" | "exitPrice" | "alertBelow" | "targetPrice" | "alertAbove";

export type AlertDef = {
  kind: AlertKind;
  /** The `WatchEntry` field this alert lives in. One field per kind. */
  field: AlertField;
  /** What the reader sets it as, in an investor's words. */
  label: string;
  /** Which way the price must move to reach it: `down` fires AT OR BELOW, `up` AT OR ABOVE. */
  dir: "down" | "up";
  /** One plain line saying when it fires. */
  when: string;
  /** What the table says once it has. */
  reached: string;
};

/**
 * THE FIVE KINDS, in the order a reader meets them. The first four are the
 * stock page's main row; `above` is kept, under "More", because a level the
 * family set must never become unreachable — but a Sell at and a Target already
 * cover "tell me when it rises to…", and three boxes for one direction is the
 * clutter the family asked to be rid of.
 */
export const ALERT_DEFS: readonly AlertDef[] = [
  { kind: "entry", field: "entryPrice", label: "Buy at", dir: "down",
    when: "Alerts when the price falls to this or lower", reached: "Buy level reached" },
  { kind: "exit", field: "exitPrice", label: "Sell at", dir: "up",
    when: "Alerts when the price rises to this or higher", reached: "Sell level reached" },
  { kind: "below", field: "alertBelow", label: "Stop loss", dir: "down",
    when: "Alerts when the price falls to this or lower", reached: "Stop loss hit" },
  { kind: "target", field: "targetPrice", label: "Target", dir: "up",
    when: "Alerts when the price reaches your target", reached: "Target reached" },
  { kind: "above", field: "alertAbove", label: "Alert above", dir: "up",
    when: "Alerts when the price rises to this or higher", reached: "Above your level" },
];

export const ALERT_DEF = Object.fromEntries(ALERT_DEFS.map((d) => [d.kind, d])) as Record<AlertKind, AlertDef>;

/** The price an alert is checked against, or why there is none. */
export type PriceNow =
  | { state: "live"; price: number }
  | { state: "nav"; price: number; asOf: string }
  | { state: "checking" }
  | { state: "none"; reason: string };

/** What the quote feed has done so far — the three things `priceNowFor` needs from it. */
export type FeedState = {
  status: "loading" | "live" | "unavailable";
  /** Of these symbols, the ones the feed has still to answer for. */
  pending: (symbols: readonly string[]) => string[];
  /** The NSE symbol a holding is quoted under, if any. */
  symbolOf: (p: Position) => string | null;
};

const hasPrice = (p: Position): boolean =>
  typeof p.currentPrice === "number" && Number.isFinite(p.currentPrice) && p.currentPrice > 0;

/**
 * Why a holding the feed CANNOT reach has no price to check, worded by what it
 * is — "no live price" sends a reader to wait for a feed, which for an AIF
 * would be a wait with no end.
 */
function noPriceReason(c: AssetClass | undefined): string {
  if (c === "AIF") return "an AIF has no live price — it is valued only on its statement";
  if (c === "Unlisted") return "an unlisted holding has no market price";
  if (c === "Cash") return "cash has no market price";
  if (c === "Mutual Fund" || c === "ETF") return "no live quote or published NAV reaches this scheme";
  return "no live price reaches this holding — it is valued only on its statement";
}

/**
 * THE PRICE AN ALERT IS CHECKED AGAINST, for one holding's rows.
 *
 * `rows` are the holding's positions from the LIVE-overlaid book
 * (`portfolio.positions`), so a quote or a NAV is already on them. Every row of
 * one holding shares one quote and one NAV, so the first priced row speaks for
 * all of them.
 */
export function priceNowFor(rows: readonly Position[], feed: FeedState): PriceNow {
  const live = rows.find((r) => r.live && hasPrice(r));
  if (live) return { state: "live", price: live.currentPrice as number };
  const nav = rows.find((r) => r.navPriced && hasPrice(r));
  if (nav) return { state: "nav", price: nav.currentPrice as number, asOf: nav.navDate ?? "" };
  if (!rows.length) return { state: "none", reason: "not held on any statement in this book, so no price is fetched for it" };
  const sym = rows.map(feed.symbolOf).find((s): s is string => !!s) ?? null;
  if (sym) {
    if (feed.status === "loading") return { state: "checking" };
    if (feed.status === "live" && feed.pending([sym]).length) return { state: "checking" };
    return {
      state: "none",
      reason: feed.status === "unavailable"
        ? "live prices are not reaching the dashboard right now"
        : "no usable live quote for this name right now",
    };
  }
  return { state: "none", reason: noPriceReason(rows[0]?.assetClass) };
}

export type AlertStatus = "reached" | "watching" | "checking" | "unchecked";

export type LevelCheck = {
  status: AlertStatus;
  /** How far the price must still move to reach the level, as a % of the price now. Watching only. */
  toGoPct: number | null;
  /** How far past the level the price already is, as a % of the level. Reached only. */
  pastPct: number | null;
};

/**
 * ONE LEVEL AGAINST ONE PRICE.
 *
 * Reached is INCLUSIVE — "falls to this or lower" — because a level set at a
 * round number the price then touches exactly must fire; an alert that waits
 * for the price to go one paisa further is not the one the reader set.
 *
 * With no price there is no verdict either way: `checking` while the feed is
 * still answering, `unchecked` when it cannot. Neither is ever `watching`,
 * which would be a check that was never made reading as one that held.
 */
export function checkLevel(dir: "down" | "up", level: number, now: PriceNow): LevelCheck {
  if (now.state === "checking") return { status: "checking", toGoPct: null, pastPct: null };
  if (now.state === "none" || !(level > 0)) return { status: "unchecked", toGoPct: null, pastPct: null };
  const p = now.price;
  const reached = dir === "down" ? p <= level : p >= level;
  return reached
    ? { status: "reached", toGoPct: null, pastPct: (Math.abs(p - level) / level) * 100 }
    : { status: "watching", toGoPct: (Math.abs(level - p) / p) * 100, pastPct: null };
}

/** One alert, one row of the All alerts table. */
export type AlertRow = LevelCheck & {
  /** `<securityKey>:<kind>` — one row per alert, so a holding with two alerts is two rows. */
  id: string;
  securityKey: string;
  name: string;
  kind: AlertKind;
  level: number;
  now: PriceNow;
  /** When the reader last changed anything on this holding's alerts. */
  updatedAt: string;
};

const STATUS_RANK: Record<AlertStatus, number> = { reached: 0, checking: 1, watching: 2, unchecked: 3 };
const KIND_RANK = Object.fromEntries(ALERT_DEFS.map((d, i) => [d.kind, i])) as Record<AlertKind, number>;

/**
 * THE ORDER A READER WANTS BEFORE THEY PICK ONE: what has fired first, the
 * furthest past its level at the top; then what is still being checked; then
 * what is being watched, closest first; then what cannot be checked at all.
 * Ties fall to the name, so the order is stable from one poll to the next — a
 * table that reshuffles every sixty seconds is one a reader cannot scan.
 */
export function compareAlertRows(a: AlertRow, b: AlertRow): number {
  const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (r) return r;
  if (a.status === "reached") {
    const d = (b.pastPct ?? 0) - (a.pastPct ?? 0);
    if (d) return d;
  }
  if (a.status === "watching") {
    const d = (a.toGoPct ?? 0) - (b.toGoPct ?? 0);
    if (d) return d;
  }
  return a.name.localeCompare(b.name) || KIND_RANK[a.kind] - KIND_RANK[b.kind];
}

/** A level the store holds: a finite positive price. Null or anything else is NOT SET. */
const isLevel = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** A key the reader will recognise when the book no longer names it. */
const prettyKey = (k: string) => k.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * EVERY ALERT THE READER HAS SET, CHECKED.
 *
 * The NAME is the book's own label where the book still holds the name — it
 * tracks the display rules every other page follows — and the name saved with
 * the alert where it does not, so an alert on a holding since sold still says
 * what it is about rather than showing a slug.
 */
export function alertRows(
  watchlist: Watchlist,
  rowsFor: (securityKey: string) => readonly Position[],
  feed: FeedState,
): AlertRow[] {
  const out: AlertRow[] = [];
  for (const [key, entry] of Object.entries(watchlist)) {
    const levels = ALERT_DEFS.filter((d) => isLevel(entry[d.field]));
    if (!levels.length) continue;
    const rows = rowsFor(key);
    const now = priceNowFor(rows, feed);
    const name = rows[0]?.security || entry.name || prettyKey(key);
    for (const d of levels) {
      const level = entry[d.field] as number;
      out.push({
        id: `${key}:${d.kind}`, securityKey: key, name, kind: d.kind, level, now,
        updatedAt: entry.updatedAt, ...checkLevel(d.dir, level, now),
      });
    }
  }
  return out.sort(compareAlertRows);
}

export type AlertCounts = { total: number; reached: number; watching: number; checking: number; unchecked: number };

export function alertCounts(rows: readonly AlertRow[]): AlertCounts {
  const n = (s: AlertStatus) => rows.filter((r) => r.status === s).length;
  return { total: rows.length, reached: n("reached"), watching: n("watching"), checking: n("checking"), unchecked: n("unchecked") };
}

/**
 * THE DISTANCE COLUMN'S SORT VALUE. Reached rows sort as the NEGATIVE of how
 * far past they are, so ascending puts the most overdue first and then walks
 * outwards through what is closest to firing. An alert with no price has no
 * distance and sorts last in both directions, as every absent value does.
 */
export const distanceOf = (r: AlertRow): number | null =>
  r.status === "reached" ? -(r.pastPct ?? 0) : r.status === "watching" ? r.toGoPct : null;

/**
 * A typed price, read strictly. Blank is NOT SET — the reader clearing a level
 * — and anything that is not a positive number is REFUSED rather than read as
 * blank: the old parser turned "abc" into a silent delete of the level that was
 * there, which is the one thing a form must never do to a figure somebody set.
 */
export function parseLevel(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  const n = Number(t.replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) && n > 0 ? { ok: true, value: n } : { ok: false };
}

/**
 * WHERE A HOLDING'S ALERT BOXES ARE: the My targets tab of its own page, with
 * `#alerts` so the card scrolls itself into view. Main's Stage 10cn made the
 * position page five tabs, so a bare `/stock/<key>#alerts` opens Position — a
 * page that does not draw the boxes — and the All alerts pencil would have
 * opened the right holding and not its alerts. ONE definition, read by the
 * pencil, the row's name link and the New alert finder, so none of them can
 * open the page on a tab the boxes are not on (Stage 10co).
 */
export const alertBoxesHref = (securityKey: string): string =>
  `/stock/${encodeURIComponent(securityKey)}?tab=targets#alerts`;
