// ── THE PRIVATE COMPANIES' REPORTED FUNDING, FROM GLOW CENTRAL RESEARCH (Stage 10kt)
//
// *"The drill down pages of the private companies need to show complete
// information … access the private market news section in the Glow Central
// Research to understand how we are fetching data for it and use that
// knowledge to fetch and show data for private markets investments."*
//   — the family, 4 Nov 2026.
//
// Glow Central Research's News → Private Market tab is Inc42's weekly
// "Funding Galore" tables: every Indian startup round of the week, one row
// each — date, company, sector, subsector, business model, round size, round
// type, investors, lead investor — read from the public table, never an
// article body, and published as `data/private-market-news.json` on that
// dashboard (`scripts/collect-private-market-news.mjs` there; it walks Inc42
// every six hours and keeps every row it has ever read). Glow Central Research
// already rules that a Glow dashboard never scrapes Inc42 a second time, so
// this reads THAT publication, the way `import-corporate-actions.mjs` reads
// its corporate-actions capture. No key, no paid service.
//
// What it adds to a company's page, and what it may not:
//   · a row is the company's ONLY when its printed name is one of the
//     company's own names, compared exactly after legal suffixes and
//     punctuation are stripped — never a substring, never a fuzzy score; a
//     name two companies share matches neither;
//   · every field is the one the table prints. The amount is read off the
//     printed string ("$21 Mn" → 21,000,000 USD, "$447K", "₹20 Cr"); a
//     footnote star is resolved to the roundup's own note ("Mix of equity
//     and debt"); a row whose amount sits in the round-type column is read
//     with the two swapped and says so. Nothing is converted between
//     currencies. Inc42 prints no valuation, so none comes from here;
//   · the same round, researched and reported, is ONE round: a row folds onto
//     the researched round (`src/data/privateRounds.json`) only on evidence —
//     dated within `FOLD_DAYS`, and at least two of: the same amount in a
//     currency both print (within `AMOUNT_TOLERANCE`), an investor both name,
//     the same day, the same series — and never across a contradiction (two
//     amounts in one currency that differ, two different series). A row with
//     no such match is a round of its own, marked as reported by Inc42;
//   · the ring-fenced holding is named on `/polycab` alone: a parenthetical
//     naming it is cut from an investor's name, and any other text naming it
//     is dropped.
export const FUNDING_SOURCE = "https://inc42.com/tag/funding-galore/";
export const RESEARCH_ORIGIN = "https://glow-central-research.tech-441.workers.dev";
export const RESEARCH_FUNDING_URL = `${RESEARCH_ORIGIN}/data/private-market-news.json`;
export const RESEARCH_HEADLINES_URL = `${RESEARCH_ORIGIN}/data/private-company-news.json`;
export const RESEARCH_COMPANIES_URL = `${RESEARCH_ORIGIN}/data/portfolio-companies.json`;

/** A reported row is the researched round only when dated this close to it. */
export const FOLD_DAYS = 45;
/** Two amounts in one currency are the same amount within this fraction. */
export const AMOUNT_TOLERANCE = 0.15;

const FENCED = /polycab/i;
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
/** Text with any parenthetical naming the ring-fenced holding cut; null if it still names it. */
export function unfenced(s) {
  const out = clean(String(s ?? "").replace(/\s*\([^)]*polycab[^)]*\)/gi, ""));
  return FENCED.test(out) ? null : out;
}

// ── NAMES ──────────────────────────────────────────────────────────────────
const LEGAL = /\b(private|pvt|limited|ltd|llp|plc|inc|incorporated)\b\.?/gi;
/** The key two names must share to be the same name (Glow Central Research's own `nameKey`). */
export const nameKey = (v) => clean(v).toLowerCase().replace(/&/g, " and ").replace(LEGAL, " ").replace(/[^a-z0-9]+/g, "");

/** Every name a registry company may be printed under: its brand, its legal name, a former or later name the registry states, and reviewed aliases. */
export function namesOf(company) {
  const names = [company.brand, ...(company.aliases ?? [])];
  const legal = String(company.legalName ?? "");
  names.push(legal.replace(/\s*\(.*\)\s*$/, ""));
  for (const m of legal.matchAll(/\((?:formerly|now|earlier|previously)\s+([^)]+)\)/gi)) names.push(m[1]);
  return [...new Set(names.map(clean).filter(Boolean))];
}

/** `(printedName) => company | null` — exact keys only; a key two companies share matches neither. */
export function companyMatcher(companies) {
  const byKey = new Map();
  for (const c of companies) for (const n of namesOf(c)) {
    const k = nameKey(n);
    if (k.length < 3) continue;
    const held = byKey.get(k);
    byKey.set(k, held && held !== c ? null : c);
  }
  return (name) => byKey.get(nameKey(name)) ?? null;
}

// ── FIGURES AS PRINTED ─────────────────────────────────────────────────────
const UNIT = { k: 1e3, mn: 1e6, m: 1e6, million: 1e6, bn: 1e9, b: 1e9, billion: 1e9, cr: 1e7, crore: 1e7, lakh: 1e5, lakhs: 1e5, l: 1e5 };
/** "$21 Mn" → { value: 21e6, currency: "USD" }; anything else → null. Stars are footnotes, not figures. */
export function parseMoney(raw) {
  const s = clean(raw).replace(/\*+$/, "").trim();
  const m = s.match(/^(\$|US\$|USD|₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)\s*(k|mn|m|million|bn|b|billion|cr|crore|lakhs?|l)?$/i);
  if (!m) return null;
  const value = Number(m[2].replace(/,/g, "")) * (m[3] ? UNIT[m[3].toLowerCase()] : 1);
  if (!Number.isFinite(value) || value <= 0) return null;
  const currency = /\$|USD/i.test(m[1]) ? "USD" : "INR";
  return { value: Math.round(value), currency };
}
const stars = (s) => (clean(s).match(/\*+\s*$/)?.[0].replace(/\s/g, "").length ?? 0);
/** The roundup's note for a cell ending in `n` stars: the line that starts with exactly that many. */
export function footnoteFor(n, notes = []) {
  if (!n) return null;
  for (const block of notes) for (const line of String(block).split("\n")) {
    const m = line.trim().match(/^(\*+)\s*(.+)$/);
    if (m && m[1].length === n) return unfenced(m[2]);
  }
  return null;
}
const DASH = /^[–—-]*\**$/;
const listOf = (s) => {
  const t = clean(s);
  if (!t || DASH.test(t)) return [];
  return t.split(/\s*,\s*|\s*;\s*|\s+&\s+(?=[A-Z])/).map(unfenced).filter((x) => x && !DASH.test(x));
};
const isoDay = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? "")) ? s : null);

/**
 * One Inc42 table row, as the family's page reads it. `company` is the
 * registry id the printed name matched; `familyNamed` the book members the
 * investor list names (`FAMILY_NAME`), for the page's "Named in the filings".
 */
export function readRow(deal, article, company, familyName) {
  let amountText = clean(deal.amount), roundText = clean(deal.round);
  let swapped = false;
  if (!parseMoney(amountText) && parseMoney(roundText)) { [amountText, roundText] = [roundText, amountText]; swapped = true; }
  const money = parseMoney(amountText);
  const footnote = footnoteFor(stars(amountText) || stars(roundText), article?.notes ?? []);
  const investors = listOf(deal.investors);
  const leads = listOf(deal.leadInvestor);
  const named = familyName ? [...new Set([...investors, ...leads].filter((x) => familyName.test(x)))] : [];
  const roundName = clean(roundText.replace(/\*+$/, ""));
  return {
    id: deal.id,
    company,
    date: isoDay(deal.dateISO),
    dateText: clean(deal.date),
    name: unfenced(deal.company) ?? "",
    round: DASH.test(roundName) || /^undisclosed$/i.test(roundName) ? null : roundName,
    amountText: DASH.test(amountText) ? null : amountText,
    amount: money,
    ...(swapped ? { swapped: true } : {}),
    footnote,
    investors,
    leadInvestors: leads,
    sector: unfenced(deal.sector) || null,
    subsector: unfenced(deal.subsector) || null,
    businessModel: unfenced(deal.businessModel) || null,
    url: deal.sourceUrl,
    title: unfenced(deal.sourceTitle),
    published: typeof deal.publishedAt === "string" ? deal.publishedAt.slice(0, 10) : null,
    ...(deal.sourceMissing ? { sourceMissing: true } : {}),
    ...(named.length ? { familyNamed: named } : {}),
  };
}

// ── THE SAME ROUND, RESEARCHED AND REPORTED ────────────────────────────────
export const roundKeyOf = (r) => `${r.date}|${r.round}`;
const dayOf = (d) => (d.length === 7 ? `${d}-15` : d);
const days = (a, b) => Math.abs(Date.parse(dayOf(a)) - Date.parse(dayOf(b))) / 86_400_000;
const amounts = (m) => (m ? [{ value: m.value, currency: m.currency }, ...(m.alt ?? [])] : []);
const STOP = new Set(["fund", "funds", "capital", "ventures", "venture", "partners", "partner", "family", "office", "offices", "investment", "investments",
  "investor", "investors", "group", "limited", "private", "growth", "advisors", "advisers", "management", "holdings", "trust", "india", "global",
  "the", "and", "others", "existing", "angel", "angels", "network", "series", "financial", "services", "asset", "assets", "wealth", "equity"]);
const tokens = (names) => new Set(names.flatMap((n) => clean(n).toLowerCase().split(/[^a-z0-9]+/)).filter((w) => w.length >= 3 && !STOP.has(w)));
const series = (s) => (String(s ?? "").match(/\bseries\s+([a-z])\b/i)?.[1]?.toLowerCase() ?? (/\bpre[-\s]?seed\b/i.test(s ?? "") ? "preseed" : /\bseed\b/i.test(s ?? "") ? "seed" : null));
const preSeries = (s) => /\bpre[-\s]?series\b/i.test(String(s ?? ""));

/**
 * The evidence that a reported row is a researched round: a score and the
 * words for it, or a reason it cannot be (a contradiction).
 */
export function foldEvidence(row, round) {
  if (!row.date || days(row.date, round.date) > FOLD_DAYS) return { score: 0, why: [], contradiction: "not dated within the window" };
  const why = [];
  let score = 0;
  if (row.amount) {
    const theirs = amounts(round.amountRaised).filter((a) => a.currency === row.amount.currency);
    if (theirs.length) {
      if (theirs.some((a) => Math.abs(a.value / row.amount.value - 1) <= AMOUNT_TOLERANCE)) { score += 2; why.push("the same amount"); }
      else return { score: 0, why, contradiction: "a different amount in the same currency" };
    }
  }
  const a = tokens([...row.investors, ...row.leadInvestors]);
  const b = tokens([...round.leadInvestors, ...(round.investors ?? [])]);
  const shared = [...a].filter((w) => b.has(w));
  if (shared.length) { score += 2; why.push("an investor both name"); }
  if (row.date === round.date) { score += 1; why.push("the same day"); }
  // Two different series letters are two rounds. "Seed" and "Pre-seed" are not:
  // publications label the same first cheque either way, so neither counts for
  // or against.
  const sa = series(row.round), sb = series(round.round);
  const seedish = (x) => x === "seed" || x === "preseed";
  if (sa && sb && !(seedish(sa) && seedish(sb) && sa !== sb)) {
    if (sa !== sb || preSeries(row.round) !== preSeries(round.round)) return { score: 0, why, contradiction: "a different series" };
    score += 1; why.push("the same series");
  }
  return { score, why, contradiction: null };
}

/**
 * Each reported row's researched round, or null: a row folds onto the round
 * with the strongest evidence (score ≥ 2, no contradiction, a unique best),
 * and a round takes at most one row — the strongest; a tie folds neither.
 */
export function foldRows(rows, rounds) {
  const best = new Map();
  for (const row of rows) {
    const scored = rounds.map((r) => ({ r, ...foldEvidence(row, r) })).filter((x) => !x.contradiction && x.score >= 2).sort((x, y) => y.score - x.score);
    if (scored.length && (scored.length === 1 || scored[0].score > scored[1].score)) best.set(row, scored[0]);
  }
  const claimed = new Map();
  for (const [row, hit] of best) {
    const held = claimed.get(hit.r);
    if (!held || hit.score > held.hit.score) claimed.set(hit.r, { row, hit, tie: false });
    else if (hit.score === held.hit.score) held.tie = true;
  }
  const out = new Map(rows.map((row) => [row, null]));
  for (const [round, { row, hit, tie }] of claimed) if (!tie) out.set(row, { key: roundKeyOf(round), why: hit.why.join(", ") });
  return out;
}
