// THE STRATEGY / DESCRIPTION STORE, BOTH ENDS.  npm run test:family
//
// *"give the option to edit and write information in the strategy and
//  description cells just like the capital call cells."*
//
// The same reasons as `enteredCalls.test.ts`: the live store sits behind the
// edge password and is not yet bound, so every branch around it is driven
// against an in-memory KV — a save is visible at once to whoever made it, a
// row over several fund lines writes each, a delete never comes back, a draft
// the store cannot keep is refused in one sentence, a cross-site write is
// refused, an unconnected store says so. Then the page's resolution: typed
// text shows over a supplied file's, and removing it shows the file's again.
import { onRequest, cleanText, isProfile, validateSave } from "../../../functions/api/investment-profiles.js";
import type { KvLike } from "../../../functions/api/capital-calls.js";
import { readReply, withEntered, REASONS, type EnteredProfile } from "../enteredProfiles";
import { combineProfiles, type InvestmentProfile } from "../investmentProfiles";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const SITE = "https://glow.example";

/** An in-memory KV whose `list` pages two keys at a time and can be frozen stale. */
function memoryKv() {
  const data = new Map<string, { value: string; metadata?: unknown }>();
  let frozen: [string, { value: string; metadata?: unknown }][] | null = null;
  const kv: KvLike & { data: typeof data; freeze(): void; thaw(): void } = {
    data,
    freeze() { frozen = [...data.entries()]; },
    thaw() { frozen = null; },
    async list({ prefix, cursor }) {
      const all = (frozen ?? [...data.entries()]).filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b));
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + 2);
      const next = start + 2;
      return { keys: page.map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: next >= all.length, cursor: next >= all.length ? undefined : String(next) };
    },
    async get(key) { const v = data.get(key); return v ? JSON.parse(v.value) : null; },
    async put(key, value, opts) { data.set(key, { value, metadata: opts?.metadata }); },
    async delete(key) { data.delete(key); },
  };
  return kv;
}

type Body = { ok: boolean; profiles?: EnteredProfile[]; code?: string; message?: string };
async function req(kv: KvLike | undefined, init: { body?: unknown; headers?: Record<string, string> } = {}) {
  const post = init.body !== undefined;
  const request = new Request(`${SITE}/api/investment-profiles`, {
    method: post ? "POST" : "GET",
    headers: post ? { "content-type": "application/json", origin: SITE, ...(init.headers ?? {}) } : {},
    body: post ? JSON.stringify(init.body) : undefined,
  });
  const res = await onRequest({ request, env: kv ? { GLOW_STORE: kv } : {} });
  const text = await res.text();
  let body: Body | null = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body, res: new Response(text, { status: res.status, headers: res.headers }) };
}

console.log("── the store ──");
{
  const none = await req(undefined);
  ok("an unconnected store answers 503 NOT_CONFIGURED", none.status === 503 && none.body?.code === "NOT_CONFIGURED");
  const read = await readReply(none.res);
  ok("…which the page words as not switched on", !read.ok && read.cause === "not-configured" && read.reason === REASONS.notConfigured);

  const kv = memoryKv();
  ok("an empty store lists nothing", (await req(kv)).body?.profiles?.length === 0);
  const funds = ["waterwala-labs-private-limited-drink-prime", "vineet-sethia-drink-prime", "ajay-jain-drink-prime"];
  kv.freeze();
  const saved = await req(kv, { body: { op: "save", funds, field: "description", fundName: "Waterwala Labs Private Limited", text: "  Subscription  water\r\n\r\n\r\npurifiers  " } });
  ok("a row over three fund lines writes one record each", saved.body?.ok === true && kv.data.size === 3);
  ok("…visible at once to whoever saved it, though the list is stale", saved.body?.profiles?.length === 3);
  ok("…kept as typed: line breaks stay, spaces close up", saved.body?.profiles?.[0]?.text === "Subscription water\n\npurifiers");
  kv.thaw();
  await req(kv, { body: { op: "save", funds: [funds[0]], field: "strategy", fundName: "x", text: "Direct equity" } });
  ok("a second field is its own key beside the first", (await req(kv)).body?.profiles?.length === 4);
  const long = "x".repeat(1500);
  await req(kv, { body: { op: "save", funds: ["neo-infra"], field: "strategy", fundName: "Neo", text: long } });
  ok("a text too long for KV metadata is kept in the value and still listed",
    (await req(kv)).body?.profiles?.some((p) => p.fund === "neo-infra" && p.text === long) === true);
  kv.freeze();
  const del = await req(kv, { body: { op: "delete", funds: funds.slice(1), field: "description" } });
  ok("a delete never comes back, even from a stale list", del.body?.profiles?.filter((p) => p.field === "description").map((p) => p.fund).join() === funds[0]);
  kv.thaw();

  const bad = async (body: unknown) => (await req(kv, { body })).body?.message ?? "";
  ok("an empty text is refused, saying what to do instead", /remove the entered text/.test(await bad({ op: "save", funds, field: "description", text: "   " })));
  ok("an unknown field is refused", /strategy or the description/.test(await bad({ op: "save", funds, field: "sector", text: "x" })));
  ok("a key that is no fund on the page is refused", /not attached/.test(await bad({ op: "save", funds: ["Not A Key"], field: "strategy", text: "x" })));
  ok("over 2,000 characters is refused with its length", /2000 characters; this is 2001/.test(await bad({ op: "save", funds, field: "strategy", text: "y".repeat(2001) })));
  const cross = await req(kv, { body: { op: "save", funds, field: "strategy", text: "x" }, headers: { origin: "https://evil.example" } });
  ok("a write from another site is refused", cross.status === 403 && cross.body?.code === "CROSS_ORIGIN");
  ok("cleanText strips control characters but keeps a line break", cleanText("a\u0007b\nc") === "a b\nc");
  ok("isProfile refuses an empty text", !isProfile({ fund: "a", field: "strategy", text: "", fundName: "", updatedAt: "" }));
  ok("validateSave stamps each record", (validateSave({ funds: ["a"], field: "strategy", text: "t" }).records?.[0]?.updatedAt ?? "").length > 10);
}

console.log("\n── what a cell shows ──");
{
  const fromFile: InvestmentProfile = {
    strategy: { value: null, source: null, matchedOn: null, reason: "none supplied" },
    description: { value: "From the file", source: "f.csv › B2", matchedOn: "name", reason: null },
  };
  const typed: EnteredProfile[] = [{ fund: "k1", field: "description", fundName: "", text: "Typed", updatedAt: "2026-10-21T10:00:00Z" }];
  const one = withEntered(fromFile, typed, "k1");
  ok("typed text shows over the file's", one.description.value === "Typed" && one.description.matchedOn === "entered");
  ok("…and the field nobody typed keeps its own cell", one.strategy.value === null && one.strategy.reason === "none supplied");
  ok("removing it shows the file's again", withEntered(fromFile, [], "k1").description.value === "From the file");
  ok("another investment's typed text is not this one's", withEntered(fromFile, typed, "k2").description.value === "From the file");
  const row = combineProfiles([withEntered(fromFile, typed, "k1"), withEntered(fromFile, typed, "k2")]);
  ok("a row whose lines now differ shows neither, and says to open it", row.description.value === null && /open the row/.test(row.description.reason ?? ""));
  const both = combineProfiles([withEntered(fromFile, typed, "k1"), withEntered(fromFile, [{ ...typed[0], fund: "k2" }], "k2")]);
  ok("a row whose every line carries the same typed text shows it", both.description.value === "Typed");
}

if (fails) { console.log(`\n${fails} failing`); process.exit(1); }
console.log("\nall entered-profile checks pass");
