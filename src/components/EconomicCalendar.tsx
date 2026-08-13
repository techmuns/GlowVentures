import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ExternalLink } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentSection, DASH } from "@/components/Absent";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import {
  fetchCalendar, isCalendarError, calendarReason, byDay, dayOf, isDayOnly, eventTime,
  impactOf, IMPACT_LABEL, categoryLabel, fmtEconValue, surpriseOf, surpriseDirection, shiftDate,
  type CalendarResponse, type CalendarError, type EconEvent, type Impact,
} from "@/lib/econCalendar";

// THE ECONOMIC RELEASE CALENDAR — previous · consensus · actual · surprise,
// with the filters the reference sites carry (date range, country, impact,
// category), served by `functions/api/econ-calendar.js`.
//
// The panel this replaces said a calendar could not be built here because a
// schedule and a consensus are "licensed products sold by paid vendors". That
// was an absence recorded against an UNCHECKED premise, and it is the third
// time this repo has made that mistake. Measured 2026-08-13: TradingEconomics'
// free API is discontinued (HTTP 410) and Bloomberg 403s, but TradingView's
// calendar endpoint answers with all four columns, an importance rank, the
// period each reading is for, the unit, and the AGENCY that published it.
//
// WHAT IS DELIBERATELY NOT DRAWN HERE
//
//   • NO VERDICT ON A SURPRISE. A CPI print above consensus is bad news; a GDP
//     print above consensus is good news; an unemployment rate above consensus
//     is bad again. Nothing in the feed says which way round an indicator runs,
//     so colouring beats green would assert a direction for hundreds of
//     indicators nobody classified. The sign is shown; the meaning is the
//     reader's.
//   • NO EVENT WITHOUT ITS UNIT. 4.45 is a percent and 692.87 is billions —
//     the unit travels with the figure, as it does in the harvest store.
//   • NO INVENTED CLOCK. Events the source stamps at midnight UTC carry no
//     announced time; they render as day-only rather than being shown at a
//     local hour the source never stated.

/** The book is Indian, so these two lead. Every country the feed carries is selectable. */
const DEFAULT_COUNTRIES = ["IN", "US"];

/** The countries worth offering first; the rest are reachable via "All". */
const COUNTRY_NAME: Record<string, string> = {
  IN: "India", US: "United States", EU: "Euro Zone", GB: "United Kingdom", CN: "China",
  JP: "Japan", DE: "Germany", FR: "France", HK: "Hong Kong", SG: "Singapore",
  AU: "Australia", CA: "Canada", CH: "Switzerland", KR: "South Korea", BR: "Brazil",
  RU: "Russia", ZA: "South Africa", IT: "Italy", ES: "Spain", NZ: "New Zealand",
};
const COUNTRY_OPTIONS = Object.keys(COUNTRY_NAME);

type RangeKey = "today" | "week" | "next" | "past";
const RANGES: { key: RangeKey; label: string; of: (t: Date) => [string, string] }[] = [
  { key: "today", label: "Today", of: (t) => [shiftDate(t, 0), shiftDate(t, 1)] },
  { key: "week", label: "This week", of: (t) => [shiftDate(t, -t.getDay()), shiftDate(t, 7 - t.getDay())] },
  { key: "next", label: "Next 30 days", of: (t) => [shiftDate(t, 0), shiftDate(t, 30)] },
  { key: "past", label: "Past 30 days", of: (t) => [shiftDate(t, -30), shiftDate(t, 1)] },
];

const IMPACTS: Impact[] = ["high", "medium", "low", "unranked"];

const impactDot = (i: Impact) =>
  i === "high" ? "bg-loss" : i === "medium" ? "bg-amber-400" : i === "low" ? "bg-slate-500" : "border border-ink-600";

export function EconomicCalendar() {
  const today = useMemo(() => new Date(), []);
  const [range, setRange] = useState<RangeKey>("week");
  const [countries, setCountries] = useState<Set<string>>(() => new Set(DEFAULT_COUNTRIES));
  const [impacts, setImpacts] = useState<Impact[]>(["high", "medium"]);
  const [categories, setCategories] = useState<Set<string>>(() => new Set());
  const [state, setState] = useState<CalendarResponse | CalendarError | undefined>(undefined);

  const [from, to] = useMemo(() => (RANGES.find((r) => r.key === range) ?? RANGES[1]).of(today), [range, today]);

  useEffect(() => {
    let alive = true;
    setState(undefined);
    fetchCalendar(from, to, [...countries]).then((r) => { if (alive) setState(r); });
    return () => { alive = false; };
  }, [from, to, [...countries].sort().join(",")]);   // eslint-disable-line react-hooks/exhaustive-deps

  const events = state && !isCalendarError(state) ? state.events : [];

  // Category options come from what actually came back, never a fixed list —
  // so a code the upstream adds appears rather than being silently dropped.
  const categoryOptions = useMemo(
    () => [...new Set(events.map((e) => e.category ?? "").filter(Boolean))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))),
    [events],
  );

  const filtered = useMemo(() => events.filter((e) => {
    if (impacts.length && !impacts.includes(impactOf(e.importance))) return false;
    if (categories.size && !categories.has(e.category ?? "")) return false;
    return true;
  }), [events, impacts, categories]);

  const days = useMemo(() => byDay(filtered), [filtered]);
  const todayKey = shiftDate(today, 0);

  const body = (() => {
    if (state === undefined) {
      return <div className="grid h-32 place-items-center text-sm text-slate-500">Loading the release calendar…</div>;
    }
    if (isCalendarError(state)) {
      return <AbsentSection what="The release calendar could not be fetched" needs={calendarReason(state)} />;
    }
    if (!events.length) {
      return (
        <AbsentSection
          what="No releases in this window"
          needs={`The feed carries no scheduled release between ${from} and ${to} for ${countries.size ? [...countries].map((c) => COUNTRY_NAME[c] ?? c).join(", ") : "any country"}. Its forward horizon is about a month — beyond that no vendor here publishes a schedule, so a longer view would be empty rather than wrong.`} />
      );
    }
    if (!filtered.length) {
      return (
        <AbsentSection
          what="Every release in this window is filtered out"
          needs={`${events.length} release${events.length === 1 ? "" : "s"} came back; the impact and category filters above exclude all of them. Widen either to see them.`} />
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-ink-700">
              <th className="label-xs px-2 py-2 text-left font-medium">Time</th>
              <th className="label-xs px-2 py-2 text-left font-medium">Country</th>
              <th className="label-xs px-2 py-2 text-left font-medium">Event</th>
              <th className="label-xs px-2 py-2 text-left font-medium" title="The month or quarter the reading is FOR — not the day it is published.">Period</th>
              <th className="label-xs px-2 py-2 text-right font-medium">Actual</th>
              <th className="label-xs px-2 py-2 text-right font-medium" title="What the street expects, where the feed carries a consensus.">Consensus</th>
              <th className="label-xs px-2 py-2 text-right font-medium">Previous</th>
              <th className="label-xs px-2 py-2 text-right font-medium" title="Actual less consensus. Shown only where BOTH are published — a surprise struck against a missing consensus would be the whole actual dressed up as a beat.">Surprise</th>
            </tr>
          </thead>
          {days.map(({ day, events: evs }) => (
            <tbody key={day} className="divide-y divide-ink-700/60">
              <tr>
                <td colSpan={8} className="bg-ink-800/60 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  {day === todayKey && <span className="ml-2 rounded bg-champagne-500/20 px-1.5 py-px text-[10px] font-semibold text-champagne-400">Today</span>}
                  <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">· {evs.length} release{evs.length === 1 ? "" : "s"}</span>
                </td>
              </tr>
              {evs.map((e) => <EventRow key={e.id} e={e} />)}
            </tbody>
          ))}
        </table>
      </div>
    );
  })();

  return (
    <Card
      title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-champagne-400" /> Data release calendar</span>}
      subtitle="Previous · consensus · actual · surprise vs consensus"
      right={state && !isCalendarError(state)
        ? <Pill tone="info">{filtered.length} of {state.count} shown</Pill>
        : undefined}>

      {/* Filters — the ones the reference calendars carry. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex w-fit items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
          {RANGES.map((r) => (
            <button key={r.key} type="button" onClick={() => setRange(r.key)}
              className={`rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${range === r.key ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <MultiSelectFilter options={COUNTRY_OPTIONS} selected={countries} onChange={setCountries}
          allLabel="All countries" unit="countries" placeholder="Search countries…" className="w-56"
          render={(c) => COUNTRY_NAME[c] ?? c} />
        <div className="inline-flex w-fit items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
          {IMPACTS.map((i) => {
            const on = impacts.includes(i);
            return (
              <button key={i} type="button"
                onClick={() => setImpacts((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))}
                title={i === "unranked" ? "Releases the feed does not rank. Excluded by default rather than shown as low — an unranked event is not a minor one." : `${IMPACT_LABEL[i]}-impact releases`}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${on ? "bg-ink-700 text-slate-100" : "text-slate-500 hover:bg-ink-700/40"}`}>
                <span className={`h-2 w-2 rounded-full ${impactDot(i)} ${on ? "" : "opacity-40"}`} />{IMPACT_LABEL[i]}
              </button>
            );
          })}
        </div>
        {categoryOptions.length > 0 && (
          <MultiSelectFilter options={categoryOptions} selected={categories} onChange={setCategories}
            allLabel="All categories" unit="categories" placeholder="Search categories…" className="w-56"
            render={(c) => categoryLabel(c)} />
        )}
      </div>

      {/* SERVED-STALE AND TRUNCATION, BOTH SAID OUT LOUD, ABOVE THE TABLE. */}
      {state && !isCalendarError(state) && state.stale && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            The calendar feed did not respond, so this is the last saved copy
            {typeof state.ageS === "number" ? ` — fetched ${state.ageS < 3600 ? `${Math.max(1, Math.round(state.ageS / 60))}m` : `${Math.floor(state.ageS / 3600)}h`} ago` : ""}.
            A schedule barely moves, but an <span className="font-semibold">actual</span> that has landed since will not be in it.
          </span>
        </div>
      )}
      {state && !isCalendarError(state) && (state.truncated || state.slicesFailed > 0) && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {state.truncated && <>This window hit the feed's per-request row limit, so it is <span className="font-semibold">incomplete</span> — narrow the date range or the country list to see all of it. </>}
            {state.slicesFailed > 0 && <>{state.slicesFailed} of {state.slices} sub-requests failed, so part of this range is missing rather than empty.</>}
          </span>
        </div>
      )}

      {body}

      <p className="mt-3 border-t border-dashed border-ink-700 pt-2.5 text-[11px] leading-relaxed text-slate-500">
        <span className="font-medium text-slate-400">Times are your own local zone.</span> A release the source publishes
        without an announced time shows as <span className="mono">{DASH}</span> rather than being placed at an invented hour.{" "}
        <span className="font-medium text-slate-400">Surprise</span> is actual less consensus and appears only where both are
        published — it carries a sign and no verdict, because whether a beat is good news depends on the indicator and nothing
        in this feed says which way round each one runs.{" "}
        <span className="font-medium text-slate-400">Impact</span> is the feed's own ranking; an unranked release is shown as
        such rather than folded into "low". Every row names the agency that published it.
        {state && !isCalendarError(state) && <> Source: {state.source}. Its forward horizon is about a month.</>}
      </p>
    </Card>
  );
}

function EventRow({ e }: { e: EconEvent }) {
  const impact = impactOf(e.importance);
  const s = surpriseOf(e);
  const dir = surpriseDirection(s);
  const val = (v: number | null) => fmtEconValue(v, e.unit, e.currency);
  const actual = val(e.actual);
  return (
    <tr className="hover:bg-ink-700/30">
      <td className="whitespace-nowrap px-2 py-2 mono text-[11.5px] text-slate-400">
        {isDayOnly(e.date)
          ? <span title="The source publishes no time for this release, only a date.">{DASH}</span>
          : eventTime(e.date)}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-[12px] text-slate-300">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${impactDot(impact)}`} title={`${IMPACT_LABEL[impact]} impact`} />
          {COUNTRY_NAME[e.country ?? ""] ?? e.country ?? DASH}
        </span>
      </td>
      <td className="px-2 py-2 text-slate-100">
        <span title={e.comment ?? undefined}>{e.title}</span>
        {e.source && (
          <span className="block text-[10.5px] text-slate-500">
            {e.sourceUrl
              ? <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-champagne-400">
                  {e.source}<ExternalLink className="h-2.5 w-2.5" />
                </a>
              : e.source}
            {e.category && <span className="ml-1.5 text-slate-600">· {categoryLabel(e.category)}</span>}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-[11.5px] text-slate-400">{e.period ?? DASH}</td>
      <td className="whitespace-nowrap px-2 py-2 text-right mono">
        {actual == null
          ? <span className="text-slate-600" title="Not published yet — this release is still ahead.">{DASH}</span>
          : <span className="font-semibold text-slate-100">{actual}</span>}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right mono text-slate-400">
        {val(e.forecast) ?? <span className="text-slate-600" title="No consensus is published for this release.">{DASH}</span>}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right mono text-slate-400">
        {val(e.previous) ?? <span className="text-slate-600">{DASH}</span>}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right mono">
        {s == null
          ? <span className="text-slate-600" title={e.actual == null ? "Not released yet." : "No consensus was published, so there is nothing to measure the surprise against."}>{DASH}</span>
          : <span className="text-slate-200" title={`${dir} consensus`}>{s > 0 ? "+" : ""}{fmtEconValue(s, e.unit, e.currency)}</span>}
      </td>
    </tr>
  );
}
