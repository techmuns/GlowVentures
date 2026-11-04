#!/usr/bin/env node
// ── THE PRIVATE COMPANIES' REPORTED FUNDING AND HEADLINES → src/data/privateMarketNews.json
//   (Stage 10kt)
//
//   npm run import-private-market                  read Glow Central Research's publications
//   npm run import-private-market -- --offline     re-match the rows already held
//                                                  (after a research refresh of the rounds)
//   npm run import-private-market -- --file a.json [--headlines b.json --companies c.json]
//                                                  read saved copies instead of the network
//
// Two of Glow Central Research's public files, read and joined to the family's
// private companies (`scripts/lib/privateCompanies.mjs`):
//
//   data/private-market-news.json   Inc42's weekly "Funding Galore" tables —
//                                   the rows behind its News → Private Market
//                                   tab (see `scripts/lib/privateFunding.mjs`);
//   data/private-company-news.json  the headlines that name one of the family's
//                                   private companies, matched there by reviewed
//                                   name (`data/portfolio-companies.json` says
//                                   which book lines each of its companies is).
//
// Nothing is scraped here and no key is needed. A read that fails, or a file
// that is not the shape it should be, leaves the record as it was and exits
// non-zero; nothing held is ever dropped by a later read — a row Glow Central
// Research no longer publishes stays, as it does there.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRIVATE_COMPANIES, FAMILY_NAME } from "./lib/privateCompanies.mjs";
import {
  FUNDING_SOURCE, RESEARCH_FUNDING_URL, RESEARCH_HEADLINES_URL, RESEARCH_COMPANIES_URL,
  companyMatcher, readRow, foldRows, unfenced,
} from "./lib/privateFunding.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/data/privateMarketNews.json");
const ROUNDS = path.join(ROOT, "src/data/privateRounds.json");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const KEEP_HEADLINES = 60;

const PROVENANCE = "Public reporting about the family's private companies, read from Glow Central Research's published captures — never the family's statements. Funding rows are Inc42's weekly Funding Galore tables (date, round, round size, investors, lead investor, sector, subsector, business model), matched to a company by its exact name; headlines are those that name the company, matched there by reviewed name. Written by `npm run import-private-market`; never edit by hand.";

async function read(url, file) {
  if (file) return JSON.parse(fs.readFileSync(file, "utf8"));
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { "user-agent": "GlowVenturesPrivateMarket/1.0 (+https://github.com/techmuns/GlowVentures)" } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

const ARTICLE = /^https:\/\/inc42\.com\/(buzz|features|startups)\/[a-z0-9-]+\/$/;
function validFunding(v) {
  if (v?.version !== 1 || v.source !== FUNDING_SOURCE || !Array.isArray(v.deals) || !Array.isArray(v.articles) || !v.archive) throw new Error("the funding capture is not the shape Glow Central Research publishes");
  const ids = new Set();
  for (const d of v.deals) {
    if (!/^[a-f0-9]{24}$/.test(d?.id ?? "") || ids.has(d.id) || !ARTICLE.test(d.sourceUrl ?? "") || typeof d.company !== "string") throw new Error(`a funding row is malformed (${d?.id ?? "no id"})`);
    ids.add(d.id);
  }
  if (!v.deals.length) throw new Error("the funding capture carries no rows");
  return v;
}
function validHeadlines(v, companies) {
  if (v?.version !== 1 || !Array.isArray(v.events) || !Array.isArray(companies?.privateCompanies)) throw new Error("the headline capture is not the shape Glow Central Research publishes");
  return v;
}

const day = (s) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const held = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
const rounds = JSON.parse(fs.readFileSync(ROUNDS, "utf8"));
const match = companyMatcher(PRIVATE_COMPANIES);

/** Every held row re-matched by its printed name, and folded against the researched rounds as they stand now. */
function foldAll(rows) {
  const byCompany = new Map();
  for (const row of rows) {
    const c = match(row.name);
    if (!c) continue;
    row.company = c.id;
    (byCompany.get(c.id) ?? byCompany.set(c.id, []).get(c.id)).push(row);
  }
  const out = [];
  for (const [id, list] of byCompany) {
    const record = rounds.companies.find((c) => c.id === id);
    const folds = foldRows(list, record?.rounds ?? []);
    for (const row of list) { const f = folds.get(row); out.push({ ...row, fold: f }); }
  }
  return out.sort((a, b) => a.company.localeCompare(b.company) || (b.date ?? "").localeCompare(a.date ?? "") || a.id.localeCompare(b.id));
}

let funding = held?.funding ?? null;
let headlines = held?.headlines ?? null;

if (args.includes("--offline")) {
  if (!funding) { console.log("Nothing held to re-match."); process.exit(0); }
  funding = { ...funding, rows: foldAll(funding.rows.map(({ fold, ...r }) => r)) };
} else {
  const cap = validFunding(await read(RESEARCH_FUNDING_URL, opt("--file")));
  const articles = new Map(cap.articles.map((a) => [a.url, a]));
  const fresh = [];
  for (const d of cap.deals) {
    const c = match(d.company);
    if (c) fresh.push(readRow(d, articles.get(d.sourceUrl), c.id, FAMILY_NAME));
  }
  // NOTHING HELD IS DROPPED: a row the new capture no longer carries stays.
  const ids = new Set(fresh.map((r) => r.id));
  const kept = (funding?.rows ?? []).filter((r) => !ids.has(r.id)).map(({ fold, ...r }) => r);
  const dated = cap.deals.map((d) => d.dateISO).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x ?? "")).sort();
  funding = {
    source: FUNDING_SOURCE,
    via: RESEARCH_FUNDING_URL,
    sourceCheckedOn: day(cap.sourceCheckedAt),
    capturedOn: day(cap.generatedAt),
    archive: { complete: !!cap.archive.complete, pagesRead: Math.max(0, Math.min(cap.archive.maxPage ?? 0, (cap.archive.nextPage ?? 2) - 1)), pages: cap.archive.maxPage ?? null },
    roundups: cap.articles.length,
    rowsRead: cap.deals.length,
    from: dated[0] ?? null,
    to: dated.at(-1) ?? null,
    ...(cap.error ? { error: unfenced(cap.error) } : {}),
    rows: foldAll([...fresh, ...kept]),
  };

  try {
    const companies = await read(RESEARCH_COMPANIES_URL, opt("--companies"));
    const h = validHeadlines(await read(RESEARCH_HEADLINES_URL, opt("--headlines")), companies);
    // Glow Central Research's company → the book lines it is → this registry's company.
    const byEntity = new Map();
    for (const pc of companies.privateCompanies) {
      const ids = new Set(PRIVATE_COMPANIES.filter((c) => c.fundKeys.some((k) => (pc.securityKeys ?? []).includes(k))).map((c) => c.id));
      if (ids.size === 1) byEntity.set(pc.id, [...ids][0]);
    }
    const next = [];
    for (const e of h.events) {
      const company = byEntity.get(e.entityId);
      const title = unfenced(e.title);
      if (!company || !title || !/^https?:\/\//.test(e.url ?? "")) continue;
      next.push({ company, at: e.at ?? e.firstSeenAt ?? null, title, summary: unfenced(e.summary)?.slice(0, 300) || null, url: e.url, publisher: unfenced(e.publisher) || null });
    }
    const key = (x) => `${x.company}|${x.url}`;
    const seen = new Set(next.map(key));
    const all = [...next, ...(headlines?.rows ?? []).filter((x) => !seen.has(key(x)))];
    const perCompany = new Map();
    const rows = all.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "") || a.url.localeCompare(b.url))
      .filter((x) => { const n = (perCompany.get(x.company) ?? 0) + 1; perCompany.set(x.company, n); return n <= KEEP_HEADLINES; })
      .sort((a, b) => a.company.localeCompare(b.company) || (b.at ?? "").localeCompare(a.at ?? "") || a.url.localeCompare(b.url));
    headlines = { via: RESEARCH_HEADLINES_URL, capturedOn: day(h.generatedAt) ?? day(h.newsCapturedAt), windowDays: h.windowDays ?? null, rows };
  } catch (e) {
    // The funding rows stand on their own; a headline read that fails keeps the headlines held.
    console.warn(`  headlines not refreshed — ${e.message}`);
  }
}

const out = { _provenance: PROVENANCE, funding, headlines };
const text = JSON.stringify(out, null, 1) + "\n";
if (/polycab/i.test(text)) throw new Error("the record would name the ring-fenced holding — refusing to write it");
if (held && JSON.stringify(held) === JSON.stringify(out)) {
  console.log("Nothing changed.");
} else {
  fs.writeFileSync(OUT + ".tmp", text);
  fs.renameSync(OUT + ".tmp", OUT);
}
const companiesWith = new Set(funding.rows.map((r) => r.company));
console.log(`✓ ${funding.rows.length} Inc42 funding rows for ${companiesWith.size} companies (${funding.rows.filter((r) => r.fold).length} the same round as a researched one); ${headlines?.rows.length ?? 0} headlines`);
