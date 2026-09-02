#!/usr/bin/env node
/**
 * ── LOOK-THROUGH: WHAT THE COMPANIES INSIDE EACH MUTUAL FUND ARE ────────────
 *
 * *"We should also be able to see each holding of every mutual fund. You can
 * fetch this data from rupeevest by typing the name of each mutual fund scheme
 * that we are holding and fetching the name of all the stocks held."*
 *
 * This is the one input the book has never had. `CLAUDE.md` has said since the
 * AIF statements landed that a fund folio is ONE purchase of a manager's
 * portfolio and that the companies inside it are "not reported to this book" —
 * true of the family's own statements, which is all the book had. A scheme's
 * portfolio is nonetheless PUBLISHED: SEBI requires every AMC to disclose it
 * monthly, and rupeevest aggregates those disclosures.
 *
 * SO THE PROVENANCE IS DIFFERENT FROM EVERYTHING ELSE IN THIS REPO, AND THE
 * DIFFERENCE IS THE POINT. Every other figure traces to the statement of the
 * institution that struck it. These trace to the AMC's own monthly disclosure
 * as a third party relays it — which is why the store keeps the source, the
 * scheme rupeevest matched and the portfolio's own as-of date on every record,
 * and why the page renders them under a heading that says so. It is NOT the
 * family's statement and must never be totalled into a book figure.
 *
 * ── THE JOIN, AND WHY IT IS ANCHORED ON AN ISIN ────────────────────────────
 *
 * rupeevest's index carries a scheme name, a fund house and a scheme code — and
 * NO ISIN. The book's mutual-fund rows are mostly depository-clipped names
 * (`WOC MAAF D-GROW`, `BNDH L&MCF DP GR`, `ICICI IOPPF D-GRW`), and matching
 * those to a scheme by name is exactly the guess this repo refuses.
 *
 * They do carry ISINs — 17 of 20 — so the chain starts there:
 *
 *     book ISIN → AMFI's NAVAll (the official ISIN → scheme-name map)
 *               → normalise → rupeevest scheme name → schemecode → portfolio
 *
 * Only ONE hop is a name match, and both sides of it are the same scheme's own
 * name. A scheme that matches nothing, or matches more than one code, is left
 * UNRESOLVED and named in the report — never resolved to a best guess.
 *
 * ── THREE FACTS THE READER IS OWED, ENCODED HERE AND RENDERED ON SCREEN ─────
 *
 * 1. **A DIRECT PLAN AND A REGULAR PLAN HOLD THE SAME PORTFOLIO.** rupeevest
 *    lists one entry per scheme, on its Regular plan; the family holds Direct.
 *    They differ in expense ratio and therefore in NAV — not in what the fund
 *    owns, because they are the same fund. That is why matching across the plan
 *    is legitimate, and the store records which plan was matched so the screen
 *    can say it rather than leaving a reader to wonder.
 * 2. **THE DATES DO NOT LINE UP.** A scheme's portfolio is disclosed monthly and
 *    the family's holding is valued on its own statement date. The store carries
 *    the portfolio's `asOf` so the page can print both rather than implying one.
 * 3. **THE PUBLISHED FIGURE IS A PERCENTAGE OF THE FUND'S AUM**, not of the
 *    family's money. The family's exposure is derivable from it — holding value
 *    × percent — and that multiplication is done ON SCREEN, where it can be
 *    labelled, never baked into the store as though it had been disclosed.
 *
 * Idempotent: no run timestamp is written anywhere, so a run that finds nothing
 * new leaves the tree clean and the nightly diff is a real change or nothing.
 *
 *   npm run build-lookthrough              refresh every scheme
 *   npm run build-lookthrough -- --only 48299,1273
 *   DRY=1 npm run build-lookthrough        resolve and report, write nothing
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "lookthrough");
const BOOK = join(ROOT, "src", "data", "glowData.ts");
const REPORT = join(ROOT, "docs", "FUND-LOOKTHROUGH.md");

const AMFI_NAV = "https://portal.amfiindia.com/spages/NAVAll.txt";
const RV_SEARCH = "https://www.rupeevest.com/home/get_search_data";
const RV_PORTFOLIO = "https://www.rupeevest.com/home/get_mf_portfolio_tracker";

const DRY = process.env.DRY === "1";
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  return i > 0 ? new Set(process.argv[i + 1].split(",").map((x) => x.trim())) : null;
})();

/**
 * THE CLASSES A LOOK-THROUGH CAN EXIST FOR — mutual funds and ETFs.
 *
 * An AIF is deliberately NOT here and this is the one place to say why: a
 * Category II/III AIF publishes no monthly portfolio disclosure of the kind SEBI
 * requires of a mutual fund, rupeevest indexes none, and the family's own AIF
 * statements report a folio rather than its constituents. So the AIF book stays
 * without a look-through, and the fund page keeps saying so — an absence with a
 * cause rather than an empty table beside a populated one.
 */
const LOOKTHROUGH_CLASSES = new Set(["Mutual Fund", "ETF"]);

/**
 * WHAT rupeevest CALLS AN AMC THAT AMFI SPELLS OUT — a committed decision table.
 *
 * These are abbreviations, not inferences: rupeevest writes `ICICI Pru` where
 * AMFI writes `ICICI Prudential`, and no amount of normalising bridges that.
 * Every entry was READ OFF the rupeevest index rather than guessed, and a
 * substitution that produces two candidate schemes leaves the name unresolved
 * exactly as if it had produced none — the alias makes the match possible, it
 * never makes it looser.
 */
const NAME_ALIASES = [
  ["aditya birla sun life", "aditya birla sl"],
  ["icici prudential", "icici pru"],
  ["whiteoak capital", "woc"],
  ["opportunities", "opp"],
];

const bookArray = (src, name) => {
  const i = src.indexOf(`export const ${name}`);
  if (i < 0) return null;
  const s = src.indexOf("= [", i);
  const e = src.indexOf("\n];", s);
  if (s < 0 || e < 0) return null;
  return JSON.parse(src.slice(s + 2, e + 2));
};

async function get(url, { json = true } = {}) {
  const r = await fetch(url, {
    headers: { Accept: json ? "application/json" : "text/plain", "User-Agent": "glow-ventures-lookthrough/1.0" },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  const body = await r.text();
  if (!json) return body;
  // A GATE OR AN ERROR PAGE ANSWERS 200 WITH HTML. Checked by CONTENT, never by
  // status — this repo has already recorded one source that "passed" a
  // status-only test while serving an error page.
  if (/^\s*</.test(body)) throw new Error(`expected JSON, got HTML from ${url}`);
  return JSON.parse(body);
}

/** Plan, option and punctuation stripped — what is left is the SCHEME. */
const normalise = (s) =>
  String(s ?? "").toLowerCase()
    .replace(/\((g|idcw|d|b|q|m|w|hy|ap)\)/g, " ")
    .replace(/-\s*(reg|dir|direct|regular)\b/g, " ")
    .replace(/\b(direct|regular|reg|dir|plan|option|growth|payout|reinvestment|idcw|dividend)\b/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const aliasVariants = (n) => {
  const out = new Set([n]);
  for (const [from, to] of NAME_ALIASES) for (const v of [...out]) if (v.includes(from)) out.add(v.replace(from, to));
  return [...out];
};

/** The plan rupeevest matched, read off its own name, so the page can say it. */
const planOf = (rvName) => (/-\s*dir\b|\(dir/i.test(rvName) ? "Direct" : /-\s*reg\b|\(reg/i.test(rvName) ? "Regular" : "unstated");

/**
 * ONE MONTH'S HOLDINGS — the newest the response carries.
 *
 * `stock_data` is an array of MONTHS, each an array of rows, and the endpoint
 * returns four. Reading them all would put one holding on screen four times at
 * four different weights; reading a fixed index would silently pick a stale
 * month the first time the source changes how many it returns. The month is
 * chosen by its own `invdate`.
 */
function newestMonth(months) {
  if (!Array.isArray(months)) return [];
  const dated = months.filter((m) => Array.isArray(m) && m.length);
  if (!dated.length) return [];
  return dated.reduce((best, m) => {
    const d = (x) => String(x?.[0]?.invdate ?? "");
    return d(m) > d(best) ? m : best;
  });
}

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

/** Rows for one sleeve, joined to the mapping that names them. */
function sleeve(months, mapping) {
  const rows = newestMonth(months);
  const names = mapping && typeof mapping === "object" ? mapping : {};
  return rows
    .map((r) => ({
      name: names[String(r.fincode)] ?? null,
      pctAum: num(r.percent_aum),
      shares: num(r.noshares),
    }))
    // A ROW THE MAPPING DOES NOT NAME IS DROPPED, not rendered as "unknown":
    // a weight with no security against it is a number a reader cannot use, and
    // the report counts what was dropped so the gap is visible rather than
    // silently absorbed.
    .filter((r) => r.name && r.pctAum != null)
    .sort((a, b) => (b.pctAum ?? 0) - (a.pctAum ?? 0));
}

const asOfOf = (fi) => String(fi?.aumdate ?? "").slice(0, 10) || null;

async function main() {
  const src = readFileSync(BOOK, "utf8");
  const positions = bookArray(src, "BOOK_POSITIONS") ?? [];

  // ── the schemes the book actually holds ───────────────────────────────────
  const wanted = new Map();
  for (const p of positions) {
    if (!LOOKTHROUGH_CLASSES.has(p.assetClass)) continue;
    const cur = wanted.get(p.securityKey) ?? {
      securityKey: p.securityKey, name: p.security, isin: p.isin ?? null, assetClass: p.assetClass, mv: 0,
    };
    cur.mv += Number(p.marketValue) || 0;
    if (!cur.isin && p.isin) cur.isin = p.isin;
    wanted.set(p.securityKey, cur);
  }
  console.log(`book carries ${wanted.size} fund/ETF names across ${LOOKTHROUGH_CLASSES.size} classes`);

  // ── AMFI: the official ISIN → scheme-name map ─────────────────────────────
  const navAll = await get(AMFI_NAV, { json: false });
  const amfi = new Map();
  for (const line of navAll.split("\n")) {
    const f = line.split(";");
    if (f.length < 5) continue;
    const name = (f[3] ?? "").trim();
    if (!name) continue;
    for (const raw of [f[1], f[2]]) {
      const isin = (raw ?? "").trim();
      if (/^INF[A-Z0-9]{9}$/.test(isin)) amfi.set(isin, name);
    }
  }
  console.log(`AMFI NAVAll: ${amfi.size} ISINs`);
  if (amfi.size < 1000) throw new Error(`AMFI returned only ${amfi.size} ISINs — refusing to resolve against a truncated map`);

  // ── rupeevest's scheme index ──────────────────────────────────────────────
  const search = await get(RV_SEARCH);
  const rvRows = search?.search_data ?? [];
  if (!Array.isArray(rvRows) || rvRows.length < 500) throw new Error(`rupeevest index returned ${rvRows.length} schemes — refusing to resolve against a truncated index`);
  console.log(`rupeevest index: ${rvRows.length} schemes`);
  const byNorm = new Map();
  for (const r of rvRows) {
    const k = normalise(r.s_name);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k).push(r);
  }

  // ── resolve ───────────────────────────────────────────────────────────────
  const resolved = [], unresolved = [];
  for (const w of [...wanted.values()].sort((a, b) => b.mv - a.mv)) {
    const amfiName = w.isin ? amfi.get(w.isin) ?? null : null;
    const hits = new Map();
    for (const base of [amfiName, w.name].filter(Boolean))
      for (const cand of aliasVariants(normalise(base)))
        for (const r of byNorm.get(cand) ?? []) hits.set(r.schemecode, r);
    if (hits.size === 1) {
      const r = [...hits.values()][0];
      resolved.push({ ...w, amfiName, schemecode: r.schemecode, rvName: r.s_name, plan: planOf(r.s_name),
        matchedVia: amfiName ? "isin-amfi-name" : "book-name" });
    } else {
      unresolved.push({ ...w, amfiName, reason: hits.size > 1
        ? `${hits.size} schemes on rupeevest normalise to this name, so which one this folio is cannot be decided from the name alone`
        : w.isin
          ? (amfiName ? "no scheme on rupeevest normalises to this name" : "this ISIN is not in AMFI's NAVAll, so no full scheme name could be resolved for it")
          : "this holding reports no ISIN, and its printed name matches no scheme on rupeevest" });
    }
  }
  console.log(`resolved ${resolved.length} of ${wanted.size}; ${unresolved.length} unresolved`);

  // ── fetch each distinct scheme once ───────────────────────────────────────
  const codes = [...new Set(resolved.map((r) => r.schemecode))].filter((c) => !ONLY || ONLY.has(String(c)));
  const portfolios = new Map();
  const failures = [];
  for (const code of codes) {
    try {
      const d = await get(`${RV_PORTFOLIO}?schemecode=${encodeURIComponent(code)}`);
      const fi = (d.fund_info ?? [])[0] ?? {};
      const equity = sleeve(d.stock_data, d.stock_mapping);
      const debt = sleeve(d.stock_data_debt, d.stock_mapping_debt);
      const cash = sleeve(d.stock_data_cash, d.stock_mapping_cash);
      const misc = sleeve(d.stock_data_misc, d.stock_mapping_misc);
      portfolios.set(code, {
        schemecode: code,
        scheme: fi.s_name ?? null,
        classification: fi.classification ?? null,
        fundAumCr: num(fi.aumtotal),
        asOf: asOfOf(fi),
        equity, debt, cash, misc,
        counts: { equity: equity.length, debt: debt.length, cash: cash.length, misc: misc.length },
      });
      const n = equity.length + debt.length + cash.length + misc.length;
      console.log(`  #${String(code).padEnd(6)} ${String(fi.s_name).slice(0, 44).padEnd(44)} ${String(n).padStart(4)} holdings  as of ${asOfOf(fi) ?? "—"}`);
      // Polite: one scheme at a time, with a gap. This is somebody else's site.
      await new Promise((res) => setTimeout(res, 400));
    } catch (e) {
      failures.push({ code, message: String(e.message ?? e) });
      console.log(`  #${String(code).padEnd(6)} FAILED — ${e.message}`);
    }
  }

  if (DRY) { console.log("\nDRY=1 — nothing written"); return; }

  // ── write the store ───────────────────────────────────────────────────────
  mkdirSync(OUT, { recursive: true });
  const writeIfChanged = (path, text) => {
    if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
    writeFileSync(path, text);
    return true;
  };
  let changed = 0;
  const keep = new Set();
  for (const [code, pf] of portfolios) {
    const f = `${code}.json`;
    keep.add(f);
    if (writeIfChanged(join(OUT, f), JSON.stringify(pf, null, 2) + "\n")) changed++;
  }
  const index = {
    /**
     * NO RUN TIMESTAMP. `build-book` and the harvest both regenerate
     * byte-identically so a commit is a real change; a `generatedAt` here would
     * make every nightly run a diff and train a reader to ignore them.
     */
    source: {
      portfolios: "rupeevest.com — the AMCs' own monthly SEBI portfolio disclosures, aggregated",
      schemeNames: "AMFI NAVAll (ISIN to scheme name)",
      note: "A scheme's Direct and Regular plans hold the SAME portfolio — they differ in expense ratio, and therefore NAV, not in what the fund owns.",
    },
    schemes: Object.fromEntries(resolved
      .filter((r) => portfolios.has(r.schemecode))
      .map((r) => [r.securityKey, {
        schemecode: r.schemecode, scheme: r.rvName, plan: r.plan,
        amfiName: r.amfiName, isin: r.isin, matchedVia: r.matchedVia,
        asOf: portfolios.get(r.schemecode)?.asOf ?? null,
      }])),
    unresolved: unresolved.map((u) => ({
      securityKey: u.securityKey, name: u.name, isin: u.isin, amfiName: u.amfiName, reason: u.reason,
    })),
  };
  if (writeIfChanged(join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n")) changed++;
  keep.add("index.json");
  // A scheme the book no longer holds leaves the store, or the next reader finds
  // a portfolio for a folio nobody owns.
  if (!ONLY) for (const f of readdirSync(OUT)) if (!keep.has(f)) { rmSync(join(OUT, f)); changed++; }

  // ── the report ────────────────────────────────────────────────────────────
  const cr = (n) => `₹${(n / 1e7).toFixed(2)} Cr`;
  const covered = resolved.filter((r) => portfolios.has(r.schemecode));
  const coveredMv = covered.reduce((a, b) => a + b.mv, 0);
  const totalMv = [...wanted.values()].reduce((a, b) => a + b.mv, 0);
  const lines = [
    "# Fund look-through — what the schemes hold",
    "",
    "GENERATED by `npm run build-lookthrough`. Do not hand-edit.",
    "",
    "Every row here comes from the AMC's own monthly portfolio disclosure, as",
    "rupeevest aggregates it — NOT from a statement issued to this family. It is",
    "kept apart from the book for that reason and is never summed into a book",
    "figure. A scheme's Direct and Regular plans hold the same portfolio.",
    "",
    `- schemes the book holds: **${wanted.size}**`,
    `- resolved to a scheme portfolio: **${covered.length}** (${cr(coveredMv)} of ${cr(totalMv)})`,
    `- unresolved: **${unresolved.length}**`,
    failures.length ? `- fetch failures this run: **${failures.length}**` : "- fetch failures this run: none",
    "",
    "## Resolved",
    "",
    "| Holding in the book | ISIN | Scheme matched | Plan | As of | Equity | Debt | Cash |",
    "| --- | --- | --- | --- | --- | ---: | ---: | ---: |",
    ...covered.map((r) => {
      const pf = portfolios.get(r.schemecode);
      return `| ${r.name} | ${r.isin ?? "—"} | ${pf.scheme ?? r.rvName} | ${r.plan} | ${pf.asOf ?? "—"} | ${pf.counts.equity} | ${pf.counts.debt} | ${pf.counts.cash} |`;
    }),
    "",
  ];
  if (unresolved.length) {
    lines.push("## Unresolved — named, never guessed", "",
      "A scheme that matches nothing, or matches more than one, gets no look-through.",
      "The fund page renders the absence with the reason rather than a nearest match.",
      "",
      "| Holding | ISIN | AMFI name | Why |", "| --- | --- | --- | --- |",
      ...unresolved.map((u) => `| ${u.name} | ${u.isin ?? "—"} | ${u.amfiName ?? "—"} | ${u.reason} |`), "");
  }
  lines.push("## Not applicable", "",
    "AIF folios carry no look-through and are not attempted. A Category II/III AIF",
    "publishes no monthly portfolio disclosure of the kind SEBI requires of a mutual",
    "fund, rupeevest indexes none, and the family's own AIF statements report the",
    "folio rather than its constituents. That absence is stated on the fund page.",
    "");
  if (writeIfChanged(REPORT, lines.join("\n"))) changed++;

  console.log(`\n${changed ? `${changed} file(s) written` : "no change — the store is already current"}`);
  console.log(`look-through covers ${covered.length} of ${wanted.size} names · ${cr(coveredMv)} of ${cr(totalMv)}`);
  if (failures.length) {
    console.log(`\n${failures.length} scheme(s) failed to fetch this run and KEEP their stored portfolio:`);
    for (const f of failures) console.log(`  #${f.code} ${f.message}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
