// THE DASHBOARD'S SHARED STORE, KEPT IN THE GITHUB REPOSITORY.  npm run test:family
//
// *"We will not store in Cloudflare. Instead, we should try to store it in GitHub."*
//
// `shared/dashboardStore.mjs` is driven against a FAKE GitHub — the five REST
// calls it makes, with GitHub's own rule that a write naming a stale file sha is
// refused (409) — so every branch that decides whether a family member's save is
// kept or lost runs here:
//
//   · the first save makes the branch: ONE commit, no parent, only the store
//     file, its message carrying [skip ci] so no build runs for it;
//   · a request's several changes are ONE commit;
//   · two people saving at once both land — the second re-reads the first's and
//     lays its own over it;
//   · what one request saves, the next request (anybody's) reads at once;
//   · and through the real Functions: a strategy saved on one request is listed
//     on the next, and a site with no token answers NOT_CONFIGURED.
import { githubStore, storeFor, serialize, toBase64, fromBase64, STORE_DEFAULTS } from "../../../shared/dashboardStore.mjs";
import { onRequest as profiles } from "../../../functions/api/investment-profiles.js";
import { onRequest as calls } from "../../../functions/api/capital-calls.js";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const REPO = STORE_DEFAULTS.repo, BRANCH = STORE_DEFAULTS.branch, PATH = STORE_DEFAULTS.path;

/** A fake of the slice of GitHub's REST API the store calls. */
function fakeGitHub() {
  let n = 0;
  const id = () => `sha${++n}`;
  const blobs = new Map<string, string>();
  const trees = new Map<string, { path: string; sha: string }[]>();
  const commits: { sha: string; message: string; parents: string[]; tree: string }[] = [];
  let head: string | null = null;
  let file: { sha: string; text: string } | null = null;
  const calls: string[] = [];
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    const p = u.pathname.replace(`/repos/${REPO}`, "");
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push(`${method} ${p}`);
    if (!String((init?.headers as Record<string, string>)?.authorization ?? "").startsWith("Bearer ")) return reply(401, {});
    if (method === "GET" && p === `/contents/${PATH}`) {
      if (u.searchParams.get("ref") !== BRANCH || !head || !file) return reply(404, { message: "Not Found" });
      return reply(200, { sha: file.sha, content: toBase64(file.text) });
    }
    if (method === "GET" && p === `/git/ref/heads/${BRANCH}`) return head ? reply(200, { object: { sha: head } }) : reply(404, {});
    if (method === "POST" && p === "/git/blobs") { const s = id(); blobs.set(s, fromBase64(body.content)); return reply(201, { sha: s }); }
    if (method === "POST" && p === "/git/trees") { const s = id(); trees.set(s, body.tree); return reply(201, { sha: s }); }
    if (method === "POST" && p === "/git/commits") { const s = id(); commits.push({ sha: s, message: body.message, parents: body.parents, tree: body.tree }); return reply(201, { sha: s }); }
    if (method === "POST" && p === "/git/refs") {
      if (head) return reply(422, { message: "Reference already exists" });
      head = body.sha;
      const c = commits.find((x) => x.sha === head)!;
      const entry = trees.get(c.tree)![0];
      file = { sha: entry.sha, text: blobs.get(entry.sha)! };
      return reply(201, {});
    }
    if (method === "PUT" && p === `/contents/${PATH}`) {
      if (body.branch !== BRANCH || !head) return reply(404, {});
      if ((file?.sha ?? null) !== (body.sha ?? null)) return reply(409, { message: "sha does not match" });
      const s = id();
      file = { sha: s, text: fromBase64(body.content) };
      const c = id();
      commits.push({ sha: c, message: body.message, parents: [head], tree: "" });
      head = c;
      return reply(200, { content: { sha: s } });
    }
    return reply(404, {});
  };
  return { fetchImpl: fetchImpl as unknown as typeof fetch, commits, calls, records: () => (file ? JSON.parse(file.text).records : null) };
}
const opts = { token: "t", repo: REPO, branch: BRANCH, path: PATH };

console.log("── the store on its own ──");
{
  const gh = fakeGitHub();
  const a = githubStore(opts, gh.fetchImpl);
  ok("an empty repository lists nothing", (await a.list({ prefix: "x:" })).keys.length === 0);
  await a.put("x:1", JSON.stringify({ v: 1 }), { metadata: { v: 1 } });
  await a.put("x:2", JSON.stringify({ v: 2 }));
  await a.flush();
  ok("the first save makes the branch with ONE commit, and no parent", gh.commits.length === 1 && gh.commits[0].parents.length === 0);
  ok("…its message carries [skip ci], so no build runs for it", /\[skip ci\]/.test(gh.commits[0].message), gh.commits[0].message);
  ok("…and the file holds both keys", Object.keys(gh.records() ?? {}).join() === "x:1,x:2");

  const b = githubStore(opts, gh.fetchImpl);
  const listed = await b.list({ prefix: "x:" });
  ok("the next request reads them at once, metadata riding on list", listed.keys.length === 2 && (listed.keys[0].metadata as { v: number })?.v === 1);
  ok("…and get returns the value", ((await b.get("x:2", "json")) as { v: number })?.v === 2);

  // Two people at once: both read the same file, both save a different key.
  const p1 = githubStore(opts, gh.fetchImpl), p2 = githubStore(opts, gh.fetchImpl);
  await p1.list({ prefix: "x:" }); await p2.list({ prefix: "x:" });
  await p1.put("x:3", "{}"); await p2.put("x:4", "{}"); await p2.delete("x:1");
  await p1.flush();
  await p2.flush();
  const after = Object.keys(gh.records() ?? {}).sort().join();
  ok("two saves at once both land — the second re-read the first's", after === "x:2,x:3,x:4", after);
  ok("…each its own commit on top of the last", gh.commits.length === 3 && gh.commits[2].parents[0] === gh.commits[1].sha);
  const quiet = githubStore(opts, gh.fetchImpl);
  await quiet.list({ prefix: "x:" }); await quiet.flush();
  ok("a request that changed nothing commits nothing", gh.commits.length === 3);
  ok("the file is sorted, so a commit's diff is only the change", serialize({ b: { value: "1", metadata: null }, a: { value: "2", metadata: null } }).indexOf('"a"') < serialize({ b: { value: "1", metadata: null }, a: { value: "2", metadata: null } }).indexOf('"b"'));
  ok("non-ASCII text round-trips", fromBase64(toBase64("₹2 Cr — Bengaluru")) === "₹2 Cr — Bengaluru");
}

console.log("\n── through the Functions ──");
{
  const gh = fakeGitHub(), seed = githubStore(opts, gh.fetchImpl);
  await seed.put("number:a", JSON.stringify({ value: 1 })); await seed.flush();
  const a = githubStore(opts, gh.fetchImpl), b = githubStore(opts, gh.fetchImpl);
  const before = await a.get("number:a", "json"); await b.get("number:a", "json");
  a.expect?.("number:a", JSON.stringify(before));
  await a.put("number:a", JSON.stringify({ value: 2 })); await a.put("number:b", "{}");
  await b.put("number:a", JSON.stringify({ value: 3 })); await b.flush();
  let refused = false; try { await a.flush(); } catch (error) { refused = (error as { status?: number }).status === 409; }
  ok("a concurrent Excel edit of the same number is refused atomically", refused && !gh.records()?.["number:b"] && JSON.parse(gh.records()!["number:a"].value).value === 3);
  const c = githubStore(opts, gh.fetchImpl), d = githubStore(opts, gh.fetchImpl);
  c.expect?.("number:a", JSON.stringify(await c.get("number:a", "json"))); await d.list({ prefix: "number:" });
  await c.put("number:a", JSON.stringify({ value: 4 })); await d.put("number:c", "{}"); await d.flush(); await c.flush();
  ok("concurrent edits of different numbers still merge", !!gh.records()?.["number:c"] && JSON.parse(gh.records()!["number:a"].value).value === 4);
}
{
  const gh = fakeGitHub();
  const realFetch = globalThis.fetch;
  globalThis.fetch = gh.fetchImpl;
  try {
    const env = { GLOW_GITHUB_TOKEN: "t" };
    const save = new Request("https://glow.example/api/investment-profiles", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://glow.example" },
      body: JSON.stringify({ op: "save", funds: ["zepto", "integris-medtech"], field: "description", fundName: "Row", text: "Typed once" }),
    });
    const r1 = await profiles({ request: save, env });
    ok("a save through the Function answers 200", r1.status === 200, String(r1.status));
    ok("…as ONE commit for its two investments", gh.commits.length === 1);
    const r2 = await profiles({ request: new Request("https://glow.example/api/investment-profiles"), env });
    const j2 = await r2.json() as { profiles: { fund: string; text: string }[] };
    ok("the next request — anybody's — lists both", j2.profiles.map((p) => p.fund).sort().join() === "integris-medtech,zepto" && j2.profiles.every((p) => p.text === "Typed once"));
    const r3 = await calls({ request: new Request("https://glow.example/api/capital-calls"), env });
    ok("the capital calls read the same store file, and find none of theirs", r3.status === 200 && ((await r3.json()) as { calls: unknown[] }).calls.length === 0);
    const none = await profiles({ request: new Request("https://glow.example/api/investment-profiles"), env: {} });
    ok("a site with no token answers 503 NOT_CONFIGURED", none.status === 503 && ((await none.json()) as { code: string }).code === "NOT_CONFIGURED");
    ok("storeFor needs a token, and a blank one is none", storeFor({ GLOW_GITHUB_TOKEN: "  " }) === null);
  } finally { globalThis.fetch = realFetch; }
}

if (fails) { console.log(`\n${fails} failing`); process.exit(1); }
console.log("\nall dashboard-store checks pass");
