// THE STATEMENT DROP BOX — the upload Function and its client, checked end to end.
//   npm run test:family
//
// The Function (`functions/api/statement-uploads.js`) stages a raw statement in
// R2 behind the password gate; the client (`src/lib/statementUploads.ts`) reads
// its answers and names the cause of any failure. Two ways this could quietly go
// wrong, both invisible until a statement is lost:
//
//   • the Function accepts something that is not a statement, mislabels where it
//     is filed, or lets a cross-site page write to it;
//   • the client reads a "not switched on" or a "signed out" answer as an empty
//     inbox, which reads as "nothing was uploaded".
//
// So this drives the Function against an in-memory R2 and asserts the full
// round trip, the guards, and that the client maps each answer to its cause.

import {
  onRequest, validateUpload, slugProvider, safeFileName, extOf, isStagedKey,
} from "../../../functions/api/statement-uploads.js";
import { readReply, REASONS } from "@/lib/statementUploads";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

// ── A FAKE R2 BUCKET — the slice of the binding the Function uses ────────────
function fakeBucket() {
  const store = new Map<string, { body: Uint8Array; customMetadata?: Record<string, string>; httpMetadata?: { contentType?: string }; uploaded: string }>();
  return {
    _store: store,
    async list({ prefix }: { prefix: string }) {
      const objects = [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({
        key, size: v.body.byteLength, uploaded: v.uploaded, customMetadata: v.customMetadata, httpMetadata: v.httpMetadata,
      }));
      return { objects, truncated: false };
    },
    async get(key: string) {
      const v = store.get(key);
      return v ? { body: v.body, customMetadata: v.customMetadata, httpMetadata: v.httpMetadata } : null;
    },
    async put(key: string, value: ArrayBuffer, opts?: { customMetadata?: Record<string, string>; httpMetadata?: { contentType?: string } }) {
      store.set(key, { body: new Uint8Array(value), customMetadata: opts?.customMetadata, httpMetadata: opts?.httpMetadata, uploaded: new Date().toISOString() });
    },
    async delete(key: string) { store.delete(key); },
  };
}

const SITE = "https://glow.example.com";
const call = (bucket: unknown, init: RequestInit & { path?: string }) =>
  onRequest({ request: new Request(`${SITE}/api/statement-uploads${init.path ?? ""}`, init), env: { STATEMENT_UPLOADS: bucket } } as never);

const postFile = (provider: string, name: string, bytes: string, headers: Record<string, string> = {}) => {
  const form = new FormData();
  form.append("provider", provider);
  form.append("file", new File([new TextEncoder().encode(bytes)], name, { type: "application/octet-stream" }));
  return { method: "POST", body: form, headers: { origin: SITE, ...headers } } as RequestInit;
};

async function run() {
  // ── 1. PURE VALIDATORS ────────────────────────────────────────────────────
  ok("extOf reads the extension", extOf("Helios - Ajay.PDF") === "pdf" && extOf("noext") === "");
  ok("slugProvider makes a path-safe slug", slugProvider("V.E.C Assago Capital Management LLP") === "v-e-c-assago-capital-management-llp");
  ok("safeFileName strips the path and unsafe characters",
    safeFileName("../../etc/Report #1.pdf") === "Report _1.pdf", safeFileName("../../etc/Report #1.pdf"));
  ok("isStagedKey accepts only keys under the prefix, no traversal",
    isStagedKey("uploads/helios/a.pdf") && !isStagedKey("other/a.pdf") && !isStagedKey("uploads/../secret"));

  const good = validateUpload({ provider: "Helios Mutual Fund", fileName: "Helios - Ajay.pdf", size: 1234 },
    new Date("2026-10-15T00:00:00Z"), () => "abcd1234ef");
  ok("validateUpload accepts a statement and files it under its provider",
    !good.error && good.key!.startsWith("uploads/helios-mutual-fund/") && good.key!.endsWith("_Helios - Ajay.pdf"), good.key ?? good.error);
  ok("...and records the provider and content type",
    good.record?.provider === "Helios Mutual Fund" && good.record?.contentType === "application/pdf");
  ok("validateUpload refuses a non-statement extension", !!validateUpload({ provider: "X", fileName: "notes.txt", size: 10 }).error);
  ok("validateUpload refuses an empty file", !!validateUpload({ provider: "X", fileName: "a.pdf", size: 0 }).error);
  ok("validateUpload refuses an oversized file", !!validateUpload({ provider: "X", fileName: "a.zip", size: 999 * 1024 * 1024 }).error);
  ok("validateUpload refuses a missing provider", !!validateUpload({ provider: "   ", fileName: "a.pdf", size: 10 }).error);

  // ── 2. NOT CONFIGURED — no binding ─────────────────────────────────────────
  const unconf = await onRequest({ request: new Request(`${SITE}/api/statement-uploads`), env: {} } as never);
  const unconfBody = await unconf.json();
  ok("with no R2 binding the store answers 503 NOT_CONFIGURED", unconf.status === 503 && unconfBody.code === "NOT_CONFIGURED");

  // ── 3. ROUND TRIP against the fake bucket ──────────────────────────────────
  const bucket = fakeBucket();
  const empty = await (await call(bucket, { method: "GET" })).json();
  ok("an empty store lists no uploads", empty.ok === true && Array.isArray(empty.uploads) && empty.uploads.length === 0);

  const up = await call(bucket, postFile("Helios Mutual Fund", "Helios - Ajay.pdf", "STATEMENT-BYTES"));
  const upBody = await up.json();
  ok("a POST stages the file under its provider",
    up.status === 200 && upBody.ok === true && upBody.upload.provider === "Helios Mutual Fund" && upBody.upload.fileName === "Helios - Ajay.pdf",
    JSON.stringify(upBody).slice(0, 160));
  ok("...and one object now sits in the store under the uploads prefix",
    bucket._store.size === 1 && [...bucket._store.keys()][0].startsWith("uploads/helios-mutual-fund/"));

  const list = await (await call(bucket, { method: "GET" })).json();
  ok("the list now carries that upload", list.uploads.length === 1 && list.uploads[0].fileName === "Helios - Ajay.pdf");

  const key = list.uploads[0].key;
  const dl = await call(bucket, { method: "GET", path: `?key=${encodeURIComponent(key)}` });
  ok("the staged file downloads by key", dl.status === 200 && (await dl.text()) === "STATEMENT-BYTES");

  // ── 4. GUARDS ──────────────────────────────────────────────────────────────
  const badExt = await call(bucket, postFile("Helios Mutual Fund", "notes.txt", "x"));
  ok("a non-statement upload is refused", badExt.status === 400 && (await badExt.json()).code === "INVALID");

  const crossOrigin = await call(bucket, postFile("Helios Mutual Fund", "a.pdf", "x", { origin: "https://evil.example.com" }));
  ok("a cross-origin upload is refused", crossOrigin.status === 403 && (await crossOrigin.json()).code === "CROSS_ORIGIN");

  ok("the guards and the bad extension stored nothing new", bucket._store.size === 1);

  // ── 5. DELETE ──────────────────────────────────────────────────────────────
  const del = await call(bucket, { method: "DELETE", path: `?key=${encodeURIComponent(key)}`, headers: { origin: SITE } });
  const delBody = await del.json();
  ok("a DELETE removes the staged file", del.status === 200 && delBody.ok === true && delBody.uploads.length === 0 && bucket._store.size === 0);

  // ── 6. THE CLIENT MAPS EACH ANSWER TO ITS CAUSE ────────────────────────────
  const jsonHdr = { "content-type": "application/json" };
  const okReply = await readReply(new Response(JSON.stringify({ ok: true, uploads: [{ key: "uploads/x/a.pdf", provider: "X", fileName: "a.pdf", size: 10, uploadedAt: "2026-10-15T00:00:00Z", contentType: "application/pdf" }] }), { headers: jsonHdr }));
  ok("the client reads a good list", okReply.ok === true && okReply.uploads.length === 1);

  const notConf = await readReply(new Response(JSON.stringify({ ok: false, code: "NOT_CONFIGURED" }), { status: 503, headers: jsonHdr }));
  ok("the client names NOT_CONFIGURED as not-configured", !notConf.ok && notConf.cause === "not-configured" && notConf.reason === REASONS.notConfigured);

  const signedOut = await readReply(new Response('<!doctype html><a href="/__auth/login">', { headers: { "content-type": "text/html" } }));
  ok("the login page reads as signed-out, never an empty inbox", !signedOut.ok && signedOut.cause === "signed-out");

  const noFn = await readReply(new Response("<!doctype html><div id=root></div>", { headers: { "content-type": "text/html" } }));
  ok("the app shell (a local preview) reads as no-function", !noFn.ok && noFn.cause === "no-function");

  console.log(fails ? `\n${fails} FAILED` : `\nall passed`);
  process.exit(fails ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
