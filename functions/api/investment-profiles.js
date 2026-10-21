// Cloudflare Pages Function — the STRATEGY and DESCRIPTION the family types on
// the Private Market table, one record for everyone.
//
// *"give the option to edit and write information in the strategy and
//  description cells just like the capital call cells."*
//
//   GET  /api/investment-profiles  → { ok: true, profiles: EnteredProfile[] }
//   POST /api/investment-profiles  { op: "save", funds: [key…], field, fundName, text }
//                                  { op: "delete", funds: [key…], field }
//                                  → { ok: true, profiles: EnteredProfile[] }
//
// The same store, the same gate and the same rules as `/api/capital-calls`
// (read that file's header): Cloudflare KV under the `GLOW_STORE` binding, behind
// the edge password; a write only from this site's own page; one KEY PER
// investment and field (`investment-profile:<field>:<fund>`) so two people
// saving different cells never lose each other's text; a save visible at once
// to whoever made it, to everyone else within about a minute.
//
// ONE SAVE MAY NAME SEVERAL INVESTMENTS: a legal-name or brand row on the page
// spans every fund line of that company, and what the company does is the same
// for each, so the row's editor writes the text to each of its funds. Each is
// still its own key.
//
// TEXT, NEVER A FIGURE. Nothing here reaches `glowData.ts` or any total.

const PREFIX = "investment-profile:";
const FIELDS = new Set(["strategy", "description"]);
/** A fund row's key — its `securityKey`, or `fund-<slug>` for a fund no statement values. */
const FUND = /^[a-z0-9][a-z0-9-]{0,159}$/;
const MAX_TEXT = 2000;
const MAX_NAME = 160;
const MAX_FUNDS = 40;
const MAX_RECORDS = 4000;
const MAX_BODY = 16384;
/** KV metadata is capped at 1,024 bytes; a longer record is kept in the value and read from there. */
const MAX_META = 1000;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
const fail = (status, code, message) => json(status, { ok: false, code, message });

/**
 * What a person typed, kept as they wrote it: line breaks stay, every other
 * control character goes (the text is shown to every reader), runs of spaces
 * close up, and the ends are trimmed.
 */
export function cleanText(s, max = MAX_TEXT) {
  return String(s ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}
const cleanName = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);

/** The shape every stored record must have to be served — anything else is skipped. */
export function isProfile(p) {
  return !!p && typeof p === "object"
    && typeof p.fund === "string" && FUND.test(p.fund)
    && FIELDS.has(p.field)
    && typeof p.text === "string" && p.text.length > 0 && p.text.length <= MAX_TEXT
    && typeof p.fundName === "string" && typeof p.updatedAt === "string";
}

const order = (a, b) => a.fund.localeCompare(b.fund) || a.field.localeCompare(b.field);
const keyOf = (field, fund) => `${PREFIX}${field}:${fund}`;

async function listProfiles(kv) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: PREFIX, cursor });
    for (const k of page.keys ?? []) {
      let p = k.metadata;
      if (!p) { try { p = await kv.get(k.name, "json"); } catch { p = null; } }
      if (isProfile(p)) out.push(p);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort(order);
}

/** The investments a request names, or the sentence that says what is wrong. */
function fundsOf(body) {
  const funds = Array.isArray(body?.funds) ? [...new Set(body.funds.map(String))] : [];
  if (!funds.length || !funds.every((f) => FUND.test(f))) return { error: "This text is not attached to an investment on the page." };
  if (funds.length > MAX_FUNDS) return { error: `One save can name at most ${MAX_FUNDS} investments.` };
  if (!FIELDS.has(body?.field)) return { error: "Say whether this is the strategy or the description." };
  return { funds, field: body.field };
}

/** Validate a save. Returns the records to store, or the one sentence the editor prints. */
export function validateSave(body, now = new Date()) {
  const f = fundsOf(body);
  if (f.error) return { error: f.error };
  const raw = String(body?.text ?? "");
  const text = cleanText(raw);
  if (!text) return { error: "Write something to save — or remove the entered text instead." };
  if (raw.trim().length > MAX_TEXT) return { error: `Keep it to ${MAX_TEXT} characters; this is ${raw.trim().length}.` };
  const updatedAt = now.toISOString();
  return { records: f.funds.map((fund) => ({ fund, field: f.field, fundName: cleanName(body.fundName), text, updatedAt })) };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const kv = env?.GLOW_STORE;
  if (!kv || typeof kv.list !== "function") {
    return fail(503, "NOT_CONFIGURED",
      "Saving strategies and descriptions is not switched on yet: the site's shared store (a Cloudflare KV binding named GLOW_STORE) has not been connected.");
  }

  if (request.method === "GET") {
    try {
      return json(200, { ok: true, profiles: await listProfiles(kv) });
    } catch {
      return fail(502, "STORE_ERROR", "The shared store did not answer. Nothing was lost; try again in a moment.");
    }
  }
  if (request.method !== "POST") return fail(405, "METHOD", "Only reading and saving are supported here.");

  // A WRITE MUST COME FROM THIS SITE'S OWN PAGE — the reasoning is in
  // `capital-calls.js`: the session cookie is SameSite=None.
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403, "CROSS_ORIGIN", "Strategies and descriptions can only be saved from the dashboard itself.");
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail(415, "NOT_JSON", "Strategies and descriptions are saved as JSON.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail(413, "TOO_LARGE", "That is more than one cell's text.");
  let body;
  try { body = JSON.parse(raw); } catch { return fail(400, "INVALID", "The request could not be read."); }

  try {
    if (body?.op === "delete") {
      const f = fundsOf(body);
      if (f.error) return fail(400, "INVALID", f.error);
      for (const fund of f.funds) await kv.delete(keyOf(f.field, fund));
      // The list is eventually consistent, so the answer applies the delete itself.
      const gone = new Set(f.funds.map((fund) => keyOf(f.field, fund)));
      const profiles = (await listProfiles(kv)).filter((p) => !gone.has(keyOf(p.field, p.fund)));
      return json(200, { ok: true, profiles });
    }
    if (body?.op === "save") {
      const v = validateSave(body);
      if (v.error) return fail(400, "INVALID", v.error);
      const current = await listProfiles(kv);
      const have = new Set(current.map((p) => keyOf(p.field, p.fund)));
      const added = v.records.filter((r) => !have.has(keyOf(r.field, r.fund))).length;
      if (current.length + added > MAX_RECORDS) {
        return fail(409, "FULL", `The store holds ${MAX_RECORDS} entries, which is its limit.`);
      }
      for (const r of v.records) {
        const value = JSON.stringify(r);
        const fits = new TextEncoder().encode(value).length <= MAX_META;
        await kv.put(keyOf(r.field, r.fund), value, fits ? { metadata: r } : undefined);
      }
      const written = new Set(v.records.map((r) => keyOf(r.field, r.fund)));
      const profiles = [...current.filter((p) => !written.has(keyOf(p.field, p.fund))), ...v.records].sort(order);
      return json(200, { ok: true, profiles });
    }
  } catch {
    return fail(502, "STORE_ERROR", "The shared store did not answer. Your change was not saved; try again in a moment.");
  }
  return fail(400, "INVALID", "Unknown request.");
}
