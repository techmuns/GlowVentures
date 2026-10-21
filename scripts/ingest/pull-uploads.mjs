#!/usr/bin/env node
// PULL STAGED STATEMENTS off the dashboard's drop box into `source/`, ready for
// the ingest pipeline.  node scripts/ingest/pull-uploads.mjs [--clear] [--check]
//
// The Statement Library's drop box uploads a file to the site's own R2 store
// (`functions/api/statement-uploads.js`), behind the edge password gate. This
// script is the bridge from that inbox to a rebuild: it signs in, lists what is
// staged, and writes each file under
//   source/uploads-<YYYY-MM-DD>/<provider-slug>/<file>
// one folder per delivery, exactly as `source/README.md` requires. Then run the
// ordinary pipeline — `npm run inventory && npm run extract && npm run build-book`
// — and commit. Nothing a reader uploaded is a book figure until that runs; this
// is the step that reads it.
//
//   GLOW_BASE_URL          the deployed site, e.g. https://glow.example.com
//   GLOW_DASHBOARD_PASSWORD the dashboard password (the edge gate)
//
//   --check   list what is staged and exit, writing nothing (a no-op control)
//   --clear   after a file is written to disk, remove it from the inbox
//
// It never deletes a file it did not first write to disk, and never without
// --clear. The store stays the source of truth until the files are safely down.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.GLOW_BASE_URL ?? "").replace(/\/+$/, "");
const PASSWORD = process.env.GLOW_DASHBOARD_PASSWORD ?? "";
const CHECK = process.argv.includes("--check");
const CLEAR = process.argv.includes("--clear");

if (!BASE || !PASSWORD) {
  console.error("Set GLOW_BASE_URL (the deployed site) and GLOW_DASHBOARD_PASSWORD (the dashboard password).");
  process.exit(2);
}

const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unidentified";
const safe = (s) => String(s ?? "").split(/[\\/]/).pop().replace(/[^A-Za-z0-9._ ()+-]/g, "_").replace(/\s+/g, " ").trim().slice(0, 200) || "statement";

/** Sign in at the edge gate and return the session cookie value. */
async function signIn() {
  const body = new URLSearchParams({ password: PASSWORD });
  const r = await fetch(`${BASE}/__auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
  });
  const setCookie = r.headers.get("set-cookie") ?? "";
  const m = /glow_auth=([^;]+)/.exec(setCookie);
  if (!m || r.status >= 400) {
    throw new Error(`Sign-in failed (HTTP ${r.status}). Check GLOW_DASHBOARD_PASSWORD.`);
  }
  return `glow_auth=${m[1]}`;
}

async function api(cookie, path, init = {}) {
  const r = await fetch(`${BASE}/api/statement-uploads${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), cookie, origin: BASE },
  });
  return r;
}

async function main() {
  const cookie = await signIn();

  const listRes = await api(cookie, "");
  if (!(listRes.headers.get("content-type") ?? "").includes("application/json")) {
    throw new Error("The upload store did not answer with JSON — are you signed in and is STATEMENT_UPLOADS bound?");
  }
  const { ok, uploads, code, message } = await listRes.json();
  if (!ok) throw new Error(`The upload store said: ${code ?? "error"} — ${message ?? "unknown"}`);

  if (!uploads.length) { console.log("Nothing is staged."); return; }

  console.log(`${uploads.length} file(s) staged:`);
  for (const u of uploads) console.log(`  · ${u.provider}  ${u.fileName}  (${Math.max(1, Math.round(u.size / 1024))} KB, ${u.uploadedAt})`);
  if (CHECK) { console.log("\n--check: nothing written."); return; }

  const day = new Date().toISOString().slice(0, 10);
  const root = join("source", `uploads-${day}`);
  let written = 0, cleared = 0;

  for (const u of uploads) {
    const dir = join(root, slug(u.provider));
    mkdirSync(dir, { recursive: true });
    let dest = join(dir, safe(u.fileName));
    // Never overwrite a file already pulled in this run or a previous one.
    let n = 1;
    while (existsSync(dest)) {
      const base = safe(u.fileName).replace(/(\.[^.]+)?$/, (ext) => `-${n}${ext || ""}`);
      dest = join(dir, base); n++;
    }
    const fileRes = await api(cookie, `?key=${encodeURIComponent(u.key)}`);
    if (!fileRes.ok) { console.error(`  ! could not download ${u.fileName} (HTTP ${fileRes.status})`); continue; }
    writeFileSync(dest, Buffer.from(await fileRes.arrayBuffer()));
    written++;
    console.log(`  → ${dest}`);

    if (CLEAR) {
      const del = await api(cookie, `?key=${encodeURIComponent(u.key)}`, { method: "DELETE" });
      if (del.ok) cleared++;
      else console.error(`  ! downloaded but could not clear ${u.fileName} from the inbox (HTTP ${del.status})`);
    }
  }

  console.log(`\n${written} file(s) written under ${root}${CLEAR ? `, ${cleared} cleared from the inbox` : ""}.`);
  console.log("Now run: npm run inventory && npm run extract && npm run build-book");
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
