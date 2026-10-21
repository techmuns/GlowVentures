// THE QUOTE PROXY'S OWN PARTITION, AGAINST A STUBBED UPSTREAM.  npm run test:family
//
// ── WHY A TEST AND NOT A PROBE ──────────────────────────────────────────────
//
// *"this daily movers section take a lot of time to show data and sometimes
// first shows incomplete data and then starts showing all the portfolio
// movers."*
//
// The cause is that this endpoint prices a BOUNDED SLICE per request — the
// upstream returns only part of a large ask inside its own budget — and used to
// report everything it had not priced under one heading, `missing`. A symbol
// DEFERRED by the cap and a symbol the upstream CANNOT PRICE are opposite facts:
// the first is answered in seconds, the second never is. A caller that cannot
// tell them apart cannot know when a set is COMPLETE, and Today's movers is a
// RANKING — a top-gainers list struck over part of a scope promotes a name that
// is not the top and omits the one that is. That is a wrong figure, not a slow
// screen.
//
// None of it can be probed. `MUNS_TOKEN` lives in the Cloudflare environment and
// nowhere else, so the real upstream is out of reach from a test — and the
// partition is a property of THIS function, not of the upstream, so stubbing is
// the honest way to reach it. Every branch around the fetch is exercised here:
// the split, the cap, the priority ordering, and the last-good fallback that
// must move a symbol OUT of pending once it has a price.
import { onRequest } from "../../../functions/api/quotes.js";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const SYMS = (n: number, prefix = "S") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/**
 * ONE CALL, WITH THE UPSTREAM AND THE EDGE CACHE BOTH STUBBED.
 *
 * `priceable` is what the stubbed upstream will answer for; anything asked for
 * and not in it comes back unpriced, which is the `missing` case. `bundle` seeds
 * the edge cache, which is how a symbol can be served without being asked for.
 */
async function call(opts: {
  symbols: string[];
  priority?: string[];
  refresh?: boolean;
  priceable?: (s: string) => boolean;
  bundle?: Record<string, { v: Record<string, unknown>; at: number }>;
}) {
  const priceable = opts.priceable ?? (() => true);
  const asked: string[][] = [];
  let stored: Record<string, unknown> = { ...(opts.bundle ?? {}) };

  const g = globalThis as unknown as Record<string, unknown>;
  const realFetch = g.fetch, realCaches = g.caches;
  // The upstream's OWN shapes, both ways: it is asked with a comma-joined
  // `ticker_symbol` and answers under `data.items`, keyed on `ticker`, with the
  // rest of the quote inside a `rawQuote` blob. Getting either wrong here would
  // make every case below report nothing priced — which is what the first draft
  // did, and is why the shapes are taken from the function rather than guessed.
  g.fetch = async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const want: string[] = String(body.ticker_symbol ?? "").split(",").filter(Boolean);
    asked.push(want);
    return new Response(JSON.stringify({
      data: {
        items: want.filter(priceable).map((s) => ({
          ticker: s, currentPrice: 100,
          rawQuote: "Previous Close: 90\nOpening Price: 91",
        })),
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  g.caches = {
    default: {
      async match() { return new Response(JSON.stringify(stored)); },
      async put(_k: unknown, res: Response) { stored = await res.json(); },
    },
  };
  try {
    const res = await onRequest({
      env: { MUNS_TOKEN: "stub" },
      request: new Request("https://example.test/api/quotes", {
        method: "POST",
        body: JSON.stringify({ symbols: opts.symbols, priority: opts.priority, refresh: opts.refresh }),
      }),
    });
    return { body: await res.json() as Record<string, string[] & number>, asked };
  } finally {
    g.fetch = realFetch; g.caches = realCaches;
  }
}

const all = <T,>(xs: T[], f: (x: T) => boolean) => xs.every(f);

// ── 1. THE PARTITION: EVERY SYMBOL LANDS IN EXACTLY ONE PLACE ──────────────
// The whole contract. A symbol that is in neither `quotes`, `missing` nor
// `pending` is one the caller can never resolve, and one in two of them lets a
// caller both wait for it and give up on it.
{
  const { body } = await call({ symbols: SYMS(200) });
  const q = Object.keys(body.quotes as unknown as Record<string, unknown>);
  const seen = [...q, ...body.missing, ...body.pending];
  ok("every symbol asked for lands in exactly one of quotes / missing / pending",
     seen.length === 200 && new Set(seen).size === 200,
     `${q.length} priced · ${body.missing.length} missing · ${body.pending.length} pending`);
}

// ── 2. DEFERRED IS `pending`, UNSERVABLE IS `missing` ─────────────────────
// The distinction the card's hold rests on. With the ask inside the cap and an
// upstream that refuses a named few, the refused ones are `missing` and nothing
// is pending; with the ask over the cap, the overflow is `pending`.
{
  const { body } = await call({ symbols: SYMS(10), priceable: (s) => s !== "S3" && s !== "S7" });
  ok("a symbol the upstream would not price is `missing`, never `pending`",
     body.missing.length === 2 && body.missing.includes("S3") && body.missing.includes("S7")
     && body.pending.length === 0,
     `missing ${body.missing.join(",")} · pending ${body.pending.length}`);
}
{
  const { body, asked } = await call({ symbols: SYMS(200) });
  const fetched = asked.flat();
  ok("a symbol deferred by the per-request cap is `pending`, never `missing`",
     body.pending.length === 200 - fetched.length && body.missing.length === 0 && fetched.length === 64,
     `fetched ${fetched.length} · pending ${body.pending.length} · missing ${body.missing.length}`);
}

// ── 3. `priority` DECIDES WHAT GOES FIRST, AND WIDENS NOTHING ─────────────
// The half that turns three rounds into one. The card's own 33 names sat at
// distinct-symbol positions 20 to 108 in book order, 30 of them past the cap.
{
  const want = ["S150", "S151", "S152", "S180", "S199"];
  const { body, asked } = await call({ symbols: SYMS(200), priority: want });
  const fetched = new Set(asked.flat());
  ok("every priority symbol is fetched in the first round",
     all(want, (s) => fetched.has(s)) && all(want, (s) => !body.pending.includes(s)),
     `pending ${body.pending.length} of 200`);
}
{
  // A PRIORITY SYMBOL NOT IN THE ASK IS IGNORED. The hint orders what was asked
  // for; it must never add to it, or a caller could reach past its own ask.
  const { body, asked } = await call({ symbols: SYMS(10), priority: ["ZZZ", "S2"] });
  const fetched = asked.flat();
  ok("a priority symbol that is not in the ask is ignored, never fetched",
     !fetched.includes("ZZZ") && !Object.keys(body.quotes as unknown as Record<string, unknown>).includes("ZZZ")
     && fetched.includes("S2"),
     `fetched ${fetched.length}`);
}

// ── 4. A PENDING SYMBOL THE BUNDLE CAN SERVE IS NOT PENDING ───────────────
// The two sets must never overlap. A deferred symbol with a recent cached price
// HAS an answer, so the caller must not wait for it — and this is what makes a
// warm reopen render at once instead of holding.
{
  const at = Date.now() - 120_000;                 // older than FRESH_S, inside STALE_S
  const bundle = Object.fromEntries(SYMS(200).map((s) =>
    [s, { v: { price: 100, prevClose: 90, ageS: 0 }, at }]));
  const { body } = await call({ symbols: SYMS(200), bundle });
  const priced = Object.keys(body.quotes as unknown as Record<string, unknown>);
  ok("a deferred symbol the bundle can still serve leaves `pending`",
     body.pending.length === 0 && priced.length === 200,
     `pending ${body.pending.length} · priced ${priced.length}`);
  // ...AND THE PARTITION IS RE-STRUCK HERE, because this is the only call in
  // which the two sets CAN overlap: elsewhere a pending symbol has no price, so
  // "exactly one place" is satisfied by construction and check 1 cannot see the
  // overlap it is written for.
  const seen = [...priced, ...body.missing, ...body.pending];
  ok("...and the partition still holds when the bundle answers for deferred names",
     seen.length === 200 && new Set(seen).size === 200,
     `${priced.length} priced · ${body.missing.length} missing · ${body.pending.length} pending`);
}

// ── 5. `fresh` EXCLUDES PENDING ───────────────────────────────────────────
// Counted in, a first round would report the whole book fresh while holding 136
// prices it had not asked for yet — a coverage figure over a set nobody measured.
{
  const { body } = await call({ symbols: SYMS(200) });
  const priced = Object.keys(body.quotes as unknown as Record<string, unknown>).length;
  ok("`fresh` counts what was priced, never what is still pending",
     (body.fresh as unknown as number) === priced,
     `fresh ${body.fresh} against ${priced} priced and ${body.pending.length} pending`);
}

// ── 6. AN ASK INSIDE THE CAP DEFERS NOTHING ───────────────────────────────
// The steady state, and the one that must not hold a card for ever.
{
  const { body } = await call({ symbols: SYMS(30) });
  ok("an ask inside the cap comes back with nothing pending",
     body.pending.length === 0 && (body.fresh as unknown as number) === 30,
     `pending ${body.pending.length}`);
}

console.log(fails ? `\n${fails} failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
