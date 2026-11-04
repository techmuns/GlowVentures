#!/usr/bin/env node
// ── THE PRIVATE COMPANIES' FUNDING ROUNDS → src/data/privateRounds.json ─────
//   (Stage 10ko)
//
//   npm run build-private-rounds                 refresh the stalest companies
//                                                (needs ANTHROPIC_API_KEY)
//   npm run build-private-rounds -- --only zepto,stay-vista
//   npm run build-private-rounds -- --import a.json b.json
//                                                take a researched batch as is
//   npm run build-private-rounds -- --check      validate; write nothing
//
// *"Fetch information like valuation, funding rounds, etc. for all the private
// investments thru credible sources and these should be automatically
// updated."* — the family, 4 Nov 2026.
//
// No statement the family receives carries a company's rounds, and no free feed
// publishes Indian private-company rounds in a form a script can read: they are
// in RoC filings as Entrackr, Inc42 and the business press report them, and in
// offer documents. So the refresh is a researcher: for each company, Claude
// (the Messages API with its own web search and web fetch) is given the
// company's current record and asked for any round it lacks, under the same
// brief a person would get — record only what a source states, never derive,
// never use a grey-market quote. What comes back is CHECKED, not trusted:
//
//   · every source URL must be one the search or fetch actually returned in
//     that run — a citation the model wrote from memory is dropped;
//   · a source on a blocked host (an unlisted-share dealer, a forum) is dropped;
//   · a round left with no source, or a figure that is not a positive number,
//     is dropped;
//   · nothing already sourced is deleted by a refresh: a round it does not
//     return again is kept. Removing one is a reviewed edit to the file.
//
// The monthly workflow `private-rounds.yml` runs this and commits the file when
// it changed. Without ANTHROPIC_API_KEY the refresh says so and leaves the file
// as it is, so the pages keep the last researched record and its date.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRIVATE_COMPANIES, NOT_A_PRIVATE_COMPANY, BLOCKED_SOURCE_HOSTS, FAMILY_NAME } from "./lib/privateCompanies.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE = path.join(ROOT, "src/data/privateRounds.json");
const REPORT = path.join(ROOT, "docs/PRIVATE-ROUNDS.md");
const MODEL = "claude-opus-5-5";
const today = () => new Date().toISOString().slice(0, 10);

const METHOD = "Funding rounds are public reporting, not the family's statements: each round is recorded from a regulatory filing, an offer document, the company's own release or the business press that read the filing, with the source linked, and only the figures that source states. Refreshed monthly by `npm run build-private-rounds`; a citation the research did not actually open is dropped.";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

// ── VALIDATION ─────────────────────────────────────────────────────────────
const DATE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; } };
const blocked = (url) => { const h = hostOf(url); return !h || BLOCKED_SOURCE_HOSTS.some((b) => h === b || h.endsWith(`.${b}`)); };
/**
 * THE RING-FENCE HOLDS HERE TOO. The family's promoter holding is named on one
 * route only (`/polycab`, CLAUDE.md "The ring-fence"), and a report of a round
 * can name it in passing. Any text that does is dropped, never printed.
 */
const FENCED = /polycab/i;
const text = (s, max = 400) => (typeof s === "string" && s.trim() && !FENCED.test(s) ? s.trim().slice(0, max) : null);

function cleanMoney(m, problems, where) {
  if (m == null) return null;
  const ok = (x) => x && typeof x.value === "number" && Number.isFinite(x.value) && x.value > 0 && /^[A-Z]{3}$/.test(x.currency ?? "");
  if (!ok(m)) { problems.push(`${where}: not a positive amount with a currency — dropped`); return null; }
  const alt = (m.alt ?? []).filter(ok).map((a) => ({ value: a.value, currency: a.currency }));
  return { value: m.value, currency: m.currency, ...(alt.length ? { alt } : {}), ...(m.basis ? { basis: m.basis } : {}) };
}

function cleanSource(s, seen, problems, where) {
  if (!s || typeof s.url !== "string" || !/^https?:\/\//.test(s.url)) { problems.push(`${where}: a source with no URL — dropped`); return null; }
  if (blocked(s.url)) { problems.push(`${where}: ${hostOf(s.url) ?? s.url} is not a credible source — dropped`); return null; }
  if (seen && !seen.has(normUrl(s.url))) { problems.push(`${where}: ${s.url} was not returned by this run's search or fetch — dropped`); return null; }
  return {
    url: s.url, publisher: String(s.publisher ?? hostOf(s.url)), published: typeof s.published === "string" && DATE.test(s.published) ? s.published : null,
    supports: text(s.supports, 240) ?? "", ...(s.aggregator ? { aggregator: true } : {}),
  };
}

function cleanRound(r, seen, problems, id) {
  const where = `${id} ${r?.round ?? "?"} ${r?.date ?? "?"}`;
  if (!r || typeof r.date !== "string" || !DATE.test(r.date) || typeof r.round !== "string" || !r.round.trim()) {
    problems.push(`${where}: no valid date or round name — dropped`); return null;
  }
  const sources = (r.sources ?? []).map((s) => cleanSource(s, seen, problems, where)).filter(Boolean);
  if (!sources.length) { problems.push(`${where}: no credible source left — dropped`); return null; }
  return {
    date: r.date, dateBasis: r.dateBasis ?? null, round: r.round.trim(), kind: r.kind ?? "primary",
    amountRaised: cleanMoney(r.amountRaised, problems, `${where} amount`),
    preMoney: cleanMoney(r.preMoney, problems, `${where} pre-money`),
    postMoney: cleanMoney(r.postMoney, problems, `${where} post-money`),
    valuation: cleanMoney(r.valuation, problems, `${where} valuation`),
    pricePerShare: cleanMoney(r.pricePerShare, problems, `${where} price`),
    sharesAllotted: typeof r.sharesAllotted === "number" && r.sharesAllotted > 0 ? r.sharesAllotted : null,
    leadInvestors: Array.isArray(r.leadInvestors) ? r.leadInvestors.map((x) => text(x, 120)).filter(Boolean) : [],
    note: text(r.note),
    sources,
  };
}

function cleanCompany(reg, c, seen, problems, checkedOn) {
  const rounds = (c?.rounds ?? []).map((r) => cleanRound(r, seen, problems, reg.id)).filter(Boolean);
  // A mention is kept only where EVERY person it names is one of the book's
  // members — a line that also names a relative the book does not carry is
  // dropped whole, since its figures cannot be split between them.
  const mentions = (c?.familyMentions ?? []).flatMap((m) => {
    const who = String(m?.who ?? "");
    const said = String(m?.text ?? (who && m?.what ? `${who}: ${m.what}` : m?.says ?? ""));
    const people = who.split(/;|,|\band\b/).map((x) => x.trim()).filter(Boolean);
    const member = (x) => FAMILY_NAME.test(/Jaisinghani|glow/i.test(x) ? x : `${x} Jaisinghani`);
    if (FENCED.test(said) || (who ? !people.every(member) : !FAMILY_NAME.test(said))) return [];
    const source = cleanSource(m?.source ?? (m?.url ? m : null), seen, problems, `${reg.id} family mention`);
    return source ? [{ text: said, shares: typeof m.shares === "number" ? m.shares : null, source }] : [];
  });
  const listed = c?.listed && c.listed.exchange && c.listed.symbol
    ? { exchange: String(c.listed.exchange), symbol: String(c.listed.symbol), date: DATE.test(c.listed.date ?? "") ? c.listed.date : null } : null;
  return {
    id: reg.id, legalName: reg.legalName, brand: reg.brand, fundKeys: reg.fundKeys,
    website: typeof c?.website === "string" && /^https?:\/\//.test(c.website) && !blocked(c.website) ? c.website : null,
    sector: text(c?.sector, 120),
    listed, rounds: sortRounds(rounds), familyMentions: mentions,
    searchNote: text(c?.searchNote, 800),
    checkedOn,
  };
}

const dayOf = (d) => (d.length === 7 ? `${d}-01` : d);
const sortRounds = (rs) => [...rs].sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)) || a.round.localeCompare(b.round));
const normUrl = (u) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
const roundKey = (r) => `${r.date.slice(0, 7)}|${r.round.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;

/** A refresh adds and updates; it never deletes a sourced round. */
function mergeCompany(old, next) {
  if (!old) return next;
  const byKey = new Map(old.rounds.map((r) => [roundKey(r), r]));
  for (const r of next.rounds) {
    const prev = byKey.get(roundKey(r));
    byKey.set(roundKey(r), prev ? { ...r, sources: dedupeSources([...r.sources, ...prev.sources]) } : r);
  }
  return {
    ...next,
    website: next.website ?? old.website, sector: next.sector ?? old.sector, listed: next.listed ?? old.listed,
    rounds: sortRounds([...byKey.values()]),
    familyMentions: dedupeMentions([...next.familyMentions, ...old.familyMentions]),
    searchNote: next.searchNote ?? old.searchNote,
  };
}
const dedupeSources = (ss) => [...new Map(ss.map((s) => [normUrl(s.url), s])).values()];
const dedupeMentions = (ms) => [...new Map(ms.map((m) => [normUrl(m.source.url) + m.text, m])).values()];

// ── THE STORE ──────────────────────────────────────────────────────────────
function readStore() {
  if (!fs.existsSync(STORE)) return { updatedOn: null, method: METHOD, companies: [] };
  return JSON.parse(fs.readFileSync(STORE, "utf8"));
}
function writeStore(byId) {
  const companies = PRIVATE_COMPANIES.map((reg) => {
    const c = byId.get(reg.id);
    // The registry owns the names and keys; a record keeps its rounds.
    return c ? { ...c, legalName: reg.legalName, brand: reg.brand, fundKeys: reg.fundKeys }
      : { id: reg.id, legalName: reg.legalName, brand: reg.brand, fundKeys: reg.fundKeys, website: null, sector: null, listed: null,
          rounds: [], familyMentions: [], searchNote: "not yet researched", checkedOn: "1970-01-01" };
  });
  const updatedOn = companies.map((c) => c.checkedOn).sort().at(-1);
  const store = { updatedOn, method: METHOD, notCompanies: NOT_A_PRIVATE_COMPANY, companies };
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2) + "\n");
  fs.writeFileSync(REPORT, report(store));
  return store;
}

function report(store) {
  const fmt = (m) => (m ? `${m.currency} ${m.value.toLocaleString("en-IN")}` : "—");
  const rows = store.companies.map((c) => {
    const last = [...c.rounds].reverse().find((r) => r.postMoney || r.valuation);
    return `| ${c.brand} | ${c.rounds.length} | ${last ? `${last.date} ${last.round}` : "—"} | ${last ? fmt(last.postMoney ?? last.valuation) : "—"} | ${c.checkedOn} |`;
  });
  return [
    "# Private companies — funding rounds",
    "",
    "Generated by `npm run build-private-rounds` into `src/data/privateRounds.json`. Never edit by hand; the",
    "rounds and their sources are on each company's page (`/private-company/<id>`).",
    "",
    `${store.companies.length} companies · ${store.companies.filter((c) => c.rounds.length).length} with at least one sourced round · ${store.companies.reduce((s, c) => s + c.rounds.length, 0)} rounds.`,
    "",
    "| Company | Rounds | Latest valued round | Valuation (as printed) | Checked |",
    "| --- | ---: | --- | ---: | --- |",
    ...rows,
    "",
  ].join("\n");
}

// ── THE RESEARCH RUN ───────────────────────────────────────────────────────
const BRIEF = `You keep the funding-round record of one private company for a family office dashboard whose rule is that no figure is ever fabricated. Use web search and web fetch to find every priced event in the company's history from credible sources — equity rounds, preferential allotments or rights issues reported with a price or valuation, an IPO, an acquisition price — especially any newer than the record below.

Credible sources, in order: RoC/MCA filings as Entrackr, Inc42, The Economic Times, TheKredible or VCCircle report them; SEBI/BSE/NSE offer documents and exchange filings; the company's own press release; established business press (ET, Mint, Business Standard, Moneycontrol, Financial Express, BusinessLine, YourStory, TechCrunch, Reuters, Bloomberg, Forbes India, Fortune India). Tracxn/Crunchbase/PitchBook public pages only when nothing else exists, marked "aggregator": true. Never use unlisted-share dealer price pages, forums, social media or SEO blogs.

Record a figure only if the source states it. Do not compute pre-money from post-money. "Valued at X" with no pre/post word goes in "valuation" with "basis": "unspecified". Keep the source's currency; give both in "alt" when it prints both. Values in full units (1 crore = 10,000,000). Dates YYYY-MM-DD, or YYYY-MM when only a month is given. Every round needs at least one source you actually opened or saw in search results, with url, publisher, published date and "supports" (≤15 words on what it states). Name the family (surname Jaisinghani, or Glow Ventures) in "familyMentions" only if a source names them as an investor or allottee.

Answer with ONLY one JSON object, in a \`\`\`json fence, shaped:
{"website": string|null, "sector": string|null, "listed": null|{"exchange","symbol","date"}, "rounds": [{"date","dateBasis","round","kind","amountRaised","preMoney","postMoney","valuation","pricePerShare","sharesAllotted","leadInvestors","note","sources":[{"url","publisher","published","supports","aggregator"}]}], "familyMentions": [], "searchNote": "what you searched and what is missing"}
A money object is {"value": number, "currency": "INR"|"USD"|…, "alt": [{"value","currency"}]}. Return every round you can source, including the ones already in the record.`;

async function research(client, reg, current) {
  const ask = `${BRIEF}\n\nCompany: ${reg.legalName} (known as ${reg.brand}).\nIts current record (${current?.checkedOn ?? "never researched"}):\n${JSON.stringify({ website: current?.website ?? null, rounds: current?.rounds ?? [] }, null, 1)}`;
  const messages = [{ role: "user", content: ask }];
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: 8, blocked_domains: BLOCKED_SOURCE_HOSTS.slice(0, 64) },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8, blocked_domains: BLOCKED_SOURCE_HOSTS.slice(0, 64) },
  ];
  const seen = new Set();
  let response;
  for (let turn = 0; turn < 5; turn++) {
    response = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "high" }, tools, messages,
    });
    for (const b of response.content) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const x of b.content) if (x.url) seen.add(normUrl(x.url));
      if (b.type === "web_fetch_tool_result" && b.content && !Array.isArray(b.content) && b.content.url) seen.add(normUrl(b.content.url));
    }
    if (response.stop_reason !== "pause_turn") break;
    messages.splice(1, messages.length - 1, { role: "assistant", content: response.content });
  }
  if (response.stop_reason === "refusal") throw new Error(`declined (${response.stop_details?.category ?? "no category"})`);
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const json = text.match(/```json\s*([\s\S]*?)```/)?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return { answer: JSON.parse(json), seen };
}

async function main() {
  const store = readStore();
  const byId = new Map(store.companies.map((c) => [c.id, c]));
  const problems = [];

  if (flag("--check")) {
    for (const reg of PRIVATE_COMPANIES) {
      const c = byId.get(reg.id);
      if (!c) { problems.push(`${reg.id}: no record`); continue; }
      const again = cleanCompany(reg, c, null, problems, c.checkedOn);
      if (again.rounds.length !== c.rounds.length) problems.push(`${reg.id}: ${c.rounds.length - again.rounds.length} round(s) fail validation`);
    }
    for (const c of store.companies) if (!PRIVATE_COMPANIES.some((r) => r.id === c.id)) problems.push(`${c.id}: a record with no registry entry`);
    for (const p of problems) console.error(`  ${p}`);
    console.log(problems.length ? `✗ ${problems.length} problem(s)` : `✓ ${store.companies.length} companies valid`);
    process.exit(problems.length ? 1 : 0);
  }

  if (flag("--import")) {
    const files = args.slice(args.indexOf("--import") + 1).filter((a) => !a.startsWith("--"));
    for (const f of files) {
      const batch = JSON.parse(fs.readFileSync(f, "utf8"));
      for (const c of batch.companies ?? []) {
        const reg = PRIVATE_COMPANIES.find((r) => r.id === c.id);
        if (!reg) { problems.push(`${f}: ${c.id} is not in the registry — skipped`); continue; }
        byId.set(reg.id, cleanCompany(reg, c, null, problems, batch.researchedOn ?? today()));
      }
    }
    for (const p of problems) console.warn(`  ${p}`);
    const out = writeStore(byId);
    console.log(`✓ ${out.companies.length} companies written · ${out.companies.reduce((s, c) => s + c.rounds.length, 0)} rounds`);
    return;
  }

  // THE REFRESH.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("ANTHROPIC_API_KEY is not set — the research run cannot search. The record stays as it is, dated " + (store.updatedOn ?? "never") + ".");
    return;
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const only = value("--only")?.split(",") ?? null;
  const limit = Number(value("--limit") ?? 20);
  const queue = PRIVATE_COMPANIES
    .filter((r) => !only || only.includes(r.id))
    .sort((a, b) => (byId.get(a.id)?.checkedOn ?? "").localeCompare(byId.get(b.id)?.checkedOn ?? ""))
    .slice(0, only ? undefined : limit);
  for (const reg of queue) {
    try {
      const { answer, seen } = await research(client, reg, byId.get(reg.id));
      const next = cleanCompany(reg, answer, seen, problems, today());
      const before = byId.get(reg.id)?.rounds.length ?? 0;
      const merged = mergeCompany(byId.get(reg.id), next);
      byId.set(reg.id, merged);
      console.log(`  ${reg.id}: ${merged.rounds.length} round(s) (${merged.rounds.length - before >= 0 ? "+" : ""}${merged.rounds.length - before})`);
    } catch (e) {
      // A failed company keeps its record and its old date, so the next run tries it first.
      problems.push(`${reg.id}: research failed — ${e.message}`);
    }
  }
  for (const p of problems) console.warn(`  ${p}`);
  writeStore(byId);
}

main().catch((e) => { console.error(e); process.exit(1); });
