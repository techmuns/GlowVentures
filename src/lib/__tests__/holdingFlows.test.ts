// EVERY DATE BEHIND A HOLDING'S RETURN, CHECKED AGAINST THE GENERATED BOOK (Stage 10fw).
//   npm run test:family   (ONLY="holding flows")
//
// ── WHAT COULD GO WRONG HERE, AND WHY NO PAGE WOULD SHOW IT ─────────────────
//
// An annual rate is a figure over dates, and the wrong dates give a plausible
// wrong rate. Compounding a holding's whole return from its OLDEST lot made
// every rupee bought later look a year older than it is; a money-weighted rate
// that left out a dividend or a sale would sit a point or two off with nothing
// on screen to say so. So each flow is struck against a figure it did not
// produce: the dividends against the holding's own dividend total, the money in
// against the cost the lot register prints, and each rate against the family's
// rule — several payments XIRR, one compounded from its own day, under a year
// the holding-period return.
import { BOOK_ACCOUNTS, BOOK_CAPITAL_FROM_INCEPTION, BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_HOLDING_INCOME, BOOK_HOLDING_LOTS, BOOK_HOLDING_TRADES, BOOK_POSITIONS, BOOK_POSITION_TRANCHES, BOOK_RECOVERED_COSTS, BOOK_REVIEW_FLOWS } from "@/data/glowData";
import { holdingFlowsOf, holdingPeriodOf } from "@/lib/holdingFlows";
import { buildDatedCapital } from "@/lib/datedCapital";
import { holdingReturn, measuredReturn, type ReturnInput } from "@/lib/analytics";
import type { Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const ACC = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
const DC = buildDatedCapital({ moves: BOOK_CAPITAL_MOVES, commitments: BOOK_COMMITMENTS, accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS,
  tranches: BOOK_POSITION_TRANCHES, fromInception: BOOK_CAPITAL_FROM_INCEPTION, reviewFlows: BOOK_REVIEW_FLOWS });
const asOfOf = (p: Position) => ACC.get(p.accountId)?.asOf ?? null;
const flowsOf = (p: Position) => holdingFlowsOf(p, asOfOf(p));
const inputOf = (p: Position): ReturnInput => ({
  returnPct: p.returnPct, heldSince: p.heldSince, valuedAt: asOfOf(p), assetClass: p.assetClass,
  costBasis: p.costBasis, marketValue: p.marketValue, capital: DC.behind([p], BOOK_POSITIONS.filter((x) => x !== p)), opened: holdingPeriodOf([p]),
});
const AS_OF = BOOK_ACCOUNTS.map((a) => a.asOf).sort().at(-1)!;

const dated = BOOK_POSITIONS.filter((p) => flowsOf(p)?.dated);
const byTrades = dated.filter((p) => { const f = flowsOf(p); return f?.dated && f.basis === "trades"; });
const byLots = dated.filter((p) => { const f = flowsOf(p); return f?.dated && f.basis === "lots"; });
const byRecovered = dated.filter((p) => { const f = flowsOf(p); return f?.dated && f.basis === "recovered"; });
ok("the book dates holdings' money by their trades and by their lots", byTrades.length > 50 && byLots.length > 0,
  `${byTrades.length} by trades, ${byLots.length} by lots`);

// ── 1. THE FLOWS TIE TO FIGURES THEY DID NOT PRODUCE ────────────────────────
{
  // THE DIVIDENDS IN THE FLOWS ARE THE ONES THE HOLDING'S OWN TOTAL COUNTS:
  // what the flows add beyond its trades (or lots) is `dividendReceived`, read
  // by build-book off the dividend statements — never more, and all of it where
  // none was paid after the holding's own statement.
  const badIncome = dated.filter((p) => {
    const f = flowsOf(p);
    if (!f?.dated) return true;
    const key = `${p.accountId}|${p.securityKey}`;
    if (f.basis === "recovered") return false; // struck in its own section below
    const principal = f.basis === "lots"
      ? -(BOOK_HOLDING_LOTS[key] ?? []).reduce((a, l) => a + l.cost, 0)
      : (BOOK_HOLDING_TRADES[key] ?? []).filter((t) => t.date >= p.tradeRecord!.from && t.date <= p.tradeRecord!.to)
        .reduce((a, t) => a + (t.side === "buy" ? -(t.amount ?? 0) : (t.amount ?? 0)), 0);
    const income = f.flows.reduce((a, x) => a + x.amount, 0) - principal;
    const total = p.dividendReceived ?? 0;
    const end = f.close?.date ?? f.flows.at(-1)!.date;
    const later = (BOOK_HOLDING_INCOME[key] ?? []).some((x) => x.date! > end);
    return income > total + 0.01 || (!later && Math.abs(income - total) > 0.01);
  });
  ok("a dated holding's flows carry exactly the dividends its own total counts", badIncome.length === 0,
    badIncome.slice(0, 3).map((p) => p.securityKey).join(", "));
  const lotCost = byLots.filter((p) => {
    const lots = BOOK_HOLDING_LOTS[`${p.accountId}|${p.securityKey}`] ?? [];
    const paid = lots.reduce((a, l) => a + l.cost, 0);
    return p.costBasis === null || Math.abs(paid - p.costBasis) > Math.max(1, p.costBasis * 0.001);
  });
  ok("a lot-dated holding's money in is the cost its statement prints", lotCost.length === 0,
    lotCost.map((p) => `${p.securityKey}`).join(", "));
  const sinceLots = byLots.every((p) => flowsOf(p)!.dated && (flowsOf(p) as { since: string }).since === p.heldSince);
  ok("...and it starts on the oldest lot, as heldSince does", sinceLots);
  const outOfWindow = byTrades.filter((p) => {
    const f = flowsOf(p) as Extract<ReturnType<typeof holdingFlowsOf>, { dated: true }>;
    const r = p.tradeRecord!;
    return f.flows.some((x) => x.date < r.from || x.date > r.to) || (f.close && f.close.date !== r.to);
  });
  ok("a trade-dated holding's flows sit inside its own window and close on its statement's date", outOfWindow.length === 0);
}

// ── 2. THE FAMILY'S RULE, ON EVERY DATED HOLDING ────────────────────────────
{
  const wrong: string[] = [];
  let xirr = 0, cagr = 0, hpr = 0;
  for (const p of dated) {
    if (p.returnPct === null) continue;
    const input = inputOf(p);
    const cap = input.capital;
    if (!cap?.dated) { wrong.push(`${p.securityKey}: no dated capital`); continue; }
    const auto = measuredReturn(input, "auto", AS_OF);
    const c = measuredReturn(input, "cagr", AS_OF);
    if (cap.days < 365) {
      if (!(auto.shown && auto.tag === "HPR" && auto.pct === p.returnPct)) wrong.push(`${p.securityKey}: under a year, not the HPR`);
      hpr++;
    } else if (cap.flows > 1) {
      if (!(auto.shown && auto.tag === "XIRR" && auto.pct === cap.annualPct) && cap.annualPct !== null) wrong.push(`${p.securityKey}: several payments, not XIRR`);
      if (c.shown || !/several dates/.test(c.reason)) wrong.push(`${p.securityKey}: several payments compounded as CAGR`);
      xirr++;
    } else {
      // One purchase closes on the statement's value and date, so its rate is the one its flows solve to.
      const want = cap.annualPct as number;
      if (!(auto.shown && auto.tag === "CAGR" && Math.abs(auto.pct - want) < 1e-9 && c.shown && c.pct === auto.pct)) wrong.push(`${p.securityKey}: one payment, not compounded from its own day`);
      cagr++;
    }
  }
  ok("each dated holding takes the family's rule: under a year HPR, several payments XIRR, one compounded from its day",
    wrong.length === 0, wrong.length ? wrong.slice(0, 4).join("; ") : `${xirr} XIRR, ${cagr} CAGR, ${hpr} HPR`);
}

// ── 3. THE FIX ITSELF: A HOLDING BOUGHT IN TWO LOTS IS NOT A YEAR OLD ALL OVER ─
{
  const two = byLots.find((p) => (BOOK_HOLDING_LOTS[`${p.accountId}|${p.securityKey}`] ?? []).length > 1
    && (Date.parse(asOfOf(p)!) - Date.parse(p.heldSince!)) / 864e5 >= 365);
  if (!two) ok("a year-old holding bought in more than one lot is on the book", false);
  else {
    const old = holdingReturn({ returnPct: two.returnPct, heldSince: two.heldSince, valuedAt: asOfOf(two) }, "cagr", AS_OF);
    const now = measuredReturn(inputOf(two), "cagr", AS_OF);
    const x = measuredReturn(inputOf(two), "xirr", AS_OF);
    ok(`${two.securityKey}: the oldest-lot CAGR is gone, and XIRR stands in its place`,
      old.kind === "cagr" && !now.shown && x.shown && x.tag === "XIRR"
      && (old.kind !== "cagr" || Math.abs(x.pct - old.pct) > 0.01),
      old.kind === "cagr" && x.shown ? `oldest-lot CAGR ${old.pct.toFixed(2)}% → XIRR ${x.pct.toFixed(2)}%` : "");
  }
}

// ── 4. A HOLDING NOTHING DATES IN FULL KEEPS ITS OWN ANSWER ─────────────────
{
  const partial = BOOK_POSITIONS.find((p) => p.tradeRecord && (p.tradeRecord.unaccounted ?? 0) > 0 && !p.heldSince)!;
  ok("a holding whose trades leave units undated has no dated money", flowsOf(partial) === null);
  const r = measuredReturn({ ...inputOf(partial), capital: DC.behind([partial], BOOK_POSITIONS.filter((x) => x !== partial)) }, "xirr", AS_OF);
  ok("...and its XIRR is a dash naming why", !r.shown && /dated trades or lot register do not account for every unit/.test(r.reason));
  const mixed = DC.behind([dated.find((p) => p.tradeRecord?.held)!, partial], BOOK_POSITIONS);
  ok("a row with one such line beside a dated one is not dated by the other", mixed === null);
}

// ── 5. YEAR TO DATE, WHERE THE TRADES PROVE THE HOLDING HELD NOTHING ON 1 JANUARY ─
{
  const year = (p: Position) => `${(asOfOf(p) ?? AS_OF).slice(0, 4)}-01-01`;
  const opened = BOOK_POSITIONS.filter((p) => { const o = holdingPeriodOf([p]); return o && o.nilSince <= year(p) && o.openedOn >= year(p); });
  const held = BOOK_POSITIONS.filter((p) => { const o = holdingPeriodOf([p]); return o && o.openedOn < year(p); });
  ok("the trades prove some holdings opened this year and some already held", opened.length > 0 && held.length > 0,
    `${opened.length} opened, ${held.length} held on 1 January`);
  ok("an opened one's YTD is its return since it opened",
    opened.filter((p) => p.returnPct !== null).every((p) => { const r = measuredReturn({ ...inputOf(p), heldSince: null }, "ytd", AS_OF); return r.shown && r.pct === p.returnPct; }));
  ok("a held one's YTD is a dash naming the date its units were first bought",
    held.filter((p) => !p.heldSince).every((p) => { const r = measuredReturn(inputOf(p), "ytd", AS_OF); return !r.shown && /already held on 1 January/.test(r.reason); }));
}

// ── 6. RECOVERED LOTS REACH THE RETURN (Stage 10jf) ─────────────────────────
{
  ok("the book dates holdings' money by their recovered purchase records", byRecovered.length >= 7, `${byRecovered.length} lines`);
  // Each record's cash, struck against the FIFO figures it did not produce:
  // bought less the cost of what was sold is the cost still held, and sold less
  // that same cost is the realised gain.
  const untied = BOOK_RECOVERED_COSTS.filter((r) => {
    if (!r.cashRecord) return false;
    const sum = (side: string) => r.cashRecord!.filter((x) => x.side === side).reduce((a, x) => a + x.amount, 0);
    const soldCost = r.costOfUnitsSold ?? 0;
    return Math.abs(sum("buy") - soldCost - r.costBasis) > 1
      || (r.realizedPnL != null && Math.abs(sum("sell") - soldCost - r.realizedPnL) > 1);
  });
  ok("every recovered record's dated cash ties to the cost and gain its FIFO printed", untied.length === 0, untied.map((r) => r.isin).join(", "));
  const notDated = BOOK_RECOVERED_COSTS.filter((r) => !r.cashRecord && !r.hprUnavailableReason);
  ok("only a sale with unverified proceeds leaves a record without dated cash", notDated.length === 0, notDated.map((r) => r.isin).join(", "));
  ok("a record with an unverified sale dates no return", BOOK_POSITIONS.filter((p) => p.recoveredCost?.hprUnavailableReason).every((p) => flowsOf(p) === null));
  ok("a holding with later sales dates no return until a newer balance arrives", BOOK_POSITIONS.filter((p) => p.recoveredCost?.salesAfter).every((p) => flowsOf(p)?.dated !== true || flowsOf(p)?.dated && (flowsOf(p) as { basis: string }).basis !== "recovered"));
  const one = byRecovered[0];
  ok("a value only a live quote gives closes no recovered record", flowsOf({ ...one, live: true }) === null);
  ok("another account's line never takes the record", flowsOf({ ...one, recoveredCost: { ...one.recoveredCost!, accountId: "someone-else" } }) === null);
  const spare = { ...one, recoveredCost: { ...one.recoveredCost!, quantity: one.recoveredCost!.quantity + 1 } };
  ok("a different unit balance never takes the record", flowsOf(spare) === null);
  const sinceFirst = byRecovered.every((p) => (flowsOf(p) as { since: string }).since <= p.recoveredCost!.heldPurchases!.first);
  ok("its flows start no later than the oldest lot still held", sinceFirst);
  const thisYear = byRecovered.filter((p) => p.recoveredCost!.heldPurchases!.first >= `${(asOfOf(p) ?? AS_OF).slice(0, 4)}-01-01` && p.returnPct !== null);
  ok("a holding the record shows opened this year has its return as YTD",
    thisYear.length > 0 && thisYear.every((p) => { const r = measuredReturn(inputOf(p), "ytd", AS_OF); return r.shown && r.pct === p.returnPct; }),
    thisYear.map((p) => p.securityKey).join(", "));
  const older = byRecovered.filter((p) => p.recoveredCost!.heldPurchases!.first < `${(asOfOf(p) ?? AS_OF).slice(0, 4)}-01-01`);
  ok("...and one it shows held on 1 January stays a dash", older.length > 0 && older.every((p) => !measuredReturn(inputOf(p), "ytd", AS_OF).shown));
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
