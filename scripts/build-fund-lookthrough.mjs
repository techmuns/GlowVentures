#!/usr/bin/env node
/**
 * ── MUTUAL FUND DATA, FROM THE FAMILY'S OWN AmfiBeas REPO ───────────────────
 *
 * *"For all the mutual funds related data you can get that from our repo —
 * amfibeas. Mutual Fund NAV, direct scheme NAV, rolling return etc etc., daily
 * Mutual Fund scheme NAV change… everything you can find in that repo. Do not
 * make any changes in the amfibeas repo — just access relevant data points."*
 *
 * READ-ONLY, ALWAYS. Nothing here writes to that checkout, and the path is an
 * input (`AMFIBEAS_DIR`) rather than something this script clones or updates.
 *
 * ── WHY THIS REPLACED A LIVE SCRAPE, AND WHAT IT FIXED ──────────────────────
 *
 * The first cut of this store fetched rupeevest at build time and matched a
 * scheme BY NAME, through AMFI's ISIN→name map and an AMC alias table. It
 * worked, and every hop of it was a hop that could go wrong. AmfiBeas carries
 * `mf-latest-nav.json` with an **ISIN on every one of 3,439 schemes**, so the
 * join is now an exact identifier lookup and the name match survives only as a
 * fallback for the holdings this book records no ISIN for. That is the same
 * tiering `build-symbols` uses, and for the reason recorded there: adding an
 * identifier above the name tiers makes the match STRICTER, not looser.
 *
 * Measured on this book: **20 of 22 fund and ETF names join on ISIN alone**,
 * and the ISIN also settles the PLAN — `INF0R8701046` resolves to `48299-D`,
 * the DIRECT plan the family actually holds, where the name match could only
 * ever reach the Regular listing.
 *
 * ── FOUR THINGS THIS BOOK COULD NOT SHOW BEFORE ─────────────────────────────
 *
 *   NAV and its DAILY CHANGE — a mutual fund resolves to no NSE symbol, so the
 *     quote feed has never priced one and every fund's "Change today" was a
 *     dash. The last two points of the scheme's own NAV series answer it.
 *   RETURNS — taken from `mf-returns.json` rather than recomputed. Two
 *     implementations of "what is a 1-year return" is how one screen ends up
 *     disagreeing with another, and that file already states each period's
 *     basis (`simple` or `CAGR`) and the window it actually spans.
 *   THE WINDOW EACH RETURN REALLY COVERS. Their `1M` for Helios runs
 *     2026-06-19 → 2026-09-01. The label is the source's; the DATES are the
 *     measurement, so both are carried and the screen prints both. A label
 *     rendered without its window would be the one figure here nobody could
 *     check.
 *   THE UNDERLYING'S OWN ISIN AND SECTOR, which the aggregator never had.
 *
 * ── HOLDINGS: THE AMC'S OWN FILING FIRST ────────────────────────────────────
 *
 * `holdings-direct/` is scraped from the AMC's own monthly disclosure page —
 * `meta.source` is the fund house's URL — and carries the underlying's ISIN and
 * sector. `holdings/` is the same data via an aggregator, with neither. So the
 * AMC's filing wins and the aggregator is the fallback, and WHICH ONE WAS USED
 * IS RECORDED PER SCHEME and printed on screen: one is the document the fund
 * itself published and the other is somebody's copy of it.
 *
 * **BOTH ARE EQUITY-ONLY, AND THAT IS A REAL LIMIT.** `meta.section` is
 * "Equity Holdings" on every file, so a liquid or debt fund resolves to ZERO
 * rows — correctly, it holds no equity. Its debt book is not in this store and
 * the card says exactly that rather than rendering an empty table. Three of
 * this book's schemes are in that position.
 *
 * Idempotent: no run timestamp is written, so a run finding nothing new leaves
 * the tree clean.
 *
 *   AMFIBEAS_DIR=/path/to/amfibeas npm run build-lookthrough
 *   DRY=1 npm run build-lookthrough      resolve and report, write nothing
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "lookthrough");
const BOOK = join(ROOT, "src", "data", "glowData.ts");
const REPORT = join(ROOT, "docs", "FUND-LOOKTHROUGH.md");

/** The AmfiBeas checkout. READ ONLY — nothing here writes to it. */
const AMFI = process.env.AMFIBEAS_DIR ?? "/home/user/techmuns/amfibeas";
const DRY = process.env.DRY === "1";

/** Mirrors `canHaveLookthrough` in src/lib/lookthrough.ts. */
const LOOKTHROUGH_CLASSES = new Set(["Mutual Fund", "ETF"]);

/**
 * THE FALLBACK TIER, AND ONLY THAT.
 *
 * Two of this book's holdings reach AmfiBeas on no ISIN — one records none at
 * all, one's ISIN is absent from the NAV file — so their scheme is matched on a
 * normalised name. A name that matches nothing, OR MORE THAN ONE, stays
 * unresolved: the alias table makes a match possible and never looser.
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
  return s < 0 || e < 0 ? null : JSON.parse(src.slice(s + 2, e + 2));
};

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const has = (p) => existsSync(p);

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

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

/**
 * The newest month a holdings file carries, chosen by ITS OWN label order.
 *
 * `meta.months` is newest-first and each row keys its figures by the same
 * labels, so the month is read from the metadata rather than by picking a fixed
 * key — a hardcoded `jul_26` silently freezes the store the month after.
 */
function newestHoldingsMonth(doc) {
  const labels = (doc?.meta?.months ?? []).map((m) => m?.label).filter(Boolean);
  if (!labels.length) return null;
  const key = String(labels[0]).toLowerCase().replace("-", "_");
  return { key, label: labels[0], aumCr: num(doc.meta.months[0]?.aumCr) };
}

/** One scheme's equity rows for that month, largest weight first. */
function holdingsRows(doc, monthKey) {
  return (doc?.rows ?? [])
    .map((r) => {
      const m = r.months?.[monthKey];
      return {
        name: r.company_name ?? null,
        // The AMC's own file gives an ISIN here; the aggregator gives its own
        // numeric id, which is useless outside it and is dropped rather than
        // shipped as though it identified anything.
        isin: /^INE[A-Z0-9]{9}$/i.test(String(r.fincode ?? "")) ? String(r.fincode).toUpperCase() : null,
        sector: r.sector ?? null,
        pctAum: num(m?.aum_pct_num),
        shares: num(m?.shares_num),
      };
    })
    .filter((r) => r.name && r.pctAum != null)
    .sort((a, b) => b.pctAum - a.pctAum);
}

function main() {
  if (!has(AMFI)) {
    console.error(`AmfiBeas checkout not found at ${AMFI}. Set AMFIBEAS_DIR to a local read-only clone of techmuns/amfibeas.`);
    process.exit(1);
  }
  const navPath = join(AMFI, "public/nav-data/mf-latest-nav.json");
  const retPath = join(AMFI, "public/nav-data/mf-returns.json");
  for (const p of [navPath, retPath]) {
    if (!has(p)) { console.error(`AmfiBeas is missing ${p} — refusing to build a partial store.`); process.exit(1); }
  }

  const src = readFileSync(BOOK, "utf8");
  const positions = bookArray(src, "BOOK_POSITIONS") ?? [];

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

  const navDoc = readJson(navPath);
  const funds = navDoc.funds ?? [];
  if (funds.length < 500) { console.error(`mf-latest-nav.json carries only ${funds.length} funds — refusing to resolve against a truncated file.`); process.exit(1); }
  console.log(`AmfiBeas: ${funds.length} schemes, NAV feed ${navDoc.feedDate}`);

  const byIsin = new Map();
  for (const f of funds) if (f.isin && !byIsin.has(f.isin)) byIsin.set(f.isin, f);
  const byName = new Map();
  for (const f of funds) {
    const k = normalise(f.fundName);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(f);
  }
  const returnsByCode = new Map((readJson(retPath).funds ?? []).map((f) => [String(f.schemecode), f]));

  // ── resolve ───────────────────────────────────────────────────────────────
  const resolved = [], unresolved = [];
  for (const w of [...wanted.values()].sort((a, b) => b.mv - a.mv)) {
    let f = w.isin ? byIsin.get(w.isin) ?? null : null;
    let via = f ? "isin" : null;
    if (!f) {
      const hits = new Map();
      for (const cand of aliasVariants(normalise(w.name)))
        for (const r of byName.get(cand) ?? []) hits.set(String(r.schemecode), r);
      if (hits.size === 1) { f = [...hits.values()][0]; via = "name"; }
      else if (hits.size > 1) {
        /**
         * CANDIDATES THAT DIFFER ONLY BY PLAN ARE SETTLED BY THE PLAN, and that
         * is a reading rather than a guess: BOTH SIDES STATE IT. A scheme's
         * regular and direct listings share one name and one portfolio, so a
         * name match returns both — and the holding's own printed name says
         * which the family bought ("… - Direct Plan Growth Option"). Where it
         * does not say, or where the candidates differ by anything else, the
         * holding stays unresolved exactly as before.
         */
        const planSaid = /\bdirect\b|\bd-?grow/i.test(w.name) ? "direct"
          : /\bregular\b|\breg\b/i.test(w.name) ? "regular" : null;
        const sameFamily = new Set([...hits.values()].map((r) => normalise(r.fundName))).size === 1;
        const onPlan = planSaid ? [...hits.values()].filter((r) => r.plan === planSaid) : [];
        if (sameFamily && onPlan.length === 1) { f = onPlan[0]; via = "name+plan"; }
        else {
          unresolved.push({ ...w, reason: `${hits.size} schemes in AmfiBeas normalise to this name${planSaid ? ` and ${onPlan.length} of them are the ${planSaid} plan this holding names` : ", and this holding's own name states no plan"}, so which one this folio is cannot be decided` });
          continue;
        }
      }
    }
    if (!f) {
      unresolved.push({ ...w, reason: w.isin
        ? `ISIN ${w.isin} is not in AmfiBeas's mf-latest-nav.json, and the printed name matches no scheme there`
        : "this holding reports no ISIN and its printed name matches no scheme in AmfiBeas" });
      continue;
    }
    resolved.push({ ...w, fund: f, matchedVia: via });
  }
  console.log(`resolved ${resolved.length} of ${wanted.size} (${resolved.filter((r) => r.matchedVia === "isin").length} on ISIN, ${resolved.filter((r) => r.matchedVia !== "isin").length} on name); ${unresolved.length} unresolved`);

  // ── project one record per scheme ─────────────────────────────────────────
  const out = new Map();
  for (const r of resolved) {
    const code = String(r.fund.schemecode);
    if (out.has(code)) continue;
    const base = code.replace(/-D$/, "");

    // NAV and the day change, from the scheme's own series.
    const histPath = join(AMFI, "public/nav-history", `${code}.json`);
    let nav = { value: num(r.fund.nav), date: r.fund.navDate ?? null, prev: null, prevDate: null, changePct: null };
    if (has(histPath)) {
      const series = readJson(histPath).series ?? [];
      const last = series[series.length - 1], prev = series[series.length - 2];
      if (last) { nav.value = num(last[1]); nav.date = last[0]; }
      if (prev && last && num(prev[1])) {
        nav.prev = num(prev[1]); nav.prevDate = prev[0];
        nav.changePct = ((num(last[1]) - num(prev[1])) / num(prev[1])) * 100;
      }
    }

    // Returns — PASSED THROUGH, never recomputed, and each keeps the window it
    // actually spans. AmfiBeas states the basis per period (`simple` or
    // `CAGR`); a label without its dates is the one figure here a reader could
    // not check, and their `1M` does not always span a month.
    const rec = returnsByCode.get(code);
    const returns = {};
    for (const [k, v] of Object.entries(rec?.returns ?? {})) {
      if (v && num(v.value) != null) {
        returns[k] = { value: num(v.value), kind: v.kind ?? null, startDate: v.startDate ?? null, endDate: v.endDate ?? null, startNav: num(v.startNav), endNav: num(v.endNav) };
      }
    }

    // Holdings — the AMC's own filing first, the aggregator as fallback.
    let hold = null, holdSource = null;
    const amcPath = join(AMFI, "public/holdings-direct", `${base}.json`);
    if (has(amcPath)) { hold = readJson(amcPath); holdSource = { kind: "amc", url: hold?.meta?.source ?? null }; }
    else {
      const dir = join(AMFI, "public/holdings");
      const hit = has(dir) ? readdirSync(dir).find((f) => f.startsWith(`${base}-`)) : null;
      if (hit) { hold = readJson(join(dir, hit)); holdSource = { kind: "aggregator", url: hold?.meta?.source ?? null }; }
    }
    const month = hold ? newestHoldingsMonth(hold) : null;
    const equity = hold && month ? holdingsRows(hold, month.key) : [];

    out.set(code, {
      schemecode: code,
      scheme: r.fund.fundName ?? null,
      amfiSchemeName: r.fund.amfiSchemeName ?? null,
      amc: r.fund.amfiAmcName ?? null,
      plan: r.fund.plan ?? null,
      option: r.fund.option ?? null,
      classification: r.fund.classification ?? null,
      isin: r.fund.isin ?? null,
      nav,
      returns,
      returnsAsOf: rec?.asOfNavDate ?? null,
      fundAumCr: num(hold?.meta?.aumTotalCr) ?? month?.aumCr ?? null,
      holdingsAsOf: String(hold?.meta?.aumAsOf ?? "").slice(0, 10) || null,
      holdingsSource: holdSource,
      /**
       * EQUITY ONLY, AND THE FIELD SAYS SO. Every AmfiBeas holdings file is
       * `section: "Equity Holdings"`, so a debt or liquid scheme resolves to
       * zero rows — correctly, it holds no equity — and its debt book is simply
       * not in this store. The card renders that as an absence with the reason
       * rather than an empty table, which is the whole difference between "this
       * fund holds nothing" and "we do not carry what it holds".
       */
      section: hold?.meta?.section ?? null,
      equity,
      counts: { equity: equity.length },
    });
  }

  if (DRY) {
    for (const [code, v] of out)
      console.log(`  #${code.padEnd(8)} ${String(v.scheme).slice(0, 40).padEnd(40)} nav=${v.nav.value} ${v.nav.date} chg=${v.nav.changePct?.toFixed(2) ?? "—"}% eq=${v.counts.equity} ret=${Object.keys(v.returns).length} src=${v.holdingsSource?.kind ?? "—"}`);
    console.log("\nDRY=1 — nothing written");
    return;
  }

  // ── write ─────────────────────────────────────────────────────────────────
  mkdirSync(OUT, { recursive: true });
  const writeIfChanged = (path, text) => {
    if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
    writeFileSync(path, text);
    return true;
  };
  let changed = 0;
  const keep = new Set(["index.json"]);
  for (const [code, rec] of out) {
    const f = `${code}.json`;
    keep.add(f);
    if (writeIfChanged(join(OUT, f), JSON.stringify(rec, null, 2) + "\n")) changed++;
  }
  const index = {
    source: {
      repo: "techmuns/amfibeas (read-only)",
      nav: "public/nav-data/mf-latest-nav.json — AMFI NAVAll daily over the mf-data base",
      returns: "public/nav-data/mf-returns.json — each period states its own basis and window",
      holdings: "public/holdings-direct (the AMC's own monthly disclosure) with public/holdings as fallback",
      limit: "Holdings are EQUITY ONLY; a debt or liquid scheme resolves to zero rows and its debt book is not carried.",
      note: "A scheme's plans differ in expense ratio, and therefore NAV, not in what the fund owns. The ISIN resolves the plan, so NAV and returns are the family's own plan.",
    },
    schemes: Object.fromEntries(resolved
      .filter((r) => out.has(String(r.fund.schemecode)))
      .map((r) => {
        const rec = out.get(String(r.fund.schemecode));
        return [r.securityKey, {
          schemecode: rec.schemecode, scheme: rec.scheme, plan: rec.plan,
          isin: rec.isin, matchedVia: r.matchedVia,
          navDate: rec.nav.date, holdingsAsOf: rec.holdingsAsOf,
          holdingsSource: rec.holdingsSource?.kind ?? null,
        }];
      })),
    unresolved: unresolved.map((u) => ({ securityKey: u.securityKey, name: u.name, isin: u.isin, reason: u.reason })),
  };
  if (writeIfChanged(join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n")) changed++;
  for (const f of readdirSync(OUT)) if (!keep.has(f)) { rmSync(join(OUT, f)); changed++; }

  // ── report ────────────────────────────────────────────────────────────────
  const cr = (n) => `₹${(n / 1e7).toFixed(2)} Cr`;
  const coveredMv = resolved.reduce((a, b) => a + b.mv, 0);
  const totalMv = [...wanted.values()].reduce((a, b) => a + b.mv, 0);
  const noEquity = [...out.values()].filter((v) => v.counts.equity === 0);
  const lines = [
    "# Fund look-through — NAV, returns and what each scheme holds",
    "",
    "GENERATED by `npm run build-lookthrough` from a READ-ONLY checkout of",
    "`techmuns/amfibeas`. Do not hand-edit, and nothing here writes to that repo.",
    "",
    "None of it is a statement issued to this family: NAV and returns come from",
    "AMFI's daily file over AmfiBeas's own base, and holdings from the AMC's",
    "monthly disclosure. It is kept out of every book total for that reason.",
    "",
    `- schemes the book holds: **${wanted.size}**`,
    `- resolved: **${resolved.length}** (${cr(coveredMv)} of ${cr(totalMv)}) — ${resolved.filter((r) => r.matchedVia === "isin").length} on ISIN, ${resolved.filter((r) => r.matchedVia !== "isin").length} on name`,
    `- unresolved: **${unresolved.length}**`,
    `- resolved but disclosing no EQUITY holdings: **${noEquity.length}** (debt and liquid schemes — see the limit below)`,
    "",
    "## Resolved",
    "",
    "| Holding | ISIN | Scheme | Plan | NAV | Day | Equity rows | Holdings from |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- |",
    ...resolved.filter((r) => out.has(String(r.fund.schemecode))).map((r) => {
      const v = out.get(String(r.fund.schemecode));
      return `| ${r.name} | ${r.isin ?? "—"} | ${v.scheme} | ${v.plan ?? "—"} | ${v.nav.value ?? "—"} | ${v.nav.changePct == null ? "—" : v.nav.changePct.toFixed(2) + "%"} | ${v.counts.equity} | ${v.holdingsSource?.kind ?? "—"} |`;
    }),
    "",
  ];
  if (unresolved.length) {
    lines.push("## Unresolved — named, never guessed", "",
      "| Holding | ISIN | Why |", "| --- | --- | --- |",
      ...unresolved.map((u) => `| ${u.name} | ${u.isin ?? "—"} | ${u.reason} |`), "");
  }
  lines.push(
    "## The limits, stated",
    "",
    "**Holdings are EQUITY ONLY.** Every AmfiBeas holdings file is",
    "`section: \"Equity Holdings\"`, so a debt or liquid scheme resolves to zero",
    "rows — correctly, it holds no equity — and its debt book is not in this",
    "store. The fund page renders that as an absence with the reason rather than",
    "an empty table.",
    "",
    "**AIF folios are not attempted at all.** SEBI requires a monthly portfolio",
    "from a mutual fund and not from a Category II or III alternative fund, so no",
    "scheme document exists to join to those folios.",
    "",
    "**Available in AmfiBeas and NOT surfaced yet**, recorded so the next session",
    "does not have to go looking: `mf-ratios.json` (standard deviation and beta,",
    "with a category rank and percentile), `mf-rolling-ranks.json`,",
    "`mf-category-returns.json` (peer-group returns per period),",
    "`public/stocks/<isin>.json` and `public/index-history/NIFTY_500.json`.",
    "");
  if (writeIfChanged(REPORT, lines.join("\n"))) changed++;

  console.log(`\n${changed ? `${changed} file(s) written` : "no change — the store is already current"}`);
  console.log(`covers ${resolved.length} of ${wanted.size} names · ${cr(coveredMv)} of ${cr(totalMv)}`);
  if (noEquity.length) console.log(`${noEquity.length} scheme(s) disclose no equity holdings (debt/liquid): ${noEquity.map((v) => v.scheme).join(", ")}`);
}

main();
