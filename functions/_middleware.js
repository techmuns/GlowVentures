// Cloudflare Pages Function — edge password gate for the ENTIRE site.
//
// Runs on every request, on Cloudflare's edge, BEFORE any static asset is
// served. Unauthenticated visitors receive only the login page below — never
// index.html, the JS bundle, or the portfolio data baked into it. (A password
// checked inside the React app would be useless: the browser downloads the whole
// bundle — data included — before any prompt could appear. This check happens
// server-side, so nothing ships until you're authenticated.)
//
// ─────────────────────────────────────────────────────────────────────────────
//  CHANGING THE PASSWORD
//    • Easiest — ask Claude: "change the dashboard password to <new password>".
//    • By hand:  npm run set-password -- "<new password>"
//  Either rewrites PASSWORD_HASH below; then commit & push. Cloudflare redeploys
//  in ~1 min and the new password is live (all existing sessions are invalidated
//  automatically). The plaintext password is NEVER stored — only its salted
//  SHA-256 hash, which is server-side only and never sent to the browser.
// ─────────────────────────────────────────────────────────────────────────────

// Salted SHA-256 of the dashboard password. Managed by `npm run set-password`.
const PASSWORD_HASH = "6da1b78fa68be61bd96cd363385ad72f91460c60c5b95447bfe54309f07dc774";

// Fixed domain-separator folded into the hash (not a secret). Must stay in sync
// with scripts/set-dashboard-password.mjs.
const PEPPER = "glow-ventures-family-office::pw::v1";

const COOKIE = "glow_auth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const hashPassword = (pw) => sha256hex(`${PEPPER}\n${pw}`);
// Session cookie value is derived from the password hash, so rotating the
// password automatically invalidates every previously issued session cookie.
const sessionToken = () => sha256hex(`session::v1\n${PASSWORD_HASH}`);

// Constant-time string compare (avoid leaking match length via early return).
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// Only allow same-origin relative redirects (blocks open-redirect via ?next=).
function safeNext(raw) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function cookieHeader(value, maxAge) {
  // SameSite=None + Secure + Partitioned so the session survives when the
  // dashboard is embedded in an iframe on another site (e.g. the muns.io app).
  // A Lax/Strict cookie is dropped in a cross-site iframe, which makes the login
  // silently loop back. Partitioned (CHIPS) keeps it working even as browsers
  // phase out unpartitioned third-party cookies.
  const parts = [`${COOKIE}=${value}`, "Path=/", "HttpOnly", "Secure", "SameSite=None", "Partitioned", `Max-Age=${maxAge}`];
  return parts.join("; ");
}

const htmlResponse = (body, status = 200, extraHeaders = {}) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", ...extraHeaders },
  });

function loginPage({ error, next }) {
  const action = `/__auth/login?next=${encodeURIComponent(next)}`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Glow Ventures Family Office — Sign in</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #f4f2ec; color: #1a1830;
  }
  .card {
    width: 100%; max-width: 380px; background: #ffffff; border: 1px solid #e4ddcd;
    border-radius: 16px; padding: 32px 28px; box-shadow: 0 12px 40px rgba(60,55,100,0.10);
  }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
  .mark {
    width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center;
    background: linear-gradient(135deg, #d9c48f, #b8923c); color: #1a1830; font-weight: 700;
    letter-spacing: 0.5px; box-shadow: 0 2px 8px rgba(184,146,60,0.35);
  }
  .brand h1 { font-size: 15px; margin: 0; font-weight: 600; letter-spacing: -0.01em; }
  .brand p { font-size: 11px; margin: 2px 0 0; letter-spacing: 0.18em; text-transform: uppercase; color: #8a8699; }
  label { display: block; font-size: 12px; font-weight: 500; margin: 0 0 7px; color: #55516b; }
  input[type=password] {
    width: 100%; padding: 11px 13px; font-size: 15px; border-radius: 9px;
    border: 1px solid #d8d3c4; background: #faf8f1; color: #1a1830; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  input[type=password]:focus { border-color: #b8923c; box-shadow: 0 0 0 3px rgba(184,146,60,0.18); }
  button {
    margin-top: 16px; width: 100%; padding: 11px 14px; font-size: 14px; font-weight: 600;
    border: 0; border-radius: 9px; cursor: pointer; color: #1a1830;
    background: linear-gradient(135deg, #d9c48f, #b8923c); transition: filter .15s;
  }
  button:hover { filter: brightness(1.05); }
  .err { margin: 14px 0 0; font-size: 12.5px; color: #b91c1c; }
  .foot { margin-top: 18px; font-size: 11px; color: #9995ad; line-height: 1.5; }
  @media (prefers-color-scheme: dark) {
    body { background: #0e0c1c; color: #ece9f6; }
    .card { background: #151233; border-color: #2b2668; box-shadow: 0 12px 40px rgba(0,0,0,0.45); }
    .brand p { color: #a5a1c4; }
    label { color: #a5a1c4; }
    input[type=password] { background: #1c1840; border-color: #2b2668; color: #ece9f6; }
    input[type=password]:focus { border-color: #d9c48f; box-shadow: 0 0 0 3px rgba(217,196,143,0.20); }
    .foot { color: #6f6b90; }
  }
</style>
</head><body>
  <form class="card" method="POST" action="${action}" autocomplete="on">
    <div class="brand">
      <div class="mark">GV</div>
      <div><h1>Glow Ventures Family Office</h1><p>Investor Cockpit</p></div>
    </div>
    <label for="password">Enter password to continue</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
    <button type="submit">Unlock dashboard</button>
    ${error ? '<p class="err">Incorrect password — please try again.</p>' : ""}
    <p class="foot">This is a private dashboard. Access is restricted to authorized members of the Glow Ventures Family Office.</p>
  </form>
</body></html>`;
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // Sign out — clear the cookie and bounce to the login page.
  if (url.pathname === "/__auth/logout") {
    return new Response(null, {
      status: 302,
      headers: { Location: "/", "Set-Cookie": cookieHeader("", 0), "Cache-Control": "no-store" },
    });
  }

  const configured = PASSWORD_HASH && !PASSWORD_HASH.startsWith("PLACEHOLDER");

  // Handle a login submission.
  if (request.method === "POST" && url.pathname === "/__auth/login") {
    let pw = "";
    try { pw = String((await request.formData()).get("password") ?? ""); } catch { pw = ""; }
    const dest = safeNext(url.searchParams.get("next"));
    if (configured && timingSafeEqual(await hashPassword(pw), PASSWORD_HASH)) {
      return new Response(null, {
        status: 302,
        headers: { Location: dest, "Set-Cookie": cookieHeader(await sessionToken(), MAX_AGE), "Cache-Control": "no-store" },
      });
    }
    return htmlResponse(loginPage({ error: true, next: dest }), 401);
  }

  // Already signed in? Let the request through to the static assets / SPA.
  const cookies = parseCookies(request.headers.get("Cookie"));
  if (configured && cookies[COOKIE] && timingSafeEqual(cookies[COOKIE], await sessionToken())) {
    return next();
  }

  // Otherwise show the login wall (200 so it renders cleanly on any deep link).
  return htmlResponse(loginPage({ error: false, next: safeNext(url.pathname + url.search) }), 200);
}
