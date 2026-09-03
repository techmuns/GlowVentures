// THE CHAT PROXY'S BRANCHES, AGAINST A STUBBED UPSTREAM.
//   npm run test:family
//
// ── WHY A TEST AND NOT A PROBE ──────────────────────────────────────────────
//
// The first live request came back 400: "user_index is required in the request
// body for service token requests". `MUNS_TOKEN` is a SERVICE token, so the
// acting user is not implicit in the credential the way the endpoint's doc
// (`Bearer <YOUR_SESSION_TOKEN>`) assumed — and the chat is the only
// user-scoped muns endpoint this dashboard calls, which is why none of the
// other seven ever needed the field.
//
// The token exists only in the Cloudflare environment, so the fix cannot be
// confirmed against the real API from here. What CAN be confirmed is every
// branch around it: that the field is sent, that it is never invented, and that
// each failure comes back under a code the panel can turn into a sentence a
// reader can act on. `fetch` is stubbed, so these assert THIS function's
// behaviour and never the upstream's.
// Typed by `functions/api/chat.d.ts` — a plain `import` of the JS function
// fails `tsc -b` with TS7016, which is how this suite broke the build once:
// `test:family` bundles with esbuild and does not typecheck, so nothing caught
// it until the next full build.
import { onRequest } from "../../../functions/api/chat.js";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const ASK = { tasks: ["What is the book worth?"], query_context: { chatHistory: [] } };
const post = (env: Record<string, string>, body: unknown = ASK) =>
  onRequest({
    env,
    request: new Request("https://x/api/chat", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }),
  });
const get = (env: Record<string, string>, qs = "") =>
  onRequest({ env, request: new Request(`https://x/api/chat${qs}`, { method: "GET" }) });

/** Stub the upstream and capture exactly what the function sent it. */
function stub(reply: { status?: number; body?: string; headers?: Record<string, string> }) {
  const seen: { url?: string; init?: RequestInit; body?: Record<string, unknown> } = {};
  (globalThis as { fetch: unknown }).fetch = async (url: string, init: RequestInit) => {
    seen.url = url; seen.init = init;
    try { seen.body = JSON.parse(String(init.body)); } catch { seen.body = undefined; }
    return new Response(reply.body ?? "data: hello\n\n", {
      status: reply.status ?? 200,
      headers: { "content-type": "text/event-stream", ...(reply.headers ?? {}) },
    });
  };
  return seen;
}

// ── the configuration failures are named BEFORE any call is made ───────────
{
  const seen = stub({});
  const r = await post({});
  const j = await r.json();
  ok("no token → NOT_CONFIGURED", j.failureCode === "NOT_CONFIGURED", String(j.failureCode));
  ok("...and no request is made to the upstream", seen.url === undefined);
}
{
  const seen = stub({});
  const r = await post({ MUNS_TOKEN: "t" });
  const j = await r.json();
  // THE FIX'S CENTRAL ASSERTION. The value is never invented: without one the
  // function refuses rather than sending a user index nobody chose, because a
  // wrong index files this family's conversation under another account.
  ok("token but no user index → USER_INDEX_REQUIRED", j.failureCode === "USER_INDEX_REQUIRED", String(j.failureCode));
  ok("...and STILL no request is made — no guessed index is ever sent", seen.url === undefined);
}

// ── the happy path sends the field, in the shape the name implies ──────────
{
  const seen = stub({});
  const r = await post({ MUNS_TOKEN: "t", MUNS_USER_INDEX: "42" });
  ok("configured → the stream is passed through", r.status === 200 && (r.headers.get("content-type") ?? "").includes("event-stream"));
  ok("...to the documented endpoint", seen.url === "https://devde.muns.io/chat/chat-muns", String(seen.url));
  ok("...carrying user_index at the TOP LEVEL of the body, as the error asked",
    Object.prototype.hasOwnProperty.call(seen.body ?? {}, "user_index"), JSON.stringify(seen.body?.user_index));
  ok("...as a number, because an all-digit index reads as one", seen.body?.user_index === 42);
  ok("...with the service token in the header, never in the body",
    String((seen.init?.headers as Record<string, string>)?.authorization) === "Bearer t"
    && !JSON.stringify(seen.body).includes("Bearer"));
  ok("...and the question intact", Array.isArray(seen.body?.tasks) && (seen.body?.tasks as string[])[0].includes("book worth"));
}
{
  const seen = stub({});
  await post({ MUNS_TOKEN: "t", MUNS_USER_INDEX: "acct-7" });
  ok("a non-numeric index is sent verbatim rather than coerced to NaN", seen.body?.user_index === "acct-7");
}
{
  // THE BROWSER DOES NOT GET TO CHOOSE WHOSE ACCOUNT A QUESTION IS FILED UNDER.
  const seen = stub({});
  await post({ MUNS_TOKEN: "t", MUNS_USER_INDEX: "42" }, { ...ASK, user_index: 999 });
  ok("a user_index in the REQUEST is ignored — the environment's wins", seen.body?.user_index === 42,
    JSON.stringify(seen.body?.user_index));
}

// ── the upstream's own words, out of its envelope ──────────────────────────
{
  // The exact body the deployment returned.
  stub({ status: 400, body: JSON.stringify({
    statusCode: 400, path: "/chat/chat-muns",
    message: { message: "user_index is required in the request body for service token requests",
      error: "Bad Request", statusCode: 400 },
  }) });
  const r = await post({ MUNS_TOKEN: "t", MUNS_USER_INDEX: "wrong" });
  const j = await r.json();
  ok("a 400 naming user_index comes back as USER_INDEX_REJECTED, not a model failure",
    j.failureCode === "USER_INDEX_REJECTED", String(j.failureCode));
  ok("...and the detail is the human sentence, not the whole JSON envelope",
    j.detail === "user_index is required in the request body for service token requests", String(j.detail));
  ok("...so the panel never prints a raw envelope at a reader again",
    !String(j.detail).includes("statusCode") && !String(j.detail).includes("{"));
}
{
  stub({ status: 401, body: "Unauthorized" });
  const j = await (await post({ MUNS_TOKEN: "t", MUNS_USER_INDEX: "42" })).json();
  ok("an auth failure stays UPSTREAM_ERROR — a different place to look",
    j.failureCode === "UPSTREAM_ERROR" && j.upstreamStatus === 401, `${j.failureCode}/${j.upstreamStatus}`);
}

// ── the diagnostics report presence and shape, never the token ─────────────
{
  stub({});
  const j = await (await get({ MUNS_TOKEN: "t", MUNS_USER_INDEX: "42" })).json();
  ok("GET reports configuration as ok when both are set", j.ok === true);
  ok("...and says the index is present and what shape it will send",
    j.userIndexPresent === true && j.userIndexSent === 42, JSON.stringify(j.userIndexSent));
  ok("...and NEVER echoes the token", !JSON.stringify(j).includes("\"t\"") || !("token" in j));
  const half = await (await get({ MUNS_TOKEN: "t" })).json();
  ok("...and is NOT ok with the token alone", half.ok === false && half.userIndexPresent === false);
}
{
  const seen = stub({ status: 200, body: "data: ok\n\n" });
  const j = await (await get({ MUNS_TOKEN: "t", MUNS_USER_INDEX: "42" }, "?probe=1")).json();
  ok("the probe makes ONE live round trip and reports what came back",
    seen.url === "https://devde.muns.io/chat/chat-muns" && j.upstreamStatus === 200, String(j.upstreamStatus));
  ok("...sending the same user_index the real path would", seen.body?.user_index === 42);
}

process.exit(fails ? 1 : 0);
