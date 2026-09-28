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
/**
 * `Jul-26` → `2026-07-31`. The whole-portfolio file dates its months by LABEL
 * where the equity read prints an `aumAsOf` date, and a store that carried one
 * of each would have two spellings of the disclosure date on one card.
 */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function monthEndOf(label) {
  const m = /^([a-z]{3})-(\d{2})$/i.exec(String(label ?? "").trim());
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  const y = 2000 + Number(m[2]);
  return `${y}-${String(mi + 1).padStart(2, "0")}-${String(new Date(Date.UTC(y, mi + 1, 0)).getUTCDate()).padStart(2, "0")}`;
}

function newestHoldingsMonth(doc) {
  const labels = (doc?.meta?.months ?? []).map((m) => m?.label).filter(Boolean);
  if (!labels.length) return null;
  const key = String(labels[0]).toLowerCase().replace("-", "_");
  return { key, label: labels[0], aumCr: num(doc.meta.months[0]?.aumCr) };
}

/**
 * ── EVERY INSTRUMENT, NOT ONLY THE EQUITY SLEEVE ────────────────────────────
 *
 * *"The look-through must cover bonds, NCDs and every instrument, not just
 * stocks. Any stock or bond. It could be a bond. It could be an NCD… there is a
 * LIC Housing NCD in the market. Now there's some negative news on LIC housing.
 * I want to see how much LIC housing I hold through my mutual fund exposure and
 * through which mutual fund."*
 *
 * `holdings-direct/` is the AMC's own disclosure read for ITS EQUITY SECTION —
 * `meta.section` is "Equity Holdings" on all 2,088 files — so a liquid or debt
 * scheme resolved to ZERO rows and a hybrid's debt sleeve was simply absent.
 * That is not a fund holding nothing; it is this store not carrying what it
 * holds, and on the family's own example it is the whole answer: measured,
 * **LIC Housing Finance is inside SIX of this family's funds** and only two of
 * those lines are equity. The other four are NCDs and commercial paper, which
 * nothing here could see.
 *
 * `amc-portfolio/` IS THE SAME DOCUMENT READ WHOLE. Its `sourceUrl` is
 * byte-identical to `holdings-direct`'s `meta.source` on every scheme checked,
 * so this is not a second source to weigh against the first — it is the filing
 * with its debt, gold, silver and cash rows kept instead of dropped. Measured
 * across the store: 157,125 rows, **an ISIN on every one**, in Equity 109,807 ·
 * Debt 45,854 · Other 1,196 · Gold 193 · Silver 69 · Cash 6. On this book's own
 * 13 resolvable schemes it takes the store from 1,702 equity rows to 3,495 rows
 * of every class — and the three liquid funds that resolved to nothing now
 * carry 688, 534 and 314 debt lines.
 *
 * ── `industry` IS A SECTOR ON AN EQUITY ROW AND A CREDIT RATING ON A DEBT ONE ─
 *
 * One field, two different facts: `Finance`, `Banks`, `IT - Software` against
 * `CRISIL - AAA`, `ICRA A1+`, `Sovereign`. Emitted under one name it would put a
 * rating in a column headed Sector — the fabricated-classification failure this
 * book already records for an index-cycled valuation method. They are separate
 * fields, split on the row's own `assetClass`, and each renders under its own
 * heading.
 *
 * ── AND ONLY THE MONTH THE FILE ITSELF REPORTS LAST ─────────────────────────
 *
 * Every row carries up to seven months and a row's own latest month may be an
 * OLD one — ICICI Prudential Liquid's `INE115A07QB9` last appears in 2026-01,
 * because the fund no longer holds it. Taking each row's own latest would report
 * instruments the fund has sold. The month comes from the FILE's `months[0]`, and
 * a row absent from it is not a current holding.
 */
function wholePortfolioRows(doc, enrichByIsin) {
  const months = doc?.months ?? [];
  const key = months[0]?.key;
  if (!key) return { rows: [], month: null };
  const rows = (doc.rows ?? [])
    .map((r) => {
      const m = r.months?.[key];
      const cls = r.assetClass ?? null;
      const isin = /^IN[EF][A-Z0-9]{9}$/i.test(String(r.isin ?? "")) ? String(r.isin).toUpperCase() : null;
      const extra = isin ? enrichByIsin.get(isin) : null;
      return {
        name: r.name ?? null,
        isin,
        assetClass: cls,
        // See above: the same source field is a sector on one class and a rating
        // on the other, so neither is published under the other's name.
        sector: cls === "Equity" ? (extra?.sector ?? r.industry ?? null) : null,
        rating: cls === "Equity" ? null : (r.industry ?? null),
        pctAum: num(m?.pctToNav),
        marketValueCr: num(m?.marketValueCr),
        // The whole-portfolio filing states a weight and a market value and no
        // unit count; the equity read of the SAME document states the shares.
        // Joined on the ISIN both sides print, so this is one document's own two
        // columns rather than a second source.
        shares: extra?.shares ?? null,
      };
    })
    .filter((r) => r.name && r.pctAum != null)
    .sort((a, b) => b.pctAum - a.pctAum);
  return { rows, month: { key, label: months[0]?.label ?? null, aumCr: num(months[0]?.aumCr), coveragePct: num(months[0]?.coveragePct), allocation: months[0]?.allocation ?? null } };
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

/**
 * ── ONE INDEX ENTRY, AND WHY THE WHOLE NAV BLOCK IS IN IT ───────────────────
 *
 * The index used to carry `navDate` alone and a caller wanting the NAV itself
 * had to fetch the scheme's own file. That is right for a page showing ONE
 * fund and wrong for a card showing every fund at once: Morning CIO's daily-NAV
 * movers needs 20 numbers, and reading them out of the scheme files costs
 * 632 KB on the landing page — which is the latency complaint that card already
 * exists to answer, arriving through the store instead of the feed.
 *
 * `nav` is ~120 bytes per scheme and the index is 7 KB, so the whole card is one
 * fetch. `navDate` STAYS beside it: it is what `SchemeMatch` has always
 * published and what the fund card reads, and removing a field to avoid
 * duplicating it inside this file would break a caller to save nothing.
 */
function indexEntry(rec, matchedVia) {
  return {
    schemecode: rec.schemecode, scheme: rec.scheme, plan: rec.plan,
    isin: rec.isin, matchedVia,
    navDate: rec.nav.date, nav: rec.nav,
    holdingsAsOf: rec.holdingsAsOf,
    holdingsSource: rec.holdingsSource?.kind ?? null,
  };
}

/**
 * ── `--reindex`: THE INDEX, REPLAYED OFF THE COMMITTED SCHEME FILES ─────────
 *
 * A full build needs the AmfiBeas checkout, which most machines do not have —
 * so a change to `indexEntry` would otherwise be unlandable, exactly as a
 * change to `securityKeyOf` was before `rekey:archive`. It does not have to be:
 * every field `indexEntry` projects is READ VERBATIM off a record this store
 * has already written to `<schemecode>.json`, so re-deriving the index from
 * those files is a faithful partial replay of the build rather than a repair
 * layer, and the next full run calls the same function on the same records and
 * writes the same bytes.
 *
 * ITS GATE IS THE FIELD THE INDEX ALREADY CARRIED. `navDate` is in every
 * existing entry and is `nav.date` by construction, so a replay that disagrees
 * with it has joined an entry to the wrong scheme file — nothing is written and
 * the run exits non-zero. `matchedVia` cannot be re-derived (it is a fact about
 * the RESOLUTION, not about the record) and is carried across from the entry
 * being replaced, which is why this can only ever UPDATE an index and never
 * create one.
 *
 *   node scripts/build-fund-lookthrough.mjs --reindex
 *   node scripts/build-fund-lookthrough.mjs --reindex --check   write nothing
 */
function reindex({ check }) {
  const idxPath = join(OUT, "index.json");
  if (!has(idxPath)) { console.error(`No index at ${idxPath} — --reindex updates an index, it cannot create one.`); process.exit(1); }
  const index = readJson(idxPath);
  const entries = Object.entries(index.schemes ?? {});
  if (!entries.length) { console.error("The index carries no schemes."); process.exit(1); }

  const replayed = {};
  const bad = [];
  for (const [securityKey, was] of entries) {
    const f = join(OUT, `${was.schemecode}.json`);
    if (!has(f)) { bad.push(`${securityKey}: no scheme file ${was.schemecode}.json`); continue; }
    const rec = readJson(f);
    const now = indexEntry(rec, was.matchedVia);
    // THE CONTROL: the field the index already carried must come back
    // unchanged, or this entry is joined to the wrong record.
    if ((was.navDate ?? null) !== (now.navDate ?? null)) {
      bad.push(`${securityKey}: navDate ${JSON.stringify(was.navDate)} in the index, ${JSON.stringify(now.navDate)} in ${was.schemecode}.json`);
      continue;
    }
    replayed[securityKey] = now;
  }
  if (bad.length) {
    console.error(`--reindex refuses: ${bad.length} entr${bad.length === 1 ? "y does" : "ies do"} not replay.`);
    for (const b of bad) console.error(`  ${b}`);
    process.exit(1);
  }
  const text = JSON.stringify({ ...index, schemes: replayed }, null, 2) + "\n";
  const same = readFileSync(idxPath, "utf8") === text;
  if (check) {
    console.log(same ? `--reindex --check: no-op over ${entries.length} schemes.` : `--reindex --check: ${entries.length} schemes replay, and the index on disk DIFFERS.`);
    return;
  }
  if (same) { console.log(`--reindex: no change (${entries.length} schemes).`); return; }
  writeFileSync(idxPath, text);
  console.log(`--reindex: rewrote index.json from ${entries.length} committed scheme files.`);
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

  /**
   * A FUND A STATEMENT RECORDS AT A QUANTITY AND NO VALUE IS STILL A FUND THE
   * FAMILY HOLDS (Stage 10cy).
   *
   * The Motilal CDSL demat prints a rate and a value that belong to each
   * holding's LAST DEPOSITORY MOVEMENT, not to the statement date, so those
   * rows are `BOOK_UNVALUED_HOLDINGS` now rather than positions. The live layer
   * values them at the scheme's published NAV, and this store is what joins
   * them to a scheme: the NAV-movers card reads its `nav`, and the stock axis
   * looks through its holdings. Read off positions alone, the next full run
   * would ask for 5 of this book's 22 schemes and DELETE the other 17 files —
   * measured, not reasoned about. Nothing here values them, so they carry
   * `mv: 0` and the report counts them apart; a line whose units another
   * account's own statement reports is that account's, and is not asked twice.
   */
  const recordedFunds = (bookArray(src, "BOOK_UNVALUED_HOLDINGS") ?? [])
    .filter((u) => LOOKTHROUGH_CLASSES.has(u.assetClass) && !u.sameUnitsReportedBy
      && typeof u.quantity === "number" && u.quantity > 0);
  for (const u of recordedFunds) {
    const cur = wanted.get(u.securityKey) ?? {
      securityKey: u.securityKey, name: u.security, isin: u.isin ?? null, assetClass: u.assetClass, mv: 0,
      recordedOnly: true,
    };
    if (!cur.isin && u.isin) cur.isin = u.isin;
    wanted.set(u.securityKey, cur);
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

    /**
     * THE WHOLE PORTFOLIO WHERE THE AMC FILED ONE, THE EQUITY READ OTHERWISE.
     *
     * `amc-portfolio` carries every asset class of the SAME document (see
     * `wholePortfolioRows`), so where it exists it is what this store publishes
     * and the equity-only read is folded into it for the `shares` and `sector`
     * columns the whole-portfolio read does not print. Where the AMC filed no
     * whole portfolio — five of this book's schemes, both DSP metal ETFs among
     * them — the equity rows stand exactly as before and `coverage` says so.
     */
    const wholePath = join(AMFI, "public/amc-portfolio", `${base}.json`);
    const whole = has(wholePath) ? readJson(wholePath) : null;
    const enrich = new Map();
    for (const e of equity) if (e.isin) enrich.set(e.isin, { shares: e.shares, sector: e.sector });
    const w = whole ? wholePortfolioRows(whole, enrich) : { rows: [], month: null };
    const useWhole = w.rows.length > 0;
    // THE SOURCE NAMED IS THE FILE THE ROWS CAME FROM. Where the whole portfolio
    // is what is published, the URL is its own — identical to the equity read's
    // on every scheme checked, and this way it stays right if one ever moves.
    if (useWhole) holdSource = { kind: "amc", url: whole?.sourceUrl ?? holdSource?.url ?? null };
    const holdings = useWhole
      ? w.rows
      : equity.map((e) => ({ ...e, assetClass: "Equity", rating: null, marketValueCr: null }));
    const byClass = {};
    for (const h of holdings) byClass[h.assetClass ?? "Unclassified"] = (byClass[h.assetClass ?? "Unclassified"] ?? 0) + 1;

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
      fundAumCr: num(whole?.months?.[0]?.aumCr) ?? num(hold?.meta?.aumTotalCr) ?? month?.aumCr ?? null,
      holdingsAsOf: monthEndOf(w.month?.label) ?? (String(hold?.meta?.aumAsOf ?? "").slice(0, 10) || null),
      holdingsSource: holdSource,
      /**
       * WHAT THE PUBLISHED ROWS COVER, STATED RATHER THAN IMPLIED.
       *
       * `whole` is every asset class the AMC filed; `equity` is the equity-only
       * read this store used to publish alone. `coveragePct` is the AMC's OWN
       * figure for how much of the scheme the disclosure accounts for — it is
       * never 100, because a filing rounds and holds cash it does not itemise —
       * so the card can say what the rows leave out instead of letting a reader
       * take them for the whole fund.
       */
      section: useWhole ? "Whole portfolio" : (hold?.meta?.section ?? null),
      coveragePct: useWhole ? w.month?.coveragePct ?? null : null,
      allocation: useWhole ? w.month?.allocation ?? null : null,
      holdings,
      counts: { holdings: holdings.length, byClass },
    });
  }

  if (DRY) {
    for (const [code, v] of out)
      console.log(`  #${code.padEnd(8)} ${String(v.scheme).slice(0, 40).padEnd(40)} nav=${v.nav.value} ${v.nav.date} chg=${v.nav.changePct?.toFixed(2) ?? "—"}% rows=${v.counts.holdings} ${JSON.stringify(v.counts.byClass)} ret=${Object.keys(v.returns).length} src=${v.holdingsSource?.kind ?? "—"}`);
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
      limit: "Holdings are the AMC's WHOLE monthly portfolio where it filed one — equity, debt, NCDs, gold, silver and cash alike. Where only the equity read of that filing exists the scheme carries its equity rows and says so.",
      note: "A scheme's plans differ in expense ratio, and therefore NAV, not in what the fund owns. The ISIN resolves the plan, so NAV and returns are the family's own plan.",
    },
    schemes: Object.fromEntries(resolved
      .filter((r) => out.has(String(r.fund.schemecode)))
      .map((r) => [r.securityKey, indexEntry(out.get(String(r.fund.schemecode)), r.matchedVia)])),
    unresolved: unresolved.map((u) => ({ securityKey: u.securityKey, name: u.name, isin: u.isin, reason: u.reason })),
  };
  if (writeIfChanged(join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n")) changed++;
  for (const f of readdirSync(OUT)) if (!keep.has(f)) { rmSync(join(OUT, f)); changed++; }

  // ── report ────────────────────────────────────────────────────────────────
  const cr = (n) => `₹${(n / 1e7).toFixed(2)} Cr`;
  const coveredMv = resolved.reduce((a, b) => a + b.mv, 0);
  const totalMv = [...wanted.values()].reduce((a, b) => a + b.mv, 0);
  const recordedOnly = [...wanted.values()].filter((w) => w.recordedOnly).length;
  const noHoldings = [...out.values()].filter((v) => v.counts.holdings === 0);
  const wholeCount = [...out.values()].filter((v) => v.section === "Whole portfolio").length;
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
    `- schemes the book holds: **${wanted.size}**${recordedOnly ? ` — ${recordedOnly} of them recorded by a statement at a quantity and no value, so ₹0 in the figures below` : ""}`,
    `- resolved: **${resolved.length}** (${cr(coveredMv)} of ${cr(totalMv)}) — ${resolved.filter((r) => r.matchedVia === "isin").length} on ISIN, ${resolved.filter((r) => r.matchedVia !== "isin").length} on name`,
    `- unresolved: **${unresolved.length}**`,
    `- covering the AMC's WHOLE portfolio (every asset class): **${wholeCount}** — the rest carry the equity read of the same filing`,
    `- resolved but disclosing nothing at all: **${noHoldings.length}**`,
    "",
    "## Resolved",
    "",
    "| Holding | ISIN | Scheme | Plan | NAV | Day | Rows | By class | Covers | Holdings from |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |",
    ...resolved.filter((r) => out.has(String(r.fund.schemecode))).map((r) => {
      const v = out.get(String(r.fund.schemecode));
      return `| ${r.name} | ${r.isin ?? "—"} | ${v.scheme} | ${v.plan ?? "—"} | ${v.nav.value ?? "—"} | ${v.nav.changePct == null ? "—" : v.nav.changePct.toFixed(2) + "%"} | ${v.counts.holdings} | ${Object.entries(v.counts.byClass).map(([k, n]) => `${k} ${n}`).join(" · ") || "—"} | ${v.section ?? "—"} | ${v.holdingsSource?.kind ?? "—"} |`;
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
    "**Holdings cover EVERY INSTRUMENT the AMC filed** — equity, debt, NCDs and",
    "commercial paper, gold, silver and cash — taken from `amc-portfolio/`, which",
    "is the same monthly disclosure `holdings-direct/` reads for its equity",
    "section alone (identical `sourceUrl` on every scheme checked). A scheme the",
    "AMC filed no whole portfolio for keeps the equity read and its `Covers`",
    "column says `Equity Holdings` rather than `Whole portfolio`.",
    "",
    "**`industry` is a SECTOR on an equity row and a CREDIT RATING on a debt one**",
    "(`Finance` against `CRISIL - AAA`), so the two are published as separate",
    "fields and neither renders under the other's heading.",
    "",
    "**A disclosure does not account for the whole scheme, and says how much it",
    "does.** `coveragePct` is the AMC's own figure — 89% to 99% here — because a",
    "filing rounds and holds cash it does not itemise. The card prints it rather",
    "than letting the rows read as the entire fund.",
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
  console.log(`${wholeCount} scheme(s) carry the AMC's WHOLE portfolio — every asset class; the rest carry the equity read of the same filing`);
  if (noHoldings.length) console.log(`${noHoldings.length} scheme(s) disclose nothing at all: ${noHoldings.map((v) => v.scheme).join(", ")}`);
}

// `--reindex` replays the index off the committed scheme files and needs no
// AmfiBeas checkout; everything else is a full build. See `reindex` above.
if (process.argv.includes("--reindex")) reindex({ check: process.argv.includes("--check") });
else main();
