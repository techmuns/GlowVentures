// THE POLYCAB EDGE FUNCTION, AGAINST A STUBBED EXCHANGE.  npm run test:family
//
// ── WHY A TEST AND NOT A PROBE ──────────────────────────────────────────────
//
// `/api/polycab` is a Cloudflare Pages Function, and this deployment gates every
// `/api/*` path behind the edge password check — measured against the branch
// preview on 2026-09-22, which answers the SIGN-IN PAGE, HTTP 200, `text/html`.
// That is right for a browser and, as Stage 10c already records, a trap for a
// script: a probe that checks the status alone reports a working endpoint while
// parsing HTML as JSON. So the deployed function cannot be exercised from here
// without `GLOW_PASSWORD`, and that is stated rather than worked around.
//
// Every branch AROUND the upstream is reachable, and they are the ones that
// matter. This is the treatment `chatFunction`, `indicesFunction` and
// `quotesFunction` already get for exactly the same reason.
//
// ── WHAT IT IS GUARDING ─────────────────────────────────────────────────────
//
// THE IDENTITY GATE IS THE MOST SAFETY-CRITICAL CODE IN THIS CHANGE. A wrong
// scrip code returns a complete, correct, well-formed quote for another company,
// and a PRICE is the figure on this page a reader would act on fastest. Probing
// moneycontrol during the same session returned precisely that — a page whose
// promoter holding was 55.03% against Polycab's 61.5%, under a title naming no
// company at all.
//
// The gate therefore has to REFUSE rather than caveat, and it has to refuse in
// three separate ways that are easy to collapse into one another:
//
//   • no ISIN from the caller        → the endpoint has nothing to check against
//                                      and must not become a bare proxy for
//                                      whatever scrip code it was handed;
//   • the exchange returns a DIFFERENT ISIN → refuse, and name both;
//   • the exchange is unreachable    → a fact about the SERVICE, never about the
//                                      holding (`upstreamStatus.ts`'s rule).
//
// Each carries its own `reason`, because a reader — and the page's own fallback
// copy — sends someone to completely different places for each.
import { onRequest } from "../../../functions/api/polycab.js";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const BOOK_ISIN = "INE455K01017";

/** The two shapes the exchange really returns, captured from the live probe. */
const IDENTITY = (isin: string) => ({
  SecurityId: "POLYCAB", SecurityCode: "542652", ISIN: isin,
  FaceVal: "10.00", Industry: "Cables - Electricals", Group: "A", Index: "BSE 200",
});
const HEADER = {
  CurrRate: { LTP: "8375.00", Chg: "+15.00", PcChg: "+0.18" },
  Header: { PrevClose: "8360.00", Open: "8377.30", High: "8428.65", Low: "8330.70", LTP: "8375.00" },
};

/**
 * Stub the exchange. `identity` and `header` are answered by URL, so a case can
 * fail ONE of the two calls — which is how the "the quote died after identity
 * passed" branch is reached at all.
 */
async function run(
  query: string,
  opts: { identity?: unknown; header?: unknown; identityStatus?: number; headerStatus?: number; throws?: boolean } = {},
) {
  (globalThis as { fetch: unknown }).fetch = async (url: string) => {
    if (opts.throws) throw new Error("getaddrinfo ENOTFOUND api.bseindia.com");
    const isIdentity = String(url).includes("ComHeadernew");
    const status = isIdentity ? (opts.identityStatus ?? 200) : (opts.headerStatus ?? 200);
    const body = isIdentity ? (opts.identity ?? IDENTITY(BOOK_ISIN)) : (opts.header ?? HEADER);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  const r = await onRequest({ request: new Request(`https://x/api/polycab${query}`) });
  return { status: r.status, body: await r.json() as Record<string, unknown> };
}

console.log("── the identity gate refuses three different ways, and names each ──");

{
  const { body } = await run("");
  ok("no ISIN from the caller is refused, and says what it needed",
    body.ok === false && body.reason === "NO_ISIN" && /ISIN the book carries/i.test(String(body.detail)));
}
{
  const { body } = await run("?isin=NOTANISIN");
  ok("a malformed ISIN is refused on the same branch rather than sent upstream",
    body.ok === false && body.reason === "NO_ISIN");
}
{
  // THE CASE THE WHOLE GATE EXISTS FOR. The exchange answers perfectly — a real
  // quote, a real company — and it is the WRONG company.
  const { body } = await run(`?isin=${BOOK_ISIN}`, { identity: IDENTITY("INE000A01001") });
  ok("an ISIN mismatch returns NO PRICE AT ALL, never a price with a caveat",
    body.ok === false && body.reason === "IDENTITY_MISMATCH" && body.quote === undefined);
  ok("…and names both sides, so the next reader can tell which is wrong",
    /INE000A01001/.test(String(body.detail)) && new RegExp(BOOK_ISIN).test(String(body.detail)));
}
{
  const { body } = await run(`?isin=${BOOK_ISIN}`, { identity: { SecurityId: "POLYCAB", ISIN: "" } });
  ok("an identity response with no well-formed ISIN is refused, not treated as a match",
    body.ok === false && body.reason === "NO_IDENTITY");
}

console.log("\n── an unreachable exchange is a fact about the SERVICE ──");

{
  const { body } = await run(`?isin=${BOOK_ISIN}`, { throws: true });
  ok("a thrown fetch reports UPSTREAM_ERROR rather than a fact about the holding",
    body.ok === false && body.reason === "UPSTREAM_ERROR" && /ENOTFOUND/.test(String(body.detail)));
}
{
  // BSE answers a REJECTED request with a 302 to an HTML error page. Followed,
  // that parses as neither JSON nor a failure; the function refuses redirects so
  // it is visible — and this asserts the refusal, since a silently-followed
  // redirect is the shape that would return `ok:true` with nothing in it.
  const { body } = await run(`?isin=${BOOK_ISIN}`, { identityStatus: 302 });
  ok("a 302 to the exchange's error page is a failure, not an empty success",
    body.ok === false && body.reason === "UPSTREAM_ERROR" && /refused/i.test(String(body.detail)));
}
{
  const { body } = await run(`?isin=${BOOK_ISIN}`, { headerStatus: 500 });
  ok("identity passing does not make a dead quote call succeed",
    body.ok === false && body.reason === "UPSTREAM_ERROR");
}
{
  const { body } = await run(`?isin=${BOOK_ISIN}`, { header: { CurrRate: {}, Header: { PrevClose: "8360" } } });
  ok("a response carrying no last-traded price yields NO_QUOTE, never a zero",
    body.ok === false && body.reason === "NO_QUOTE");
}

console.log("\n── and a good answer carries the figures, derived and checked ──");

{
  const { body } = await run(`?isin=${BOOK_ISIN}`);
  const q = body.quote as Record<string, number | null>;
  ok("a matching identity serves the quote", body.ok === true && q?.ltp === 8375);
  // DERIVED from two figures the response also carries, and compared against the
  // exchange's own printed change. `/api/indices` once differenced a level
  // against its OWN session and printed +0.00% across four indices, with a
  // residual of a few paise as the only tell.
  ok("the day change is derived as last-traded less previous close",
    q?.change === 15 && Math.abs((q?.changePct as number) - (15 / 8360) * 100) < 1e-9);
  ok("…and the exchange's own printed change rides along as a CHECK, not a source",
    q?.printedChange === 15 && q?.printedChangePct === 0.18);
  ok("the identity it verified against is returned, so the page can show what was checked",
    (body.identity as Record<string, string>)?.isin === BOOK_ISIN);
}
{
  // A quote with no previous close carries NO change rather than a zero — the
  // same rule the index strip needed: without the other end there is nothing to
  // difference, and 0.00% reads as a measured flat day.
  const { body } = await run(`?isin=${BOOK_ISIN}`, {
    header: { CurrRate: { LTP: "8375.00" }, Header: { LTP: "8375.00" } },
  });
  const q = body.quote as Record<string, number | null>;
  ok("a quote with no previous close carries no change rather than a fabricated zero",
    body.ok === true && q?.ltp === 8375 && q?.change === null && q?.changePct === null);
}

console.log("\n── the browser cannot widen what this endpoint will confirm ──");

/**
 * The caller states the ISIN, and that is deliberately the ONLY thing it gets to
 * state: the scrip code is a constant in the shared module, so a request cannot
 * point this endpoint at a different company and have it confirm one. A caller
 * passing a different ISIN does not move the scrip — it only fails the gate.
 */
{
  const seen: string[] = [];
  (globalThis as { fetch: unknown }).fetch = async (url: string) => {
    seen.push(String(url));
    return new Response(JSON.stringify(String(url).includes("ComHeadernew") ? IDENTITY(BOOK_ISIN) : HEADER),
      { status: 200, headers: { "content-type": "application/json" } });
  };
  await onRequest({ request: new Request(`https://x/api/polycab?isin=${BOOK_ISIN}&scripcode=500325`) });
  ok("a scrip code in the request is ignored — every call goes to the book's own scrip",
    seen.length > 0 && seen.every((u) => u.includes("scripcode=542652") && !u.includes("500325")),
    seen.join(" | ").slice(0, 160));
}

console.log(fails === 0 ? "\nAll Polycab function checks passed." : `\n${fails} FAILED`);
if (fails) process.exit(1);
