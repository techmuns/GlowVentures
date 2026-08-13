// THE RELEASE CALENDAR'S DERIVED FIGURES, against a REAL saved response.
//   npm run test:family
//
// The fixture is `economic-calendar.tradingview.com/events` for IN + US over
// 2026-08-12 → 2026-08-16, saved verbatim. It is a real payload for the same
// reason the financial-table and cash-flow suites use real ones: a hand-written
// sample proves only that two inventions agree with each other, and every quirk
// worth testing here is one the source actually has.
//
// Each case below is a place where the wrong answer renders as an ordinary,
// believable line on a calendar.
import fs from "node:fs";
import path from "node:path";
import {
  impactOf, IMPACT_LABEL, surpriseOf, surpriseDirection, fmtEconValue,
  byDay, dayOf, isDayOnly, categoryLabel, shiftDate, type EconEvent,
} from "@/lib/econCalendar";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const FIX = process.env.GLOW_FIXTURES ?? path.join(process.cwd(), "src/lib/__tests__/fixtures");
const raw = JSON.parse(fs.readFileSync(path.join(FIX, "tv-calendar-IN-US.json"), "utf8"));
const rows: EconEvent[] = raw.result.map((e: Record<string, unknown>) => ({
  id: String(e.id), date: e.date as string, country: e.country as string, title: e.title as string,
  indicator: (e.indicator ?? null) as string | null, category: (e.category ?? null) as string | null,
  period: (e.period ?? null) as string | null, referenceDate: (e.referenceDate ?? null) as string | null,
  importance: typeof e.importance === "number" ? e.importance : null,
  actual: typeof e.actual === "number" ? e.actual : null,
  forecast: typeof e.forecast === "number" ? e.forecast : null,
  previous: typeof e.previous === "number" ? e.previous : null,
  unit: (e.unit ?? null) as string | null, currency: (e.currency ?? null) as string | null,
  source: (e.source ?? null) as string | null, sourceUrl: (e.source_url ?? null) as string | null,
  comment: (e.comment ?? null) as string | null,
}));

ok("the fixture is a real payload with events in it", rows.length > 20, `${rows.length} events`);

// ── The anchor row: India CPI ───────────────────────────────────────────────
//
// This one figure is why the calendar was built. The Economy page once printed
// "India CPI actual 4.83%" as an INVENTED sample, which CLAUDE.md records as a
// fabrication. The same field is now measured, and this asserts it arrives with
// everything needed to render it honestly — a value, a unit, a period and the
// agency that published it.
const cpi = rows.find((r) => r.country === "IN" && r.title === "Inflation Rate YoY");
ok("India's headline CPI is in the payload", !!cpi);
if (cpi) {
  eq("  its actual, consensus and previous are all numbers", [cpi.actual, cpi.forecast, cpi.previous], [4.45, 4.5, 4.38]);
  eq("  it carries its unit", cpi.unit, "%");
  eq("  it names the period the reading is FOR", cpi.period, "Jul");
  eq("  it names the publishing agency", cpi.source, "Ministry of Statistics and Programme Implementation (MOSPI)");
  // 16:00 IST = 10:30 UTC. If this drifts, the release is being shown at an
  // hour the agency never published at.
  eq("  its timestamp is the real release instant, in UTC", cpi.date, "2026-08-12T10:30:00.000Z");
  eq("  surprise = actual - consensus", Number(surpriseOf(cpi)!.toFixed(2)), -0.05);
  eq("  and it is reported as BELOW consensus, with no verdict attached", surpriseDirection(surpriseOf(cpi)), "below");
}

// ── Surprise must never be struck against a missing half ────────────────────
//
// Most rows on a forward calendar have no actual, and many have no consensus at
// all. A surprise computed against either missing half would report the whole
// actual as a beat — the same failure as an IPS gap against a defaulted target.
const noForecast = rows.filter((r) => r.actual != null && r.forecast == null);
const noActual = rows.filter((r) => r.actual == null);
ok("the payload really does contain both half-missing cases", noForecast.length > 0 && noActual.length > 0,
  `${noForecast.length} with an actual but no consensus, ${noActual.length} not yet released`);
ok("no surprise is computed where the consensus is missing", noForecast.every((r) => surpriseOf(r) === null));
ok("no surprise is computed where the actual is missing", noActual.every((r) => surpriseOf(r) === null));

// A ZERO actual is a measurement and must survive. If `actual: 0` were treated
// as absent — the classic falsy-check bug — a genuine flat print would vanish
// from the table and its surprise would read as unmeasurable.
{
  const zero: EconEvent = { ...rows[0], actual: 0, forecast: 0.3, previous: 0.2 };
  eq("a zero actual is a reading, not an absence", surpriseOf(zero), -0.3);
  eq("and it formats as 0, not as a dash", fmtEconValue(0, "%", null), "0%");
}

// ── Impact: the mapping was verified against known-high events ──────────────
//
// -1 low / 0 medium / 1 high. Reading it the other way round would print "High"
// against a 3-month bill auction, which is the fabricated-classification
// failure this book already caught once in `VAL_METHODS[i % 5]`.
eq("impact mapping", [impactOf(1), impactOf(0), impactOf(-1), impactOf(null)],
  ["high", "medium", "low", "unranked"]);
{
  const high = rows.filter((r) => impactOf(r.importance) === "high").map((r) => r.title);
  // Whatever else is in the window, the high bucket must be recognisably the
  // market-moving prints and must NOT be dominated by auctions.
  ok("the high bucket holds market-moving prints", high.some((t) => /Inflation Rate|Non Farm Payrolls|Unemployment Rate|PMI/i.test(t)),
    high.slice(0, 6).join(", "));
  ok("no bill auction is ranked high", !high.some((t) => /Bill Auction/i.test(t)));
  eq("an unranked release is labelled as such, never demoted to low", IMPACT_LABEL[impactOf(null)], "Unranked");
}

// ── A value is never rendered without its unit ──────────────────────────────
//
// 4.45 is a percent, 692.87 is billions. The harvest store learnt this when
// Yahoo quoted grains in cents: reading ¢639 as $639 is a 100x error that looks
// like an ordinary price.
eq("percent", fmtEconValue(4.45, "%", "INR"), "4.45%");
eq("magnitude suffix", fmtEconValue(1800, "K", "USD"), "1,800K");
eq("no unit reported → the bare number, never an invented one", fmtEconValue(332.81, null, "USD"), "332.81");
eq("absent stays absent", fmtEconValue(null, "%", "INR"), null);

// ── A release with no announced time must not move a day ───────────────────
//
// The source stamps a date-only release at midnight UTC. Rendered in a zone
// behind UTC that lands on the PREVIOUS day, so an event with no announced hour
// would silently shift. Those are treated as day-only and grouped on the
// source's own date.
{
  const dayOnly = rows.filter((r) => isDayOnly(r.date));
  ok("the payload contains date-only releases", dayOnly.length > 0, `${dayOnly.length} of ${rows.length}`);
  ok("a date-only release groups on the source's own date, never a shifted one",
    dayOnly.every((r) => dayOf(r.date) === r.date.slice(0, 10)),
    dayOnly.slice(0, 2).map((r) => `${r.title} ${r.date} -> ${dayOf(r.date)}`).join(" | "));
}

// ── Grouping ────────────────────────────────────────────────────────────────
{
  const days = byDay(rows);
  ok("every event lands in exactly one day", days.reduce((n, d) => n + d.events.length, 0) === rows.length);
  ok("days come back in chronological order", days.every((d, i) => i === 0 || days[i - 1].day <= d.day),
    days.map((d) => d.day).join(" "));
}

// ── Small helpers that are easy to get subtly wrong ─────────────────────────
eq("an unknown category code passes through rather than being dropped", categoryLabel("zzz"), "zzz");
eq("a known one is spelled out", categoryLabel("prce"), "Prices & inflation");
eq("no category at all is named", categoryLabel(null), "Uncategorised");
// shiftDate must work off LOCAL calendar days — a UTC-based one rolls the date
// early for any reader east of Greenwich, which is every reader of this book.
eq("shiftDate is local-calendar and crosses a month end", shiftDate(new Date(2026, 7, 31, 23, 30), 1), "2026-09-01");
eq("shiftDate goes backwards too", shiftDate(new Date(2026, 0, 1, 0, 30), -1), "2025-12-31");

process.exit(fails ? 1 : 0);
