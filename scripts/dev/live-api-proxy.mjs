#!/usr/bin/env node
// LOCAL APP, PRODUCTION API — the bridge that makes the muns-backed screens
// developable at all.
//
// THE PROBLEM THIS SOLVES. `MUNS_TOKEN` exists only in the Cloudflare Pages
// environment. Locally every `/api/*` call 404s against `vite preview`, so the
// company page, Compare, News and the research panels all render their "no
// upstream" state — which is indistinguishable from an upstream that answers
// with nothing. Several of those endpoints therefore shipped carrying an
// explicit UNVERIFIED AGAINST THE LIVE API comment.
//
// Measuring on the network that matters is the rule this repo already learnt
// the hard way: FRED was declared unreachable from a dev container, that
// absence was written into the docs, and it turned out to answer fine from the
// runner that actually runs the harvest.
//
// SO: this serves the LOCAL build and forwards only `/api/*` to the DEPLOYED
// site, carrying a session cookie it obtains itself. Local code, real data.
//
//   npm run build && npx vite preview --port 4173 &
//   GLOW_PASSWORD='…' node scripts/dev/live-api-proxy.mjs
//   → http://localhost:4174
//
// Two things it deliberately does NOT do:
//
//   • It does not cache. The point is to see what the upstream really returns
//     today, including its failures. A cache here would let a stale success
//     hide a live outage, which is the exact confusion it exists to remove.
//   • It never writes the password or the session cookie anywhere. Both live in
//     memory for the life of the process. The cookie is derived from the
//     password hash server-side, so logging it would be as good as logging the
//     password.
import http from "node:http";

const PORT = Number(process.env.PORT ?? 4174);
const APP = process.env.APP_ORIGIN ?? "http://localhost:4173";
const LIVE = process.env.GLOW_URL ?? "https://glowventures-1xw.pages.dev";
const PASSWORD = process.env.GLOW_PASSWORD ?? "";

if (!PASSWORD) {
  console.error("GLOW_PASSWORD is unset — the deployed site is password-gated and /api/* would return the login page.");
  process.exit(2);
}

/**
 * Sign in to the deployed site and keep the session cookie.
 *
 * The gate returns the LOGIN PAGE (HTTP 200, text/html) for an unauthenticated
 * `/api/*` request rather than a 401. That is right for a browser and a trap
 * for a script: a naive probe reads 200, tries to parse HTML as JSON and
 * reports the endpoint as broken. Everything here checks the redirect and the
 * content type rather than the status code alone.
 */
async function signIn() {
  const body = new URLSearchParams({ password: PASSWORD });
  const res = await fetch(`${LIVE}/__auth/login?next=%2F`, {
    method: "POST", body, redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = /glow_auth=([^;]+)/.exec(setCookie);
  if (res.status !== 302 || !m || !m[1]) {
    throw new Error(`login failed (status ${res.status}) — check GLOW_PASSWORD`);
  }
  return `glow_auth=${m[1]}`;
}

let cookie = await signIn();
console.log(`signed in to ${LIVE}`);

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => resolve(Buffer.concat(chunks)));
});

const server = http.createServer(async (req, res) => {
  const isApi = req.url.startsWith("/api/");
  const target = (isApi ? LIVE : APP) + req.url;
  try {
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
    const headers = { ...(req.headers["content-type"] ? { "Content-Type": req.headers["content-type"] } : {}) };
    if (isApi) headers.Cookie = cookie;

    let upstream = await fetch(target, { method: req.method, headers, body, redirect: "manual" });

    // A session can expire mid-run (30-day cookie, or a password rotation on the
    // deployed site). Re-sign once and retry rather than surfacing a login page
    // as an API response, which would read on screen as an upstream returning
    // garbage.
    if (isApi && (upstream.headers.get("content-type") ?? "").includes("text/html")) {
      cookie = await signIn();
      headers.Cookie = cookie;
      upstream = await fetch(target, { method: req.method, headers, body, redirect: "manual" });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const out = {};
    for (const k of ["content-type", "cache-control"]) {
      const v = upstream.headers.get(k);
      if (v) out[k] = v;
    }
    if (isApi) {
      const ct = out["content-type"] ?? "";
      let note = `${buf.length}B`;
      if (ct.includes("json")) {
        try {
          const j = JSON.parse(buf.toString());
          note += ` ok=${j.ok}`;
          for (const k of ["count", "articles", "items", "quotes", "failureCode"]) {
            if (k in j) note += ` ${k}=${Array.isArray(j[k]) ? j[k].length : typeof j[k] === "object" && j[k] ? Object.keys(j[k]).length : j[k]}`;
          }
        } catch { note += " (unparsed)"; }
      }
      console.log(`  ${req.method} ${req.url.slice(0, 70)} → ${upstream.status} ${note}`);
    }
    res.writeHead(upstream.status, out);
    res.end(buf);
  } catch (e) {
    // Say what actually failed. A generic 500 here would look like the app's
    // own error state rather than the bridge's.
    console.error(`  ${req.method} ${req.url} → bridge error: ${e.message}`);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, failureCode: "DEV_BRIDGE_ERROR", detail: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`local app  ${APP}`);
  console.log(`live api   ${LIVE}/api/*`);
  console.log(`open       http://localhost:${PORT}`);
});
