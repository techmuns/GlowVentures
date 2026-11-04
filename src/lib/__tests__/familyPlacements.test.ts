// A ROW MOVED TO ANOTHER TAB, BOTH ENDS.  npm run test:family  (ONLY="moved holdings")
//
// *"Allow the ability for any security or row to move any sub tab by doing
//  right click — for example if i want to move DSP gold from alternate to any
//  other i should be able to do so"* — the family, 4 Nov 2026 (Stage 10la).
//
// The store (`/api/placements`) against an in-memory KV, and the one section
// rule every surface reads (`groupKeyFor`): a move must land, be undoable, keep
// its review citation, move a whole mandate at once, and never invent a tab.
import { onRequest, validatePlacementChange } from "../../../functions/api/placements.js";
import type { KvLike } from "../../../functions/api/capital-calls.js";
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_UNVALUED_HOLDINGS } from "../../data/glowData";
import { accountIndex } from "../accounts";
import { familyAssetClass, productKeyOf, UNCLASSIFIED } from "../familyTaxonomy";
import {
  groupKeyFor, groupSourceFor, statedGroupKeyFor, moveTargetsFor, productKeysFor, heldUnderMandate,
  CATEGORY_MOVE_TARGETS,
} from "../groupAxis";
import { MANDATE_BUCKET, AT_COST_BUCKET } from "../analytics";
import { movePlacement, placementOf, readPlacementReply, PLACEMENT_REASONS } from "../familyPlacements";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const SITE = "https://glow.example";
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
      return { keys: page.map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: start + 2 >= all.length, cursor: String(start + 2) };
    },
    async get(key) { const v = data.get(key); return v ? JSON.parse(v.value) : null; },
    async put(key, value, opts) { data.set(key, { value, metadata: opts?.metadata }); },
    async delete(key) { data.delete(key); },
  };
  return kv;
}
type Body = { ok: boolean; placements?: { axis: string; product: string; section: string }[]; code?: string; message?: string };
async function call(kv: KvLike | undefined, init: { body?: unknown; headers?: Record<string, string> } = {}) {
  const post = init.body !== undefined;
  const request = new Request(`${SITE}/api/placements`, {
    method: post ? "POST" : "GET",
    headers: post ? { "content-type": "application/json", origin: SITE, ...(init.headers ?? {}) } : {},
    body: post ? JSON.stringify(init.body) : undefined,
  });
  const res = await onRequest({ request, env: kv ? { DASHBOARD_STORE: kv } : {} });
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) as Body, again: () => new Response(text, { status: res.status, headers: res.headers }) };
}

console.log("── the store keeps a move, answers with it, and forgets it on null ──");
{
  const kv = memoryKv();
  const g0 = await call(kv);
  ok("an empty store answers no placements", g0.status === 200 && g0.body.placements?.length === 0);
  kv.freeze();
  const s = await call(kv, { body: { axis: "assetClass", products: ["sec:dsp-gold-etf"], section: "Equity" } });
  ok("with KV's list still stale, the mover sees their move in the answer",
    s.status === 200 && s.body.placements?.some((p) => p.product === "sec:dsp-gold-etf" && p.section === "Equity") === true, JSON.stringify(s.body));
  kv.thaw();
  const reply = await readPlacementReply(s.again());
  ok("the page reads the answer", reply.ok && reply.placements.length === 1 && reply.placements[0].axis === "assetClass");
  await call(kv, { body: { axis: "basket", products: ["sec:dsp-gold-etf"], section: "Liquidity" } });
  ok("one product keeps one placement per axis", (await call(kv)).body.placements?.length === 2);
  const back = await call(kv, { body: { axis: "assetClass", products: ["sec:dsp-gold-etf"], section: null } });
  ok("section null removes the placement, in the answer and the store",
    back.body.placements?.length === 1 && back.body.placements[0].axis === "basket" && !kv.data.has("placement:assetClass:sec:dsp-gold-etf"));
  const many = await call(kv, { body: { axis: "category", products: ["mandate:a-1", "mandate:BARING_X-2"], section: "AIF" } });
  ok("a row's products move together, account ids keeping their capitals", many.body.placements?.filter((p) => p.axis === "category").length === 2);
}

console.log("── only a tab name for a known product, from this site ──");
{
  const at = new Date("2026-11-04T10:00:00Z");
  ok("a valid move is stamped", validatePlacementChange({ axis: "basket", products: ["sec:x"], section: "Liquidity" }, at).change?.updatedAt === at.toISOString());
  ok("an axis without tabs is refused", !!validatePlacementChange({ axis: "security", products: ["sec:x"], section: "Equity" }).error);
  ok("a product that is not a security or mandate key is refused", !!validatePlacementChange({ axis: "basket", products: ["../x"], section: "Liquidity" }).error);
  ok("markup where a tab belongs is refused", !!validatePlacementChange({ axis: "basket", products: ["sec:x"], section: "<b>Equity</b>" }).error);
  ok("a figure where a tab belongs is refused", !!validatePlacementChange({ axis: "basket", products: ["sec:x"], section: 12 }).error);
  ok("no products is refused", !!validatePlacementChange({ axis: "basket", products: [], section: "Liquidity" }).error);
  const kv = memoryKv();
  const foreign = await call(kv, { body: { axis: "basket", products: ["sec:x"], section: "Liquidity" }, headers: { origin: "https://evil.example" } });
  ok("a foreign Origin is refused 403 and writes nothing", foreign.status === 403 && kv.data.size === 0);
  const none = await call(undefined);
  ok("an unconnected store says NOT_CONFIGURED", none.status === 503 && none.body.code === "NOT_CONFIGURED");
  const r = await readPlacementReply(none.again());
  ok("…which the menu words as this browser only", !r.ok && r.reason === PLACEMENT_REASONS.notConfigured);
}

console.log("── DSP Gold moves from Alternate to Equity on every surface's one rule ──");
{
  const idx = accountIndex(BOOK_ACCOUNTS);
  // A depository balance, valued on the live basis at the quote — the row the
  // family pointed at. Its three classifying fields are what every surface reads.
  const gold = BOOK_UNVALUED_HOLDINGS.filter((p) => p.securityKey === "dsp-gold-etf")
    .map((p) => ({ assetClass: p.assetClass, securityKey: p.securityKey, accountId: p.accountId }));
  ok("the book holds DSP Gold ETF", gold.length > 0, String(gold.length));
  const g = gold[0];
  ok("before any move it is Alternate, by the review", groupKeyFor("assetClass", idx, g) === "Alternate" && groupSourceFor("assetClass", idx, g) === "review");
  const products = productKeysFor(idx, gold);
  ok("its row stands for one product", products.length === 1 && products[0] === "sec:dsp-gold-etf", products.join(","));

  await movePlacement("assetClass", products, "Equity");   // the store is unreachable here; the move applies at once
  ok("the move applies before the store answers", placementOf("assetClass", "sec:dsp-gold-etf")?.section === "Equity");
  ok("groupKeyFor files it under Equity", gold.every((p) => groupKeyFor("assetClass", idx, p) === "Equity"));
  ok("…and says the family moved it", groupSourceFor("assetClass", idx, g) === "moved");
  ok("where it was is still Alternate", statedGroupKeyFor("assetClass", idx, g) === "Alternate");
  ok("the review's citation is kept", familyAssetClass(g, false)?.reviewProduct === "DSP Gold ETF");
  ok("the basket is untouched", groupKeyFor("basket", idx, g) === "Thematic & Tactical");

  await movePlacement("assetClass", products, null);
  ok("moving it back removes the placement", groupKeyFor("assetClass", idx, g) === "Alternate" && groupSourceFor("assetClass", idx, g) === "review");

  // A name this build does not draw as a tab is ignored, never drawn as a heading.
  await movePlacement("assetClass", products, "Crypto");
  ok("an unknown tab is ignored", groupKeyFor("assetClass", idx, g) === "Alternate");
  await movePlacement("assetClass", products, null);
}

console.log("── a mandate moves whole, on the category axis too ──");
{
  const idx = accountIndex(BOOK_ACCOUNTS);
  const held = BOOK_POSITIONS.filter((p) => heldUnderMandate(idx, p) && p.accountId === "carnelian-asset-management-and-advisors-pvt-ltd-3517383");
  ok("the Carnelian mandate holds shares", held.length > 1, String(held.length));
  const products = productKeysFor(idx, held);
  ok("its row stands for its one account", products.length === 1 && products[0] === productKeyOf(held[0], true));
  ok("it sits under PMS mandates", held.every((p) => groupKeyFor("category", idx, p) === MANDATE_BUCKET));
  await movePlacement("category", products, "AIF");
  ok("every share of it moves with it", held.every((p) => groupKeyFor("category", idx, p) === "AIF" && groupSourceFor("category", idx, p) === "moved"));
  ok("…while it remembers where it was", statedGroupKeyFor("category", idx, held[0]) === MANDATE_BUCKET);
  await movePlacement("category", products, null);
  ok("and goes back whole", held.every((p) => groupKeyFor("category", idx, p) === MANDATE_BUCKET));
}

console.log("── the tabs a row can be moved to ──");
{
  ok("asset class offers the family's four", moveTargetsFor("assetClass", "Alternate").join("|") === "Equity|Debt|Alternate|Cash");
  ok("basket offers the four baskets", moveTargetsFor("basket", UNCLASSIFIED).length === 4);
  ok("no row is moved INTO Not classified", !moveTargetsFor("assetClass", UNCLASSIFIED).includes(UNCLASSIFIED));
  ok("a security is never moved into PMS mandates or the at-cost heading",
    !CATEGORY_MOVE_TARGETS.includes(MANDATE_BUCKET) && !CATEGORY_MOVE_TARGETS.includes(AT_COST_BUCKET));
  ok("…but a mandate's own tab is offered to it", moveTargetsFor("category", MANDATE_BUCKET).includes(MANDATE_BUCKET));
}

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall moved-holdings checks pass");
