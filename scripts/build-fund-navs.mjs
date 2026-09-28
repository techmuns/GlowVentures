#!/usr/bin/env node
/**
 * ── THE DAILY NAV, FROM THE INDUSTRY'S OWN PUBLISHED FILE ───────────────────
 *
 * *"Current value of any fund or Mutual Fund that can easily be fetched from
 * online sources should show present value… These NAV must be automatically
 * fetched everyday and refreshed."*
 *
 * A mutual fund resolves NO NSE TRADING SYMBOL, and every live endpoint this
 * dashboard calls is keyed on one — which is why the quote feed has never
 * priced a scheme and why a fund's value sat at whatever mark its last
 * statement struck. Measured on this book that is a month of drift on the two
 * the family named: Motilal Oswal Active Momentum marked ₹14.0491 on 6 August
 * against a published ₹14.5522, Helios ₹16.21 on 7 August against ₹16.16.
 *
 * AMFI publishes every scheme's NAV daily, keyless, as one file. So this is not
 * a proxy and not a scrape of somebody's reading of it: it is the industry
 * body's own record, joined to this book ON THE ISIN and never on a name.
 *
 *   portal.amfiindia.com/spages/NAVAll.txt
 *     Scheme Code;ISIN Growth;ISIN Reinvest;Scheme Name;Plan;Option;NAV;Date
 *
 * WHAT IT WRITES IS NOT THE BOOK. `src/data/fundNavs.ts` sits beside
 * `polycabLive.ts` on exactly the same terms: generated, committed daily by a
 * workflow, and read at DISPLAY time as a price source. `glowData.ts` is
 * generated from `source/` and must regenerate byte-identically (§7), so a
 * fetched price may never enter it — the same reason a live quote does not.
 *
 * ── TWO IDENTIFIER TIERS, STRONGEST FIRST, AND NO FUZZY ONE ────────────────
 *
 * A wrong join here is the worst fabrication available: a complete, correct,
 * well-formed NAV belonging to somebody else's fund, which nothing on screen
 * could catch. So a scheme is reached by ISIN or not at all.
 *
 *   1. the BOOK's own `Position.isin` — what the family's statement printed;
 *   2. the look-through index's resolved `isin` for that securityKey, which
 *      `build-lookthrough` established against AmfiBeas and committed.
 *
 * The second tier is what reaches Motilal Oswal Active Momentum, whose own
 * statement prints NO ISIN at all. Where both tiers answer they must AGREE, and
 * a disagreement yields nothing rather than letting either win silently — the
 * rule `build-symbols` already applies to its own ISIN tier.
 *
 * ── AND THE UNITS AND THE NAV MUST BE ON ONE BASIS ─────────────────────────
 *
 * This is the check that stops a ten-fold error. A published NAV values a
 * holding only as `quantity × NAV`, and that is true only while the book's
 * units and the AMC's NAV unit are the same unit. On this book they are not,
 * twice: DSP Gold is marked ₹151.10 against a NAV of ₹14.7633 and DSP Silver
 * ₹276.82 against ₹22.4561 — a SHARE-COUNT BREAK, the book's units being
 * pre-split and the NAV post-split. Valued naively the family's ₹16.9 Cr of
 * gold reports as ₹1.76 Cr.
 *
 * So a scheme's NAV values a holding only where the ratio against that
 * holding's own statement mark is within a FACTOR OF TWO. That bound is a claim
 * about markets rather than about this dataset — no scheme halves or doubles
 * between two statement dates absent a corporate action — and it separates the
 * real cases by an order of magnitude: the schemes that pass span 0.92 to 1.14,
 * and the two that fail sit at 0.08 and 0.10. The failure mode is deliberately
 * asymmetric: refusing a good scheme costs a refresh and keeps the statement
 * mark, while accepting a broken one prints a figure wrong by 10x.
 *
 * A REFUSED SCHEME STILL CARRIES ITS NAV, marked `usableForValue: false` with
 * the reason. The family asked to SEE the current NAV; what they must not get
 * is a holding value built on a base the book cannot reconcile.
 *
 * ── THE DAY CHANGE ACCUMULATES, BECAUSE THE SOURCE PUBLISHES ONE DAY ───────
 *
 * NAVAll is a snapshot. So the previous NAV is whatever THIS FILE already held
 * from an earlier run, carried forward on a date change — the merge-never-
 * truncate rule `rbi.mjs` and `iex.mjs` are built on. A first run therefore has
 * no day change and says so rather than reporting zero.
 *
 * ── AND THE SCHEME'S SEBI CATEGORY, BECAUSE A NAME CANNOT SAY IT ──────────
 *
 * NAVAll is not a flat list. It is grouped under headings that carry the
 * regulator's own classification of every scheme — `Open Ended Schemes(Hybrid
 * Scheme - Arbitrage Fund)`, `(Debt Scheme - Liquid Fund)` — which is SEBI's
 * 2017 categorisation, printed by the industry body against each scheme code.
 * Every row inherits the heading above it, and both halves are recorded:
 * `category` verbatim, and `sebiCategory`, the part after the first " - ".
 *
 * That is what lets a rule about a KIND of fund be checked by identifier rather
 * than by resemblance. A depository clips `KOTAK ARBITRAGE FUND` to its column
 * width as readily as it clips `BNDH L&MCF DP GR`, and a name pattern can only
 * find the ones spelled out. The category is keyed on the ISIN like every other
 * figure here, so a fund is an arbitrage fund because AMFI files it as one.
 *
 * ── UNITS A DEPOSITORY REPORTS AND NO STATEMENT VALUES ────────────────────
 *
 * One of this family's demat accounts sent a TRANSACTION statement and no
 * holding statement, so the book carries its closing balances as dated unit
 * counts (`BOOK_SHARE_MOVEMENTS`) and not one valued position. Those balances
 * are the depository's own record of what the account holds, and each block
 * already had to walk its own printed opening balance to its own printed
 * closing one before the book would publish it.
 *
 * A fund among them is priced here too, so a reader can SEE what it is worth —
 * but only from an account the book marks `transactionsOnly`: no holding
 * statement in the drop, only a transaction one. NOT "an account with no
 * positions", which was this script's first test and is wrong: Ajay's other
 * demat 37359311 also carries no position, because its holding statement's two
 * rows are AIF units the funds report themselves and were dropped as
 * duplicates. Priced as depository units they would have counted Buoyant's
 * units twice. An account that did send a holding statement has had every row
 * it does not carry dropped ON PURPOSE, and pricing those would reverse a
 * decision the book made and recorded. Whether a priced depository
 * unit then VALUES anything is not this script's call — it is a price table —
 * and the dashboard's own cash rule decides which of them it shows.
 *
 * THE BASIS CHECK NEEDS A DIFFERENT WITNESS HERE, because no statement marks
 * these units at all. The share-count break the check exists for is an ETF's:
 * an ETF's units split and the depository's count can straddle the date. An
 * open-ended mutual fund's units do not split, and the depository holds the
 * very units the fund's registrar records under the same ISIN. So a
 * depository-only unit is priced for value only where its category is not an
 * ETF, and an ETF with no mark anywhere in the book is refused with the reason.
 *
 * Idempotent: nothing moved upstream means nothing written, so the daily
 * workflow commits on a real change and never on a timestamp. `--check` writes
 * nothing and is the control run.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/data/fundNavs.ts");
const DOC = join(ROOT, "docs/FUND-NAVS.md");
const CHECK = process.argv.includes("--check");

/** AMFI redirects the www host to the portal one; follow it rather than pin it. */
const NAVALL = "https://portal.amfiindia.com/spages/NAVAll.txt";

/**
 * A FACTOR OF TWO, EITHER WAY. See the header: this is a statement about what a
 * scheme can do between two dates, not a tolerance fitted to the observed data.
 */
const BASIS_MIN = 0.5;
const BASIS_MAX = 2.0;

const die = (m) => { console.error(`build-fund-navs: ${m}`); process.exit(1); };

/** `21-Sep-2026` → `2026-09-21`, so every date in this repo sorts and compares. */
const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
function isoDate(s) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(s).trim());
  if (!m) return null;
  const mm = MONTHS[m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, "0")}` : null;
}

/** The array literal behind a `export const NAME: T[] = [...]` in a generated file. */
function bookArray(src, name) {
  const m = new RegExp(`export const ${name}[^=]*= (\\[[\\s\\S]*?\\n\\]);`).exec(src);
  return m ? JSON.parse(m[1]) : null;
}

/** The same, for a generated OBJECT literal (`BOOK_SHARE_MOVEMENTS`). */
function bookObject(src, name) {
  const i = src.indexOf(`export const ${name}`);
  if (i < 0) return null;
  const a = src.indexOf("= {", i);
  const b = a < 0 ? -1 : src.indexOf("\n};", a);
  return a < 0 || b < 0 ? null : JSON.parse(src.slice(a + 2, b + 2));
}

// ── what the book holds, and which identifiers reach it ─────────────────────
const glow = readFileSync(join(ROOT, "src/data/glowData.ts"), "utf8");
const positions = bookArray(glow, "BOOK_POSITIONS") ?? die("no BOOK_POSITIONS");

/** securityKey → the ISIN the look-through resolved for it, if that ran. */
const ltIsin = new Map();
const ltPath = join(ROOT, "public/lookthrough/index.json");
if (existsSync(ltPath)) {
  const lt = JSON.parse(readFileSync(ltPath, "utf8"));
  for (const [k, s] of Object.entries(lt.schemes ?? {})) if (s.isin) ltIsin.set(k, s.isin);
}

/**
 * One row per SECURITY the book holds, with its identifier and its own mark.
 * Keyed on securityKey because that is this book's identity for a security (§1)
 * and because the mark is what the basis check needs.
 */
const wanted = new Map();
for (const p of positions) {
  const cur = wanted.get(p.securityKey) ?? {
    key: p.securityKey, name: p.security, bookIsin: null, marks: [], assetClass: p.assetClass, from: "book" };
  if (p.isin && !cur.bookIsin) cur.bookIsin = p.isin;
  if (typeof p.currentPrice === "number" && Number.isFinite(p.currentPrice)) cur.marks.push(p.currentPrice);
  wanted.set(p.securityKey, cur);
}

/**
 * AND EVERY FUND LINE THE BOOK CARRIES AS A QUANTITY (Stage 10cy). A Motilal
 * Oswal CDSL holding statement prints a fund's units beside the price of its
 * LAST DEPOSITORY MOVEMENT, which is not a valuation — so since that correction
 * those units are `BOOK_UNVALUED_HOLDINGS` rows and not positions, and the
 * dashboard values them at the NAV this file publishes. Read off positions
 * alone, this table would drop fifteen of those schemes on its next run and the
 * dashboard would stop valuing ₹57 Cr of the family's funds the same morning,
 * with nothing failing anywhere.
 *
 * THE LAST MOVEMENT'S PRICE IS THE BASIS WITNESS, exactly as the statement's
 * rate was when these rows were positions: a mutual fund's units are bought and
 * redeemed at its NAV, so that rate is a NAV of the scheme on the movement's
 * date, on the units the depository counts. It checks the BASIS and nothing
 * else — the price a holding is valued at is the NAV below. A line printing no
 * rate adds its ISIN and no mark, so the scheme is published for the dashboard
 * to find and refused for value here unless another mark clears it.
 *
 * `from` stays "book": these are lines the book carries, from a holding
 * statement — not a depository's transaction tape. A line a fund's own
 * statement already reports (`sameUnitsReportedBy`) is left out, as the
 * dashboard leaves it out.
 */
const unvaluedFunds = (bookArray(glow, "BOOK_UNVALUED_HOLDINGS") ?? [])
  .filter((u) => (u.assetClass === "Mutual Fund" || u.assetClass === "ETF")
    && !u.sameUnitsReportedBy && typeof u.quantity === "number" && u.quantity > 0
    && typeof u.isin === "string" && /^INF/i.test(u.isin));
for (const u of unvaluedFunds) {
  const cur = wanted.get(u.securityKey) ?? {
    key: u.securityKey, name: u.security, bookIsin: null, marks: [], assetClass: u.assetClass, from: "book" };
  if (!cur.bookIsin) cur.bookIsin = u.isin;
  if (typeof u.lastMovementRate === "number" && Number.isFinite(u.lastMovementRate) && u.lastMovementRate > 0) {
    cur.marks.push(u.lastMovementRate);
  }
  wanted.set(u.securityKey, cur);
}

/**
 * THE DEPOSITORY-ONLY FUND UNITS — see the header. Four conditions, each a
 * reason a balance must NOT be priced as a holding:
 *
 *   - the account sent no holding statement (`transactionsOnly`, read off the
 *     book's own registry), because an account that did had its other
 *     depository rows dropped on purpose — and it carries no position either;
 *   - the block reconciled — it walked its own printed balances (`reason` null);
 *   - there is something left at the close (a zero closing is an exit);
 *   - the ISIN is a FUND's (`INF…`). A share is priced by an exchange, not by AMFI.
 *
 * A security whose ISIN the book already reaches under its own key is priced
 * there already and is not added twice; the dashboard finds the one entry by ISIN.
 */
const movements = bookObject(glow, "BOOK_SHARE_MOVEMENTS") ?? {};
const accountsWithPositions = new Set(positions.map((p) => p.accountId));
const transactionsOnly = new Set((bookArray(glow, "BOOK_ACCOUNTS") ?? [])
  .filter((a) => a.transactionsOnly === true).map((a) => a.accountId));
const reachedIsins = new Set([...wanted.values()].map((w) => w.bookIsin ?? ltIsin.get(w.key)).filter(Boolean));
const depositoryOnly = Object.values(movements)
  .filter((w) => transactionsOnly.has(w.accountId)
    && !accountsWithPositions.has(w.accountId)
    && w.reason == null
    && typeof w.closing === "number" && w.closing > 0
    && typeof w.isin === "string" && /^INF/.test(w.isin))
  .sort((a, b) => a.securityKey.localeCompare(b.securityKey));
for (const w of depositoryOnly) {
  if (reachedIsins.has(w.isin) || wanted.has(w.securityKey)) continue;
  reachedIsins.add(w.isin);
  wanted.set(w.securityKey, {
    key: w.securityKey, name: w.security, bookIsin: w.isin, marks: [], assetClass: null, from: "depository",
  });
}

// ── the published file ──────────────────────────────────────────────────────
async function fetchNavAll() {
  const res = await fetch(NAVALL, { redirect: "follow", headers: { "user-agent": "glow-ventures/1.0" } });
  if (!res.ok) die(`AMFI answered ${res.status}`);
  const text = await res.text();
  // CHECKED BY CONTENT, NEVER BY STATUS. A portal that answers 200 with an
  // error page is the failure `build-symbols` already records against NSE.
  if (!/Scheme Code;.*Net Asset Value/i.test(text)) die("AMFI answered without the NAVAll header — not the file");
  return text;
}

/** ISIN → the scheme's published record. Both ISIN columns are indexed. */
/**
 * `Open Ended Schemes(Hybrid Scheme - Arbitrage Fund)` → the text in the
 * parentheses. Anchored on the three scheme TYPES NAVAll groups by, so an AMC's
 * own name — `IL&FS Mutual Fund (IDF)` also carries parentheses — is never
 * mistaken for a category. Measured on the file: 104 headings, all three types.
 */
const CATEGORY_HEADING = /^\s*(?:Open Ended|Close Ended|Interval Fund)[^(]*\((.*)\)\s*$/;
/** `Hybrid Scheme - Arbitrage Fund` → `Arbitrage Fund`: SEBI's own category name. */
const sebiOf = (c) => {
  if (!c) return null;
  const i = c.indexOf(" - ");
  return (i < 0 ? c : c.slice(i + 3)).trim() || null;
};

function indexByIsin(text) {
  const by = new Map();
  let rows = 0;
  let category = null;
  for (const line of text.split(/\r?\n/)) {
    const head = CATEGORY_HEADING.exec(line);
    if (head) { category = head[1].replace(/\s+/g, " ").trim(); continue; }
    const f = line.split(";");
    if (f.length < 8) continue;                       // an AMC name or a blank, not a row
    const nav = Number(f[6]);
    const date = isoDate(f[7]);
    if (!Number.isFinite(nav) || !date) continue;     // "N.A." on a suspended scheme
    rows += 1;
    const rec = { schemecode: f[0].trim(), scheme: f[3].trim(), plan: f[4].trim(),
      option: f[5].trim(), nav, date, category, sebiCategory: sebiOf(category) };
    for (const col of [f[1], f[2]]) {
      const isin = col?.trim();
      if (isin && isin !== "-") by.set(isin, rec);
    }
  }
  return { by, rows };
}

// ── what the last run held, for the day change and for idempotence ──────────
function previous() {
  if (!existsSync(OUT)) return new Map();
  const src = readFileSync(OUT, "utf8");
  const arr = bookArray(src, "BOOK_FUND_NAVS");
  return new Map((arr ?? []).map((e) => [e.securityKey, e]));
}

function main() {
  return fetchNavAll().then((text) => {
    const { by, rows } = indexByIsin(text);
    const prev = previous();
    const out = [];
    const skipped = [];

    for (const w of [...wanted.values()].sort((a, b) => a.key.localeCompare(b.key))) {
      const bookIsin = w.bookIsin;
      const lt = ltIsin.get(w.key) ?? null;
      // BOTH TIERS MUST AGREE WHERE BOTH ANSWER. A disagreement means one of
      // them is about a different security, and neither may win silently.
      if (bookIsin && lt && bookIsin !== lt) {
        skipped.push({ ...w, why: `the statement's ISIN ${bookIsin} and the look-through's ${lt} disagree, so neither is used` });
        continue;
      }
      const isin = bookIsin ?? lt;
      if (!isin) continue;                            // not identifiable; silently not a fund we can reach
      const rec = by.get(isin);
      if (!rec) {
        // Only worth naming where the book thinks this is a fund at all — or
        // where a depository reported units a reader would expect to see valued.
        if (w.assetClass === "Mutual Fund" || w.assetClass === "ETF" || w.from === "depository") {
          skipped.push({ ...w, isin, why: `ISIN ${isin} is not in AMFI's published NAV file` });
        }
        continue;
      }

      /**
       * THE BASIS CHECK. Struck against the book's own mark for this holding —
       * the widest one where several statements disagree, so a scheme is
       * refused only when it is out of range on EVERY mark the book carries.
       */
      const mark = w.marks.length ? w.marks.reduce((a, b) => Math.max(a, b), -Infinity) : null;
      const lo = w.marks.length ? w.marks.reduce((a, b) => Math.min(a, b), Infinity) : null;
      const ratios = w.marks.map((m) => rec.nav / m);
      /**
       * A DEPOSITORY-ONLY UNIT HAS NO MARK TO CHECK AGAINST, so its witness is
       * the instrument: an open-ended mutual fund's units do not split, and the
       * share-count break this check exists for is an ETF's. See the header.
       */
      const isEtf = /\bETFs?\b/i.test(rec.category ?? "");
      const depositoryUsable = w.from === "depository" && ratios.length === 0 && rec.category != null && !isEtf;
      const usable = depositoryUsable || (ratios.length > 0 && ratios.some((r) => r >= BASIS_MIN && r <= BASIS_MAX));
      const why = usable ? null
        : ratios.length === 0
          ? (w.from === "depository"
            ? `no statement marks these units and AMFI files the scheme as ${rec.category ? `"${rec.category}"` : "no category"}; an ETF's units can split, so without a mark there is nothing to show the depository's count and this NAV are the same unit`
            : "no statement in this book marks this holding per unit, so there is nothing to check the NAV's basis against")
          : `the published NAV of ${rec.nav} against this book's own mark of ${lo === mark ? mark : `${lo}–${mark}`} is a factor of ${(1 / Math.max(...ratios)).toFixed(1)}, which is a share-count break rather than market movement — the units and the NAV are not the same unit`;

      const before = prev.get(w.key);
      // The previous NAV is whatever THIS FILE held on an earlier date — the
      // source publishes one day, so the change accumulates here or not at all.
      const carry = before && before.date && before.date !== rec.date
        ? { prev: before.nav, prevDate: before.date }
        : before && before.prev != null && before.date === rec.date
          ? { prev: before.prev, prevDate: before.prevDate }
          : {};
      out.push({
        securityKey: w.key,
        security: w.name,
        isin,
        isinFrom: bookIsin ? "statement" : "look-through",
        from: w.from,
        schemecode: rec.schemecode,
        scheme: rec.scheme,
        plan: rec.plan,
        option: rec.option,
        category: rec.category,
        sebiCategory: rec.sebiCategory,
        nav: rec.nav,
        date: rec.date,
        ...carry,
        changePct: carry.prev != null && carry.prev !== 0
          ? Number((((rec.nav - carry.prev) / carry.prev) * 100).toFixed(6)) : null,
        usableForValue: usable,
        notUsableReason: why,
      });
    }

    const body = `${HEADER}
export interface FundNav {
  securityKey: string;
  security: string;
  /** The identifier the join was made on — exact, never a name match. */
  isin: string;
  /** Which tier supplied it: the family's own statement, or the look-through. */
  isinFrom: "statement" | "look-through";
  /**
   * What put this security in the table: a position the BOOK carries, or a
   * balance a DEPOSITORY reports for an account that sent no holding statement.
   * The second has no statement mark anywhere — see the builder's header.
   */
  from: "book" | "depository";
  schemecode: string;
  scheme: string;
  plan: string;
  option: string;
  /** AMFI's heading for the scheme, verbatim — SEBI's category, e.g. "Hybrid Scheme - Arbitrage Fund". */
  category: string | null;
  /** The category name alone — the part after the first " - ", e.g. "Arbitrage Fund". */
  sebiCategory: string | null;
  /** The NAV AMFI published, verbatim. */
  nav: number;
  /** Its own publication date — NOT the date the book's statements were drawn. */
  date: string;
  /** The NAV this file held on an earlier date, so a day change can be struck. */
  prev?: number;
  prevDate?: string;
  /** Null until this file has held two different dates — never a zero. */
  changePct: number | null;
  /**
   * Whether \`quantity × nav\` is a figure this book may publish. False where the
   * units and the NAV are not the same unit — see the builder's header.
   */
  usableForValue: boolean;
  /** Required whenever \`usableForValue\` is false. */
  notUsableReason: string | null;
}

export const BOOK_FUND_NAVS: FundNav[] = ${JSON.stringify(out, null, 1)};

/** The newest publication date across every scheme above. */
export const FUND_NAV_AS_OF = ${JSON.stringify(out.reduce((a, e) => (e.date > a ? e.date : a), ""))};
`;

    const usable = out.filter((e) => e.usableForValue);
    const doc = `# Fund NAVs — what is priced daily, and what is not

Generated by \`npm run build-fund-navs\`. **Never hand-edited**; the builder is
idempotent and \`--check\` writes nothing.

Source: AMFI's own published file, \`${NAVALL}\`, joined to this book **on the
ISIN** and never on a name. ${rows.toLocaleString("en-IN")} scheme rows read.

| | |
| --- | ---: |
| Schemes priced | **${usable.length}** |
| …of which identified by the family's own statement | ${usable.filter((e) => e.isinFrom === "statement").length} |
| …by the look-through's resolved ISIN | ${usable.filter((e) => e.isinFrom === "look-through").length} |
| Resolved but **not usable to value a holding** | ${out.length - usable.length} |
| Named below and not resolved | ${skipped.length} |
| Newest published date | ${out.reduce((a, e) => (e.date > a ? e.date : a), "") || "—"} |

## Priced

| Security | ISIN | via | SEBI category | NAV | Date | Day |
| --- | --- | --- | --- | ---: | --- | ---: |
${usable.filter((e) => e.from === "book").map((e) => `| ${e.security} | \`${e.isin}\` | ${e.isinFrom} | ${e.sebiCategory ?? "—"} | ${e.nav} | ${e.date} | ${e.changePct == null ? "—" : `${e.changePct >= 0 ? "+" : ""}${e.changePct.toFixed(2)}%`} |`).join("\n") || "| — | | | | | | |"}

## Priced from a depository's own units

These are balances a demat account's TRANSACTION statement reports at its close,
for an account that sent no holding statement — so no statement marks them and
the book carries none of them as a position. They are priced here so a reader
can see what they are worth. Which of them the dashboard SHOWS is its own cash
rule's decision (\`CASH_EQUIVALENT_KEYS\` in \`src/lib/analytics.ts\`), not this
table's.

| Security | ISIN | SEBI category | NAV | Date |
| --- | --- | --- | ---: | --- |
${usable.filter((e) => e.from === "depository").map((e) => `| ${e.security} | \`${e.isin}\` | ${e.sebiCategory ?? "—"} | ${e.nav} | ${e.date} |`).join("\n") || "| — | | | | |"}

## Resolved, and NOT used to value a holding

A NAV is shown for these; a holding value is not built on it. Each names why.

${out.filter((e) => !e.usableForValue).map((e) => `- **${e.security}** (\`${e.isin}\`) — NAV ${e.nav} on ${e.date}. ${e.notUsableReason}`).join("\n") || "_None._"}

## Not resolved

${skipped.map((e) => `- **${e.name}** — ${e.why}`).join("\n") || "_None._"}
`;

    const prevBody = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    const prevDoc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
    const changed = prevBody !== body || prevDoc !== doc;

    if (CHECK) {
      console.log(changed ? "build-fund-navs --check: WOULD CHANGE" : "build-fund-navs --check: no change");
      process.exit(changed ? 1 : 0);
    }
    if (changed) { writeFileSync(OUT, body); writeFileSync(DOC, doc); }
    console.log(`build-fund-navs: ${usable.length} priced, ${out.length - usable.length} resolved-not-usable, ${skipped.length} unresolved${changed ? "" : " (no change)"}`);
  });
}

const HEADER = `// GENERATED by \`npm run build-fund-navs\` — do not edit by hand.
//
// AMFI's own published daily NAV, joined to this book ON THE ISIN. This is a
// PRICE SOURCE read at display time, exactly as a live quote is: it may move
// market value, day change, unrealised P&L and return on cost, and it may never
// touch quantity, cost basis, realised gains, dividends or any dated cash flow.
//
// It is NOT part of the book. \`glowData.ts\` is generated from \`source/\` and
// regenerates byte-identically; a fetched price may never enter it.
`;

main().catch((e) => die(e?.message ?? String(e)));
