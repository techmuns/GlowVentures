// WHAT THE EXCHANGE AND THE DISCLOSURE AGGREGATORS SAY ABOUT POLYCAB — ONE
// DEFINITION, READ BY THE DAILY BUILDER AND BY THE LIVE EDGE FUNCTION.
//
// `scripts/build-polycab-live.mjs` commits a dated snapshot every morning;
// `functions/api/polycab.js` serves the same facts intraday. Two readings of one
// upstream would be two chances for the committed figure and the live one to
// disagree about what a dividend was worth — the failure `shared/seriesReturns.mjs`
// and `shared/sectors.mjs` were each extracted to prevent — so the parsing,
// the identity gates and the classification all live here and neither caller
// re-derives any of it.
//
// ── EVERY SOURCE IS KEYLESS, AND THAT IS WHY THESE ONES ────────────────────
//
// Measured 2026-09-22 from this environment, with the full probe recorded in
// `docs/POLYCAB-LIVE.md`:
//
//   api.bseindia.com          200, JSON, no key, no cookie   ← the exchange itself
//   www.screener.in           200, HTML, no key              ← promoter holding
//   trendlyne.com             200, HTML, no key              ← promoter holding AND pledge
//   www.nseindia.com          403 Akamai, with and without a cookie bootstrap
//   query1.finance.yahoo.com  429 from this IP
//
// NSE is the other exchange and would be the natural second witness; it refuses
// every request from here, which is recorded rather than worked around. Nothing
// below needs it: BSE is the primary market record for a BSE-listed scrip, and
// the two aggregators cross-check each other on the one figure they both carry.
//
// ── THE IDENTITY GATE IS THE WHOLE LICENCE FOR PUBLISHING ANY OF IT ────────
//
// A wrong scrip code returns a COMPLETE, CORRECT, WELL-FORMED answer belonging
// to another company, and there is nothing on screen a reader could catch it by.
// This is not hypothetical here: probing `moneycontrol.com/.../polycabindia/PI47`
// during the same session returned a page whose promoter holding was 55.03%
// against Polycab's 61.5%, under a title naming no company at all. It was
// refused, and this file is why that refusal is mechanical rather than a matter
// of noticing.
//
// So every source must ECHO BACK an identifier the BOOK already holds:
//
//   BSE        `ComHeadernew` returns the ISIN. It must equal the ISIN on the
//              ring-fenced holding in `BOOK_POLYCAB` — an identifier neither
//              this file nor the upstream chose.
//   screener   the page must link its own BSE scrip code AND its NSE symbol.
//   trendlyne  the same two.
//
// A source that fails its gate yields NOTHING. It never yields a figure with a
// warning attached, because a warning on a figure about the wrong company is
// still a figure about the wrong company.

export const BSE_API = "https://api.bseindia.com/BseIndiaAPI/api";
export const BSE_SCRIP = "542652";
export const NSE_SYMBOL = "POLYCAB";

// BSE's API rejects a request with no browser-ish headers, and answers 302 to an
// error page rather than 403 — which parses as neither JSON nor an error unless
// the redirect is refused. `redirect: "manual"` is what turns that into a
// failure this code can see.
export const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/html;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.bseindia.com/",
  Origin: "https://www.bseindia.com",
};

/** A number, or null. NEVER 0 for something that did not parse. */
export function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/,/g, "").replace(/[₹%\s]/g, "").replace(/^\+/, "");
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** `18 Jun 2019` / `2026-07-30T00:00:00` / `20190618` → `YYYY-MM-DD`, else null. */
export function isoDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s === "-") return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const MON = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
                jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(s);
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${MON[m[2].toLowerCase()]}-${String(m[1]).padStart(2, "0")}`;
  return null;
}

/**
 * WHAT KIND OF CORPORATE ACTION IS THIS, AND WHAT IS IT WORTH PER SHARE.
 *
 * BSE states the purpose as one string — `Final Dividend - Rs. - 47.0000`,
 * `Bonus issue 1:1`, `Stock  Split From Rs.10/- to Rs.2/-`. The kind decides
 * which table a row lands in, and the two tables mean completely different
 * things: a dividend pays CASH against a share count, a bonus or split CHANGES
 * the share count and pays nothing.
 *
 * AN UNRECOGNISED PURPOSE IS `other`, CARRIED VERBATIM, AND NEVER DROPPED. A row
 * silently discarded for not matching a pattern is a corporate action this page
 * would hide, and on a promoter block a hidden action is the expensive kind. It
 * is also never guessed into `bonus`: the page prints the exchange's own words
 * beside whatever this function concluded, so a reader can see the raw purpose.
 *
 * THE AMOUNT IS ONLY READ OFF A DIVIDEND. `Bonus issue 1:1` contains digits and
 * a naive number-scrape would report a bonus "worth ₹1", which is a fabricated
 * per-share amount of exactly the kind this book exists to refuse.
 */
export function classifyAction(purpose) {
  const p = String(purpose || "").trim();
  const low = p.toLowerCase();
  let kind = "other";
  if (/\bdividend\b/.test(low)) kind = "dividend";
  else if (/\bbonus\b/.test(low)) kind = "bonus";
  else if (/\bsplit\b|\bsub-?division\b|face\s*value/.test(low)) kind = "split";
  else if (/\bspin[\s-]?off\b|\bdemerger\b|\barrangement\b|\bscheme\b/.test(low)) kind = "spinoff";
  else if (/\bright[s]?\b/.test(low)) kind = "rights";

  // `Final Dividend - Rs. - 47.0000` → 47. Anchored on the currency marker so a
  // ratio like `1:1` can never be read as an amount.
  let amountPerShare = null;
  if (kind === "dividend") {
    const m = /(?:rs\.?|inr|₹)\s*-?\s*([\d,]+\.?\d*)/i.exec(p);
    amountPerShare = m ? num(m[1]) : null;
  }
  // `Bonus issue 1:1`, `Stock Split From Rs.10/- to Rs.2/-`
  let ratio = null;
  if (kind === "bonus" || kind === "split" || kind === "rights") {
    const m = /(\d+)\s*:\s*(\d+)/.exec(p);
    if (m) ratio = `${m[1]}:${m[2]}`;
    else {
      const f = /from\s*rs\.?\s*([\d.]+)[^\d]*to\s*rs\.?\s*([\d.]+)/i.exec(p);
      if (f) ratio = `Rs ${f[1]} → Rs ${f[2]}`;
    }
  }
  return { kind, amountPerShare, ratio, purpose: p };
}

/**
 * THE EXCHANGE'S OWN CORPORATE-ACTION RECORD, whole.
 *
 * `DefaultData/w` with an empty date range returns EVERY action the exchange has
 * recorded for the scrip since listing — for Polycab, 2019 to date. That
 * completeness is what lets the page say "no bonus or split has ever been
 * declared" as a MEASURED nil rather than as an absence of reporting, and it is
 * why the row count is carried out of here: a truncated fetch and a company that
 * genuinely never declared one look identical in the result alone.
 */
export function parseCorporateActions(rows) {
  if (!Array.isArray(rows)) return null;
  const out = [];
  for (const r of rows) {
    const exDate = isoDate(r.Ex_date ?? r.exdate ?? r.Ex_Date);
    const c = classifyAction(r.Purpose ?? r.purpose ?? r.purpose_name);
    out.push({
      exDate,
      kind: c.kind,
      purpose: c.purpose,
      amountPerShare: c.amountPerShare,
      ratio: c.ratio,
      recordDate: isoDate(r.RD_Date),
      bookClosureFrom: isoDate(r.BCRD_FROM),
      bookClosureTo: isoDate(r.BCRD_TO),
      paymentDate: isoDate(r.payment_date ?? r.PAYMENT_DATE),
    });
  }
  // Newest first. A row with no ex-date sorts last rather than as the epoch —
  // `txnSort.ts`'s rule, which is that an absent date is not an early one.
  out.sort((a, b) => (b.exDate ?? "").localeCompare(a.exDate ?? ""));
  return out;
}

/**
 * THE LAST TRADED PRICE AND THE SESSION BEHIND IT.
 *
 * `getScripHeaderData` carries LTP, the previous close and the day's OHLC. The
 * day change is taken as LTP − PrevClose and NOT from the upstream's own `Chg`
 * string, for one reason measured in this repo already: `/api/indices` once
 * differenced a level against its OWN session and printed +0.00% across the
 * board, and the only tell was a residual of a few paise. Deriving the change
 * from two figures this function can also print is what makes that visible.
 *
 * The upstream's `Chg` is kept as `printedChange` and CHECKED against the
 * derived one — a `printed.*` cross-check, not a source (§4).
 */
export function parseQuote(hdr) {
  const rate = hdr?.CurrRate ?? {};
  const head = hdr?.Header ?? {};
  const ltp = num(rate.LTP ?? head.LTP);
  const prevClose = num(head.PrevClose);
  if (ltp === null) return null;
  const change = ltp !== null && prevClose !== null ? ltp - prevClose : null;
  return {
    ltp,
    prevClose,
    open: num(head.Open),
    high: num(head.High),
    low: num(head.Low),
    change,
    changePct: change !== null && prevClose ? (change / prevClose) * 100 : null,
    printedChange: num(rate.Chg),
    printedChangePct: num(rate.PcChg),
  };
}

/**
 * WHERE A FETCH FELL AGAINST BSE'S TRADING DAY, IN INDIA TIME.
 *
 * `getScripHeaderData` answers with a last-traded price and NO session date, so
 * the only thing this book can know about which session a stored price belongs
 * to is WHEN it was fetched. The equity session runs 09:00 (pre-open) to 16:00
 * IST (the closing and post-closing sessions), Monday to Friday. A price
 * fetched inside that window may be an intraday figure; one fetched outside it
 * is the last session's close.
 *
 * EXCHANGE HOLIDAYS ARE NOT KNOWN HERE — nothing this file reads publishes the
 * calendar — so a fetch inside the window on a holiday is reported `inSession`,
 * and the page says the price MAY be intraday. That errs towards the weaker
 * claim, never the stronger one: calling a settled close "possibly intraday"
 * misleads nobody, and calling an intraday price "the last close" is the defect
 * this function exists for (a store committed at 09:39 IST once did exactly
 * that). India keeps no daylight saving, so the offset is a constant.
 */
export function sessionPhase(iso) {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return null;
  const ist = new Date(t + 330 * 60000);
  const day = ist.getUTCDay();
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const weekday = day >= 1 && day <= 5;
  const pad = (n) => String(n).padStart(2, "0");
  return {
    inSession: weekday && mins >= 9 * 60 && mins < 16 * 60,
    weekday,
    istDate: `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`,
    istTime: `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`,
  };
}

/**
 * WHICH QUOTE THE DAILY STORE KEEPS — only a settled session, where it can.
 *
 * The workflow runs after the close, so the price it stores is a close; a run
 * started by hand DURING the session (09:00–16:00 IST on a weekday) would
 * otherwise commit an intraday price that the page then called "the last
 * settled close". Where a settled close is already stored, a mid-session fetch
 * keeps it; where none is, the intraday price is stored WITH its fetch time,
 * and the page labels it as possibly intraday rather than as a close. Moved out
 * of the builder so the rule can be exercised without the network.
 */
export function settledQuote(fresh, fetchedAt, prevQuote) {
  const quote = { ...fresh, fetchedAt };
  const phase = sessionPhase(fetchedAt);
  const prevPhase = sessionPhase(prevQuote?.fetchedAt);
  if (phase?.inSession && prevQuote && prevPhase && !prevPhase.inSession) {
    return {
      quote: prevQuote,
      note: { severity: "info", text: `fetched during trading hours (${phase.istTime} IST, ${phase.istDate}), so it may be intraday; the stored close, fetched ${prevPhase.istTime} IST on ${prevPhase.istDate}, is kept — only a settled session is stored.` },
    };
  }
  if (phase?.inSession) {
    return {
      quote,
      note: { severity: "warn", text: `fetched during trading hours (${phase.istTime} IST, ${phase.istDate}) with no settled close stored, so it is published with its fetch time and the page labels it as possibly intraday.` },
    };
  }
  return { quote, note: null };
}

/**
 * IDENTITY, AND THE FIELD THE GATE IS STRUCK ON.
 *
 * `ComHeadernew` returns the ISIN, the security id and the scrip code together.
 * The caller compares the ISIN against the one the BOOK carries.
 */
export function parseIdentity(h) {
  if (!h || typeof h !== "object") return null;
  const isin = String(h.ISIN ?? "").trim().toUpperCase();
  if (!/^IN[EF][0-9A-Z]{9}$/.test(isin)) return null;
  return {
    isin,
    scripCode: String(h.SecurityCode ?? "").trim() || null,
    securityId: String(h.SecurityId ?? "").trim() || null,
    faceValue: num(h.FaceVal),
    industry: String(h.Industry ?? "").trim() || null,
    group: String(h.Group ?? "").trim() || null,
    index: String(h.Index ?? "").trim() || null,
  };
}

/**
 * PROMOTER HOLDING AND PLEDGE, FROM TICKERTAPE'S EMBEDDED SHAREHOLDING RECORD.
 *
 * The page ships its data as JSON in `__NEXT_DATA__`, one entry per quarter,
 * each with an ISO date and a `data` block whose fields are declared in the
 * page's own label dictionary:
 *
 *   pmPctT   Promoter Holding            pmPctP   Promoter Holding Pledged
 *   plPctT   Pledged                     uPlPctT  Unpledged
 *
 * READ AS JSON, NOT SCRAPED OUT OF THE RENDERED TABLE. A number taken from
 * markup is a number taken from a layout, and this is the same document's own
 * structured source — which is also why the quarter is an exact ISO date here
 * rather than a `Jun 2026` label that has to be mapped to a quarter end.
 *
 * WHY THIS SOURCE AND NOT TRENDLYNE, which was tried first and rejected:
 * trendlyne sits behind an AWS WAF that answers `x-amzn-waf-action: captcha`
 * with HTTP 405 to a plain client. A single curl got through and Node's fetch
 * did not, which is the worst possible property for a daily job — it would have
 * passed the day it was written and failed silently in CI ever after. Measured,
 * recorded in `docs/POLYCAB-LIVE.md`, and not built on.
 *
 * AN ABSENT FIGURE IS NULL, NEVER 0 — and nowhere in this file does that matter
 * more. A fabricated nil on a PROMOTER pledge is the single most consequential
 * zero available to invent in this whole book, so a quarter whose block does not
 * carry the field is dropped rather than defaulted, and a `0` only ever reaches
 * the store because the upstream published the number 0.
 */
export function parseTickertapeHoldings(html) {
  if (typeof html !== "string" || !html) return null;
  const m = /id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[1]); } catch { return null; }
  const list = d?.props?.pageProps?.securitySummary?.holdings?.holdings;
  if (!Array.isArray(list) || !list.length) return null;

  const out = [];
  for (const e of list) {
    const asOf = isoDate(e?.date);
    const v = e?.data ?? {};
    // `typeof === "number"` rather than `num()`: these arrive already typed, and
    // an absent key must stay absent instead of being coerced through a string.
    const holdingPct = typeof v.pmPctT === "number" ? v.pmPctT : null;
    // "Promoter Holding Pledged" ALONE, and NO FALLBACK. This used to fall back
    // to `plPctT` ("Pledged") where a block carried no `pmPctP` — but the two
    // are struck on DIFFERENT BASES: the `…T` fields (`pmPctT`, `plPctT`,
    // `uPlPctT`) are shares of the company's TOTAL equity, and pledged plus
    // unpledged is the promoter holding; `pmPctP` is the pledged part of the
    // promoter group's OWN holding. A column that could hold either, row by
    // row, is a percentage whose denominator changes under the reader — and the
    // store recorded only "tickertape", so which one a figure was could not be
    // told afterwards. A quarter whose block carries no `pmPctP` has no pledge
    // on this basis, so it is null rather than a figure on the other one.
    const pledgePct = typeof v.pmPctP === "number" ? v.pmPctP : null;
    if (!asOf || (holdingPct === null && pledgePct === null)) continue;
    out.push({ asOf, holdingPct, pledgePct });
  }
  // Newest first, like every other dated rollup in this repo.
  out.sort((a, b) => b.asOf.localeCompare(a.asOf));
  return out.length ? out : null;
}

/** `2026-06-30` → `Jun 2026`, to line a tickertape row up with a screener column. */
export function quarterLabel(iso) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(iso || ""));
  if (!m) return null;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mm = Number(m[2]);
  return mm >= 1 && mm <= 12 ? `${MON[mm - 1]} ${m[1]}` : null;
}

/**
 * PROMOTER HOLDING FROM SCREENER — the SECOND witness, and the reason there are
 * two.
 *
 * Trendlyne prints the holding to one decimal (`61.5%`) and screener to two
 * (`61.46%`). Where both answer they are COMPARED and a disagreement leaves the
 * figure unpublished; the finer of the two is then what is stored. That is
 * `build-symbols`' own rule — a second identifier makes the match stricter, not
 * looser — and it is the only protection available against an aggregator
 * quietly re-basing a series, which no single source can reveal.
 */
export function parseScreenerPromoter(html) {
  if (typeof html !== "string" || !html) return null;
  const i = html.indexOf('id="shareholding"');
  if (i < 0) return null;
  const txt = html.slice(i, i + 14000).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const qs = [...txt.matchAll(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+20\d\d)/g)].map((m) => m[1]);
  const m = /Promoters\s*\+?\s*((?:\s*-?[\d.]+%)+)/.exec(txt);
  if (!m || !qs.length) return null;
  const vals = [...m[1].matchAll(/(-?[\d.]+)%/g)].map((x) => num(x[1]));
  const out = [];
  for (let k = 0; k < Math.min(qs.length, vals.length); k++) {
    if (vals[k] === null) continue;
    out.push({ quarter: qs[k], holdingPct: vals[k] });
  }
  return out.length ? out : null;
}

/**
 * THE PAYMENT DATE LIVES ON A SECOND ENDPOINT, AND IS JOINED ON THE EX-DATE.
 *
 * `DefaultData/w` returns the whole history and leaves `payment_date` empty;
 * `CorporateAction/w` returns only the last five rows and carries
 * `PAYMENT_DATE` on them. Neither is complete, so the long record is the spine
 * and the short one only ever FILLS AN EMPTY FIELD — the same tiering the sector
 * map uses, where a lower tier can never overrule a higher one.
 *
 * Joined on the EX-DATE, which both print, and never on the purpose string,
 * which they spell differently (`Final Dividend - Rs. - 47.0000` against
 * `Final Dividend`). A row the short record does not cover keeps its null.
 */
export function mergePaymentDates(actions, caTable2) {
  if (!Array.isArray(actions) || !Array.isArray(caTable2)) return actions;
  const pay = new Map();
  for (const r of caTable2) {
    const d = isoDate(r.Ex_date);
    const p = isoDate(r.PAYMENT_DATE);
    if (d && p) pay.set(d, p);
  }
  return actions.map((a) =>
    a.paymentDate === null && a.exDate && pay.has(a.exDate)
      ? { ...a, paymentDate: pay.get(a.exDate) }
      : a,
  );
}

/**
 * DOES THIS PAGE PROVE IT IS ABOUT THE HOLDING THE BOOK CARRIES?
 *
 * Two tiers, strongest first, and the caller passes the BOOK's own ISIN so that
 * nothing in this file gets to decide what the answer should be:
 *
 *   isin    the page prints the exact ISIN. Tickertape does, which is why the
 *           pledge — the figure with a single witness — is taken from the source
 *           with the strongest identity rather than the most convenient one.
 *   scrip   the page prints BOTH the BSE scrip code and the NSE symbol. Screener
 *           prints neither on its own, and links both, which is enough for a
 *           second witness whose only job is to agree with the first.
 *
 * A page matching NEITHER yields nothing. It never yields a figure with a
 * caveat: a caveat on a figure about the wrong company is still a figure about
 * the wrong company, which is what the moneycontrol probe returned.
 */
export function pageIdentity(html, bookIsin) {
  if (typeof html !== "string" || !html) return null;
  if (bookIsin && html.includes(String(bookIsin).toUpperCase())) return "isin";
  if (html.includes(BSE_SCRIP) && new RegExp(`\\b${NSE_SYMBOL}\\b`).test(html)) return "scrip";
  return null;
}

/** `Jun 2026` → `2026-06-30`, the quarter end the disclosure is struck at. */
export function quarterEndIso(q) {
  const m = /^([A-Za-z]{3})\s+(20\d\d)$/.exec(String(q || "").trim());
  if (!m) return null;
  const END = { mar: "03-31", jun: "06-30", sep: "09-30", dec: "12-31" };
  const e = END[m[1].toLowerCase()];
  return e ? `${m[2]}-${e}` : null;
}

/**
 * THE TWO PROMOTER WITNESSES, JOINED ON THE QUARTER END — one definition, so the
 * builder and its test cannot disagree about what "two sources carried it" is.
 *
 * WHERE BOTH CARRY A QUARTER THEY ARE COMPARED, AND A DISAGREEMENT PUBLISHES
 * NEITHER. Screener prints two decimals and tickertape full precision, so they
 * are reconciled at 0.05pp; the finer figure is the one stored. A quarter ONE
 * source carries is published on that source alone ("never empty a figure you
 * could not cross-check"), and the store says so rather than implying two.
 *
 * `witnesses` IS COUNTED BEFORE ANY REFUSAL. It is how many sources CARRIED a
 * holding figure for the quarter — a refused quarter was carried by two, and
 * counting the nulled side as absent would print "1" beside a dash that is a
 * refusal between two. `holdingRefused` is what tells a refused quarter from one
 * no source carried: they look identical as a null and send a reader to
 * completely different places, so the page words them apart.
 *
 * AND A QUARTER THE FIRST WITNESS CARRIED WITHOUT A HOLDING FIGURE (a block with
 * only a pledge) TAKES THE SECOND WITNESS'S HOLDING. The inline version this
 * replaced left it null, which dropped a published holding on the one source
 * that had it.
 */
export function mergePromoterQuarters(tickertape, screener) {
  const byIso = new Map();
  for (const q of Array.isArray(tickertape) ? tickertape : []) {
    if (!q?.asOf) continue;
    byIso.set(q.asOf, {
      asOf: q.asOf, quarter: quarterLabel(q.asOf),
      holdingPct: null, pledgePct: q.pledgePct ?? null,
      pledgeSource: typeof q.pledgePct === "number" ? "tickertape" : null,
      tt: typeof q.holdingPct === "number" ? q.holdingPct : null, sc: null,
    });
  }
  for (const q of Array.isArray(screener) ? screener : []) {
    const iso = quarterEndIso(q?.quarter);
    if (!iso) continue;
    const sc = typeof q.holdingPct === "number" ? q.holdingPct : null;
    const e = byIso.get(iso);
    if (e) e.sc = sc;
    else byIso.set(iso, { asOf: iso, quarter: q.quarter, holdingPct: null, pledgePct: null, pledgeSource: null, tt: null, sc });
  }
  if (!byIso.size) return null;
  const rows = [...byIso.values()].sort((a, b) => b.asOf.localeCompare(a.asOf));
  const disagreed = [];
  let compared = 0;
  const quarters = rows.map((r) => {
    let holdingPct = r.tt ?? r.sc;
    let holdingRefused = false;
    if (r.tt !== null && r.sc !== null) {
      compared++;
      if (Math.abs(r.tt - r.sc) > 0.05) {
        disagreed.push(`${r.quarter}: ${r.tt} vs ${r.sc}`);
        holdingPct = null;
        holdingRefused = true;
      }
    }
    return {
      asOf: r.asOf, quarter: r.quarter, holdingPct, pledgePct: r.pledgePct, pledgeSource: r.pledgeSource,
      witnesses: (r.tt !== null ? 1 : 0) + (r.sc !== null ? 1 : 0),
      holdingRefused,
    };
  });
  return { quarters, compared, disagreed };
}

