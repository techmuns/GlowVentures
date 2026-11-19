// THE SHARED DOCUMENTS-FOLDER-LINK STORE, BOTH ENDS (#420).  npm run test:family
//
//   *"Open OneDrive folder link per investment."*
//
// `/api/holding-links` is a Cloudflare Pages Function over the dashboard's
// shared store, gated behind the edge password and unconfigured until
// `GLOW_GITHUB_TOKEN` is set. Every branch AROUND the store is reachable against
// an in-memory one, and they are the branches that decide whether a link the
// family typed is kept, refused, or silently lost — and, because a link is put
// into an anchor every reader clicks, whether a non-http(s) address is ever
// stored.
import { onRequest, isLink, validateLink, cleanUrl } from "../../../functions/api/holding-links.js";
import { readReply, isHttpUrl, linkFor, linkHost, REASONS, type HoldingLink } from "../holdingLinks";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const SITE = "https://glow.example";
const PREFIX = "holding-link:";

function memoryKv() {
  const data = new Map<string, { value: string; metadata?: unknown }>();
  let frozen: [string, { value: string; metadata?: unknown }][] | null = null;
  let failList = false, failPut = false;
  const kv = {
    data,
    freeze() { frozen = [...data.entries()]; },
    thaw() { frozen = null; },
    breakList(on: boolean) { failList = on; },
    breakPut(on: boolean) { failPut = on; },
    async list({ prefix, cursor }: { prefix: string; cursor?: string }) {
      if (failList) throw new Error("list failed");
      const all = (frozen ?? [...data.entries()]).filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b));
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + 2);
      const next = start + 2;
      return { keys: page.map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: next >= all.length, cursor: next >= all.length ? undefined : String(next) };
    },
    async get(key: string) { const v = data.get(key); return v ? JSON.parse(v.value) : null; },
    async put(key: string, value: string, opts?: { metadata?: unknown }) { if (failPut) throw new Error("put failed"); data.set(key, { value, metadata: opts?.metadata }); },
    async delete(key: string) { data.delete(key); },
  };
  return kv;
}

type Body = { ok: boolean; links?: HoldingLink[]; key?: string; code?: string; message?: string };

async function call(kv: ReturnType<typeof memoryKv> | undefined, init: { method?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {}) {
  const method = init.method ?? (init.body !== undefined || init.raw !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = method === "POST" ? { "content-type": "application/json", origin: SITE, ...(init.headers ?? {}) } : { ...(init.headers ?? {}) };
  const request = new Request(`${SITE}/api/holding-links`, { method, headers, body: method === "POST" ? (init.raw ?? JSON.stringify(init.body)) : undefined });
  const res = await onRequest({ request, env: kv ? { DASHBOARD_STORE: kv } : {} });
  const text = await res.text();
  let body: Body | null = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body, res };
}

const draft = (over: Record<string, unknown> = {}) => ({ key: "zepto", label: "Deal docs", url: "https://1drv.ms/f/s!abc", note: "SHA, term sheet", ...over });

console.log("── only an http(s) address is ever stored ──");
{
  ok("an https OneDrive link is kept", cleanUrl("https://1drv.ms/f/s!abc") === "https://1drv.ms/f/s!abc");
  ok("http is kept", cleanUrl("http://intranet.example/folder") === "http://intranet.example/folder");
  ok("a javascript: url is refused — it would be a live trap under the folder label", cleanUrl("javascript:alert(1)") === null);
  ok("a data: url is refused", cleanUrl("data:text/html,<script>") === null);
  ok("an ftp: url is refused", cleanUrl("ftp://host/x") === null);
  ok("a bare word is refused", cleanUrl("my onedrive folder") === null);
  ok("an empty string is refused", cleanUrl("") === null);
  ok("the client agrees on what is a link", isHttpUrl("https://x.example") && !isHttpUrl("javascript:1") && !isHttpUrl(""));
}

console.log("── an unconnected store says so ──");
{
  const g = await call(undefined);
  ok("GET with no token answers 503 NOT_CONFIGURED", g.status === 503 && g.body?.code === "NOT_CONFIGURED");
  const p = await call(undefined, { body: { op: "save", link: draft() } });
  ok("…and so does a save — nothing is claimed saved", p.status === 503 && p.body?.ok === false);
  const r = await readReply(await onRequest({ request: new Request(`${SITE}/api/holding-links`), env: {} }));
  ok("the page reads that 503 as 'saving is not switched on', not an empty list", r.ok === false && r.reason === REASONS.notConfigured && r.cause === "not-configured");
}

console.log("── a link is kept, one key per holding, visible at once ──");
{
  const kv = memoryKv();
  const empty = await call(kv);
  ok("an empty store lists nothing, and says ok", empty.status === 200 && empty.body?.ok === true && empty.body.links?.length === 0);
  ok("…and is never served from a cache", empty.res.headers.get("cache-control") === "no-store");

  const s = await call(kv, { body: { op: "save", link: draft() } });
  ok("a link is saved under the holding's own key", s.status === 200 && s.body?.ok === true && s.body.key === "zepto");
  const stored = kv.data.get(PREFIX + "zepto");
  ok("it is ONE key carrying itself as metadata", !!stored && JSON.stringify(stored.metadata) === stored.value);
  ok("the answer carries the change already applied", s.body?.links?.length === 1 && s.body.links[0].url === "https://1drv.ms/f/s!abc");

  const e = await call(kv, { body: { op: "save", link: draft({ url: "https://1drv.ms/f/s!XYZ", label: "All papers" }) } });
  ok("saving the same holding replaces its link in place, not a second row", e.status === 200 && kv.data.size === 1 && e.body?.links?.length === 1 && e.body.links[0].url.endsWith("XYZ"));

  const two = await call(kv, { body: { op: "save", link: draft({ key: "perplexity-ai", label: "" }) } });
  ok("a second holding is a second key", kv.data.size === 2 && two.body?.links?.length === 2);

  kv.freeze();
  const d = await call(kv, { body: { op: "delete", key: "zepto" } });
  ok("a delete is gone from its own answer even while the list lags", d.status === 200 && !(d.body?.links ?? []).some((l) => l.key === "zepto") && d.body?.links?.length === 1);
  kv.thaw();
  const g = await call(kv);
  ok("…and from the next read by anyone", !(g.body?.links ?? []).some((l) => l.key === "zepto"));
}

console.log("── a link the store cannot keep is refused whole ──");
{
  const kv = memoryKv();
  const refused = async (label: string, d: Record<string, unknown>, want: RegExp) => {
    const r = await call(kv, { body: { op: "save", link: d } });
    ok(label, r.status === 400 && r.body?.code === "INVALID" && want.test(r.body?.message ?? "") && kv.data.size === 0, `${r.status} · ${r.body?.message}`);
  };
  await refused("a javascript: url is refused, never stored", draft({ url: "javascript:alert(1)" }), /web address|https link/i);
  await refused("a missing url is refused", draft({ url: "" }), /web address|https link/i);
  await refused("a link attached to no holding is refused", draft({ key: "Zepto <script>" }), /not attached to a holding/);
  const v = validateLink(draft({ label: "a\u0000b   c", note: "x\ny" }));
  ok("control characters are stripped from what every reader sees", v.link?.label === "a b c" && v.link?.note === "x y");
  ok("the store's own shape check refuses a non-http link", !isLink({ key: "zepto", url: "ftp://x", label: "", note: "", updatedAt: "" }) && isLink({ key: "zepto", url: "https://x.example/", label: "", note: "", updatedAt: "" }));
}

console.log("── only this site's own page may write ──");
{
  const kv = memoryKv();
  const foreign = await call(kv, { body: { op: "save", link: draft() }, headers: { origin: "https://evil.example" } });
  ok("a write from another origin is refused 403 and stores nothing", foreign.status === 403 && foreign.body?.code === "CROSS_ORIGIN" && kv.data.size === 0);
  const xsite = await call(kv, { body: { op: "save", link: draft() }, headers: { "sec-fetch-site": "cross-site" } });
  ok("…and so is one the browser marks cross-site", xsite.status === 403 && kv.data.size === 0);
  const form = await call(kv, { raw: "op=save", headers: { "content-type": "application/x-www-form-urlencoded" } });
  ok("a form post is refused 415", form.status === 415 && kv.data.size === 0);
  const put = await call(kv, { method: "PUT" });
  ok("any method but read and save is refused 405", put.status === 405);
}

console.log("── the store's failures say what happened ──");
{
  const kv = memoryKv(); kv.breakList(true);
  const down = await call(kv);
  ok("a store that fails to list answers 502, never an empty list", down.status === 502 && down.body?.code === "STORE_ERROR");
  kv.breakList(false); kv.breakPut(true);
  const notSaved = await call(kv, { body: { op: "save", link: draft() } });
  ok("a write that fails says the change was not saved", notSaved.status === 502 && /not saved/i.test(notSaved.body?.message ?? ""));
}

console.log("── the page reads each failure by its cause, and the helpers hold ──");
{
  const html = (b: string) => new Response(b, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  const a = await readReply(html(`<form action="/__auth/login">`));
  ok("the edge login page reads as signed out", !a.ok && a.cause === "signed-out");
  const b = await readReply(html(`<div id="root"></div>`));
  ok("the app shell (no function) reads as the store not running here", !b.ok && b.cause === "no-function");
  const good = new Response(JSON.stringify({ ok: true, links: [
    { key: "zepto", url: "https://x.example/", label: "A", note: "", updatedAt: "" },
    { key: "bad", url: "javascript:1", label: "", note: "", updatedAt: "" },
  ] }), { headers: { "content-type": "application/json" } });
  const c = await readReply(good);
  ok("an ok answer is read and a non-http link is dropped", c.ok && c.links.length === 1 && c.links[0].key === "zepto");
  const links: HoldingLink[] = c.ok ? c.links : [];
  ok("linkFor finds a holding's link", linkFor(links, "zepto")?.url === "https://x.example/" && linkFor(links, "nope") === null);
  ok("linkHost shortens a folder address", linkHost("https://www.onedrive.live.com/x?y=1") === "onedrive.live.com");
}

if (fails) { console.log(`\n${fails} holding-link store check(s) FAILED`); process.exit(1); }
console.log("\nall holding-link store checks passed");
