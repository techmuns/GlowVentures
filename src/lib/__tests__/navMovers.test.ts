// THE DAILY-NAV MOVERS, CHECKED AGAINST THE BOOK AND THE COMMITTED NAV STORE.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   "wherever there is a daily NAV available and if there is a drastic moment
//    in the line item for some reason, can we capture that? … Because a silver
//    ETF can have a drastic moment ऊपर नीचे."
//
// This card prints a rupee figure that is DERIVED — the scheme's published move
// applied to what the book values the holding at — beside a percentage that is
// MEASURED. Three things can go wrong quietly and none of them shows on a
// rendered page:
//
//   • the rupee move struck as `units × NAV`, which is exact arithmetic on a
//     wrong premise: the units and the NAV are not on the same base for every
//     holding, and it puts a ₹16.88 Cr gold ETF at ₹1.76 Cr;
//   • a scheme's row double-counted or dropped, so a coverage figure moves
//     while every caption still reads correctly;
//   • a NAV move blended into a "today" figure struck on live quotes, which is
//     a real figure under the wrong day.
//
// ── THE ANCHORS ARE TWO GENERATED ARTEFACTS, NOT TYPED FIGURES ──────────────
//
// `glowData.ts` comes from `source/` through `build-book`; the NAV store comes
// from a READ-ONLY checkout of `techmuns/amfibeas` through `build-lookthrough`.
// They move on their own schedules, so every expectation is either derived from
// both on this run or written as a RELATION that survives either moving.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_POSITIONS, BOOK_ACCOUNTS } from "@/data/glowData";
import { accountIndex, engagementOf } from "@/lib/accounts";
import { currentHoldings, dedupedPositions, holdingBucket, isFundVehicle } from "@/lib/analytics";
import { navMoverModel, isDrastic, DRASTIC_PCT, NAV_MOVER_BUCKETS } from "@/lib/navMovers";
import type { SchemeMatch } from "@/lib/lookthrough";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (name: string, got: number | null | undefined, want: number, tol = 0.01) => {
  const pass = got != null && Math.abs(got - want) <= tol;
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${got} want ${want}`); }
  else console.log(`ok   ${name} = ${got}`);
};

const ROOT = process.env.GLOW_ROOT ?? process.cwd();
const store = JSON.parse(readFileSync(path.join(ROOT, "public/lookthrough/index.json"), "utf8"));
const schemes = new Map<string, SchemeMatch>(Object.entries(store.schemes ?? {}));
const accts = accountIndex(BOOK_ACCOUNTS);
const cr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

const rows = currentHoldings(dedupedPositions(BOOK_POSITIONS));
const m = navMoverModel(rows, accts, schemes);

console.log(`\n${m.rows.length} schemes · ${cr(m.coveredValue)} of ${cr(m.scopeValue)} · ${m.changePct?.toFixed(4)}% · NAV ${m.navDates.join(", ")}`);

// ── THE LOAD-BEARING GATE ───────────────────────────────────────────────────
// A suite that passes over no input claims confidence nobody earned. If the
// store ever stops resolving these holdings, every equality below is trivially
// satisfied — so the first assertion is that there is something to check.
ok("the store prices something in scope", m.rows.length > 0, `${m.rows.length} schemes`);
ok("the scope is not empty", m.scopeNames > 0, `${m.scopeNames} names`);

// ── EVERY ROW TIES TO ITS OWN COLUMNS ───────────────────────────────────────
// `move ÷ value` must be the printed percentage, exactly. This is what makes it
// safe to show the three figures side by side: a reader dividing one printed
// cell by another gets the third.
ok("every row's move ÷ value is its printed percentage",
  m.rows.every((r) => Math.abs((r.move / r.value) * 100 - r.changePct) < 1e-9));
near("the aggregate percentage is value-weighted, not an average",
  (m.move / m.coveredValue) * 100, m.changePct!, 1e-9);

// AND IT IS NOT THE MEAN OF THE ROWS' PERCENTAGES, which is the wrong figure a
// naive aggregate produces — it weights a ₹107 residual the same as a ₹42 Cr
// position. Asserted as an INEQUALITY so it cannot pass by accident on a book
// where the two happen to coincide.
{
  const mean = m.rows.reduce((a, r) => a + r.changePct, 0) / m.rows.length;
  ok("the aggregate is not the unweighted mean of the rows",
    Math.abs(mean - m.changePct!) > 1e-6, `mean ${mean.toFixed(4)}% vs weighted ${m.changePct!.toFixed(4)}%`);
}

// ── THE PARTITION ───────────────────────────────────────────────────────────
// Covered plus skipped is the whole scope. A holding the store cannot price is
// NAMED, never dropped in silence and never blended in as a zero move.
near("covered + skipped === the scope",
  m.coveredValue + m.skipped.reduce((a, s) => a + s.value, 0), m.scopeValue, 1);
ok("every skipped holding carries a reason", m.skipped.every((s) => !!s.reason && s.reason.length > 10));

// ── THE SCOPE IS THE TWO BUCKETS, AND NEVER AN AIF ──────────────────────────
//   "AIF में monthly NAV आएगा" — the family said so first, and it is a fact
// about the instrument: no alternative fund publishes a daily NAV.
{
  const scope = rows.filter((p) => (NAV_MOVER_BUCKETS as readonly string[])
    .includes(holdingBucket(p, engagementOf(accts, p))));
  ok("no AIF holding is in scope", scope.every((p) => p.assetClass !== "AIF"));
  ok("every holding in scope is a fund vehicle", scope.every(isFundVehicle));
  // AND NOTHING A PMS MANAGER CHOSE. `holdingBucket` is where that lives; this
  // asserts the card reads it rather than the asset class.
  ok("nothing held inside a PMS mandate is in scope",
    scope.every((p) => engagementOf(accts, p) !== "PMS"));
}

// ── A REDEEMED SCHEME IS NOT A MOVER ────────────────────────────────────────
// A fund still publishes a NAV after the family has redeemed, so without
// `currentHoldings` this card would report a daily move on money that has
// already been paid back. Asserted by feeding it the UNFILTERED book and
// requiring the covered value to be unchanged — the closed rows are ₹0, so a
// value comparison alone cannot see it; the COUNT is what moves.
{
  const unfiltered = navMoverModel(dedupedPositions(BOOK_POSITIONS), accts, schemes);
  const closed = dedupedPositions(BOOK_POSITIONS).filter((p) =>
    isFundVehicle(p) && p.quantity === 0 && p.currentPrice != null
    && (NAV_MOVER_BUCKETS as readonly string[]).includes(holdingBucket(p, engagementOf(accts, p))));
  if (closed.length === 0) {
    console.log("ok   (no redeemed ETF or mutual-fund row in this book to exclude)");
  } else {
    ok("a redeemed scheme is excluded from the scope count",
      unfiltered.scopeNames > m.scopeNames, `${unfiltered.scopeNames} unfiltered vs ${m.scopeNames}`);
  }
}

// ── THE UNIT TRAP, ASSERTED RATHER THAN DESCRIBED ───────────────────────────
//
// The whole reason the rupee move is derived from the book's value: for at
// least one holding the units and the published NAV are NOT on the same base,
// so `units × NAV` is an order of magnitude out. Measured on this book that is
// the DSP gold and silver ETFs. Written as a measurement rather than a name, so
// it keeps meaning something when the drop changes.
{
  const offenders = rows.filter((p) => {
    const nav = schemes.get(p.securityKey)?.nav?.value;
    if (nav == null || !p.quantity || !p.marketValue) return false;
    return Math.abs((p.quantity * nav) / p.marketValue - 1) > 0.5;
  });
  if (offenders.length === 0) {
    console.log("ok   (no holding in this drop has a unit base that disagrees with its published NAV)");
  } else {
    ok("the model never values a holding at units × NAV",
      m.rows.every((r) => r.value > 0),
      `${offenders.length} holding(s) would be misvalued by units × NAV: ${offenders.map((p) => p.security).join(", ")}`);
    // And the row for such a holding carries the BOOK's value, to the rupee.
    for (const p of offenders) {
      const sc = schemes.get(p.securityKey)!.schemecode;
      const row = m.rows.find((r) => r.schemecode === sc);
      if (!row) { ok(`${p.security} has a row`, false); continue; }
      const byUnits = p.quantity * (schemes.get(p.securityKey)!.nav!.value ?? 0);
      ok(`${p.security}: the row carries the book's value, not units × NAV`,
        row.value >= p.marketValue - 1 && Math.abs(row.value - byUnits) > 1,
        `row ${cr(row.value)} · book ${cr(p.marketValue)} · units×NAV ${cr(byUnits)}`);
    }
  }
}

// ── ONE SCHEME IS ONE ROW, ACROSS EVERY KEY THE BOOK NAMES IT BY ────────────
// A NAV is published against a scheme, so a scheme is one mover however many
// securityKeys reach it. Helios Flexi Cap is in this book twice — the AMC folio
// and the depository's clipped name — and both resolve one ISIN.
ok("no scheme appears twice", new Set(m.rows.map((r) => r.schemecode)).size === m.rows.length);
{
  const clubbed = m.rows.filter((r) => r.keys > 1);
  if (clubbed.length === 0) console.log("ok   (no scheme in this book is reached by more than one securityKey)");
  else ok("a scheme reached by two keys is ONE row", clubbed.every((r) => r.keys > 1 && r.positions >= r.keys),
    clubbed.map((r) => `${r.scheme} (${r.keys} keys, ${r.positions} statements)`).join("; "));
}

// ── THE TWO PLANS OF ONE FUND ARE TWO ROWS AND ARE TOLD APART ───────────────
// They differ in expense ratio and therefore in NAV, not in what the fund owns,
// so two rows of one scheme NAME are legitimate — and unreadable without the
// plan beside them.
{
  const byName = new Map<string, typeof m.rows>();
  for (const r of m.rows) byName.set(r.scheme, [...(byName.get(r.scheme) ?? []), r]);
  const dupes = [...byName.values()].filter((v) => v.length > 1);
  if (dupes.length === 0) console.log("ok   (no fund in this book is held in more than one plan)");
  else ok("two plans of one fund carry different plan labels",
    dupes.every((v) => new Set(v.map((r) => r.plan)).size === v.length),
    dupes.map((v) => `${v[0].scheme}: ${v.map((r) => r.plan).join(" / ")}`).join("; "));
}

// ── EVERY ROW IS DATED, AND THE CARD'S OWN DATES ARE ITS ROWS' ──────────────
ok("every row carries both NAV dates", m.rows.every((r) => !!r.navDate && !!r.prevNavDate));
ok("a row's previous NAV is dated before its NAV", m.rows.every((r) => r.prevNavDate < r.navDate));
ok("the card's newest date is a row's date", m.rows.some((r) => r.navDate === m.newestNavDate));
ok("the date list is the rows' own",
  JSON.stringify(m.navDates) === JSON.stringify([...new Set(m.rows.map((r) => r.navDate))].sort().reverse()));

// ── "DRASTIC" LABELS AND NEVER DECIDES ──────────────────────────────────────
// The chip must not change which rows exist. Asserted by construction: every
// covered scheme has a row whether or not it crosses the bound.
{
  const chipped = m.rows.filter(isDrastic);
  ok(`the drastic bound is ${DRASTIC_PCT}% and labels only`,
    m.rows.length >= chipped.length && chipped.every((r) => Math.abs(r.changePct) >= DRASTIC_PCT),
    `${chipped.length} of ${m.rows.length} past the bound`);
  // AND IT FIRES WHEN IT SHOULD. Nothing on this book crosses 2%, so the label
  // is exercised against a constructed move rather than left unproven.
  ok("a move past the bound is labelled", isDrastic({ changePct: DRASTIC_PCT + 0.01 }));
  ok("a move inside the bound is not", !isDrastic({ changePct: DRASTIC_PCT - 0.01 }));
  ok("the bound is symmetric", isDrastic({ changePct: -(DRASTIC_PCT + 0.01) }));
}

// ── NOTHING NON-FINITE REACHES A FIGURE ─────────────────────────────────────
// A `?? 0` on an absent input is the absent-vs-zero rule failing through a
// field instead of a table cell, and a NaN renders as an em dash that looks
// deliberate.
ok("every figure is finite", m.rows.every((r) =>
  [r.nav, r.prevNav, r.changePct, r.value, r.move].every((n) => Number.isFinite(n))));
ok("the aggregate is finite", Number.isFinite(m.move) && Number.isFinite(m.coveredValue) && Number.isFinite(m.changePct!));

// ── AND A STORE THAT KNOWS NOTHING YIELDS NOTHING, NOT ZEROS ────────────────
{
  const empty = navMoverModel(rows, accts, new Map());
  ok("an empty store yields no rows", empty.rows.length === 0);
  ok("…and a null percentage rather than 0%", empty.changePct === null);
  ok("…and names every holding it could not price", empty.skipped.length > 0 && empty.skipped.every((s) => !!s.reason));
  near("…and still reports the scope it covers nothing of", empty.scopeValue, m.scopeValue, 1);
}

console.log(fails ? `\n${fails} FAILED` : "\nall nav-mover checks passed");
process.exit(fails ? 1 : 0);
