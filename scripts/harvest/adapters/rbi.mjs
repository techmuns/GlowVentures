// ADAPTER — the Reserve Bank of India's current policy rates.
//
// Repo, Standing Deposit Facility, Marginal Standing Facility, Bank Rate, the
// fixed Reverse Repo, CRR and SLR: the spec's whole "Policy Rates" block under
// Layer 2D, and seven rows that were illustrative on the Economy page until now.
//
// THIS IS AN ACCUMULATING SOURCE, AND THAT IS THE POINT.
// The RBI publishes the rate IN EFFECT TODAY. There is no history endpoint and
// no downloadable series behind these figures — the DBIE warehouse holds one but
// is a JavaScript application with no stable URL per series. So each run
// contributes ONE observation and the store keeps every previous one: the
// history is built here, a day at a time, by `merge` in lib/store.mjs, which
// exists precisely so a latest-value source can become a series.
//
// What that means on screen, and the page says it: on the first day this series
// has one point and every horizon is absent. It is not a broken chart, it is an
// honest one — a rate we have observed once cannot answer "what was the 1-year
// change". `accumulating: true` travels in the meta so the UI can say so.
//
// RATES ARE MATCHED BY LABEL, WITH A BOUNDARY. "Repo Rate" is a substring of
// both "Policy Repo Rate" and "Fixed Reverse Repo Rate", so a naive search binds
// the wrong number to the wrong rate — a mistake that reads perfectly plausibly,
// since both are percentages in the same range. Every pattern is anchored so the
// label cannot be preceded by another word character.

const HOME = "https://www.rbi.org.in/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** One fetch serves all seven series — cache the PROMISE so concurrent runs share it. */
let cached = null;
const load = () => (cached ??= loadOnce().catch((e) => { cached = null; throw e; }));

async function loadOnce() {
  const r = await fetch(HOME, { headers: { "User-Agent": UA, accept: "text/html" } });
  if (!r.ok) throw new Error(`RBI home: HTTP ${r.status}`);
  const html = await r.text();
  // Strip scripts before tags, or inline JS string literals become "text".
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
  return { text, url: HOME };
}

export async function fetchSeries(spec) {
  const { text, url } = await load();
  const label = spec.source.label;
  // `(?<![A-Za-z])` keeps "Bank Rate" from matching inside another label, and
  // stops "Repo Rate" binding to the Reverse Repo figure.
  const re = new RegExp(`(?<![A-Za-z])${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%`);
  const m = text.match(re);
  if (!m) throw new Error(`"${label}" not found on the RBI home page — the layout or the label changed`);
  const v = Number(m[1]);
  if (!Number.isFinite(v)) throw new Error(`"${label}" parsed to a non-number: ${m[1]}`);

  // The observation is "the rate in effect on this date". Unlike a market close,
  // which is not settled until the session ends, a policy rate in effect today
  // is a settled fact today — so today's date is the right stamp.
  const t = new Date().toISOString().slice(0, 10);
  return { points: [{ t, v }], upstreamCurrency: null, exchange: null, sourceUrl: url };
}

export const unitPrefixFor = () => null;
