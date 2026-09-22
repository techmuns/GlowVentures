/**
 * Build `src/data/polycabLive.ts` — what the EXCHANGE and the statutory
 * disclosures say about the ring-fenced promoter holding, refreshed every day.
 *
 *   npm run build-polycab
 *   npm run build-polycab -- --check     write nothing, report the diff
 *
 * ── THE ASK ────────────────────────────────────────────────────────────────
 *
 *   *"Every single data point in the Polycab Page should be live and
 *    automatically updated everyday, there must be no placeholders. Daily fetch
 *    all such information for the Polycab promoter activity,
 *    dividend/split/bonus/pledge."*
 *
 * ── THE DISTINCTION THE WHOLE FILE TURNS ON ────────────────────────────────
 *
 * The Polycab page already answered a question completely and correctly, and it
 * is NOT the question this store answers. Those are two different facts and
 * conflating them would be the worst thing this change could do:
 *
 *   WHAT THIS DEMAT REPORTS      the ICICI NSDL `Statement of Holding` prints
 *                                ISIN, scrip name, account description, balance
 *                                and value — and no encumbrance column, no
 *                                income and no corporate action. No amount of
 *                                fetching changes what that document IS.
 *
 *   WHAT THE COMPANY DID         declared dividends, bonuses, splits, and the
 *                                promoter group's disclosed holding and
 *                                encumbrance. Public, statutory, dated, and
 *                                refreshed here every morning.
 *
 * A promoter-group pledge of 0.0% is a real measurement about the group this
 * holding belongs to. It is NOT a statement that THIS demat's balance is
 * unencumbered, and the page must never let the first stand in for the second —
 * which is why this store's fields are named for the group and the page renders
 * them in their own card rather than filling the statement card's dashes.
 *
 * What the store DOES retire is one absence that turns out to be measurable:
 * the page said a bonus or split here was "unreported rather than confirmed",
 * and the exchange's own complete record since listing carries EIGHT corporate
 * actions, every one of them a dividend and NOT ONE a bonus, split or spin-off.
 * That is a MEASURED nil, which is strictly better than an absence, and it is
 * the reason `actionsComplete` is carried out of the fetch: a truncated response
 * and a company that never declared one look identical in the rows alone.
 *
 * ── THE IDENTITY GATE IS THE LICENCE FOR PUBLISHING ANY OF IT ──────────────
 *
 * The ISIN the exchange echoes must equal the ISIN the BOOK carries on the
 * ring-fenced holding — read out of `glowData.ts`, never typed here. A wrong
 * scrip code returns a complete, correct, well-formed answer about another
 * company, and there is nothing on screen to catch it by. Probing moneycontrol
 * during the same session returned exactly that: a page whose promoter holding
 * was 55.03% against Polycab's 61.5%. It was refused, and this gate is why that
 * refusal is mechanical rather than a matter of noticing.
 *
 * ── AND A SOURCE THAT FAILS KEEPS ITS LAST GOOD DATA ───────────────────────
 *
 * The harvester's rule, for the same reason: a fetch that throws leaves the
 * stored figure exactly as it was and records that it could not be refreshed,
 * so a bad morning at an upstream degrades to a dated figure rather than to a
 * blank card. There is no partial write and no empty overwrite.
 *
 * IT IS IDEMPOTENT. Nothing moved upstream → nothing is written and the tree
 * stays clean, which is what lets the nightly Action commit only on a real
 * change instead of churning the history daily.
 *
 * NOTHING HERE EVER REACHES `glowData.ts`. This module is generated beside the
 * book, read by ONE page, and is in no total, allocation, sector or NAV — the
 * same standing `BOOK_POLYCAB` itself has.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  BSE_API, BSE_SCRIP, NSE_SYMBOL, BROWSER_HEADERS,
  parseCorporateActions, parseQuote, parseIdentity, mergePaymentDates,
  parseTickertapeHoldings, parseScreenerPromoter, pageIdentity, quarterEndIso, quarterLabel,
} from "../shared/polycabSources.mjs";

const CHECK = process.argv.includes("--check");
const BOOK = "src/data/glowData.ts";
const OUT = "src/data/polycabLive.ts";
const REPORT = "docs/POLYCAB-LIVE.md";
const TIMEOUT_MS = 30000;

const SCREENER_URL = `https://www.screener.in/company/${NSE_SYMBOL}/consolidated/`;
const TICKERTAPE_URL = "https://www.tickertape.in/stocks/polycab-india-POLC";

const notes = [];
const note = (severity, rule, detail) => notes.push({ severity, rule, detail });

async function get(url, as = "json") {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    // `redirect: "manual"` on purpose: BSE answers a rejected request with a 302
    // to an HTML error page, which parses as neither JSON nor a failure unless
    // the redirect is refused. Following it turns a refusal into a silent empty.
    const r = await fetch(url, { headers: BROWSER_HEADERS, signal: ctl.signal, redirect: "manual" });
    if (r.status >= 300 && r.status < 400) throw new Error(`HTTP ${r.status} redirect (upstream refused the request)`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    if (as === "text") return text;
    try { return JSON.parse(text); }
    catch { throw new Error(`upstream answered ${text.length}b that is not JSON`); }
  } finally { clearTimeout(t); }
}

/** The ring-fenced holding, out of the generated book. Never typed here. */
function ringFenced() {
  const src = readFileSync(BOOK, "utf8");
  const i = src.indexOf("export const BOOK_POLYCAB");
  if (i < 0) return null;
  const s = src.indexOf("= [", i), e = src.indexOf("\n];", s);
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(src.slice(s + 2, e + 2)); } catch { return null; }
}

/** The previous generated module, so a failed source keeps its last good data. */
function stored() {
  if (!existsSync(OUT)) return null;
  const src = readFileSync(OUT, "utf8");
  const i = src.indexOf("export const POLYCAB_LIVE");
  if (i < 0) return null;
  const s = src.indexOf("= {", i), e = src.indexOf("\n};", s);
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(src.slice(s + 2, e + 2)); } catch { return null; }
}

async function main() {
  const fenced = ringFenced();
  if (!fenced?.length) {
    console.error(`${BOOK} carries no BOOK_POLYCAB holding — nothing to describe. Run build-book first.`);
    process.exit(1);
  }
  const bookIsin = String(fenced[0].isin || "").toUpperCase();
  const bookShares = fenced.reduce((a, p) => a + (typeof p.quantity === "number" ? p.quantity : 0), 0);
  if (!/^IN[EF][0-9A-Z]{9}$/.test(bookIsin)) {
    console.error(`The ring-fenced holding carries no ISIN (${bookIsin || "none"}); the identity gate cannot be struck.`);
    process.exit(1);
  }
  const prev = stored();
  const retrievedAt = new Date().toISOString();

  // ── IDENTITY, FIRST. Nothing else from BSE is read until this passes. ─────
  let identity = null;
  try {
    identity = parseIdentity(await get(`${BSE_API}/ComHeadernew/w?quotetype=EQ&scripcode=${BSE_SCRIP}&seriesid=`));
    if (!identity) throw new Error("the response carries no well-formed ISIN");
    if (identity.isin !== bookIsin) {
      throw new Error(`the exchange returns ${identity.isin} for scrip ${BSE_SCRIP}; the book's ring-fenced holding is ${bookIsin}`);
    }
  } catch (e) {
    note("fail", "identity", `BSE identity refused — ${e.message}. Nothing from the exchange is published this run.`);
    identity = null;
  }

  // ── THE QUOTE. Only where identity held. ─────────────────────────────────
  let quote = null;
  if (identity) {
    try {
      quote = parseQuote(await get(`${BSE_API}/getScripHeaderData/w?Debtflag=&scripcode=${BSE_SCRIP}&seriesid=`));
      if (!quote) throw new Error("no last-traded price in the response");
      // The derived change against the exchange's own printed one — a
      // `printed.*` CHECK, never a source (§4). A mismatch beyond the printing
      // precision means the two ends came from different sessions, which is the
      // defect `/api/indices` already cost this repo once.
      if (quote.change !== null && quote.printedChange !== null && Math.abs(quote.change - quote.printedChange) > 0.05) {
        note("warn", "quote-change", `derived change ${quote.change.toFixed(2)} against the exchange's printed ${quote.printedChange.toFixed(2)}`);
      }
    } catch (e) {
      note("fail", "quote", `the live quote did not refresh — ${e.message}`);
      quote = prev?.quote ?? null;
      if (quote) note("info", "quote", "the stored quote is kept; it carries its own session date.");
    }
  } else if (prev?.quote) quote = prev.quote;

  // ── CORPORATE ACTIONS — the whole record since listing. ──────────────────
  let actions = null, actionsComplete = false;
  if (identity) {
    try {
      const rows = await get(`${BSE_API}/DefaultData/w?ddlcategorys=E&ddlindustrys=&segment=0&strSearch=S&Fdate=&TDate=&Purposecode=&scripcode=${BSE_SCRIP}`);
      actions = parseCorporateActions(rows);
      if (!actions?.length) throw new Error("the exchange returned no corporate action at all");
      actionsComplete = true;
      // The payment date lives on a second, SHORTER endpoint and only ever
      // fills an empty field. Its failure costs a date, never a row.
      try {
        const ca = await get(`${BSE_API}/CorporateAction/w?scripcode=${BSE_SCRIP}`);
        actions = mergePaymentDates(actions, ca?.Table2 ?? []);
      } catch (e) { note("warn", "payment-dates", `payment dates did not refresh — ${e.message}`); }
    } catch (e) {
      note("fail", "corporate-actions", `the corporate-action record did not refresh — ${e.message}`);
      actions = prev?.corporateActions ?? null;
      actionsComplete = false;
      if (actions) note("info", "corporate-actions", "the stored record is kept, and is NOT republished as complete.");
    }
  } else if (prev?.corporateActions) { actions = prev.corporateActions; actionsComplete = false; }

  // ── PROMOTER HOLDING AND PLEDGE — two sources, compared. ─────────────────
  let tickertape = null, screener = null, pledgeGate = null;
  try {
    const html = await get(TICKERTAPE_URL, "text");
    pledgeGate = pageIdentity(html, bookIsin);
    if (pledgeGate !== "isin") {
      throw new Error(pledgeGate
        ? `the page names the scrip but not the ISIN ${bookIsin}; the pledge is not published on a weaker gate than the book's own identifier`
        : `the page names neither ${bookIsin} nor scrip ${BSE_SCRIP}`);
    }
    tickertape = parseTickertapeHoldings(html);
    if (!tickertape) throw new Error("the embedded shareholding record carries no quarter");
  } catch (e) { note("warn", "tickertape", `promoter holding and pledge did not refresh — ${e.message}`); }

  try {
    const html = await get(SCREENER_URL, "text");
    if (!pageIdentity(html, bookIsin)) throw new Error(`the page names neither ${bookIsin} nor scrip ${BSE_SCRIP} with symbol ${NSE_SYMBOL}`);
    screener = parseScreenerPromoter(html);
    if (!screener) throw new Error("no Promoters row found in the shareholding table");
  } catch (e) { note("warn", "screener", `the second promoter witness did not refresh — ${e.message}`); }

  /**
   * WHERE BOTH ANSWER THEY ARE COMPARED, AND A DISAGREEMENT PUBLISHES NEITHER.
   *
   * Screener prints two decimals and tickertape full precision, so they are
   * reconciled at 0.05pp — 61.46 against 61.461685 is the SAME disclosure read
   * twice, and 61.46 against 55.03 is two different companies, which is exactly
   * what the refused moneycontrol probe returned. `build-symbols`' rule: a second
   * witness makes the match STRICTER, never looser.
   *
   * THE HOLDING SURVIVES ON EITHER SOURCE ALONE. Requiring both would mean one
   * aggregator having a bad morning blanks a figure the other is still serving —
   * the "never empty a series you could not fetch" rule, one level up. What
   * requires both is AGREEMENT where both answer.
   *
   * THE PLEDGE HAS ONE WITNESS, and the store says so rather than implying two.
   * Screener prints no pledge row for this scrip — measured, and measured on two
   * heavily-pledged companies as well, so it is screener's layout rather than
   * this scrip's nil. A figure with one witness is not a figure with none: it is
   * published, its source is named on screen, and it is the reason the pledge
   * source is gated on the ISIN rather than on the weaker scrip-code tier.
   */
  let quarters = null, promoterAgreement = null;
  const byIso = new Map();
  for (const q of tickertape ?? []) {
    byIso.set(q.asOf, { asOf: q.asOf, quarter: quarterLabel(q.asOf), holdingPct: q.holdingPct, pledgePct: q.pledgePct, pledgeSource: q.pledgePct === null ? null : "tickertape" });
  }
  for (const q of screener ?? []) {
    const iso = quarterEndIso(q.quarter);
    if (!iso) continue;
    const e = byIso.get(iso);
    if (!e) { byIso.set(iso, { asOf: iso, quarter: q.quarter, holdingPct: q.holdingPct, pledgePct: null, pledgeSource: null }); continue; }
    e.screenerHoldingPct = q.holdingPct;
  }
  if (byIso.size) {
    const rows = [...byIso.values()].sort((a, b) => b.asOf.localeCompare(a.asOf));
    const disagreed = [];
    let compared = 0;
    for (const r of rows) {
      const other = r.screenerHoldingPct;
      if (other !== undefined && other !== null && r.holdingPct !== null) {
        compared++;
        if (Math.abs(other - r.holdingPct) > 0.05) { disagreed.push(`${r.quarter}: ${r.holdingPct} vs ${other}`); r.holdingPct = null; }
      }
      r.witnesses = (r.holdingPct === null ? 0 : 1) + (other !== undefined && other !== null ? 1 : 0);
      delete r.screenerHoldingPct;
    }
    quarters = rows;
    promoterAgreement = { compared, disagreed: disagreed.length };
    if (disagreed.length) note("fail", "promoter-disagreement", `two sources disagree and NEITHER figure is published for: ${disagreed.join("; ")}`);
    else if (compared) note("info", "promoter-agreement", `${compared} quarter(s) carried by both witnesses; all agree within 0.05pp.`);
    else note("warn", "promoter-agreement", "only one witness answered; the holding is published unchecked against a second.");
  } else if (prev?.promoterQuarters) {
    quarters = prev.promoterQuarters;
    promoterAgreement = prev.promoterAgreement ?? null;
    note("info", "promoter", "the stored promoter series is kept.");
  }

  // ── WHAT THIS HOLDING WAS ENTITLED TO, AND THE ASSUMPTION IT RESTS ON ────
  /**
   * The exchange states a dividend PER SHARE. The rupee figure for this holding
   * is that times the share count — and the share count comes from a statement
   * dated 31 Mar 2026 while an ex-date can fall either side of it. A snapshot is
   * not a history: this book cannot show what was held ON an ex-date, only what
   * was held on the statement's own date.
   *
   * So the entitlement is DERIVED and says so, it carries the statement date it
   * was struck on, and every row carries `heldOnExDateReported: false` — because
   * the one thing that would make it a measurement is the one thing no document
   * here supplies. It is never summed into income, and the page never calls it
   * "received".
   */
  const shares = bookShares > 0 ? bookShares : null;

  const out = {
    scripCode: BSE_SCRIP,
    nseSymbol: NSE_SYMBOL,
    bookIsin,
    bookShares: shares,
    identity,
    quote,
    corporateActions: actions,
    actionsComplete,
    promoterQuarters: quarters,
    promoterAgreement,
    sources: [
      { name: "BSE (exchange)", url: `https://www.bseindia.com/stock-share-price/polycab-india-ltd/${NSE_SYMBOL.toLowerCase()}/${BSE_SCRIP}/`, carries: "identity, last traded price, the full corporate-action record" },
      { name: "Tickertape", url: TICKERTAPE_URL, carries: "promoter holding and promoter pledge, per quarter — gated on the book's own ISIN" },
      { name: "Screener", url: SCREENER_URL, carries: "promoter holding, per quarter — the second witness" },
    ],
    notes,
    retrievedAt,
  };

  // ── IDEMPOTENCY. Compare everything BUT the timestamps. ──────────────────
  const fingerprint = (o) => o && JSON.stringify({ ...o, retrievedAt: null, notes: null });
  const unchanged = prev && fingerprint(prev) === fingerprint(out);
  if (unchanged) out.retrievedAt = prev.retrievedAt;

  const text = render(out, unchanged ? prev : out);
  const report = renderReport(out);
  const sameOut = existsSync(OUT) && readFileSync(OUT, "utf8") === text;
  const sameReport = existsSync(REPORT) && readFileSync(REPORT, "utf8") === report;

  const fails = notes.filter((n) => n.severity === "fail").length;
  const warns = notes.filter((n) => n.severity === "warn").length;
  const summary = `${actions?.length ?? 0} corporate action(s)` +
    `, ${quarters?.length ?? 0} promoter quarter(s)` +
    `, quote ${quote ? "live" : "ABSENT"}` +
    `, ${fails} failure(s), ${warns} warning(s)`;

  if (CHECK) {
    console.log(`--check: ${summary}. ${sameOut && sameReport ? "No change." : "WOULD REWRITE " + [!sameOut && OUT, !sameReport && REPORT].filter(Boolean).join(" and ")}`);
    process.exit(0);
  }
  if (!sameOut) writeFileSync(OUT, text);
  if (!sameReport) writeFileSync(REPORT, report);
  console.log(`${summary}. ${sameOut && sameReport ? "Nothing moved — nothing written." : "Wrote " + [!sameOut && OUT, !sameReport && REPORT].filter(Boolean).join(" and ")}`);
  for (const n of notes) console.log(`  [${n.severity}] ${n.rule}: ${n.detail}`);
}

function render(o) {
  const body = JSON.stringify(o, null, 2);
  return `// GENERATED by \`npm run build-polycab\` — DO NOT EDIT BY HAND.
//
// What the EXCHANGE and the statutory disclosures say about the ring-fenced
// promoter holding, refreshed daily by \`.github/workflows/polycab.yml\`. The
// builder's header explains every gate; the two that matter most here are:
//
//   • Everything from BSE is published only where the ISIN the exchange echoes
//     equals the ISIN \`BOOK_POLYCAB\` carries. A wrong scrip code answers with a
//     complete, correct table about another company.
//   • The promoter HOLDING has two independent witnesses and a disagreement
//     publishes neither. The promoter PLEDGE has one, and says so.
//
// NOTHING HERE IS IN ANY BOOK TOTAL. It is company-level and public; the
// family's own holding, its cost and its value stay in \`BOOK_POLYCAB\`, and the
// two are rendered in separate cards so that a promoter-GROUP encumbrance can
// never be read as a statement about THIS demat's balance.
//
// \`docs/POLYCAB-LIVE.md\` carries this run's findings.

export interface PolycabAction {
  exDate: string | null;
  kind: "dividend" | "bonus" | "split" | "spinoff" | "rights" | "other";
  purpose: string;
  amountPerShare: number | null;
  ratio: string | null;
  recordDate: string | null;
  bookClosureFrom: string | null;
  bookClosureTo: string | null;
  paymentDate: string | null;
}

export interface PolycabQuarter {
  /** \`Jun 2026\` — the label, derived from the quarter end and never scraped. */
  quarter: string | null;
  /** The quarter END the disclosure is struck at, ISO. */
  asOf: string;
  /** Null where the two witnesses disagreed — a REFUSAL, not a gap. */
  holdingPct: number | null;
  pledgePct: number | null;
  /** Which source carried the pledge, or null where none did. */
  pledgeSource: string | null;
  /** How many independent sources carried the holding for this quarter. */
  witnesses: number;
}

export interface PolycabQuote {
  ltp: number;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  changePct: number | null;
  printedChange: number | null;
  printedChangePct: number | null;
}

export interface PolycabLive {
  scripCode: string;
  nseSymbol: string;
  bookIsin: string;
  bookShares: number | null;
  identity: {
    isin: string; scripCode: string | null; securityId: string | null;
    faceValue: number | null; industry: string | null; group: string | null; index: string | null;
  } | null;
  quote: PolycabQuote | null;
  corporateActions: PolycabAction[] | null;
  /** True only where THIS run fetched the exchange's whole record. A stored
   *  record kept through a failed fetch is never republished as complete, which
   *  is what lets the page say "none ever declared" as a measurement. */
  actionsComplete: boolean;
  promoterQuarters: PolycabQuarter[] | null;
  promoterAgreement: { compared: number; disagreed: number } | null;
  sources: { name: string; url: string; carries: string }[];
  notes: { severity: string; rule: string; detail: string }[];
  retrievedAt: string;
}

export const POLYCAB_LIVE: PolycabLive = ${body};
`;
}

function renderReport(o) {
  const L = [];
  L.push("# Polycab — the live company-level record\n");
  L.push("Generated by `npm run build-polycab`. **Do not edit by hand.**\n");
  L.push("This is what the EXCHANGE and the statutory disclosures say about the");
  L.push("ring-fenced promoter holding. It is company-level and public, it is in no");
  L.push("book total, and it is deliberately NOT a statement about what the family's");
  L.push("own demat reports — that distinction is the whole design and is set out at");
  L.push("the top of `scripts/build-polycab-live.mjs`.\n");
  L.push(`Retrieved \`${o.retrievedAt}\`.\n`);

  L.push("## Identity — the gate everything else passed\n");
  if (o.identity) {
    L.push(`The exchange returns **${o.identity.isin}** for scrip \`${o.scripCode}\`, and the book's`);
    L.push(`ring-fenced holding carries **${o.bookIsin}**. They match, so the figures below are published.\n`);
    L.push("| | |");
    L.push("| --- | --- |");
    L.push(`| Security id | ${o.identity.securityId ?? "—"} |`);
    L.push(`| Face value | ${o.identity.faceValue ?? "—"} |`);
    L.push(`| Industry | ${o.identity.industry ?? "—"} |`);
    L.push(`| Group / index | ${o.identity.group ?? "—"} / ${o.identity.index ?? "—"} |\n`);
  } else {
    L.push("**The identity gate did not pass this run**, so nothing from the exchange was");
    L.push("refreshed. Whatever the store already held is kept and carries its own dates.\n");
  }

  const a = o.corporateActions ?? [];
  const kinds = a.reduce((m, r) => ((m[r.kind] = (m[r.kind] ?? 0) + 1), m), {});
  L.push("## Corporate actions — the exchange's own record since listing\n");
  L.push(`**${a.length}** action(s)${o.actionsComplete ? ", fetched whole this run" : " — **kept from a previous run**, so not republished as complete"}.`);
  L.push(`By kind: ${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}.\n`);
  if (o.actionsComplete) {
    const share = ["bonus", "split", "spinoff"].reduce((n, k) => n + (kinds[k] ?? 0), 0);
    L.push(share === 0
      ? "**No bonus, split or spin-off has ever been declared on this scrip.** The record"
        + "\nis complete from listing, so that is a MEASURED nil rather than an absence of"
        + "\nreporting — which is the one thing this store retires from the page's own"
        + "\n\"unreported rather than confirmed\" wording.\n"
      : `**${share}** share-count action(s) are on the record; each is listed below with its ratio.\n`);
  }
  L.push("| Ex-date | Kind | Per share | Ratio | Record | Payment | The exchange's own words |");
  L.push("| --- | --- | ---: | --- | --- | --- | --- |");
  for (const r of a) {
    L.push(`| ${r.exDate ?? "—"} | ${r.kind} | ${r.amountPerShare ?? "—"} | ${r.ratio ?? "—"} | ${r.recordDate ?? "—"} | ${r.paymentDate ?? "—"} | ${r.purpose} |`);
  }
  L.push("");

  L.push("## Promoter holding and pledge\n");
  if (o.promoterQuarters?.length) {
    const ag = o.promoterAgreement;
    L.push(ag ? `${ag.compared} quarter(s) are carried by BOTH witnesses; **${ag.disagreed}** disagree.\n` : "");
    L.push("A quarter where the two disagree beyond 0.05pp publishes **neither** figure, which");
    L.push("is why a `—` in the holding column is a refusal rather than a gap. The pledge has");
    L.push("ONE witness (screener prints no pledge row for this scrip) and is published as such.\n");
    L.push("| Quarter | As of | Promoter holding | Promoter pledge |");
    L.push("| --- | --- | ---: | ---: |");
    for (const q of o.promoterQuarters) {
      L.push(`| ${q.quarter} | ${q.asOf ?? "—"} | ${q.holdingPct === null ? "—" : q.holdingPct + "%"} | ${q.pledgePct === null ? "—" : q.pledgePct + "%"} |`);
    }
    L.push("");
  } else {
    L.push("No promoter series was published this run.\n");
  }

  L.push("## The live quote\n");
  if (o.quote) {
    L.push("| | |");
    L.push("| --- | ---: |");
    L.push(`| Last traded | ${o.quote.ltp} |`);
    L.push(`| Previous close | ${o.quote.prevClose ?? "—"} |`);
    L.push(`| Day change | ${o.quote.change ?? "—"} (${o.quote.changePct === null ? "—" : o.quote.changePct.toFixed(2) + "%"}) |`);
    L.push(`| Open / high / low | ${o.quote.open ?? "—"} / ${o.quote.high ?? "—"} / ${o.quote.low ?? "—"} |\n`);
    L.push("The day change is DERIVED as last-traded less previous close, and checked against");
    L.push(`the exchange's own printed \`${o.quote.printedChange ?? "—"}\`. Both are shown because a level`);
    L.push("differenced against its OWN session prints a plausible near-zero, which is a defect");
    L.push("this repo has already paid for once on the index strip.\n");
  } else {
    L.push("**No quote was published this run.**\n");
  }

  L.push("## Sources\n");
  L.push("| Source | Carries | URL |");
  L.push("| --- | --- | --- |");
  for (const s of o.sources) L.push(`| ${s.name} | ${s.carries} | ${s.url} |`);
  L.push("");
  L.push("NSE would be the natural second exchange witness and refuses every request from");
  L.push("the harvest environment (HTTP 403, Akamai, with and without a cookie bootstrap).");
  L.push("That is recorded rather than worked around; nothing above needs it.\n");

  if (o.notes.length) {
    L.push("## This run's findings\n");
    for (const n of o.notes) L.push(`- **${n.severity}** \`${n.rule}\` — ${n.detail}`);
    L.push("");
  }
  return L.join("\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
