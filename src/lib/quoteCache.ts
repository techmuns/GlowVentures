// THE LAST GOOD QUOTE SNAPSHOT, SO THE DASHBOARD OPENS WITH FIGURES ON IT.
//
// The quote endpoint prices only PART of the book per call, so a cold open took
// several rounds to fill in — and until the first round landed, Today's movers
// had no priced row and rendered "No holding in this book carries a day change
// right now". That is a claim ABOUT THE BOOK made while the feed was still in
// flight: the same failure this repo already records on the company page, where
// a panel still fetching asserted the security has no live quote. A reader who
// sees it either believes the book is unpriceable or reloads.
//
// Two fixes, and this file is the second. The first is that a card must not
// assert an absence while `quotesStatus === "loading"` — it says it is loading.
// The second is that it should not have to: the previous snapshot is kept here
// and the app opens on it, so the figures are there from the first paint and
// the live rounds refine them.
//
// ── A CACHED QUOTE IS A MEASUREMENT, AND IT CARRIES ITS OWN AGE ─────────────
//
// Nothing here fabricates a price. Every quote stored was pulled from the feed
// at a stated instant, and `ageS` is RE-DERIVED from that instant on read —
// never restored as written, which would let a snapshot from this morning claim
// to be seconds old. `QuoteFeed.asOf` travels with it and the UI already prints
// it ("Quotes as of 01:54 PM").
//
// ── AND IT IS BOUNDED BY THE SESSION, WHICH IS THE LOAD-BEARING PART ────────
//
// A day change is `price − prevClose`, and `prevClose` is the PREVIOUS
// SESSION's close. Serving yesterday's snapshot would print yesterday's move
// under a heading reading "Today" — a real figure against the wrong day, which
// is the worst kind of wrong because it is plausible. So a snapshot older than
// MAX_AGE_MS is discarded rather than shown, and a cold open on a new session
// falls back to the loading state, which is honest about having nothing yet.
import type { QuoteFeed } from "./quotes";

const KEY = "glow.quotes.v1";

/**
 * How long a snapshot may be served for.
 *
 * Twelve hours: long enough that reopening the dashboard through a trading day
 * — or after lunch — lands on figures, short enough that a snapshot can never
 * survive into the next session, where `prevClose` has moved and every day
 * change on it would be measured against the wrong day.
 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** A stored snapshot, plus when it was written. */
type Stored = { asOf: string; savedAt: number; feed: QuoteFeed };

/**
 * The last snapshot, or null.
 *
 * Returns null — never a partial or a guess — for every failure: no storage
 * (Safari private mode throws on read), malformed JSON, a snapshot from another
 * session, or one carrying no quotes. A caller that gets null shows its loading
 * state, which is the correct thing to show when nothing has been measured yet.
 */
export function readCachedQuotes(): QuoteFeed | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored;
    if (!stored?.feed?.quotes || typeof stored.savedAt !== "number") return null;
    const ageMs = Date.now() - stored.savedAt;
    if (!(ageMs >= 0) || ageMs > MAX_AGE_MS) return null;
    const ageS = Math.round(ageMs / 1000);
    // EVERY QUOTE'S AGE IS RE-DERIVED, not restored. `ageS` is what the top bar
    // and the company page read to decide whether a price is fresh; written
    // back as stored it would say "0 seconds" about a snapshot hours old.
    const quotes = Object.fromEntries(
      Object.entries(stored.feed.quotes).map(([sym, q]) => [sym, { ...q, ageS: (q.ageS ?? 0) + ageS }]),
    );
    if (!Object.keys(quotes).length) return null;
    // The whole snapshot is stale by construction — it was read from storage,
    // not from the feed — so the fresh/stale counters say so rather than
    // carrying the counts from when it was written.
    return { ...stored.feed, quotes, fresh: 0, stale: Object.keys(quotes).length };
  } catch {
    return null;
  }
}

/**
 * Keep this snapshot for the next open.
 *
 * Best effort and deliberately silent: a full quota, a private window that
 * refuses writes, or storage disabled entirely are all conditions under which
 * the app must go on working exactly as it did before this file existed.
 */
export function writeCachedQuotes(feed: QuoteFeed | null): void {
  if (!feed || !feed.quotes || !Object.keys(feed.quotes).length) return;
  try {
    const stored: Stored = { asOf: feed.asOf, savedAt: Date.now(), feed };
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* storage unavailable or full — the app simply opens cold next time */
  }
}
