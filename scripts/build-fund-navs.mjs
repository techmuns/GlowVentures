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
    key: p.securityKey, name: p.security, bookIsin: null, marks: [], assetClass: p.assetClass };
  if (p.isin && !cur.bookIsin) cur.bookIsin = p.isin;
  if (typeof p.currentPrice === "number" && Number.isFinite(p.currentPrice)) cur.marks.push(p.currentPrice);
  wanted.set(p.securityKey, cur);
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
function indexByIsin(text) {
  const by = new Map();
  let rows = 0;
  for (const line of text.split(/\r?\n/)) {
    const f = line.split(";");
    if (f.length < 8) continue;                       // a section heading, not a row
    const nav = Number(f[6]);
    const date = isoDate(f[7]);
    if (!Number.isFinite(nav) || !date) continue;     // "N.A." on a suspended scheme
    rows += 1;
    const rec = { schemecode: f[0].trim(), scheme: f[3].trim(), plan: f[4].trim(),
      option: f[5].trim(), nav, date };
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
        // Only worth naming where the book thinks this is a fund at all.
        if (w.assetClass === "Mutual Fund" || w.assetClass === "ETF") {
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
      const usable = ratios.length === 0
        ? false
        : ratios.some((r) => r >= BASIS_MIN && r <= BASIS_MAX);
      const why = ratios.length === 0
        ? "no statement in this book marks this holding per unit, so there is nothing to check the NAV's basis against"
        : usable ? null
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
        schemecode: rec.schemecode,
        scheme: rec.scheme,
        plan: rec.plan,
        option: rec.option,
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
  schemecode: string;
  scheme: string;
  plan: string;
  option: string;
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

| Security | ISIN | via | NAV | Date | Day |
| --- | --- | --- | ---: | --- | ---: |
${usable.map((e) => `| ${e.security} | \`${e.isin}\` | ${e.isinFrom} | ${e.nav} | ${e.date} | ${e.changePct == null ? "—" : `${e.changePct >= 0 ? "+" : ""}${e.changePct.toFixed(2)}%`} |`).join("\n") || "| — | | | | | |"}

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
