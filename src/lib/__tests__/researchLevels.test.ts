/**
 * ── THE FAMILY'S LEVELS, SENT TO GLOW CENTRAL RESEARCH ─────────────────────
 *
 * Stage 10cn. Three halves, and each is here because the other two cannot see it:
 *
 *   1. THE RULES (`researchLevels.ts`) — what is sent, seed against set, what
 *      an answer means. Pure, so every rule is struck on constructed inputs.
 *   2. A REAL SEND (`researchSync.ts`) against a stand-in for the receiving
 *      side that follows ITS rules (set replaces, seed only where it has never
 *      heard of the company, clear is kept) — what goes over the wire, what is
 *      remembered, and which failure is reported for which cause.
 *   3. THE REAL BOOK — a level on every holding it carries, and every batch
 *      that would produce must pass the receiving side's own validation and fit
 *      its request limit. A suite over invented tickers would prove only that
 *      two inventions agree.
 */
import { BOOK_POSITIONS } from "@/data/glowData";
import { UPSTOX_INSTRUMENTS } from "../../../shared/upstoxInstruments.mjs";
import { applyFundNavs } from "../fundNavs";
import { symbolFor, symbolForKey } from "../quotes";
import {
  EMPTY_SENT, FOOTER_LINE_MAX, LEVEL_NAMES, RESEARCH_BATCH, RESEARCH_ISIN_RE, RESEARCH_LEVELS_URL, RESEARCH_NAME,
  RESEARCH_SYMBOL_RE, applyOutcomes, batchesOf, failSentence, failShort, fingerprint, intentsFor, levelsOf,
  pruneSent, researchLevelsFrom, retryDelayMs, statusFor, summaryLine, syncSummary, withSeeds,
  type FailCode, type HeldCompany, type Intent, type Levels, type Outcome, type ResearchLevel, type Resolve,
  type SentState, type SyncSummary,
} from "../researchLevels";
import { researchSnapshot, syncResearchLevels, type ResearchState } from "../researchSync";
import { EMPTY_ENTRY, type WatchEntry, type Watchlist } from "../watchlist";
import type { Position } from "../types";

let pass = 0;
const fails: string[] = [];
const ok = (what: string, cond: boolean, note = "") => {
  if (cond) { pass += 1; console.log(`ok   ${what}${note ? ` — ${note}` : ""}`); }
  else { fails.push(what); console.log(`FAIL ${what}${note ? ` — ${note}` : ""}`); }
};

console.log("──── Price levels sent to Glow Central Research");

const entry = (key: string, patch: Partial<WatchEntry>): WatchEntry => ({ ...EMPTY_ENTRY(key), ...patch });
const pos = (key: string, patch: Partial<Position> = {}): Position =>
  ({ securityKey: key, security: key.toUpperCase(), accountId: "a", assetClass: "Equity", ...patch }) as Position;
const noLevels: Levels = { buyAt: null, sellAt: null, stopLoss: null, target: null, alertAbove: null };

/** A resolver over a hand-made book: `symbol` and `isin` per key, and one Upstox ISIN per ticker. */
function resolver(book: Record<string, { symbol?: string; isin?: string; name?: string }>, upstox: Record<string, string> = {}): Resolve {
  return {
    rowsFor: (k) => (book[k] ? [pos(k, { symbol: book[k].symbol, isin: book[k].isin, security: book[k].name ?? k })] : []),
    symbolOf: (k, rows) => rows.map((r) => r.symbol).find((s): s is string => !!s) ?? null,
    instrumentIsin: (t) => upstox[t] ?? null,
  };
}

// ── 1. THE RULES ─────────────────────────────────────────────────────────────
console.log("── what is sent ──");
{
  const l = levelsOf(entry("x", { entryPrice: 100, exitPrice: 300, alertBelow: 90, targetPrice: 250, alertAbove: 280 }));
  ok("the five store fields travel under the names both apps use",
    l.buyAt === 100 && l.sellAt === 300 && l.stopLoss === 90 && l.target === 250 && l.alertAbove === 280);
  const none = levelsOf(entry("x", { targetPrice: 0 as unknown as number, fairValue: 500, note: "why" }));
  ok("a level nobody set is null, never 0 — and fair value is not a level", LEVEL_NAMES.every((n) => none[n] === null));

  const wl: Watchlist = {
    abc: entry("abc", { targetPrice: 250, updatedAt: "2026-09-20T10:00:00.000Z" }),
    fund: entry("fund", { alertBelow: 14, updatedAt: "2026-09-20T10:00:00.000Z" }),
    noted: entry("noted", { note: "a note alone is not a level" }),
    typo: entry("typo", { targetPrice: 25_000_000 }),
    sold: entry("sold", { exitPrice: 90, name: "Sold Co Ltd" }),
  };
  const d = researchLevelsFrom(wl, resolver(
    { abc: { symbol: "ABC", isin: "INE000A01011", name: "Abc Ltd" }, fund: { name: "A Fund" }, typo: { symbol: "TYPO" } },
    { ABC: "INE111B01011" },
  ));
  ok("a holding with an NSE symbol is sent", d.send.length === 1 && d.send[0].ticker === "ABC");
  ok("...with the ISIN of the instrument its symbol IS, ahead of the book's", d.send[0].isin === "INE111B01011");
  ok("...under the book's own name", d.send[0].name === "Abc Ltd");
  ok("a holding with no NSE symbol stays here, and says why",
    d.unsendable.some((u) => u.securityKey === "fund" && u.reason === "no-symbol" && /NSE symbol/.test(u.why)));
  // A company the family holds only INSIDE a fund has a page of its own (#88)
  // and may well be listed: what is missing is THIS dashboard's symbol for it,
  // not a listing. "This holding has none" would be false of exactly that page.
  ok("...in words true of a listed company this dashboard simply has no symbol for",
    d.unsendable.every((u) => u.reason !== "no-symbol" || (/this dashboard has no NSE symbol/.test(u.why) && !/has none/.test(u.why))));
  ok("a level the receiving side would refuse as a typo is named here instead of sinking a batch",
    d.unsendable.some((u) => u.securityKey === "typo" && u.reason === "too-high"));
  const dsum = syncSummary(d, EMPTY_SENT, null);
  ok("...and the count under the table keeps it apart from the ones with no NSE symbol",
    dsum.local === d.unsendable.length && dsum.tooHigh === 1, `local ${dsum.local}, too high ${dsum.tooHigh}`);
  ok("an entry with no level is not sent at all", !d.send.some((l) => l.securityKey === "noted") && !d.unsendable.some((u) => u.securityKey === "noted"));
  ok("a holding since sold with no symbol anywhere stays here too",
    d.unsendable.some((u) => u.securityKey === "sold" && u.name === "Sold Co Ltd"));

  const d2 = researchLevelsFrom({ abc: entry("abc", { targetPrice: 250 }) }, resolver({ abc: { symbol: "abc", isin: "INE000A01011" } }));
  ok("with no Upstox instrument the book's own ISIN rides with the ticker", d2.send[0].isin === "INE000A01011");
  ok("...and the ticker is upper-cased the way the receiving side keys it", d2.send[0].ticker === "ABC");
  const d3 = researchLevelsFrom({ abc: entry("abc", { targetPrice: 250 }) }, resolver({ abc: { symbol: "ABC", isin: "not-an-isin" } }));
  ok("an ISIN of the wrong shape is never sent — the company goes without one", d3.send[0].isin === null);

  const two = researchLevelsFrom({
    old: entry("old", { targetPrice: 100, updatedAt: "2026-09-01T00:00:00.000Z" }),
    new: entry("new", { targetPrice: 120, updatedAt: "2026-09-02T00:00:00.000Z" }),
  }, resolver({ old: { symbol: "SAME", name: "Same Ltd (old spelling)" }, new: { symbol: "SAME", name: "Same Ltd" } }));
  ok("two saved entries for one company send ONE row — the later edit speaks",
    two.send.length === 1 && two.send[0].levels.target === 120 && two.send[0].securityKey === "new");
  ok("...and the other is named as shadowed, so its card does not claim a send it did not make",
    two.shadowed.length === 1 && two.shadowed[0].securityKey === "old" && two.shadowed[0].byName === "Same Ltd");

  const base: ResearchLevel = { ticker: "A", isin: null, name: "A Ltd", levels: { ...noLevels, target: 1 }, changedAt: "t", securityKey: "a" };
  const renamed: ResearchLevel = { ...base, name: "A Limited", changedAt: "later" };
  ok("the fingerprint is what is sent — a new name or a new edit time alone is not a change",
    fingerprint(base) === fingerprint(renamed));
  ok("...while a new ISIN or a new level is",
    fingerprint(base) !== fingerprint({ ...base, isin: "INE000A01011" })
    && fingerprint(base) !== fingerprint({ ...base, levels: { ...base.levels, stopLoss: 1 } }));
}

console.log("── seed, set and clear ──");
const lvl = (ticker: string, target: number, changedAt: string): ResearchLevel =>
  ({ ticker, isin: null, name: ticker, levels: { ...noLevels, target }, changedAt, securityKey: ticker.toLowerCase() });
{
  const since = "2026-09-23T10:00:00.000Z";
  const before = lvl("OLD", 100, "2026-09-01T00:00:00.000Z");
  const after = lvl("NEW", 200, "2026-09-23T11:00:00.000Z");
  const first = intentsFor([before, after], { ...EMPTY_SENT, since });
  ok("a level typed before this browser ever sent is a SEED", first.find((i) => i.ticker === "OLD")?.op === "seed");
  ok("a level typed after is a SET — the family's latest word", first.find((i) => i.ticker === "NEW")?.op === "set");
  ok("with no start time at all, everything is a seed", intentsFor([after], EMPTY_SENT).every((i) => i.op === "seed"));

  const acked: SentState = { ...EMPTY_SENT, since, acked: { OLD: fingerprint(before) } };
  ok("nothing is resent for a company the list already confirmed holding exactly", intentsFor([before], acked).length === 0);
  const moved = { ...before, levels: { ...before.levels, target: 110 } };
  ok("a company this browser had sent is SET when it changes, however old the edit's clock",
    intentsFor([moved], acked)[0]?.op === "set");
  ok("a company this browser had sent and holds no level on now is CLEARED",
    JSON.stringify(intentsFor([], acked)) === JSON.stringify([{ op: "clear", ticker: "OLD" }]));

  const declined: SentState = { ...EMPTY_SENT, since, declined: { OLD: { fp: fingerprint(before), why: "elsewhere" } } };
  ok("a declined seed is not offered again", intentsFor([before], declined).length === 0);
  ok("...and dropping it here clears nothing — it was never this browser's to clear", intentsFor([], declined).length === 0);
  const retyped = { ...before, levels: { ...before.levels, target: 130 }, changedAt: "2026-09-23T12:00:00.000Z" };
  ok("...until the family changes a level here, which makes it a SET", intentsFor([retyped], declined)[0]?.op === "set");
  const refused: SentState = { ...EMPTY_SENT, since, refused: { NEW: { fp: fingerprint(after), why: "full" } } };
  ok("a set the list was too full to take is not hammered at", intentsFor([after], refused).length === 0);

  const pruned = pruneSent({ ...EMPTY_SENT, since, acked: { A: "x" }, declined: { B: { fp: "y", why: "removed" } }, refused: { C: { fp: "z", why: "full" } } }, []);
  ok("forgetting keeps an acknowledged company until its clear is answered",
    "A" in pruned.acked && !("B" in pruned.declined) && !("C" in pruned.refused));

  // THE SAVE TIME IS NOT THE LEVEL. A note, or a tick on Watching, saves the
  // entry again and moves its time; the level under it is still the old one.
  const seeded = withSeeds({ ...EMPTY_SENT }, [before], since);
  ok("the first send starts the clock and records every level already here as a seed",
    seeded.since === since && seeded.seeds.OLD === fingerprint(before));
  const noted = { ...before, changedAt: "2026-09-23T12:30:00.000Z" };
  ok("a note typed today under a month-old level leaves it a SEED", intentsFor([noted], seeded)[0]?.op === "seed");
  const bumped = { ...noted, levels: { ...noted.levels, target: 101 } };
  ok("...while changing the level itself makes it a SET", intentsFor([bumped], seeded)[0]?.op === "set");
  const again = withSeeds(seeded, [bumped], "2026-09-25T00:00:00.000Z");
  ok("the clock is never restarted, and a recorded seed never overwritten",
    again.since === since && again.seeds.OLD === fingerprint(before));
  const late = lvl("LATE", 5, "2026-09-01T00:00:00.000Z");
  const later = withSeeds(seeded, [before, late, after], "2026-09-24T00:00:00.000Z");
  ok("a level that only became sendable later, untouched since before the clock, is recorded as a seed too",
    later.seeds.LATE === fingerprint(late));
  ok("...but one typed after the clock started is not — it is the family's new word",
    !("NEW" in later.seeds) && intentsFor([after], later)[0]?.op === "set");
  const acknowledged = applyOutcomes(seeded, [{ op: "seed", ticker: "OLD", isin: null, name: "OLD", levels: before.levels }],
    [{ ticker: "OLD", op: "seed", outcome: "seeded" }], []);
  ok("once the list acknowledges a company it is no longer a seed", !("OLD" in acknowledged.seeds) && "OLD" in acknowledged.acked);
  const gone = pruneSent(seeded, []);
  ok("a seed whose levels were all removed here is forgotten, so typing them again is a SET",
    !("OLD" in gone.seeds) && intentsFor([noted], withSeeds(gone, [noted], "2026-09-24T00:00:00.000Z"))[0]?.op === "set");
}

console.log("── what an answer means ──");
{
  const a = lvl("A", 100, "2026-09-23T11:00:00.000Z");
  const b = lvl("B", 200, "2026-09-01T00:00:00.000Z");
  const c = lvl("C", 300, "2026-09-01T00:00:00.000Z");
  const intents: Intent[] = [
    { op: "set", ticker: "A", isin: null, name: "A", levels: a.levels },
    { op: "seed", ticker: "B", isin: null, name: "B", levels: b.levels },
    { op: "seed", ticker: "C", isin: null, name: "C", levels: c.levels },
    { op: "clear", ticker: "D" },
  ];
  const held: HeldCompany[] = [
    { ticker: "A", levels: { target: { value: 100 } } },
    { ticker: "B", levels: { target: { value: 999 } } },
  ];
  const out: Outcome[] = [
    { ticker: "A", op: "set", outcome: "set" },
    { ticker: "B", op: "seed", outcome: "unchanged" },
    { ticker: "C", op: "seed", outcome: "unchanged" },
    { ticker: "D", op: "clear", outcome: "cleared" },
  ];
  const s = applyOutcomes({ ...EMPTY_SENT, since: "t", acked: { D: "old" } }, intents, out, held);
  ok("a set that landed is acknowledged", s.acked.A === fingerprint(a));
  ok("a seed refused because ANOTHER device's levels are there is declined as 'elsewhere'", s.declined.B?.why === "elsewhere");
  ok("a seed refused because the company was REMOVED there is declined as 'removed'", s.declined.C?.why === "removed");
  ok("a clear that landed forgets the company", !("D" in s.acked));

  const twoTabs = applyOutcomes(EMPTY_SENT, [{ op: "seed", ticker: "E", isin: null, name: "E", levels: { ...noLevels, target: 5 } }],
    [{ ticker: "E", op: "seed", outcome: "unchanged" }], [{ ticker: "E", levels: { target: { value: 5 } } }]);
  ok("a seed another TAB of this browser already sent is acknowledged, not declined — the list holds exactly it",
    "E" in twoTabs.acked && !("E" in twoTabs.declined));
  const full = applyOutcomes(EMPTY_SENT, [{ op: "set", ticker: "F", isin: null, name: "F", levels: { ...noLevels, target: 5 } }],
    [{ ticker: "F", op: "set", outcome: "full" }], []);
  ok("'full' is never read as saved", !("F" in full.acked) && full.refused.F?.why === "full");
  const stranger = applyOutcomes(EMPTY_SENT, intents.slice(0, 1), [{ ticker: "ZZZ", op: "set", outcome: "set" }], []);
  ok("an outcome for a company this batch did not name changes nothing", Object.keys(stranger.acked).length === 0);
}

console.log("── what the card says ──");
{
  const wl: Watchlist = {
    abc: entry("abc", { targetPrice: 250 }),
    xyz: entry("xyz", { targetPrice: 50 }),
    fund: entry("fund", { targetPrice: 10 }),
  };
  const d = researchLevelsFrom(wl, resolver({ abc: { symbol: "ABC" }, xyz: { symbol: "XYZ" }, fund: {} }));
  const abc = d.send.find((l) => l.ticker === "ABC") as ResearchLevel;
  const sent: SentState = { ...EMPTY_SENT, since: "t", acked: { ABC: fingerprint(abc) } };
  ok("an acknowledged level reads SENT", statusFor("abc", d, sent, null).kind === "sent");
  ok("one not acknowledged yet, with no failure, reads SENDING", statusFor("xyz", d, sent, null).kind === "sending");
  const failed = statusFor("xyz", d, sent, { at: "t", ok: false, code: "not-ready", retryAt: null });
  ok("...and after a failure names the CAUSE", failed.kind === "failed" && failed.code === "not-ready");
  ok("a fund reads LOCAL, with its reason", statusFor("fund", d, sent, null).kind === "local");
  ok("an entry with nothing to send reads nothing", statusFor("nope", d, sent, null).kind === "none");
  const changed = { ...sent, acked: { ABC: "an older fingerprint" } };
  ok("a level changed since it was acknowledged is SENDING again, never still 'sent'", statusFor("abc", d, changed, null).kind === "sending");

  const sum = syncSummary(d, sent, { at: "t", ok: false, code: "unreachable", retryAt: null });
  ok("the table's count is struck on what arrived", sum.companies === 2 && sum.sent === 1 && sum.waiting === 1 && sum.local === 1 && sum.tooHigh === 0);
  ok("...and names the one reason the rest have not", sum.code === "unreachable");
  ok("every failure is worded by its cause, and a refused address names the address",
    new Set((["offline", "unreachable", "not-ready", "not-allowed", "rate-limited", "invalid", "error"] as const).map((c) => failSentence(c))).size === 7
    && /http:\/\/localhost:4173/.test(failSentence("not-allowed", "http://localhost:4173")));
  ok("a refusal trying again cannot fix is not retried on a timer", retryDelayMs("not-allowed", 1) === null && retryDelayMs("invalid", 3) === null);
  ok("an outage is retried, waiting longer each time and never more than half an hour",
    retryDelayMs("unreachable", 1) === 30_000 && retryDelayMs("unreachable", 2) === 60_000 && retryDelayMs("unreachable", 40) === 30 * 60_000);
  ok("a receiving side not switched on yet is asked again every fifteen minutes", retryDelayMs("not-ready", 9) === 15 * 60_000);
  ok("the receiving side's batch size is honoured", batchesOf(Array.from({ length: 81 }, (_, i) => i)).map((b) => b.length).join(",") === "40,40,1");
}

console.log("── the line under the All alerts table ──");
{
  // Main's rule for a note under a table (Stage 10ci): one short line, the
  // reasoning in its hover. This line is COUNTED, so what it may never do is
  // say "sent" for a count other than what arrived, or name a failure while a
  // send is still in flight.
  const CODES: FailCode[] = ["offline", "unreachable", "not-ready", "not-allowed", "rate-limited", "invalid", "error"];
  const sum = (p: Partial<SyncSummary>): SyncSummary =>
    ({ companies: 0, sent: 0, declined: 0, refused: 0, waiting: 0, code: null, local: 0, tooHigh: 0, ...p });

  ok("nothing saved draws no line at all", summaryLine(sum({}), false) === null);

  const plain = summaryLine(sum({ companies: 2, sent: 2, local: 3 }), false);
  ok("the count on screen is what arrived, and the funds are named as staying here",
    plain !== null && plain.text === `${RESEARCH_NAME}: 2 of 2 companies sent · 3 stay here (no NSE symbol)`, plain?.text);
  ok("...one fund 'stays', never 'stay'",
    /1 stays here/.test(summaryLine(sum({ companies: 1, sent: 1, local: 1 }), false)?.text ?? ""));
  ok("...and one company is a company", /1 of 1 company sent/.test(summaryLine(sum({ companies: 1, sent: 1 }), false)?.text ?? ""));

  const onlyFunds = summaryLine(sum({ local: 4 }), false);
  ok("alerts on funds alone say the other dashboard follows listed shares, never '0 of 0 sent'",
    onlyFunds !== null && /follows listed shares only/.test(onlyFunds.text) && !/0 of 0/.test(onlyFunds.text));

  ok("every cause has its own short wording", new Set(CODES.map(failShort)).size === CODES.length);
  ok("...and each short wording says what happens next, so 'not sent' never reads as the family's to fix",
    CODES.every((c) => /retrying|automatically|once it is|when it is back|change a level|live dashboard/.test(failShort(c))));

  for (const code of CODES) {
    const line = summaryLine(sum({ companies: 3, sent: 1, waiting: 2, code, local: 2 }), false, "http://localhost:4173");
    ok(`${code}: the line names the cause on screen, and the whole sentence in its hover`,
      line !== null && line.text.includes(failShort(code)) && line.title.includes(failSentence(code, "http://localhost:4173"))
      && line.text.length <= FOOTER_LINE_MAX, `${line?.text.length} chars`);
  }
  const busy = summaryLine(sum({ companies: 3, sent: 1, waiting: 2, code: "unreachable" }), true);
  ok("while a send is in flight the rest read 'sending', and no earlier failure is named",
    busy !== null && /2 sending/.test(busy.text) && !busy.text.includes(failShort("unreachable"))
    && !busy.title.includes(failSentence("unreachable")));

  // A bad day with every outcome at once: the reasons drop to the hover and the
  // COUNTS stay — the line never grows past the rule to keep them.
  const worst = summaryLine(sum({ companies: 999, sent: 111, waiting: 555, code: "not-ready", declined: 222, refused: 111, local: 999 }), false);
  ok("the worst day still fits one short line", worst !== null && worst.text.length <= FOOTER_LINE_MAX, `${worst?.text.length} chars`);
  ok("...by keeping every count on screen",
    worst !== null && ["111 of 999 companies sent", "555 waiting", "222 held back", "111 refused", "999 stay here"].every((t) => worst.text.includes(t)));
  ok("...and moving every reason to the hover",
    worst !== null && !worst.text.includes(failShort("not-ready")) && worst.title.includes(failSentence("not-ready"))
    && /another device/.test(worst.title) && /list of companies is full/.test(worst.title) && /no NSE symbol/.test(worst.title));
  const high = summaryLine(sum({ companies: 1, sent: 1, local: 1, tooHigh: 1 }), false);
  ok("a level kept here because it is too high never reads '(no NSE symbol)'",
    high !== null && !/no NSE symbol/.test(high.text) && /too high/.test(high.text) && /typo/.test(high.title) && !/no NSE symbol/.test(high.title));
  const mixed = summaryLine(sum({ companies: 1, sent: 1, local: 3, tooHigh: 1 }), false);
  ok("...and where the two reasons are mixed the line names neither, and the hover names both",
    mixed !== null && /3 stay here$/.test(mixed.text) && /no NSE symbol/.test(mixed.title) && /typo/.test(mixed.title));
  const held = summaryLine(sum({ companies: 2, sent: 1, declined: 1 }), false);
  ok("a held-back level is described in words true of BOTH ways it happens — set there, or removed there",
    held !== null && /set there, or removed there/.test(held.title) && !/levels are there/.test(held.text));
}

// ── 2. A REAL SEND ───────────────────────────────────────────────────────────
console.log("── a real send, against a stand-in that follows the receiving side's rules ──");

/** An in-memory `localStorage`, installed where the browser's would be. */
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;

type Held = { state: "set" | "cleared"; levels: Levels };
const research = {
  held: new Map<string, Held>(),
  posts: [] as { url: string; init: RequestInit; intents: Intent[] }[],
  gets: 0,
  /** What the next POSTs do: answer normally, or fail in one of the ways the real one can. */
  post: [] as ("ok" | "404" | "throw" | "429" | "400" | "500")[],
  get: "ok" as "ok" | "404" | "throw",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The receiving side's `apply`, reduced to its rules. */
function applyHere(intents: Intent[]) {
  const outcomes: Outcome[] = intents.map((i) => {
    const had = research.held.get(i.ticker);
    if (i.op === "clear") {
      if (had?.state !== "set") return { ticker: i.ticker, op: "clear", outcome: "unchanged" };
      research.held.set(i.ticker, { ...had, state: "cleared" });
      return { ticker: i.ticker, op: "clear", outcome: "cleared" };
    }
    if (i.op === "seed" && had) return { ticker: i.ticker, op: "seed", outcome: "unchanged" };
    const same = had?.state === "set" && LEVEL_NAMES.every((n) => had.levels[n] === i.levels[n]);
    research.held.set(i.ticker, { state: "set", levels: { ...i.levels } });
    return { ticker: i.ticker, op: i.op, outcome: i.op === "seed" ? "seeded" : same ? "unchanged" : "set" };
  });
  const companies = [...research.held.entries()].filter(([, h]) => h.state === "set").map(([ticker, h]) => ({
    ticker, levels: Object.fromEntries(LEVEL_NAMES.map((n) => [n, h.levels[n] === null ? null : { value: h.levels[n] }])),
  }));
  return { ok: true, outcomes, companies, count: companies.length };
}

globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = String(input);
  if (url !== RESEARCH_LEVELS_URL) throw new Error(`unexpected request to ${url}`);
  if ((init.method ?? "GET") === "GET") {
    research.gets += 1;
    if (research.get === "throw") throw new TypeError("Failed to fetch");
    return research.get === "404" ? json(404, { error: "Not implemented" }) : json(200, { ok: true, companies: [], hits: [] });
  }
  const intents = JSON.parse(String(init.body)).intents as Intent[];
  research.posts.push({ url, init, intents });
  const mode = research.post.shift() ?? "ok";
  if (mode === "throw") throw new TypeError("Failed to fetch");
  if (mode === "404") return json(404, { error: "Not implemented", path: "/api/price-levels" });
  if (mode === "429") return json(429, { ok: false, reason: "rate-limit" });
  if (mode === "400") return json(400, { ok: false, reason: "invalid-request" });
  if (mode === "500") return json(503, { ok: false, reason: "price-levels-unavailable" });
  return json(200, applyHere(intents));
}) as typeof fetch;

const T0 = Date.parse("2026-09-23T09:00:00.000Z");
let clock = T0;
const now = () => new Date(clock);
const stored = (): ResearchState => JSON.parse(mem.get("glow:research-levels/v1") ?? "null");
const send = (want: ResearchLevel[]) => syncResearchLevels(want, now);
const L = (ticker: string, target: number, changedAt: number): ResearchLevel =>
  ({ ticker, isin: "INE674K01013", name: `${ticker} Ltd`, levels: { ...noLevels, target, stopLoss: target / 2 }, changedAt: new Date(changedAt).toISOString(), securityKey: ticker.toLowerCase() });

await (async () => {
  // A browser opened for the first time after this change: two levels typed long ago.
  const a = L("ABCAPITAL", 250, T0 - 86_400_000);
  const b = L("PGEL", 900, T0 - 86_400_000);
  await send([a, b]);
  const p0 = research.posts[0];
  ok("the first send goes to the receiving side's own address, as a cross-site POST that carries no cookie",
    !!p0 && p0.init.method === "POST" && p0.init.mode === "cors" && p0.init.credentials === "omit"
    && new Headers(p0.init.headers).get("content-type") === "application/json");
  ok("...both levels typed before this browser ever sent go as SEEDS", p0?.intents.map((i) => i.op).join(",") === "seed,seed");
  ok("...with the ISIN beside each ticker", p0?.intents.every((i) => i.op !== "clear" && i.isin === "INE674K01013"));
  ok("...and the answer is remembered, beside the store and not in it",
    stored()?.acked.ABCAPITAL === fingerprint(a) && stored()?.acked.PGEL === fingerprint(b) && stored()?.attempt?.ok === true);
  ok("...with the moment this browser started sending, which is what makes a later edit a SET",
    stored()?.since === new Date(T0).toISOString());

  await send([a, b]);
  ok("nothing changed, so nothing is sent", research.posts.length === 1);

  clock += 60_000;
  const a2 = { ...L("ABCAPITAL", 260, clock), securityKey: "abcapital" };
  await send([a2, b]);
  ok("a level changed after this browser started sending goes as a SET", research.posts[1]?.intents.length === 1 && research.posts[1].intents[0].op === "set");
  ok("...and the receiving side now holds the new level", research.held.get("ABCAPITAL")?.levels.target === 260);

  clock += 60_000;
  await send([a2]);
  ok("the last level removed on a company this browser sent is CLEARED there",
    research.posts[2]?.intents.length === 1 && research.posts[2].intents[0].op === "clear" && research.posts[2].intents[0].ticker === "PGEL"
    && research.held.get("PGEL")?.state === "cleared" && !("PGEL" in (stored()?.acked ?? {})));

  // ANOTHER DEVICE set a level on a company this browser holds an OLD one on.
  research.held.set("TCS", { state: "set", levels: { ...noLevels, target: 5000 } });
  const tcsOld = L("TCS", 3000, T0 - 86_400_000 * 30);
  clock += 60_000;
  await send([a2, tcsOld]);
  ok("an old level here never overwrites a newer one set on another device", research.held.get("TCS")?.levels.target === 5000);
  ok("...it is declined, and remembered as another device's", stored()?.declined.TCS?.why === "elsewhere");
  const beforeRetry = research.posts.length;
  await send([a2, tcsOld]);
  ok("...and is not offered again", research.posts.length === beforeRetry);
  clock += 60_000;
  const tcsNew = L("TCS", 3100, clock);
  await send([a2, tcsNew]);
  ok("changing that level here sends it as a SET, which replaces the other device's", research.held.get("TCS")?.levels.target === 3100
    && research.posts.at(-1)?.intents[0].op === "set");
})();

console.log("── and each failure, by its cause ──");
await (async () => {
  const want = (t: string) => [L(t, 100, clock + 1)];
  const lastFail = () => stored()?.attempt;

  research.post.push("404");
  clock += 60_000;
  await send(want("NRDY"));
  ok("the route not existing yet reads NOT READY — the receiving side is not deployed, it is not down",
    lastFail()?.ok === false && lastFail()?.code === "not-ready"
    && Date.parse(lastFail()?.retryAt ?? "") === clock + 15 * 60_000);
  ok("...and nothing is remembered as sent", !("NRDY" in (stored()?.acked ?? {})));

  research.post.push("throw");
  research.get = "ok";
  const gets = research.gets;
  await send(want("NRDY"));
  ok("a write refused with no CORS header, while the list answers a plain read, is a REFUSED ADDRESS",
    lastFail()?.code === "not-allowed" && research.gets === gets + 1);
  ok("...which trying again on a timer cannot fix, so none is set", lastFail()?.retryAt === null);

  research.post.push("throw", "throw");
  research.get = "throw";
  await send(want("NRDY"));
  const first = Date.parse(lastFail()?.retryAt ?? "") - clock;
  await send(want("NRDY"));
  const second = Date.parse(lastFail()?.retryAt ?? "") - clock;
  ok("nothing answering at all is UNREACHABLE", lastFail()?.code === "unreachable");
  // The third and fourth failures in a row: 30 s doubled twice, then three times.
  ok("...retried later each time it fails again", first === 120_000 && second === 240_000,
    `${first / 1000}s, then ${second / 1000}s`);
  research.get = "ok";

  research.post.push("429");
  await send(want("NRDY"));
  ok("a rate limit reads as a pause, retried in a minute", lastFail()?.code === "rate-limited" && Date.parse(lastFail()?.retryAt ?? "") - clock === 60_000);
  research.post.push("400");
  await send(want("NRDY"));
  ok("a batch the receiving side could not read is INVALID and not retried on a timer", lastFail()?.code === "invalid" && lastFail()?.retryAt === null);
  research.post.push("500");
  await send(want("NRDY"));
  ok("a receiving side that could not save is an ERROR, retried", lastFail()?.code === "error" && lastFail()?.retryAt !== null);

  await send(want("NRDY"));
  ok("the next send that lands clears the failure and its count", stored()?.attempt?.ok === true && stored()?.failures === 0
    && "NRDY" in (stored()?.acked ?? {}));
})();

console.log("── batches, and a send that stops half way ──");
/** A browser starting over: nothing sent, nothing held on the other side. */
const fresh = () => { mem.delete("glow:research-levels/v1"); research.held.clear(); };

await (async () => {
  fresh();
  const many = Array.from({ length: 45 }, (_, i) => L(`CO${String(i).padStart(2, "0")}`, 100 + i, clock + 10));
  research.post.push("ok", "throw");
  research.get = "throw";
  const start = research.posts.length;
  clock += 60_000;
  await send(many);
  const sentNow = research.posts.slice(start);
  ok("45 companies go as two batches, in the receiving side's size", sentNow.length === 2 && sentNow[0].intents.length === RESEARCH_BATCH && sentNow[1].intents.length === 5);
  const acked = stored()?.acked ?? {};
  ok("the batch that landed is remembered though the next one failed",
    sentNow[0].intents.every((i) => i.ticker in acked) && sentNow[1].intents.every((i) => !(i.ticker in acked)));
  research.get = "ok";
  const again = research.posts.length;
  await send(many);
  ok("...so the retry resumes where it stopped, sending only the five", research.posts.length === again + 1 && research.posts.at(-1)?.intents.length === 5);
})();

console.log("── two calls at once ──");
await (async () => {
  fresh();
  const start = research.posts.length;
  const x = L("RACE", 10, clock + 20);
  const y = L("RACE", 11, clock + 30);
  const one = send([x]);
  const two = send([y]);
  await Promise.all([one, two]);
  const posts = research.posts.slice(start);
  ok("a call while a send is running is folded into one more send, with the latest levels",
    posts.length === 2 && research.held.get("RACE")?.levels.target === 11);
  ok("the snapshot every card reads is the stored state", JSON.stringify(researchSnapshot().acked) === JSON.stringify(stored()?.acked));
})();

console.log("── a note typed while the receiving side was not taking levels ──");
await (async () => {
  fresh();
  // A level typed on this laptop three weeks ago, and the receiving side not deployed yet.
  const old = L("NOTED", 700, T0 - 86_400_000 * 21);
  research.post.push("404");
  clock += 60_000;
  await send([old]);
  ok("the first send is refused as not ready", stored()?.attempt?.code === "not-ready");
  // Meanwhile a note is typed under it here, and the phone sets a newer level there.
  const noted = { ...old, changedAt: new Date(clock + 5_000).toISOString() };
  research.held.set("NOTED", { state: "set", levels: { ...noLevels, target: 750 } });
  clock += 60_000;
  await send([noted]);
  ok("the old level still goes as a SEED, and never overwrites the phone's newer one",
    research.posts.at(-1)?.intents[0]?.op === "seed" && research.held.get("NOTED")?.levels.target === 750
    && stored()?.declined.NOTED?.why === "elsewhere");
})();

// ── 3. THE REAL BOOK ─────────────────────────────────────────────────────────
console.log("── on the real book ──");
{
  const book = applyFundNavs(BOOK_POSITIONS);
  const byKey = new Map<string, Position[]>();
  for (const p of book) byKey.set(p.securityKey, [...(byKey.get(p.securityKey) ?? []), p]);
  // A Target on EVERY holding the book carries — the most this browser could ever send.
  const wl: Watchlist = Object.fromEntries([...byKey.keys()].map((k) => [k, entry(k, { targetPrice: 1234.5, alertBelow: 1000, updatedAt: "2026-09-23T10:00:00.000Z" })]));
  const d = researchLevelsFrom(wl, {
    rowsFor: (k) => byKey.get(k) ?? [],
    symbolOf: (k, rows) => rows.map(symbolFor).find((s): s is string => !!s) ?? symbolForKey(k),
    instrumentIsin: (t) => (UPSTOX_INSTRUMENTS[t]?.key?.startsWith("NSE_EQ|") ? UPSTOX_INSTRUMENTS[t].key.slice(7) : null),
  });
  const quotable = [...byKey.values()].filter((rows) => rows.some((r) => symbolFor(r))).length;
  ok("the book has listed shares to send — a suite over none would prove nothing", d.send.length > 50, `${d.send.length} companies`);
  ok("every holding with an NSE symbol is sent or named as sharing a company with another", d.send.length + d.shadowed.length === quotable);
  ok("every holding without one stays here, and none is lost between the two",
    d.send.length + d.shadowed.length + d.unsendable.length === byKey.size);
  ok("every AIF stays here — none has a symbol to be followed by",
    [...byKey.values()].filter((rows) => rows[0].assetClass === "AIF" && !rows.some((r) => symbolFor(r))).every((rows) => d.unsendable.some((u) => u.securityKey === rows[0].securityKey)));
  ok("every ticker passes the receiving side's own symbol rule", d.send.every((l) => RESEARCH_SYMBOL_RE.test(l.ticker)));
  const withIsin = d.send.filter((l) => l.isin);
  ok("almost every company carries an ISIN, so the receiving side can check its price",
    withIsin.length >= d.send.length - 2 && withIsin.every((l) => RESEARCH_ISIN_RE.test(l.isin as string)),
    `${withIsin.length} of ${d.send.length}`);
  const intents = intentsFor(d.send, { ...EMPTY_SENT, since: "2026-09-23T09:00:00.000Z" });
  const batches = batchesOf(intents);
  const bytes = Math.max(...batches.map((b) => new TextEncoder().encode(JSON.stringify({ intents: b })).length));
  ok("every batch fits the receiving side's 32 KB request limit, with the whole book at once", bytes < 32_768, `largest ${bytes} bytes`);
  ok("no batch names a company twice — the receiving side refuses one that does",
    batches.every((b) => new Set(b.map((i) => i.ticker)).size === b.length));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  FAILED: ${f}`); process.exit(1); }
console.log("All research-level checks passed.");
