/**
 * ── EVERY LEVEL THE FAMILY SETS ALSO GOES TO GLOW CENTRAL RESEARCH ──────────
 *
 * *"when the user puts target price inside the dashboard, it should
 * automatically also go to the Glow Central Research dashboard. When the target
 * price is met, it should show in All Alerts as an alert, and automatically come
 * to the AI Alert section in the Glow Central Research dashboard."* (Stage 10cn)
 *
 * Glow Central Research is a separate app on its own server, so a level kept in
 * this browser's `localStorage` can never reach it on its own. It keeps ONE
 * shared list of the family's price levels (`/api/price-levels`, a Durable
 * Object on its Worker), checks each against ITS OWN live price once a minute
 * while the market is open, and turns a reached level into a row in its All
 * Alerts and a card in its AI Alerts. This module decides WHAT is sent and how
 * an answer is read; `researchSync.ts` does the sending.
 *
 * ── WHAT IS SENT, AND WHAT STAYS HERE ───────────────────────────────────────
 *
 * - ONLY A HOLDING WITH AN NSE SYMBOL. Glow Central Research follows listed
 *   companies by their NSE ticker and nothing else. A mutual fund or an AIF has
 *   no ticker, so its levels stay in this dashboard and the card says so — a
 *   send that can never arrive must not look like one that is waiting.
 * - THE ISIN RIDES WITH THE TICKER, because the receiving side keys its live
 *   quote on it (`NSE_EQ|<ISIN>`) and refuses a quote that does not echo both.
 *   Taken first from Upstox's own instrument for that symbol — the instrument
 *   the receiving side will ask Upstox about — then from the book's own ISIN.
 *   Never guessed from a name; a company with neither is sent without one and
 *   the receiving side names it as unchecked rather than guessing.
 * - THE FIVE LEVELS, UNDER THE NAMES BOTH APPS USE — Buy at, Sell at, Stop loss,
 *   Target, Alert above — never this app's internal field names, so the wire
 *   reads the same on both sides. A level nobody set is `null`, never 0.
 *
 * ── SEED, SET AND CLEAR ─────────────────────────────────────────────────────
 *
 * A level typed AFTER this browser started sending is a `set`: the family's
 * latest word, and it replaces what the shared list held. A level that was
 * already in this browser BEFORE it ever sent anything is a `seed`: added only
 * where the shared list has never heard of that company, so a laptop opened for
 * the first time in a month cannot overwrite a level set yesterday on a phone.
 * "Before" is judged on the LEVELS, not on when the entry was last saved — a
 * note typed today under a month-old level leaves it a month-old level.
 * Clearing the last level on a company this browser had sent is a `clear`, and
 * the shared list keeps it as a record so a stale device cannot put it back.
 * The same three rules Glow Central Research's own shared watchlist follows.
 *
 * PURE — the store, the book, what was last acknowledged and the answer are all
 * arguments — so the suite checks every rule without a network.
 */
import type { AlertKind } from "./priceAlerts";
import { ALERT_DEF } from "./priceAlerts";
import type { Position } from "./types";
import type { Watchlist } from "./watchlist";

/** The receiving app, by name, as every sentence here says it. */
export const RESEARCH_NAME = "Glow Central Research";
/** Its own address. Its Worker takes writes from this dashboard's production origin only. */
export const RESEARCH_ORIGIN = "https://glow-central-research.tech-441.workers.dev";
export const RESEARCH_LEVELS_URL = `${RESEARCH_ORIGIN}/api/price-levels`;

/** The five levels, under the names both apps use, in the order the stock page shows them. */
export const LEVEL_NAMES = ["buyAt", "sellAt", "stopLoss", "target", "alertAbove"] as const;
export type LevelName = (typeof LEVEL_NAMES)[number];
export type Levels = Record<LevelName, number | null>;

/**
 * Which of this app's alerts each wire name is. ONE mapping, read off
 * `ALERT_DEF` for the store field, so the sender cannot drift from the boxes
 * the family types into.
 */
export const LEVEL_KIND: Record<LevelName, AlertKind> = {
  buyAt: "entry", sellAt: "exit", stopLoss: "below", target: "target", alertAbove: "above",
};

// ── THE RECEIVING SIDE'S OWN BOUNDS, mirrored so a level it would refuse is ──
// named HERE instead of sinking a whole batch. It refuses a batch outright when
// any one edit is malformed, so one typo would otherwise hold back every other
// company in the same request.
/** `price-levels-shared.js` → `PRICE_LEVELS_INTENT_BATCH`. */
export const RESEARCH_BATCH = 40;
/** ₹1 crore a share — above every listed Indian share; the receiving side reads more as a typo. */
export const RESEARCH_LEVEL_MAX = 1e7;
/** `watchlist-shared.js` → `SYMBOL_RE`. */
export const RESEARCH_SYMBOL_RE = /^(?:(?=[A-Z0-9&._-]*[A-Z])[A-Z0-9][A-Z0-9&._-]{0,49}|\d{6})$/;
/** `price-levels-shared.js` → `ISIN_RE`. */
export const RESEARCH_ISIN_RE = /^IN[A-Z0-9]{10}$/;
const NAME_MAX = 200;

const isLevel = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** The five levels of one saved entry, `null` where nothing is set. */
export function levelsOf(e: Watchlist[string]): Levels {
  const out = {} as Levels;
  for (const n of LEVEL_NAMES) {
    const v = e[ALERT_DEF[LEVEL_KIND[n]].field];
    out[n] = isLevel(v) ? v : null;
  }
  return out;
}

const anyLevel = (l: Levels) => LEVEL_NAMES.some((n) => l[n] !== null);

/** One company as this browser wants the shared list to hold it. */
export type ResearchLevel = {
  ticker: string;
  isin: string | null;
  name: string;
  levels: Levels;
  /**
   * When the family last saved the entry, on this device's clock. Any save moves
   * it — a note too — so it decides which of two entries for one company speaks,
   * and is only half of what decides seed or set (see `intentsFor`).
   */
  changedAt: string;
  /** The saved entry that speaks for this company. */
  securityKey: string;
};

/** A saved entry whose levels stay in this dashboard, and why, in the card's words. */
export type Unsendable = { securityKey: string; name: string; reason: "no-symbol" | "too-high"; why: string };

/** A saved entry for a company another entry already speaks for. */
export type Shadowed = { securityKey: string; ticker: string; by: string; byName: string };

export type Derived = { send: ResearchLevel[]; unsendable: Unsendable[]; shadowed: Shadowed[] };

/** How one holding is identified — kept as arguments so the suite can stand one in. */
export type Resolve = {
  rowsFor: (securityKey: string) => readonly Position[];
  /** The NSE symbol a holding is quoted under, or null. */
  symbolOf: (securityKey: string, rows: readonly Position[]) => string | null;
  /** The ISIN of the listed instrument that symbol is, or null. */
  instrumentIsin: (ticker: string) => string | null;
};

/**
 * WHAT THIS BROWSER WANTS GLOW CENTRAL RESEARCH TO HOLD — one row per ticker —
 * and every saved entry that cannot be sent, with the reason its card prints.
 *
 * Two saved entries can resolve to one ticker (one company reported under two
 * spellings). The one changed most recently speaks for it, because it is the
 * family's latest word on that company, and the other is named as SHADOWED so
 * its card does not claim a send that carried somebody else's levels.
 */
export function researchLevelsFrom(watchlist: Watchlist, resolve: Resolve): Derived {
  const byTicker = new Map<string, ResearchLevel>();
  const unsendable: Unsendable[] = [];
  const losers: { securityKey: string; ticker: string }[] = [];
  for (const [key, e] of Object.entries(watchlist)) {
    const levels = levelsOf(e);
    if (!anyLevel(levels)) continue;
    const rows = resolve.rowsFor(key);
    const name = (rows[0]?.security || e.name || key).replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
    const raw = resolve.symbolOf(key, rows);
    const ticker = raw ? raw.trim().toUpperCase() : null;
    if (!ticker || !RESEARCH_SYMBOL_RE.test(ticker)) {
      unsendable.push({
        securityKey: key, name, reason: "no-symbol",
        why: `${RESEARCH_NAME} follows listed companies by their NSE symbol, and this dashboard has no NSE symbol for this holding`,
      });
      continue;
    }
    if (LEVEL_NAMES.some((n) => (levels[n] ?? 0) > RESEARCH_LEVEL_MAX)) {
      unsendable.push({
        securityKey: key, name, reason: "too-high",
        why: `${RESEARCH_NAME} reads a level above ₹1 crore a share as a typo and would refuse it`,
      });
      continue;
    }
    const isin = [resolve.instrumentIsin(ticker), ...rows.map((r) => r.isin)]
      .map((i) => (typeof i === "string" ? i.trim().toUpperCase() : ""))
      .find((i) => RESEARCH_ISIN_RE.test(i)) ?? null;
    const row: ResearchLevel = { ticker, isin, name, levels, changedAt: e.updatedAt || "", securityKey: key };
    const had = byTicker.get(ticker);
    if (!had) { byTicker.set(ticker, row); continue; }
    // The later edit speaks. A tie is broken on the key so the answer never
    // depends on the order `localStorage` happened to return the entries in.
    const newer = row.changedAt > had.changedAt || (row.changedAt === had.changedAt && key < had.securityKey);
    losers.push({ securityKey: newer ? had.securityKey : key, ticker });
    if (newer) byTicker.set(ticker, row);
  }
  const send = [...byTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  const shadowed = losers.map(({ securityKey, ticker }) => {
    const by = byTicker.get(ticker) as ResearchLevel;
    return { securityKey, ticker, by: by.securityKey, byName: by.name };
  });
  return { send, unsendable, shadowed };
}

/** A stable fingerprint of what is sent for one company — what an acknowledgement is compared on. */
export const fingerprint = (l: Pick<ResearchLevel, "ticker" | "isin" | "levels">): string =>
  JSON.stringify([l.ticker, l.isin, ...LEVEL_NAMES.map((n) => l.levels[n])]);

/**
 * WHAT THIS BROWSER KNOWS ABOUT THE SHARED LIST, kept beside the store.
 *
 * - `since` — when this browser first ran the sender. An entry last saved
 *   before it was typed before this browser ever sent anything, so it is a SEED.
 * - `seeds` — per ticker, the fingerprint of the levels this browser already
 *   held from before `since`, as first seen. An entry saved again later with
 *   the SAME levels — a note, a tick on Watching — is still those old levels
 *   and still a seed; only a changed level becomes a set. Dropped once the
 *   shared list acknowledges the company or clears it, after which anything
 *   typed for it is new.
 * - `acked` — per ticker, the fingerprint the shared list confirmed holding.
 * - `declined` — per ticker, a seed the shared list did NOT take because it had
 *   already heard about that company from another device, and whether that
 *   company is still set there or was removed there. Not resent until the
 *   family changes a level here, which makes it a `set`.
 * - `refused` — per ticker, a set the shared list could not take because it is
 *   full. Not resent until something changes.
 */
export type SentState = {
  since: string | null;
  seeds: Record<string, string>;
  acked: Record<string, string>;
  declined: Record<string, { fp: string; why: "elsewhere" | "removed" }>;
  refused: Record<string, { fp: string; why: "full" }>;
};

export const EMPTY_SENT: SentState = { since: null, seeds: {}, acked: {}, declined: {}, refused: {} };

/**
 * START THE CLOCK, AND NOTE WHAT WAS ALREADY HERE. The first send stamps
 * `since` and records every level this browser holds as a seed; a later send
 * records one that only became sendable since (its holding gained an NSE
 * symbol) if it has not been touched since the clock started. Never moves
 * `since`, and never overwrites a seed already recorded.
 */
export function withSeeds(sent: SentState, want: readonly ResearchLevel[], at: string): SentState {
  const since = sent.since ?? at;
  const seeds = { ...sent.seeds };
  for (const l of want) {
    if (l.ticker in seeds || l.ticker in sent.acked) continue;
    if (sent.since === null || l.changedAt < since) seeds[l.ticker] = fingerprint(l);
  }
  return { ...sent, since, seeds };
}

export type Intent =
  | { op: "set" | "seed"; ticker: string; isin: string | null; name: string; levels: Levels }
  | { op: "clear"; ticker: string };

/**
 * THE EDITS THAT BRING THE SHARED LIST UP TO THIS BROWSER.
 *
 * Nothing is sent for a company whose acknowledged fingerprint already matches,
 * nor for one the shared list declined or refused at this very fingerprint. A
 * company this browser had sent and no longer holds a level on is cleared — and
 * ONLY one this browser had sent: a declined seed was never ours to clear.
 *
 * A SET NEEDS BOTH: the entry saved since the clock started, AND levels that
 * are not the ones it already held then. Either alone is a wrong answer — the
 * save time moves on a note, and a recorded seed cannot see a level that was
 * only sendable later.
 */
export function intentsFor(want: readonly ResearchLevel[], sent: SentState): Intent[] {
  const out: Intent[] = [];
  const wanted = new Set<string>();
  for (const l of want) {
    wanted.add(l.ticker);
    const fp = fingerprint(l);
    if (sent.acked[l.ticker] === fp) continue;
    if (sent.declined[l.ticker]?.fp === fp) continue;
    if (sent.refused[l.ticker]?.fp === fp) continue;
    const fresh = sent.since !== null && l.changedAt >= sent.since && sent.seeds[l.ticker] !== fp;
    const op = fresh || l.ticker in sent.acked ? "set" : "seed";
    out.push({ op, ticker: l.ticker, isin: l.isin, name: l.name, levels: { ...l.levels } });
  }
  for (const t of Object.keys(sent.acked).sort()) if (!wanted.has(t)) out.push({ op: "clear", ticker: t });
  return out;
}

/** The receiving side's batches, in its own size and never splitting nothing. */
export function batchesOf<T>(items: readonly T[], size = RESEARCH_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** One company as the shared list reports holding it. */
export type HeldCompany = { ticker: string; levels: Partial<Record<LevelName, { value: number } | null>> };
export type Outcome = { ticker: string; op: string; outcome: "set" | "seeded" | "cleared" | "unchanged" | "full" | string };

const holdsExactly = (held: HeldCompany | undefined, levels: Levels) =>
  !!held && LEVEL_NAMES.every((n) => (held.levels?.[n]?.value ?? null) === levels[n]);

/**
 * WHAT ONE ANSWER MEANS FOR WHAT THIS BROWSER KNOWS.
 *
 * `unchanged` is the one outcome that needs care, because it means three
 * different things. On a `set` the list already held exactly this — so it is
 * acknowledged. On a `clear` there was nothing left to clear. On a `seed` the
 * list had already heard about the company — and then the list's OWN copy,
 * returned with the answer, decides whether that is this very set of levels
 * (another tab of this browser sent it a moment ago, so it is acknowledged) or
 * another device's (so it is declined, and this browser stops offering it).
 */
export function applyOutcomes(
  sent: SentState, intents: readonly Intent[], outcomes: readonly Outcome[], companies: readonly HeldCompany[],
): SentState {
  const next: SentState = {
    since: sent.since, seeds: { ...sent.seeds },
    acked: { ...sent.acked }, declined: { ...sent.declined }, refused: { ...sent.refused },
  };
  const held = new Map(companies.map((c) => [c.ticker, c]));
  const byTicker = new Map(intents.map((i) => [i.ticker, i]));
  for (const o of outcomes) {
    const intent = byTicker.get(o.ticker);
    if (!intent) continue;
    const forget = () => {
      delete next.acked[o.ticker]; delete next.declined[o.ticker]; delete next.refused[o.ticker];
      // Acknowledged or cleared, it is no longer a level from before: what is
      // typed for it next is the family's new word.
      delete next.seeds[o.ticker];
    };
    if (intent.op === "clear") {
      if (o.outcome === "cleared" || o.outcome === "unchanged") forget();
      continue;
    }
    const fp = fingerprint(intent);
    if (o.outcome === "set" || o.outcome === "seeded"
      || (o.outcome === "unchanged" && (intent.op === "set" || holdsExactly(held.get(o.ticker), intent.levels)))) {
      forget();
      next.acked[o.ticker] = fp;
    } else if (o.outcome === "unchanged") {
      forget();
      next.declined[o.ticker] = { fp, why: held.has(o.ticker) ? "elsewhere" : "removed" };
    } else if (o.outcome === "full") {
      delete next.declined[o.ticker];
      next.refused[o.ticker] = { fp, why: "full" };
    }
  }
  return next;
}

/**
 * Forget what no longer matters: a declined, refused or seeded company this
 * browser no longer holds a level on — a level removed and typed again is a
 * new decision, never the old one. An ACKNOWLEDGED one is kept until its clear
 * is answered — dropping it here would lose the one fact that says it must be
 * cleared.
 */
export function pruneSent(sent: SentState, want: readonly ResearchLevel[]): SentState {
  const wanted = new Set(want.map((l) => l.ticker));
  const keep = <T,>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([t]) => wanted.has(t)));
  return {
    since: sent.since, seeds: keep(sent.seeds), acked: sent.acked, declined: keep(sent.declined), refused: keep(sent.refused),
  };
}

// ── WHAT THE CARD AND THE TABLE SAY ──────────────────────────────────────────

/** Why the last attempt did not land, by CAUSE — each sends a reader somewhere different. */
export type FailCode = "offline" | "unreachable" | "not-ready" | "not-allowed" | "rate-limited" | "invalid" | "error";

export type Attempt = { at: string; ok: boolean; code: FailCode | null; retryAt: string | null };

export type SyncStatus =
  | { kind: "none" }
  | { kind: "local"; why: string }
  | { kind: "shadowed"; ticker: string; byName: string }
  | { kind: "sent"; ticker: string }
  | { kind: "sending"; ticker: string }
  | { kind: "declined"; ticker: string; why: "elsewhere" | "removed" }
  | { kind: "refused"; ticker: string }
  | { kind: "failed"; ticker: string; code: FailCode };

/** One saved entry's standing with the shared list. */
export function statusFor(securityKey: string, d: Derived, sent: SentState, attempt: Attempt | null): SyncStatus {
  const local = d.unsendable.find((u) => u.securityKey === securityKey);
  if (local) return { kind: "local", why: local.why };
  const shadow = d.shadowed.find((s) => s.securityKey === securityKey);
  if (shadow) return { kind: "shadowed", ticker: shadow.ticker, byName: shadow.byName };
  const l = d.send.find((x) => x.securityKey === securityKey);
  if (!l) return { kind: "none" };
  const fp = fingerprint(l);
  if (sent.acked[l.ticker] === fp) return { kind: "sent", ticker: l.ticker };
  const declined = sent.declined[l.ticker];
  if (declined?.fp === fp) return { kind: "declined", ticker: l.ticker, why: declined.why };
  if (sent.refused[l.ticker]?.fp === fp) return { kind: "refused", ticker: l.ticker };
  if (attempt && !attempt.ok && attempt.code) return { kind: "failed", ticker: l.ticker, code: attempt.code };
  return { kind: "sending", ticker: l.ticker };
}

/** The whole store's standing, for the All alerts table's footer. */
export type SyncSummary = {
  /** Companies this browser sends. */
  companies: number;
  sent: number;
  declined: number;
  refused: number;
  /** Not acknowledged yet — sending, or failed with `code`. */
  waiting: number;
  code: FailCode | null;
  /** Saved entries whose levels stay here: no NSE symbol, or a level the list would refuse. */
  local: number;
  /** ...of which a level above ₹1 crore a share, which the list would read as a typo. */
  tooHigh: number;
};

export function syncSummary(d: Derived, sent: SentState, attempt: Attempt | null): SyncSummary {
  let ok = 0, declined = 0, refused = 0;
  for (const l of d.send) {
    const fp = fingerprint(l);
    if (sent.acked[l.ticker] === fp) ok++;
    else if (sent.declined[l.ticker]?.fp === fp) declined++;
    else if (sent.refused[l.ticker]?.fp === fp) refused++;
  }
  const waiting = d.send.length - ok - declined - refused;
  return {
    companies: d.send.length, sent: ok, declined, refused, waiting,
    code: waiting > 0 && attempt && !attempt.ok ? attempt.code : null,
    local: d.unsendable.length,
    tooHigh: d.unsendable.filter((u) => u.reason === "too-high").length,
  };
}

/** A failure, in one plain sentence that says what happens next. */
export function failSentence(code: FailCode, origin = ""): string {
  switch (code) {
    case "offline": return "this browser is offline — they will go as soon as it is back online";
    case "unreachable": return `${RESEARCH_NAME} did not answer — retrying automatically`;
    case "not-ready": return `${RESEARCH_NAME} is not taking price levels yet — they will go automatically once it is`;
    case "not-allowed": return `${RESEARCH_NAME} takes levels from the live dashboard only${origin ? `, not from ${origin}` : ""}`;
    case "rate-limited": return `${RESEARCH_NAME} asked for a pause — retrying in a minute`;
    case "invalid": return `${RESEARCH_NAME} could not read them — change a level to send them again`;
    default: return `${RESEARCH_NAME} could not save them — retrying automatically`;
  }
}

/**
 * THE SAME CAUSE, SHORT ENOUGH FOR A LINE UNDER A TABLE. A note under a table is
 * one short line (Stage 10ci), so the All alerts footer names the cause in a few
 * words and carries `failSentence` in its hover. Each still says what happens
 * next, because "not sent" alone reads as something the family has to fix.
 */
export function failShort(code: FailCode): string {
  switch (code) {
    case "offline": return "this browser is offline, they go when it is back";
    case "unreachable": return "no answer, retrying automatically";
    case "not-ready": return "not taking levels yet, they go automatically once it is";
    case "not-allowed": return "it takes levels from the live dashboard only";
    case "rate-limited": return "asked for a pause, retrying in a minute";
    case "invalid": return "it could not read them, change a level to resend";
    default: return "not saved there, retrying automatically";
  }
}

/** The longest line a note under a table may be (Stage 10ci's guard). */
export const FOOTER_LINE_MAX = 150;

/**
 * THE ALL ALERTS FOOTER'S SECOND LINE — what reached Glow Central Research,
 * COUNTED — and its hover, which carries the sentences the line has no room for.
 * Written out in full where that fits in one short line; where it does not (a
 * bad day that has every kind of outcome at once) the reasons drop to the hover
 * and only the counts stay. `null` where no level is saved at all.
 */
export function summaryLine(s: SyncSummary, busy: boolean, origin = ""): { text: string; title: string } | null {
  if (s.companies === 0 && s.local === 0) return null;
  const stay = (n: number) => `${n} ${n === 1 ? "stays" : "stay"} here`;
  // Why they stay, on screen only where ONE reason covers them all: "(no NSE
  // symbol)" over a level that stays because it is too high would be a caption
  // claiming something of a count it is not true of.
  const stayWhy = s.tooHigh === 0 ? " (no NSE symbol)" : s.tooHigh === s.local ? " (a level too high to send)" : "";
  const build = (full: boolean): string => {
    if (s.companies === 0) {
      return `${RESEARCH_NAME} follows listed shares only · ${stay(s.local)}${full ? stayWhy : ""}`;
    }
    const parts = [`${RESEARCH_NAME}: ${s.sent} of ${s.companies} ${s.companies === 1 ? "company" : "companies"} sent`];
    if (s.waiting > 0) {
      parts.push(busy || !s.code ? `${s.waiting} sending` : `${s.waiting} waiting${full ? ` — ${failShort(s.code)}` : ""}`);
    }
    if (s.declined > 0) parts.push(`${s.declined} held back${full ? " — changed there from another device" : ""}`);
    if (s.refused > 0) parts.push(`${s.refused} refused${full ? " — its list is full" : ""}`);
    if (s.local > 0) parts.push(`${stay(s.local)}${full ? stayWhy : ""}`);
    return parts.join(" · ");
  };
  const full = build(true);
  const text = full.length <= FOOTER_LINE_MAX ? full : build(false);
  const why: string[] = [
    `Alerts on listed shares also go to ${RESEARCH_NAME}, which checks each level against its own live price`
      + " and raises it in its All Alerts and AI Alerts when it is reached.",
  ];
  if (s.waiting > 0 && s.code && !busy) why.push(`Not sent yet: ${failSentence(s.code, origin)}.`);
  if (s.declined > 0) {
    why.push(`${s.declined} held back: ${RESEARCH_NAME} had already heard about ${s.declined === 1 ? "that company" : "those companies"}`
      + " from another device — levels set there, or removed there. Change a level here to send these instead.");
  }
  if (s.refused > 0) why.push(`${s.refused} refused: ${RESEARCH_NAME}'s list of companies is full.`);
  if (s.local > s.tooHigh) why.push("An alert on a holding this dashboard has no NSE symbol for, such as a fund or an AIF, stays in this dashboard.");
  if (s.tooHigh > 0) {
    why.push(`${s.tooHigh} ${s.tooHigh === 1 ? "has a level" : "have levels"} above ₹1 crore a share, which ${RESEARCH_NAME}`
      + " would read as a typo — it stays here until the level is corrected.");
  }
  return { text, title: why.join(" ") };
}

/**
 * HOW LONG TO WAIT BEFORE TRYING AGAIN, by cause. `null` is "only when
 * something changes" — a refusal that trying again cannot fix. Growing with each
 * consecutive failure and capped, so a long outage costs a request every half
 * hour rather than every few seconds.
 */
export function retryDelayMs(code: FailCode, failures: number): number | null {
  switch (code) {
    case "offline": return 60_000;
    case "rate-limited": return 60_000;
    case "not-ready": return 15 * 60_000;
    case "not-allowed": return null;
    case "invalid": return null;
    default: return Math.min(30 * 60_000, 30_000 * 2 ** Math.min(6, Math.max(0, failures - 1)));
  }
}
