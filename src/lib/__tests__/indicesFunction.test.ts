// THE INDEX STRIP'S DAY MOVE, AGAINST A STUBBED UPSTREAM.  npm run test:family
//
// ── WHY A TEST AND NOT A PROBE ──────────────────────────────────────────────
//
// The client's screenshot showed all four NSE indices at +0.00%, on levels near
// 23,000, with absolute moves of 0.05 / 0.00 / −0.05 / +0.05. Measured against
// Yahoo's own bars for 2026-09-07 the four reproduce TO FOUR DECIMALS as the
// level minus ITS OWN SESSION'S CLOSE — a subtraction of a session from itself,
// not a market that stood still.
//
// The cause was two clocks. `regularMarketPrice` follows the EXCHANGE's session;
// the "is this bar settled" filter used `new Date().toISOString()`, the SERVER's
// UTC date. IST is UTC+5:30, so between 05:30 and 09:15 IST the UTC date has
// rolled over while the level is still the previous session's close, and the bar
// meant to be excluded becomes the "previous" close. The same holds through every
// weekend and every market holiday, when the level does not move for days.
//
// A LIVE PROBE CANNOT CHECK THIS: outside that window the function is correct,
// so a probe run at the wrong hour reports a clean feed. The upstream shape is
// therefore stubbed FROM REAL MEASURED BARS (7 and 8 September 2026, captured
// from Yahoo) and the clock is the fixture's, so the failing window is
// reproducible on demand rather than once a day.
import { onRequest } from "../../../functions/api/indices.js";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

// ── THE REAL BARS, and the real levels the screenshot printed ───────────────
// Bar stamps are the SESSION OPEN in UTC (03:45Z = 09:15 IST). The closes are
// Yahoo's own float32 values, kept verbatim: the ±0.05 residual against a level
// rounded to 2dp is exactly what made the defect look like a market figure.
const IST = 19800;
const T = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const BARS = [
  { t: T("2026-09-03T03:45:00Z"), close: 23873.44921875 },
  { t: T("2026-09-04T03:45:00Z"), close: 23897.69921875 },
  { t: T("2026-09-07T03:45:00Z"), close: 23779.150390625 },
  { t: T("2026-09-08T03:45:00Z"), close: 23635.099609375 },
];

/**
 * One chart response. `marketTime` is what the upstream says the LEVEL is from —
 * the whole of what the fix turns on.
 */
function chart(opts: {
  level: number; marketTime: number; bars?: { t: number; close: number }[];
  longName?: string; gmtoffset?: number | null;
}) {
  const bars = opts.bars ?? BARS;
  return {
    chart: {
      result: [{
        meta: {
          longName: opts.longName ?? "NIFTY 50",
          shortName: opts.longName ?? "NIFTY 50",
          currency: "INR",
          fullExchangeName: "NSE",
          regularMarketPrice: opts.level,
          regularMarketTime: opts.marketTime,
          ...(opts.gmtoffset === null ? {} : { gmtoffset: opts.gmtoffset ?? IST }),
          timezone: "IST",
        },
        timestamp: bars.map((b) => b.t),
        indicators: { quote: [{ close: bars.map((b) => b.close) }] },
      }],
    },
  };
}

/** Stub every upstream call with one response and read the Nifty 50 row back. */
async function run(body: unknown) {
  (globalThis as { fetch: unknown }).fetch = async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  // `caches` and `waitUntil` are what the Pages runtime supplies; `refresh=1`
  // skips the read so every case sees the stub rather than a neighbour's answer.
  (globalThis as { caches?: unknown }).caches = { default: { match: async () => undefined, put: async () => undefined } };
  const r = await onRequest({
    request: new Request("https://x/api/indices?refresh=1"),
    waitUntil: () => {},
  });
  const d = await r.json();
  return d.indices[0];
}

// ── 1. THE DEFECT'S OWN WINDOW: 06:00 IST, before the session's first tick ──
// The level is still 7 September's close and 8 September's bar does not exist.
// Under the old rule the UTC date had already rolled to the 8th, so the 7th's
// bar became the "previous" close and the level was differenced against itself.
{
  const row = await run(chart({
    level: 23779.2,                       // 7 Sep close, as `regularMarketPrice`
    marketTime: T("2026-09-07T10:01:17Z"),// 15:31 IST on the 7th
    bars: BARS.slice(0, 3),               // no bar for the 8th yet
  }));
  ok("pre-open: the level's session and the previous close are DIFFERENT sessions",
     row.sessionDate === "2026-09-07" && row.prevCloseDate === "2026-09-04",
     `session ${row.sessionDate} vs prev ${row.prevCloseDate}`);
  ok("...so the move is the last COMPLETED session's, not a session against itself",
     Math.abs(row.change - (23779.2 - 23897.69921875)) < 1e-6,
     `${row.change?.toFixed(4)} (7 Sep close − 4 Sep close)`);
  ok("...and it is not the fabricated ±0.05",
     Math.abs(row.change) > 1, `|Δ| = ${Math.abs(row.change).toFixed(2)} points`);
}

// ── 2. MID-SESSION: today's bar exists and must not be the previous close ───
{
  const row = await run(chart({ level: 23635.1, marketTime: T("2026-09-08T10:01:17Z") }));
  ok("in session: the previous close is the session BEFORE the level's",
     row.sessionDate === "2026-09-08" && row.prevCloseDate === "2026-09-07",
     `session ${row.sessionDate} vs prev ${row.prevCloseDate}`);
  ok("...and the move ties to the two closes it names",
     Math.abs(row.change - (23635.1 - 23779.150390625)) < 1e-6 &&
     Math.abs(row.changePct - ((23635.1 - 23779.150390625) / 23779.150390625) * 100) < 1e-9,
     `${row.change.toFixed(2)} pts · ${row.changePct.toFixed(3)}%`);
}

// ── 3. THE INVARIANT ITSELF, over every hour of the day ─────────────────────
// The defect was a WINDOW, so the guard is swept rather than sampled: whatever
// the level's timestamp, the two ends of the subtraction are never one session.
{
  let same = 0, checked = 0;
  for (let h = 0; h < 24; h++) {
    const stamp = T(`2026-09-08T${String(h).padStart(2, "0")}:30:00Z`);
    const row = await run(chart({ level: 23635.1, marketTime: stamp }));
    if (row.prevCloseDate == null) continue;
    checked++;
    if (row.sessionDate === row.prevCloseDate) same++;
  }
  ok("across all 24 hours the level is never differenced against its own session",
     checked === 24 && same === 0, `${checked} hours checked, ${same} self-differenced`);
}

// ── 4. A WEEKEND HOLDS THE LEVEL FOR DAYS, and must still report a move ────
// Two clocks made this the worst case: the level sits at Friday's close while
// the server's date advances, so the strip read 0.00% all weekend.
{
  const row = await run(chart({
    level: 23635.1, marketTime: T("2026-09-08T10:01:17Z"),
    bars: [...BARS, { t: T("2026-09-12T03:45:00Z"), close: NaN }],  // a holiday: null close
  }));
  ok("a null bar is not a session, so it can neither be the level's nor the previous close",
     row.prevCloseDate === "2026-09-07", `prev ${row.prevCloseDate}`);
}

// ── 5. NO SESSION FOR THE LEVEL MEANS NO SUBTRACTION ───────────────────────
// Without a timestamp there is nothing to exclude and the last bar might be the
// level's own — which IS the defect, so it refuses rather than guessing.
{
  const row = await run(chart({ level: 23635.1, marketTime: NaN }));
  ok("a level whose session is unreadable carries no change, never a zero",
     row.level === 23635.1 && row.change === null && row.changePct === null && row.prevClose === null,
     `level ${row.level}, change ${row.change}`);
}

// ── 6. THE OFFSET IS THE UPSTREAM'S, AND BOTH ENDS USE IT ──────────────────
// A stamp at 20:00 UTC on the 7th is the 8th in IST. Read in UTC it is the 7th,
// which would make the 7th's bar the level's own session — the defect again,
// arriving through the zone rather than through the hour.
{
  const row = await run(chart({ level: 23779.2, marketTime: T("2026-09-07T20:00:00Z") }));
  ok("the exchange offset decides the session, not the server's zone",
     row.sessionDate === "2026-09-08" && row.prevCloseDate === "2026-09-07",
     `session ${row.sessionDate} vs prev ${row.prevCloseDate}`);
  const utc = await run(chart({ level: 23779.2, marketTime: T("2026-09-07T20:00:00Z"), gmtoffset: null }));
  ok("...and with no offset declared BOTH ends fall back together, never one each",
     utc.sessionDate !== utc.prevCloseDate && utc.prevCloseDate === "2026-09-04",
     `session ${utc.sessionDate} vs prev ${utc.prevCloseDate}`);
}

// ── 7. A MEASURED ZERO SURVIVES ────────────────────────────────────────────
// The fix is about WHICH sessions are compared and must not suppress a real
// unchanged close — §2's rule, applied to the one figure this defect faked.
{
  const row = await run(chart({
    level: 23779.150390625, marketTime: T("2026-09-08T10:01:17Z"),
    bars: [...BARS.slice(0, 3), { t: T("2026-09-08T03:45:00Z"), close: 23779.150390625 }],
  }));
  ok("an index that genuinely closed unchanged still reports 0.00%, from two sessions",
     row.change === 0 && row.changePct === 0 && row.sessionDate !== row.prevCloseDate,
     `${row.change} over ${row.prevCloseDate} → ${row.sessionDate}`);
}

// ── 8. IDENTITY STILL OUTRANKS FIGURES (trap 2, unchanged) ─────────────────
{
  const row = await run(chart({ level: 7757.15, marketTime: T("2026-09-08T10:01:17Z"), longName: "NIFTY NEXT 50" }));
  ok("a symbol answering with a different index still yields no level",
     row.ok === false && row.reason === "identity_mismatch", `reason ${row.reason}`);
}

console.log(fails ? `\n${fails} failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
