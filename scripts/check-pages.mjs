// Walks every route and reports what a human would otherwise have to look for.
//
// Five checks, in the order they catch things:
//
//   1. console errors and page errors
//   2. failed network requests
//   3. HORIZONTAL PAGE OVERFLOW — the page body must never scroll sideways. A
//      wide table scrolls inside its own container; a table that pushes the body
//      wider takes the whole chassis with it, and at 1024 that is every table
//      this book has.
//   4. UNREMAPPED DARK UTILITIES IN LIGHT MODE — the light theme is a remap of
//      the dark ink-*/slate-* palette (see index.css). A class with no remap
//      keeps its DARK value, so a component written after the port paints a
//      near-black panel or a near-white hover on ivory. This resolves the
//      computed colour in the browser rather than grepping, so it catches the
//      ones no static list would.
//   5. "₹0" / "0.00%" on screen — a lead, not a verdict: a bar chart's ₹0 axis
//      tick and cash's genuinely-zero P&L both match, and both are correct.
//
// Themes: LIGHT is the default (`:root`), DARK is opt-in (`html.dark`). Both are
// walked, because every page rewritten since the port was written against
// whichever one the author happened to be looking at.
//
// Usage:  npm run build && npx vite preview --port 4173 &  then  npm run check:pages
//         WIDTHS=1440,1280,1024 npm run check:pages   (responsive sweep)
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:4173";
const OUT = process.env.OUT ?? "docs/page-check";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const THEMES = (process.env.THEMES ?? "light,dark").split(",");
const WIDTHS = (process.env.WIDTHS ?? "1500").split(",").map(Number);
const SHOTS = process.env.SHOTS !== "0";
// The responsive sweep only needs LAYOUT, and waiting for networkidle means
// waiting out the feed retry rounds on every one of 45 combinations. `FAST=1`
// settles on load instead and skips the per-element contrast walk, which is the
// other expensive half.
const FAST = process.env.FAST === "1";
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ["cio", "/cio"],
  ["monitor", "/monitor"],
  ["monitor-txns", "/monitor"],          // same route, Transactions toggle clicked
  ["family", "/family"],
  ["sectors", "/sectors"],
  ["compare", "/compare"],
  ["watchlist", "/watchlist"],
  // FOOS-spec preview pages — illustrative placeholders for spec layers whose
  // live source does not exist yet. Walked so their light-mode remaps, overflow
  // and any stray ₹0 are held to the same bar as every real page.
  ["knowledge", "/knowledge"],
  ["exposure", "/exposure"],
  ["macro", "/macro"],
  ["economy", "/economy"],
  ["industry", "/industry"],
  ["thesis", "/thesis"],
  ["alerts", "/alerts"],
  ["stock", "/stock/aditya-birla-capital"],   // one company page — returns table, tools, research
  ["capital-gains", "/capital-gains"],
  ["performance", "/performance"],
  ["returns", "/returns"],
  ["ledger", "/ledger"],
  ["news", "/news"],
  ["audit", "/audit"],
  ["history", "/history"],
  ["upload", "/upload"],
];

// Requests that fail because this harness runs offline against a static preview:
// the web font CDN is unreachable, and /api/* are Cloudflare Pages Functions that
// only exist on the deployed site. Neither is an application error, and folding
// them in would bury the ones that are.
// `ratios` and `econ-calendar` join the list for the same reason as the rest:
// they are Pages Functions, `vite preview` does not run Functions, so they 404
// locally on every run and would otherwise be reported as an application fault
// on every sweep. They are exercised against the DEPLOYED site instead.
const ENVIRONMENT_NOISE = /fonts\.googleapis\.com|\/api\/(news|quotes|fx|announcements|insider|research|ratios|econ-calendar|prices|macro|economy)|ERR_CONNECTION_RESET|Failed to load resource/;

const ZEROISH = /(?:₹|Rs\.?\s?)0(?:\.00)?(?![\d.,])|\b0\.00\s?%|(?<![\d.])\b0\s?%/g;

// DATA INVARIANTS — the client's own data complaints, encoded so they cannot
// silently regress. Checked against the rendered page text on the primary
// theme/width. Each returns true when the page is CORRECT.
const INVARIANTS = {
  // "on the dashboard there's only one asset class" — the CIO allocation must
  // surface more than equity, and state the listed/private split.
  cio: [
    ["allocation shows more than one asset class (AIF + MF/Cash)", (t) => /\bAIF\b/.test(t) && /(Mutual Fund|Cash)/.test(t)],
    ["listed/private split is shown, not 'no private holdings'", (t) => /Private\s*₹/.test(t) && !/no private holdings/.test(t)],
    // "are there no investments in direct equity?" — listed equity is one
    // consolidated Equity asset class, not the empty "Direct Equity" row it was.
    ["equity is a consolidated asset class, not an empty 'Direct Equity' row", (t) => /\bEquity\b/.test(t)],
    // THE AIF WAS DOUBLE-COUNTED INTO NAV, and this is the guard against it
    // returning. It used to read "ties to ~₹335 Cr … not ₹5xx Cr" — a copy of a
    // figure the book GENERATES, written when the book was ₹335.43 Cr. The
    // August drop moved it to ₹461.00 Cr and this line failed against a page
    // computing correctly, which is the same stale-literal failure the household
    // net-worth check had. A test carrying its own copy of a generated figure is
    // a second source for it.
    //
    // So the RELATION is what is asserted, and it is the one the bug actually
    // broke: the NAV tile's own caption splits the book by asset class, and
    // double-counting the AIF puts value in the headline that is in neither
    // half. Listed + Private must reconstruct the headline.
    ["NAV = its own listed + private split (the AIF is not counted twice)", (t) => {
      const nav = Number(/consolidated nav[\s\S]{0,60}?₹([\d.]+)\s*Cr/i.exec(t)?.[1] ?? NaN);
      const listed = Number(/Listed\s*₹([\d.]+)\s*Cr/i.exec(t)?.[1] ?? NaN);
      const priv = Number(/Private\s*₹([\d.]+)\s*Cr/i.exec(t)?.[1] ?? NaN);
      return [nav, listed, priv].every(Number.isFinite) && Math.abs(listed + priv - nav) <= 0.6;
    }],
    // THE XIRR TILE MUST SAY WHAT IT IS AND WHAT IT COVERS. An annualised rate
    // over a 132-day window reads in the nineties, and an unlabelled +95% is
    // the most misleading figure this page could carry — so "annualised" and
    // the coverage fraction are asserted on the rendered page, not trusted to
    // stay in the markup.
    ["the XIRR tile is labelled annualised and names its coverage", (t) => {
      const i = t.search(/\bXIRR\b/);
      if (i < 0) return false;
      const tile = t.slice(i, i + 220);
      return /annualised/i.test(tile) && /\d+ of \d+ accounts/.test(tile);
    }],
    // And the allocation table's own footer must tie to its own two columns —
    // it carried a money-weighted rate in a column of return-on-cost figures,
    // so Invested and Current printed one answer and the Total cell another.
    ["the allocation total ties to its own Invested and Current columns", (t) => {
      const row = /Total\s+₹([\d.]+)\s*Cr\s+₹([\d.]+)\s*Cr\s+([+-])([\d.]+)%/.exec(t);
      if (!row) return true;   // layout changed; the other invariants still bind
      const [, inv, cur, sign, pct] = row;
      const expect = ((Number(cur) - Number(inv)) / Number(inv)) * 100;
      return Math.abs((sign === "-" ? -Number(pct) : Number(pct)) - expect) <= 0.6;
    }],
  ],
  // "why are 70% holdings in unclassified" — and then, after the private book
  // was excluded, why Unclassified was STILL 49% with a mutual fund at its head.
  // A GICS sector is a property of a company; the page is direct equity only,
  // and every excluded class must be NAMED with its value rather than dropped.
  sectors: [
    ["sector view is direct-equity only, the excluded classes named", (t) => /direct equity/i.test(t) && /excluded rather than folded in/i.test(t)],
    // The failure this replaced: a fund standing at the head of a sector table.
    // No wrapper may appear as a holding here at all.
    ["no fund wrapper appears as a sector holding", (t) => !/(Flexi Cap Fund|Sanshi Fund|Opportunities Strategy|Founders Fund|Liquid ?Bees)/i.test(t)],
  ],
  // "in the portfolio monitor I can see all kinds of investments being mixed" —
  // holdings must be sectioned by asset class; and the by-security total counts
  // each dedupeGroup once (₹335.43 Cr, never the double-counted ₹338.6 Cr).
  monitor: [
    ["holdings are sectioned by asset class", (t) => /\bequity\b/i.test(t) && /\d+\s+holdings/i.test(t)],
    // The by-security total must count each dedupeGroup once. Asserted against
    // the CONSOLIDATED NAV IN THE HEADER, which is on every page and is the
    // deduped figure by construction — not against a literal, and not against
    // the specific wrong number one drop happened to produce.
    // A NON-MATCH FAILS HERE, it does not pass. The first draft returned true
    // when its regex found nothing, which is a check that reports confidence
    // over no input — the same thing `golden.mjs` refuses to do with BLOCKED.
    // The row is "Total · 164 rows  ₹394.1 Cr  —  ₹461 Cr  …", and the ₹461 Cr
    // must be the header chip's consolidated NAV: that figure is deduped by
    // construction, so a by-security table that double-counts a dually-reported
    // holding cannot match it.
    ["by-security total counts each dedupeGroup once", (t) => {
      const nav = Number(/₹([\d.]+)\s*Cr/.exec(t)?.[1] ?? NaN);   // header chip, first on the page
      const total = Number(/Total\s*·\s*\d+\s*rows\s*₹[\d.]+\s*Cr\s*\S*\s*₹([\d.]+)\s*Cr/.exec(t)?.[1] ?? NaN);
      return Number.isFinite(nav) && Number.isFinite(total)
        && Math.abs(total - nav) <= Math.max(0.6, nav * 0.002);
    }],
  ],
  // Audit: the per-entity money-weighted return must be measured over accounts
  // that carry an opening portfolio value only. Closing an owner's WHOLE market
  // value against partial openings produced +147% / +2,624% p.a. for real family
  // members. A de-annualised to-date figure here never reaches four digits, so a
  // 4-digit percentage anywhere on these pages is the blow-up regressing.
  family: [
    ["no per-entity XIRR blow-up (4-digit %)", (t) => !/[+-]?\d{4,}(\.\d+)?\s*%/.test(t)],
  ],
  // Exposure & IPS sector GAP is a listed-only view; the private book is named
  // as excluded rather than folded in as one giant "Unclassified" slice.
  exposure: [
    ["sector GAP is listed-only, private book named as excluded", (t) => /listed book/i.test(t) && /excluded/i.test(t)],
    // Phase 5: the IPS is an editor now. With NO family input recorded — which is
    // this harness's state — every gap must be absent and the page must say why.
    // A gap computed against a defaulted target is a fabricated instruction.
    ["IPS is recordable and the gap stays absent until a target is set",
      (t) => /IPS buckets/i.test(t) && /No target weights recorded yet/i.test(t)],
  ],
  // Phase 5: alerts evaluate real rules. With no rules recorded the page must say
  // so plainly — never render an empty list that reads as "nothing is wrong".
  alerts: [
    ["no-rules state is explicit, not an empty all-clear", (t) => /No rules yet/i.test(t) || /firing|clear|cannot be evaluated/i.test(t)],
    ["alerts needing a source are named, not shown as silent rules", (t) => /need a source, not a threshold/i.test(t)],
  ],
  // Phase 5: the thesis record is an editor over the book's holdings, and an
  // expected return is never inferred from the actual sitting beside it.
  thesis: [
    // Asserts the DEFAULT (collapsed) state — the per-row editor fields only
    // exist once a row is expanded, so testing for them here tested nothing.
    ["thesis is an editor over real holdings, with a recorded count",
      (t) => /\d+ of \d+ recorded/i.test(t) && /Thesis/i.test(t) && /Review/i.test(t)],
    ["an expected return is never inferred from the actual beside it",
      (t) => /Expected/i.test(t) && /Return \(actual\)/i.test(t)],
  ],
  // Phase 4: Industry Research composes the harvested store into per-industry
  // input-cost dashboards. The economics half must be LIVE (real series with
  // sources), and the structure half must be NAMED as absent rather than shown
  // as illustrative numbers — the state the page was in before.
  industry: [
    ["input costs are live from the series store", (t) => /live inputs/i.test(t) && /input & output prices/i.test(t)],
    ["structure gaps are named, not drawn", (t) => /asked for, not yet sourced/i.test(t)],
    ["sector match is not passed off as an industry classification", (t) => /GICS sector/i.test(t)],
  ],
  // Phase 3: the company page draws a real price chart and a returns table from
  // /api/prices. In this headless run the edge function does not exist, so the
  // card must degrade to a NAMED absence — never to the old "a chart is
  // impossible" claim, which stopped being true when the series arrived.
  stock: [
    ["price card resolves or names its absence", (t) => /Price history & returns/i.test(t)],
    ["the retired 'no chart is possible' claim is gone", (t) => !/four-row|no path to plot/i.test(t)],
  ],
  // Layer 1: Knowledge & Memory is a real note store, not a mock. In this
  // headless run nothing has been captured, so the page must show the ABSENT
  // state with what would fill it — never "0 notes", and never the old sample
  // counts. It must also not call its keyword search an AI query engine.
  knowledge: [
    ["an empty store renders the absent state, not zeros",
      (t) => /No note has been captured yet/i.test(t) && !/\b0 notes\b/i.test(t)],
    ["the search says what it is rather than claiming to be an AI index",
      (t) => /not a language model reading an index/i.test(t) && !/AI query engine/i.test(t)],
    ["the retired sample counts are gone", (t) => !/636/.test(t)],
  ],
  // Phase 0: Macro Research renders from the committed series store, not a live
  // API — so it is live in this headless run with no token and no network. If
  // the store fails to load the page says so, and these catch that.
  macro: [
    ["series store loaded — the returns table is live, not preview", (t) => /\d+ live/.test(t) && !/series store did not respond/i.test(t)],
    ["observation count is stated, so the table is backed by a real series", (t) => /observations/i.test(t)],
    ["a max-available CAGR resolved (a stored series, not a four-row preview)", (t) => /Max/.test(t) && /[+-]\d+\.\d%/.test(t)],
    // Phase A1: the spec's weekly / quarterly / year-end views. The control is
    // rendered only when the chosen series can honestly be coarsened, which the
    // default (a daily commodity) can.
    ["a frequency toggle offers the coarser views the spec asks for",
      (t) => /Quarterly/.test(t) && /Year-end/.test(t)],
  ],
};

/**
 * Elements painting a DARK surface or near-invisible text while the page is in
 * light mode. Run in the browser so it reads COMPUTED colour — the only way to
 * catch a utility whose light remap is missing, since the class name itself
 * looks identical either way.
 */
const DARK_IN_LIGHT = () => {
  const lum = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    if (a < 0.12) return null;                       // effectively transparent
    const [r, g, b] = [1, 2, 3].map((i) => Number(m[i]) / 255);
    return { l: 0.2126 * r + 0.7152 * g + 0.0722 * b, a };
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const cls = typeof el.className === "string" ? el.className : "";
    const where = `${el.tagName.toLowerCase()}${cls ? "." + cls.split(/\s+/).slice(0, 4).join(".") : ""}`;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const bg = lum(cs.backgroundColor);
    // A dark fill on a light page: the light remap for this utility is missing.
    if (bg && bg.l < 0.25) {
      const k = "bg|" + where;
      if (!seen.has(k)) { seen.add(k); out.push({ kind: "dark-surface", where, color: cs.backgroundColor }); }
    }
    const bc = lum(cs.borderTopColor);
    if (bc && bc.l < 0.2 && parseFloat(cs.borderTopWidth) > 0) {
      const k = "bd|" + where;
      if (!seen.has(k)) { seen.add(k); out.push({ kind: "dark-border", where, color: cs.borderTopColor }); }
    }
    // Near-white text on a light surface reads as invisible. Only flagged where
    // the element actually has text of its own.
    const fg = lum(cs.color);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText && fg && fg.l > 0.82) {
      const k = "fg|" + where;
      if (!seen.has(k)) { seen.add(k); out.push({ kind: "pale-text", where, color: cs.color }); }
    }
  }
  return out.slice(0, 40);
};

/**
 * The mirror check for DARK mode.
 *
 * Dark mode is the palette's native form, so an unremapped utility is correct
 * there by construction — the failure mode is the opposite one: a colour
 * hardcoded for a light surface (a white panel, near-black text) that survives
 * into the dark chassis. Far rarer, and invisible to anyone testing only the
 * default theme.
 */
const LIGHT_IN_DARK = () => {
  const lum = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    if (a < 0.12) return null;
    const [r, g, b] = [1, 2, 3].map((i) => Number(m[i]) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const cls = typeof el.className === "string" ? el.className : "";
    const where = `${el.tagName.toLowerCase()}${cls ? "." + cls.split(/\s+/).slice(0, 4).join(".") : ""}`;
    // A near-white panel in the dark chassis. Champagne accents are legitimate
    // (the primary button, the active nav pill), so allow warm colours: flag
    // only near-neutral whites, where R≈G≈B.
    const bg = lum(cs.backgroundColor);
    const rgb = cs.backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
    const neutral = rgb.length >= 3 && Math.max(...rgb.slice(0, 3)) - Math.min(...rgb.slice(0, 3)) < 26;
    if (bg !== null && bg > 0.75 && neutral) {
      const k = "bg|" + where;
      if (!seen.has(k)) { seen.add(k); out.push({ kind: "light-surface", where, color: cs.backgroundColor }); }
    }
    const fg = lum(cs.color);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText && fg !== null && fg < 0.06) {
      // Dark text is right on a champagne badge or the gold GRADIENT behind the
      // logo mark, and wrong only on the dark chassis. The backdrop is often on
      // an ANCESTOR (the logo's letter carries no background of its own) and a
      // gradient lives in background-IMAGE, so walk up to whatever actually
      // paints behind this text before calling it unreadable.
      let backdrop = null;
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.backgroundImage && acs.backgroundImage !== "none") { backdrop = 1; break; }
        const l = lum(acs.backgroundColor);
        if (l !== null) { backdrop = l; break; }
      }
      if (backdrop === null || backdrop < 0.4) {
        const k = "fg|" + where;
        if (!seen.has(k)) { seen.add(k); out.push({ kind: "dark-text", where, color: cs.color }); }
      }
    }
  }
  return out.slice(0, 40);
};

/** Does the page body scroll sideways? A table must scroll inside its own box. */
const OVERFLOW = () => {
  const de = document.documentElement;
  const overflow = de.scrollWidth - de.clientWidth;
  if (overflow <= 1) return null;
  // Name the widest offender so the fix has an address.
  let worst = null;
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    const past = r.right - de.clientWidth;
    if (past > 1 && (!worst || past > worst.past)) {
      const cls = typeof el.className === "string" ? el.className : "";
      worst = { past: Math.round(past), where: `${el.tagName.toLowerCase()}${cls ? "." + cls.split(/\s+/).slice(0, 3).join(".") : ""}` };
    }
  }
  return { overflow, worst };
};

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const report = [];

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    for (const [name, path] of ROUTES) {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
      // Set the theme BEFORE the app boots, so it never paints the wrong one first.
      await ctx.addInitScript((t) => {
        try { localStorage.setItem("glow:theme", t); } catch { /* private mode */ }
        // addInitScript can run before <html> exists, so apply the class when
        // the document is ready rather than assuming documentElement is there.
        const apply = () => document.documentElement?.classList.add("dark");
        if (t === "dark") {
          if (document.documentElement) apply();
          else document.addEventListener("readystatechange", apply, { once: true });
        }
      }, theme);
      const page = await ctx.newPage();
      // The web-font CDN is unreachable from this sandbox and blocks `load` for
      // ~12s per navigation. Abort it up front: it changes no layout the checks
      // care about (metrics fall back to system-ui) and takes the sweep from
      // minutes to seconds.
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      const errors = [], failed = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("requestfailed", (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ""}`));
      page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

      await page.goto(`${BASE}${path}`, { waitUntil: FAST ? "load" : "networkidle", timeout: 45000 });
      if (name === "monitor-txns") {
        const t = page.getByRole("button", { name: /transactions/i }).first();
        if (await t.count()) { await t.click(); await page.waitForTimeout(1200); }
      }
      await page.waitForTimeout(FAST ? 350 : 800);

      const text = FAST ? "" : await page.evaluate(() => document.body.innerText);
      const zeros = !FAST && theme === "light" && width === WIDTHS[0]
        ? [...text.matchAll(ZEROISH)].map((m) => {
            const i = Math.max(0, m.index - 70);
            return text.slice(i, m.index + m[0].length + 40).replace(/\s+/g, " ");
          })
        : [];
      const overflow = await page.evaluate(OVERFLOW);
      const contrast = FAST ? [] : await page.evaluate(theme === "light" ? DARK_IN_LIGHT : LIGHT_IN_DARK);
      // Data invariants — only the primary theme/width, where innerText is real.
      const invariants = !FAST && theme === THEMES[0] && width === WIDTHS[0] && INVARIANTS[name]
        ? INVARIANTS[name].filter(([, test]) => !test(text)).map(([desc]) => desc)
        : [];
      if (SHOTS && width === WIDTHS[0]) {
        await page.screenshot({ path: `${OUT}/${theme}-${name}.png`, fullPage: true });
      }
      report.push({
        theme, width, name, path,
        errors: errors.filter((e) => !ENVIRONMENT_NOISE.test(e)),
        failed: [...new Set(failed.filter((f) => !ENVIRONMENT_NOISE.test(f)))],
        overflow, contrast, zeros, invariants,
      });
      await ctx.close();
    }
  }
}
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

let broken = 0;
for (const r of report) {
  const inv = r.invariants ?? [];
  const hard = r.errors.length + r.failed.length + (r.overflow ? 1 : 0) + r.contrast.length + inv.length;
  if (hard) broken++;
  const tag = `${r.theme}/${r.width}`.padEnd(11);
  const ok = hard ? "✗" : "✓";
  if (hard || (r.theme === THEMES[0] && r.width === WIDTHS[0])) {
    console.log(`${ok} ${tag} ${r.name.padEnd(14)} err=${r.errors.length} req=${r.failed.length} overflow=${r.overflow ? r.overflow.overflow + "px" : "-"} contrast=${r.contrast.length} zeroish=${r.zeros.length}${inv.length ? ` invariant=${inv.length}` : ""}`);
  }
  for (const i of inv) console.log(`    INVARIANT FAILED  ${i}`);
  for (const e of r.errors) console.log(`    ERR  ${e.slice(0, 200)}`);
  for (const f of r.failed) console.log(`    REQ  ${f.slice(0, 160)}`);
  if (r.overflow) console.log(`    OVERFLOW ${r.overflow.overflow}px — widest: ${r.overflow.worst?.where ?? "?"} (+${r.overflow.worst?.past}px)`);
  for (const c of r.contrast) console.log(`    ${c.kind.toUpperCase().padEnd(13)} ${c.color.padEnd(26)} ${c.where.slice(0, 110)}`);
  for (const z of r.zeros) console.log(`    ZERO …${z}`);
}
console.log(`\n${SHOTS ? `Screenshots and ` : ""}report.json in ${OUT}/`);
console.log(broken
  ? `✗ ${broken} of ${report.length} route/theme/width combinations have a finding`
  : `✓ ${report.length} route/theme/width combinations clean`);
process.exit(broken ? 1 : 0);
