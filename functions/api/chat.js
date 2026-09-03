// Cloudflare Pages Function — Muns chat, streamed.
//
// POST https://devde.muns.io/chat/chat-muns, proxied so `MUNS_TOKEN` stays in
// the Cloudflare environment and never reaches a browser. Same rule as the
// eight functions beside it; the token is the reason this file exists at all.
//
// ── IT STREAMS, AND THAT IS THE WHOLE POINT ─────────────────────────────────
//
// The upstream answers `text/event-stream`. The body is piped straight through
// rather than buffered: an expert-mode answer takes tens of seconds, and a
// reader watching nothing happen for half a minute assumes the thing is broken.
// `X-Chat-Id` and `X-Message-Id` are forwarded so the client can continue a
// conversation, and named in `Access-Control-Expose-Headers` because a header
// the browser cannot read is a header that does not exist.
//
// ── NOTHING HERE IS CACHED, DELIBERATELY ────────────────────────────────────
//
// Every other function in this folder caches at the edge because a P&L
// statement does not move intraday. An ANSWER is not a document: two readers
// asking the same question at the same moment are entitled to two answers, and
// serving one from cache would attach one family member's chat id to another's
// request. `cache-control: no-store` on the way out, and no `caches.default`.
//
// ── `user_index`, AND WHY THE DOC'S EXAMPLE DID NOT WORK HERE ───────────────
//
// The first live request came back:
//
//   400 — "user_index is required in the request body for service token requests"
//
// That is a TOKEN CLASS mismatch, not a wrong path. The endpoint's doc shows
// `Authorization: Bearer <YOUR_SESSION_TOKEN>` — a USER session token, where
// the acting user is implicit in the credential. `MUNS_TOKEN` is a SERVICE
// token, so the user is not implicit and the API asks the caller to name one.
//
// This is the first USER-SCOPED muns endpoint this dashboard calls. The other
// seven are stateless lookups — a quote, a filing, a ratio table — and none of
// them has an owner, a session or a history, which is exactly why none of them
// ever needed this field and why the omission surfaced only here.
//
// ── AND THE VALUE IS CONFIGURED, NEVER GUESSED ──────────────────────────────
//
// `MUNS_USER_INDEX` sits beside `MUNS_TOKEN` in the Cloudflare environment. It
// is not defaulted and not inferred: a wrong user index would file this
// family's conversation under somebody else's account, which is a worse outcome
// than the 400 it replaces. Unset, the function says so by name
// (`USER_INDEX_REQUIRED`) and names the variable to set, rather than sending a
// value nobody chose.
//
// ── UNVERIFIED AGAINST THE LIVE API ─────────────────────────────────────────
//
// `MUNS_TOKEN` exists only in the Cloudflare environment, so this could not be
// exercised end to end before shipping — the same position `research.js`
// records for itself, and that doc has been wrong about a response shape more
// than once. What IS measured: `POST /chat/chat-muns` with no token answers
// 401, so the host and the route are real and the failure is authentication
// rather than a wrong path. What is NOT: the SSE frame format, and whether
// `DASHBOARD_INPUTS` is read at all. The client therefore also puts its context
// in the task text, where it is certain to be seen, and treats every frame
// shape defensively — see `munsChat.ts`.
//
// GET /api/chat returns configuration diagnostics (never the token) so the
// deployed site can be checked without sending a question.

const VERSION = "chat-fn/1";
const UPSTREAM = "https://devde.muns.io/chat/chat-muns";
const UPSTREAM_TIMEOUT_MS = 120000;   // expert mode is slow; a stream, not a fetch
const MAX_BODY_BYTES = 256 * 1024;    // the dashboard context is a few KB

/**
 * THE ACTING USER, FIXED AT THE CLIENT'S INSTRUCTION.
 *
 * "Pass an argument named `user_id`: 14 — this is a static value, don't change
 * it, keep it 14 only, include it in the main payload."
 *
 * It is a CONSTANT rather than an environment variable precisely because it was
 * given as one: the value is the same on every deployment, and putting it in
 * the Cloudflare environment would mean a working dashboard could be broken by
 * an unset variable somewhere else. It is the only identity this dashboard
 * sends, it is never taken from the request, and a browser cannot change it.
 */
const USER_ID = 14;

/**
 * The upstream's own words, out of whatever envelope it wrapped them in.
 *
 * A NestJS error nests as `{ message: { message, error, statusCode } }`, and the
 * first cut printed that whole JSON blob at the reader — machine noise where a
 * sentence belongs. The deepest `message` string is the part a human wrote.
 */
function upstreamMessage(raw) {
  if (!raw) return null;
  let v;
  try { v = JSON.parse(raw); } catch { return String(raw).slice(0, 300); }
  for (let i = 0; i < 5; i++) {
    if (typeof v === "string") return v.slice(0, 300);
    if (v && typeof v === "object" && "message" in v) { v = v.message; continue; }
    break;
  }
  return typeof v === "string" ? v.slice(0, 300) : String(raw).slice(0, 300);
}

/**
 * `user_index` as the API wants it.
 *
 * "index" reads as a number and the value is configured as a string, so an
 * all-digit value is sent as a NUMBER and anything else verbatim. Stated rather
 * than silently coerced: if the upstream turns out to want the string form, the
 * probe below shows it in one call.
 */
const asUserIndex = (v) => (/^\d+$/.test(String(v).trim()) ? Number(String(v).trim()) : v);

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function onRequest(context) {
  const { request, env } = context;
  const token = env && env.MUNS_TOKEN;
  const userIndex = env && env.MUNS_USER_INDEX;
  const meta = {
    version: VERSION,
    deploymentId: (env && (env.CF_PAGES_COMMIT_SHA || env.CF_PAGES_BRANCH)) || null,
    colo: request.cf && request.cf.colo ? request.cf.colo : null,
    tokenPresent: !!token,
    // The PRESENCE and the SHAPE, never the value — the same discipline the
    // token itself is held to. `sent` is what the body would carry, so a
    // mis-typed index shows up here rather than needing a redeploy to find.
    userIndexPresent: !!userIndex,
    userIndexSent: userIndex ? asUserIndex(userIndex) : null,
    userIdSent: USER_ID,
  };

  // GET /api/chat            — configuration, no upstream call.
  // GET /api/chat?probe=1    — ONE live round trip, diagnostics only. This is
  //                            how the `user_index` value gets confirmed on the
  //                            deployment, since the token exists nowhere else.
  if (request.method === "GET") {
    const probe = new URL(request.url).searchParams.get("probe");
    if (!probe) return json({ ok: !!token, upstream: UPSTREAM, ...meta });
    if (!token) return json({ ok: false, failureCode: "NOT_CONFIGURED", ...meta });
    try {
      const r = await fetch(UPSTREAM, {
        method: "POST",
        headers: { accept: "text/event-stream", authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          tasks: ["Reply with the single word: ok"],
          query_context: { chatHistory: [], mode: "fast" },
          user_id: USER_ID,
          ...(userIndex ? { user_index: asUserIndex(userIndex) } : {}),
        }),
      });
      const text = (await r.text()).slice(0, 600);
      return json({ ok: r.ok, upstreamStatus: r.status, upstreamMessage: upstreamMessage(text), body: text, ...meta });
    } catch (e) {
      return json({ ok: false, failureCode: "UPSTREAM_UNREACHABLE", detail: String((e && e.message) || e), ...meta });
    }
  }
  if (request.method !== "POST") return json({ ok: false, failureCode: "METHOD_NOT_ALLOWED", ...meta }, 405);

  // A MISSING TOKEN IS A CONFIGURATION FACT, NOT AN EMPTY ANSWER. It is named
  // as such so the panel can say the assistant is not configured rather than
  // implying the question had no answer.
  if (!token) return json({ ok: false, failureCode: "NOT_CONFIGURED", ...meta }, 503);
  /**
   * `MUNS_USER_INDEX` NO LONGER BLOCKS THE CALL.
   *
   * It used to refuse before calling the upstream, because at that point the
   * only identity the API had asked for was `user_index` and this dashboard had
   * no value for it. The client has since supplied one, under the name
   * `user_id` and as the fixed 14 above, so the request now has an identity to
   * send and refusing it would be refusing a call that works.
   *
   * The variable stays wired: set it, and `user_index` rides alongside
   * `user_id`. Unset, it is simply omitted — never defaulted to `USER_ID`,
   * because "index" and "id" are not obviously the same field and a 14 that
   * means a position in a list rather than an identity would file this family's
   * conversation under somebody else. If the upstream still asks for it, the
   * 400 handler below says so by name.
   */

  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ ok: false, failureCode: "BODY_TOO_LARGE", bytes: raw.length, ...meta }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, failureCode: "BAD_REQUEST", detail: "body is not JSON", ...meta }, 400);
  }
  if (!Array.isArray(body?.tasks) || !body.tasks.length) {
    return json({ ok: false, failureCode: "NO_TASKS", detail: "tasks[] is required", ...meta }, 400);
  }
  // `chatHistory` is documented as REQUIRED, and an absent one is the kind of
  // omission that returns a 4xx nobody can read from a stream. Defaulted here so
  // a client that forgets it still gets an answer.
  const query_context = { chatHistory: [], mode: "expert", ...(body.query_context || {}) };
  if (!Array.isArray(query_context.chatHistory)) query_context.chatHistory = [];

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        tasks: body.tasks,
        query_context,
        // The acting user, in the main payload. Fixed, and never taken from the
        // request: the browser does not get to say whose account a question is
        // filed under.
        user_id: USER_ID,
        // Sent only when configured — see the note above. `MUNS_TOKEN` is a
        // SERVICE token, so the upstream may want this too.
        ...(userIndex ? { user_index: asUserIndex(userIndex) } : {}),
        ...(body.chat_id ? { chat_id: body.chat_id } : {}),
      }),
      signal: ctl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e && (e.name === "AbortError" || String(e).includes("aborted"));
    return json({ ok: false, failureCode: aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNREACHABLE",
      detail: String((e && e.message) || e), ...meta }, 504);
  }

  if (!upstream.ok) {
    clearTimeout(timer);
    // The upstream's own words, truncated. A status alone sends the next reader
    // to guess; 401 and 403 mean different things about the token.
    let preview = null;
    try { preview = (await upstream.text()).slice(0, 600); } catch { /* body already gone */ }
    const message = upstreamMessage(preview);
    // A 400 NAMING `user_index` MEANS THE CONFIGURED VALUE IS WRONG, not that
    // the question was. Reported as its own code so the panel sends the reader
    // to the environment rather than to the model.
    // A 400 NAMING AN IDENTITY FIELD IS A CONFIGURATION FACT, not a bad
    // question. Split in two because the remedies differ: with no
    // `MUNS_USER_INDEX` set the fix is to set one, and with one set the fix is
    // to correct it.
    const identity = upstream.status === 400 && /user_index|user_id/i.test(message ?? "");
    const code = !identity ? "UPSTREAM_ERROR"
      : userIndex ? "USER_INDEX_REJECTED"
      : "USER_INDEX_REQUIRED";
    return json({ ok: false, failureCode: code, upstreamStatus: upstream.status, detail: message, ...meta }, 502);
  }

  // Clear the abort timer once the stream is flowing: it bounds how long we wait
  // for the RESPONSE, not how long the answer may take to write. Left armed, a
  // long expert answer would be cut off mid-sentence at two minutes.
  clearTimeout(timer);

  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    "x-accel-buffering": "no",   // some proxies buffer SSE unless told not to
    "access-control-expose-headers": "X-Chat-Id, X-Message-Id",
  });
  for (const h of ["x-chat-id", "x-message-id"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: 200, headers });
}
