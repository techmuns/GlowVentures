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

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function onRequest(context) {
  const { request, env } = context;
  const token = env && env.MUNS_TOKEN;
  const meta = {
    version: VERSION,
    deploymentId: (env && (env.CF_PAGES_COMMIT_SHA || env.CF_PAGES_BRANCH)) || null,
    colo: request.cf && request.cf.colo ? request.cf.colo : null,
    tokenPresent: !!token,
  };

  if (request.method === "GET") return json({ ok: !!token, upstream: UPSTREAM, ...meta });
  if (request.method !== "POST") return json({ ok: false, failureCode: "METHOD_NOT_ALLOWED", ...meta }, 405);

  // A MISSING TOKEN IS A CONFIGURATION FACT, NOT AN EMPTY ANSWER. It is named
  // as such so the panel can say the assistant is not configured rather than
  // implying the question had no answer.
  if (!token) return json({ ok: false, failureCode: "NOT_CONFIGURED", ...meta }, 503);

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
    try { preview = (await upstream.text()).slice(0, 400); } catch { /* body already gone */ }
    return json({ ok: false, failureCode: "UPSTREAM_ERROR", upstreamStatus: upstream.status, detail: preview, ...meta },
      upstream.status === 401 || upstream.status === 403 ? 502 : 502);
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
