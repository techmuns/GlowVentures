// THE MONEY-WEIGHTED RETURN OF A ROW THAT IS WHOLE ACCOUNTS, CHECKED AGAINST
// THE GENERATED BOOK AND AGAINST THE MANAGER'S OWN PRINTED FIGURE.
//   npm run test:family
//
// ── WHY THIS EXISTS (Stage 10cf) ────────────────────────────────────────────
//
//   *"According to the client the return [on] all this AIF is a lot higher than
//    what we are showing on the dashboard … check it for all other investments
//    as well."*
//
// The Portfolio Monitor's XIRR column was a dash on every row and the company
// page carried no money-weighted return at all, because a HOLDING has no cash
// flows of its own. A row that IS an account — a Buoyant folio, a Sanshi folio,
// a drawdown fund — has them, dated, on its own statements. The errors worth
// catching all produce a PLAUSIBLE number:
//
//   • a rate solved over a record that stops short of the value it is set
//     against (Green Lantern 510861's typed record ends a month before its
//     statement — now closed by its register, and checked on a constructed
//     shortfall; see §2);
//   • a rate on a row holding only PART of an account;
//   • a ₹0 cash line splitting an account that is whole in every rupee;
//   • a sub-year window compounded onto a year;
//   • one set of accounts rated on the Monitor and another on the Transactions
//     card, over the same record.
//
// Anchored OUTSIDE the code under test where a primary source exists — the IRR
// Buoyant's own fact sheet prints, read out of the committed `pages.json` — and
// on constructed rows where the trap needs a shape this book does not contain.
import fs from "node:fs";
import path from "node:path";
import {
  BOOK_ACCOUNTS, BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_POSITIONS,
  BOOK_POSITION_TRANCHES, BOOK_CAPITAL_FROM_INCEPTION,
  BOOK_REVIEW_FLOWS,
} from "@/data/glowData";
import { buildDatedCapital } from "@/lib/datedCapital";
import {
  capitalMovesWithCalls, capitalRollup, capitalReturn, contributionsAreComplete, recordShortfall,
} from "@/lib/tranches";
import { currentHoldings, measuredReturn, returnCoverage, type ReturnInput, type RowCapital } from "@/lib/analytics";
import type { Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const book = {
  moves: BOOK_CAPITAL_MOVES, commitments: BOOK_COMMITMENTS, accounts: BOOK_ACCOUNTS,
  positions: BOOK_POSITIONS, tranches: BOOK_POSITION_TRANCHES, fromInception: BOOK_CAPITAL_FROM_INCEPTION,
  reviewFlows: BOOK_REVIEW_FLOWS,
};
const dc = buildDatedCapital(book);
const universe = currentHoldings(BOOK_POSITIONS);
const own = (id: string) => universe.filter((p) => p.accountId === id);
const AJAY = "buoyant-capital-103473";
const ANKITA = "buoyant-capital-103472";
const GL = "green-lantern-capital-llp-510861";

// ── 1. THE MANAGER'S OWN PRINTED IRR ─────────────────────────────────────────
//
// Buoyant's 31 Jul fact sheet prints a "Performance(IRR)" for each folio, and
// beside it the value and date it is struck on ("Portfolio Value(31/07/2026)").
// An XIRR over the dated deposits this book reads, closing on THAT value and
// date, must reproduce it to the two decimals printed — a primary source
// standing as witness for the flows and the solver at once.
//
// THE BOOK NO LONGER CLOSES ON THAT DATE, and the witness had to follow its
// own close rather than the book's. Since the September 2026 delivery each
// folio's 31 Aug portfolio snap supersedes the 31 Jul appraisal, and the snap
// prints a time-weighted return, never an IRR. So the IRR is reproduced on the
// book AS IT STOOD on the fact sheet's date — the account's statement date, its
// value and its record cut to that day, run through the REAL `buildDatedCapital`
// — and the book's own close is held to the snap's printed value and date,
// which is the only thing the snap can witness. Together the two say the rate
// on screen is the manager's own method run one month further.
console.log("\n── the IRR Buoyant's fact sheet prints ──");
{
  const AUDIT = path.join(process.cwd(), "public", "audit");
  const pagesOf = (dir: string): string | null => {
    const p = path.join(AUDIT, dir, "pages.json");
    if (!fs.existsSync(p)) return null;
    return (JSON.parse(fs.readFileSync(p, "utf8")).pages as { text: string }[]).map((x) => x.text).join("\n");
  };
  const num = (x: string) => Number(x.replace(/,/g, ""));
  const iso = (d: string) => d.split("/").reverse().join("-");
  /** The fact sheet's IRR "Since" column, and the value and date it is struck on. */
  const factSheet = (accountId: string): { irr: number; value: number; date: string } | null => {
    const text = pagesOf(`buoyant-capital-${accountId.split("-").at(-1)}-2026-07-31-fact-sheet`);
    if (!text) return null;
    const irr = /Performance\(IRR\)[\s\S]*?Portfolio\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s+(-?[\d.]+)%/.exec(text);
    const val = /Portfolio Value\((\d\d\/\d\d\/\d{4})\)\s+([\d,]+)/.exec(text);
    return irr && val ? { irr: Number(irr[4]), value: num(val[2]), date: iso(val[1]) } : null;
  };
  /** The 31 Aug snap's printed total value and its "As of" date. */
  const snap = (accountId: string): { value: number; date: string } | null => {
    const text = pagesOf(`buoyant-capital-${accountId.split("-").at(-1)}-2026-08-31-portfolio-snap`);
    if (!text) return null;
    const asOf = /Account Summary : As of (\d\d\/\d\d\/\d{4})/.exec(text);
    const total = /\nTotal\s+[\d,.]+\s+[\d,.]+\s+([\d,]+\.\d\d)/.exec(text);
    return asOf && total ? { value: num(total[1]), date: iso(asOf[1]) } : null;
  };
  /** The book with ONE account as it stood on `date`, valued at `value`. */
  const bookOn = (accountId: string, date: string, value: number) => {
    const valued = BOOK_POSITIONS.filter((p) => p.accountId === accountId && p.marketValue !== 0);
    if (valued.length !== 1) return null;
    const positions = [
      ...BOOK_POSITIONS.filter((p) => p.accountId !== accountId),
      { ...valued[0], marketValue: value },
    ];
    return {
      dc: buildDatedCapital({
        ...book,
        accounts: BOOK_ACCOUNTS.map((a) => (a.accountId === accountId ? { ...a, asOf: date } : a)),
        positions,
        moves: BOOK_CAPITAL_MOVES.filter((m) => m.accountId !== accountId || m.date <= date),
      }),
      rows: positions.filter((p) => p.accountId === accountId),
      universe: currentHoldings(positions),
    };
  };
  for (const id of [AJAY, ANKITA]) {
    const printed = factSheet(id);
    ok(`${id}: the 31 Jul fact sheet prints an IRR, and the value and date it is struck on`, printed !== null, JSON.stringify(printed));
    const then = printed ? bookOn(id, printed.date, printed.value) : null;
    ok(`${id}: the folio is one valued line, so the book on that date can be stated`, then !== null);
    const capThen = then ? then.dc.behind(then.rows, then.universe) : null;
    ok(`${id}: on that date the folio is a whole account on a complete dated record, closing on the fact sheet's own date`,
      !!capThen?.dated && capThen.to === printed?.date, JSON.stringify(capThen));
    ok(`${id}: the XIRR over its dated deposits reproduces the IRR the manager prints`,
      !!capThen?.dated && printed !== null && capThen.annualPct != null
        && Math.abs(Math.round(capThen.annualPct * 100) / 100 - printed.irr) < 0.005,
      `solved ${capThen?.dated ? capThen.annualPct?.toFixed(4) : "nothing"} against printed ${printed?.irr}`);

    // The book's own close: the 31 Aug snap's printed value, on its own date.
    const now = snap(id);
    const g = dc.of(id);
    ok(`${id}: the book closes the folio on the snap's own printed value and date`,
      !!now && !!g && g.valueAsOf === now.date && g.value != null && Math.abs(g.value - now.value) < 0.01,
      `book ${g?.value} on ${g?.valueAsOf} · snap ${now?.value} on ${now?.date}`);
    const cap = dc.behind(own(id), universe);
    ok(`${id}: the folio is a whole account on a complete dated record`, !!cap?.dated, JSON.stringify(cap));
    if (!cap?.dated) continue;
    ok(`${id}: its payments span more than a year, so the rate is annual`, cap.days >= 365, `${cap.days} days`);
    // LOAD-BEARING: the month between the two closes moved the rate, so the
    // witness above is a different measurement from the figure on screen and
    // the snap's close is doing work — a book still closing on 31 Jul would
    // print the fact sheet's IRR and pass the check above for the wrong reason.
    ok(`${id}: the rate on screen is struck a month later than the one the manager printed`,
      cap.to === now?.date && capThen?.dated === true && capThen.annualPct != null && cap.annualPct != null
        && Math.abs(cap.annualPct - capThen.annualPct) >= 0.01,
      `${capThen?.dated ? capThen.annualPct?.toFixed(2) : "—"}% to ${capThen?.dated ? capThen.to : "—"} · ${cap.annualPct?.toFixed(2)}% to ${cap.to}`);
    // …and it reaches the cell: the measure the Monitor's XIRR column resolves.
    const shown = measuredReturn({ returnPct: 10, heldSince: null, assetClass: "AIF", capital: cap }, "xirr", cap.to);
    ok(`${id}: the XIRR column prints that rate, tagged XIRR`, shown.shown && shown.tag === "XIRR"
      && Math.abs(shown.pct - (cap.annualPct as number)) < 1e-9, JSON.stringify(shown));
  }
}

// ── 2. A RECORD THAT STOPS SHORT OF ITS VALUE CARRIES NO RATE ────────────────
//
// Green Lantern 510861's typed record comes from a QUARTERLY report ending 30
// June, and its value is struck on 27 July. Stage 10cf named the gap — ₹6,350
// of July TDS, in the value and not in the record — and refused the rate
// (`recordShortfall`). THE CASE HAS SINCE MOVED, because the gap was closed at
// its source: the book builder now merges the account's capital REGISTER, whose
// balances walk to 27 July and which carries exactly those two TDS rows
// (₹2,810 + ₹3,540), and `capitalRecordTo` runs as far as that witnessed
// register. So no real account in this book stops short any more.
//
// The refusal is still LOAD-BEARING and is still checked here — on a
// CONSTRUCTED shortfall: the same account with its record's reach set back to
// what its typed rows reach on their own, run through the REAL
// `recordShortfall`, `buildDatedCapital` and `behind`. And the control is
// flipped: the real book, whose record reaches the statement, RATES it — so the
// reach is the only thing doing the refusing, in both directions.
console.log("\n── the record must reach the value it is set against ──");
{
  const gl = BOOK_ACCOUNTS.find((a) => a.accountId === GL);
  // How far the TYPED rows reach on their own — re-expressed off the archive
  // (the documents that print a contribution or a withdrawal row), not read
  // back out of the builder.
  const AUDIT = path.join(process.cwd(), "public", "audit");
  const typedReach = fs.readdirSync(AUDIT)
    .map((dir) => path.join(AUDIT, dir, "document.json"))
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, "utf8")))
    .filter((d) => d.provider === gl?.provider && d.accountNo === gl?.accountNo)
    .filter((d) => (d.cashFlows ?? []).some((c: { date?: string; kind?: string }) => c.date && (c.kind === "contribution" || c.kind === "withdrawal")))
    .map((d) => (d.periodTo ?? d.asOf) as string)
    .filter(Boolean).sort().at(-1) ?? null;
  ok("the account's typed rows alone stop short of its statement", !!gl?.asOf && !!typedReach && typedReach < gl.asOf,
    `${typedReach} < ${gl?.asOf}`);
  ok("the real record reaches its statement: capitalRecordTo is the as-of, past the typed rows",
    !!gl?.capitalRecordTo && gl.capitalRecordTo === gl.asOf && !!typedReach && gl.capitalRecordTo > typedReach,
    `runs to ${gl?.capitalRecordTo}, statement ${gl?.asOf}, typed rows ${typedReach}`);
  // What closed it is the gap Stage 10cf named, and nothing more: the record's
  // rows past the typed reach are withdrawals only, adding to ₹6,350.
  const past = BOOK_CAPITAL_MOVES.filter((m) => m.accountId === GL && !!typedReach && m.date > typedReach);
  const pastOut = past.filter((m) => m.direction === "out").reduce((a, m) => a + (m.amount ?? 0), 0);
  ok("…and what reaches it is the July TDS the gap was: withdrawals only, ₹6,350",
    past.length > 0 && past.every((m) => m.direction === "out") && Math.abs(pastOut - 6350) <= 1,
    `${past.length} row(s), ${pastOut} out`);
  ok("so the real book RATES the account, over a record running to its own statement",
    recordShortfall(gl) === null && dc.of(GL) !== null, `rated ${dc.of(GL) !== null}`);
  const glCap = dc.behind(own(GL), universe);
  ok("…and a row that is the whole mandate is dated, closing on the statement its record reaches",
    !!glCap && glCap.dated && glCap.to === gl?.asOf, JSON.stringify(glCap));

  // THE CONSTRUCTED SHORTFALL: the same account, its reach set back to the
  // typed rows' own. Everything below is the real code.
  const short = gl && typedReach ? { ...gl, capitalRecordTo: typedReach } : undefined;
  const why = recordShortfall(short);
  ok("a record set back to its typed reach is refused, naming both dates",
    !!why && why.includes(String(typedReach)) && why.includes(String(gl?.asOf)), why ?? "no reason");
  const spoofed = BOOK_ACCOUNTS.map((a) => (a.accountId === GL && short ? short : a));
  const shortDc = buildDatedCapital({ ...book, accounts: spoofed });
  ok("…so the Monitor rates none of it", shortDc.of(GL) === null);
  const shortCap = shortDc.behind(own(GL), universe);
  ok("…and a row that is the whole mandate is marked undated, with the reason", !!shortCap && !shortCap.dated
    && /ends .* before the .* statement/.test(shortCap.reason), JSON.stringify(shortCap));
  // The inception half is not what refuses it: the record reaches back to
  // inception on its own terms, so the reach is the only refusal.
  const moves = BOOK_CAPITAL_MOVES.filter((m) => m.accountId === GL);
  ok("the record reaches back to inception on its own terms",
    contributionsAreComplete(GL, [...moves], [...BOOK_POSITIONS], BOOK_POSITION_TRANCHES, gl?.inceptionDate, null,
      BOOK_CAPITAL_FROM_INCEPTION.includes(GL)) === null);
  // …and the other direction, on the whole book: every record-sourced rated
  // account's record reaches its own statement.
  const recorded = new Set(BOOK_CAPITAL_MOVES.map((m) => m.accountId));
  const late = BOOK_ACCOUNTS.filter((a) => recorded.has(a.accountId) && dc.of(a.accountId)
    && !(a.capitalRecordTo && a.asOf && a.capitalRecordTo >= a.asOf));
  ok("no rated capital record stops short of its own statement", late.length === 0, late.map((a) => a.accountId).join(", "));
  ok("every account with a dated record carries the date it runs to",
    [...recorded].every((id) => !!BOOK_ACCOUNTS.find((a) => a.accountId === id)?.capitalRecordTo));
}

// ── 3. ONE DEFINITION: THE TRANSACTIONS CARD AND THE MONITOR AGREE ────────────
//
// The Transactions card strikes each account's XIRR through `capitalReturn`,
// which builds its own flows and window; the Monitor pools through
// `datedCapital.behind`. Two paths over one record: on every rated account
// whose row is the whole account, the two rates must be one.
console.log("\n── the Transactions card and the Monitor strike one rate ──");
{
  const record = capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_ACCOUNTS, BOOK_REVIEW_FLOWS);
  const card = capitalRollup(record, BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_POSITION_TRANCHES, "all", "recent", {
    commitments: BOOK_COMMITMENTS, fromInception: BOOK_CAPITAL_FROM_INCEPTION,
  });
  let compared = 0, noRow = 0;
  for (const g of card) {
    const cardX = capitalReturn(g, "xirr");
    // AN ACCOUNT HOLDING NOTHING HAS NO ROW ON A HOLDINGS TABLE — 3P, redeemed
    // in full, and the funds no statement values. Its rate, where it has one,
    // is the Transactions card's alone, and that is not a disagreement.
    if (!own(g.accountId).length) { noRow++; continue; }
    const cap = dc.behind(own(g.accountId), universe);
    if (!cap?.dated) {
      // Rated on the card and not on the Monitor would be two definitions.
      ok(`${g.accountId}: an account the Monitor does not rate carries no annual rate on the card either`,
        !(cardX.shown && cardX.tag === "XIRR"), JSON.stringify(cardX));
      continue;
    }
    if (cap.days < 365) {
      ok(`${g.accountId}: under a year on both — the card shows HPR, not a rate`, cardX.shown ? cardX.tag === "HPR" : true);
      continue;
    }
    compared++;
    ok(`${g.accountId}: the Monitor's XIRR is the Transactions card's, to the millionth`,
      cardX.shown && cardX.tag === "XIRR" && cap.annualPct != null && Math.abs(cardX.pct - cap.annualPct) < 1e-6,
      `${cap.annualPct} vs ${cardX.shown ? cardX.pct : "absent"}`);
  }
  ok("the comparison ran over accounts funded more than a year ago", compared >= 3, `${compared}, and ${noRow} holding nothing`);
}

// ── 4. THE WHOLE-ACCOUNT RULE ────────────────────────────────────────────────
console.log("\n── a row carries an account's record only where it holds all of it ──");
{
  // A ₹0 line with no cost carries none of an account's money, so the lines
  // beside it are the whole account. Buoyant was this rule's subject: its 31 Jul
  // appraisals printed a ₹0 Cash line beside each folio's units. Its 31 Aug
  // snaps, which the book reads now, print none — so the shape is CONSTRUCTED
  // on Ajay's real folio (the rule's own case), and held on the book wherever
  // an account still carries such a line beside a valued one.
  const units = own(AJAY).filter((p) => p.marketValue !== 0);
  const sleeve = { ...units[0], securityKey: "cash", security: "Cash", assetClass: "Cash",
    marketValue: 0, costBasis: null, quantity: 0 } as Position;
  ok("a costless ₹0 line beside a folio's units leaves the units the whole account",
    units.length > 0 && !!dc.behind(units, [...universe, sleeve])?.dated);
  const costless0 = (p: Position) => p.marketValue === 0 && !(typeof p.costBasis === "number" && p.costBasis !== 0);
  const onBook = [...new Set(universe.map((p) => p.accountId))].filter((id) =>
    own(id).some(costless0) && own(id).some((p) => p.marketValue !== 0));
  if (onBook.length) {
    const split = onBook.filter((id) => dc.behind(own(id).filter((p) => p.marketValue !== 0), universe) === null);
    ok("…and on this book, every account carrying one is whole on its valued lines", split.length === 0,
      `${onBook.join(", ")}${split.length ? ` — split: ${split.join(", ")}` : ""}`);
  } else {
    console.log("NOT CHECKED no account on this book carries a costless ₹0 line beside a valued one — the constructed case holds the rule");
  }
  // A ₹0 line WITH a cost is money (a write-off) and does split.
  const written: Position = { ...units[0], securityKey: "written-off", security: "Written off", marketValue: 0, costBasis: 5_00_000 };
  ok("a ₹0 line that carries a cost does split the account",
    dc.behind(units, [...universe, written]) === null);
  // A share inside a mandate is not the mandate.
  const svan = BOOK_ACCOUNTS.find((a) => /svan/i.test(a.provider) && dc.of(a.accountId));
  const shares = svan ? own(svan.accountId).filter((p) => p.marketValue > 0) : [];
  ok("a mandate on a dated record is rated as a whole", !!svan && !!dc.behind(own(svan.accountId), universe)?.dated);
  ok("…and one of its shares is not an account: no capital at all", shares.length > 1 && dc.behind([shares[0]], universe) === null);
  // A whole account with no dated record is marked, and says why.
  const undatedMandate = BOOK_ACCOUNTS.find((a) => a.engagement === "PMS" && !BOOK_CAPITAL_MOVES.some((m) => m.accountId === a.accountId)
    && own(a.accountId).length > 0);
  const u = undatedMandate ? dc.behind(own(undatedMandate.accountId), universe) : null;
  ok("a whole mandate with no dated record is undated, with the reason", !!u && !u.dated && u.reason.length > 40,
    JSON.stringify(u));
  // A row over two rated accounts pools them, each closing on its own date.
  const both = dc.behind([...own(AJAY), ...own(ANKITA)], universe);
  const a1 = dc.behind(own(AJAY), universe), a2 = dc.behind(own(ANKITA), universe);
  ok("two whole folios pool into one rate", !!both?.dated && both.accounts === 2
    && both.accountIds.join(" ") === [AJAY, ANKITA].sort().join(" "));
  if (both?.dated && a1?.dated && a2?.dated && both.annualPct != null && a1.annualPct != null && a2.annualPct != null) {
    ok("…between the two folios' own rates", both.annualPct > Math.min(a1.annualPct, a2.annualPct)
      && both.annualPct < Math.max(a1.annualPct, a2.annualPct), `${a1.annualPct} / ${a2.annualPct} → ${both.annualPct}`);
  }
}

// ── 5. THE METHODOLOGY ON A DATED ROW, ON CONSTRUCTED CAPITAL ────────────────
console.log("\n── the family's rule on a dated row ──");
{
  const dated = (o: Partial<Extract<RowCapital, { dated: true }>> = {}): RowCapital => ({
    dated: true, accountIds: ["x"], accounts: 1, flows: 4, since: "2024-01-01", to: "2026-06-30", days: 911,
    annualPct: 12.34, ...o,
  });
  const row = (capital: RowCapital | undefined, returnPct: number | null = 30): ReturnInput =>
    ({ returnPct, heldSince: null, assetClass: "AIF", capital });
  const AS_OF = "2026-06-30";

  const x = measuredReturn(row(dated()), "xirr", AS_OF);
  ok("several dated payments over a year: the XIRR column is the rate", x.shown && x.tag === "XIRR" && x.pct === 12.34);
  const a = measuredReturn(row(dated()), "auto", AS_OF);
  ok("…and auto picks XIRR for it — the family's multiple-tranche rule", a.shown && a.tag === "XIRR" && a.pct === 12.34);
  const c = measuredReturn(row(dated()), "cagr", AS_OF);
  ok("…and the CAGR column refuses it, pointing at XIRR", !c.shown && /XIRR/.test(c.shown ? "" : c.reason));
  const h = measuredReturn(row(dated()), "absolute", AS_OF);
  ok("…while the HPR column is the row's own FIFO figure, untouched", h.shown && h.tag === "HPR" && h.pct === 30);

  const one = dated({ flows: 1, days: 730, since: "2024-06-30" });
  const oc = measuredReturn(row(one, 21), "cagr", AS_OF);
  ok("one payment two years ago compounds", oc.shown && oc.tag === "CAGR" && Math.abs(oc.pct - 10) < 0.02,
    oc.shown ? `${oc.pct}` : "absent");
  ok("…and auto picks CAGR for it", measuredReturn(row(one, 21), "auto", AS_OF).tag === "CAGR");

  const short = dated({ days: 120, since: "2026-03-01" });
  for (const m of ["xirr", "cagr", "auto"] as const) {
    const r = measuredReturn(row(short, 20), m, AS_OF);
    ok(`a four-month window is never annualised (${m})`, m === "cagr" && !r.shown
      ? true   // several dated payments: CAGR refuses before it reaches the window
      : r.shown && r.tag === "HPR" && r.pct === 20, JSON.stringify(r));
  }
  const shortOne = dated({ flows: 1, days: 120, since: "2026-03-01" });
  const sc = measuredReturn(row(shortOne, 20), "cagr", AS_OF);
  ok("one payment four months ago: the CAGR column shows the HPR, tagged", sc.shown && sc.tag === "HPR" && sc.pct === 20);

  const unsolved = dated({ annualPct: null });
  const ux = measuredReturn(row(unsolved), "xirr", AS_OF);
  ok("flows that do not solve are absent, with the reason", !ux.shown && /do not solve/.test(ux.shown ? "" : ux.reason));
  const ua = measuredReturn(row(unsolved), "auto", AS_OF);
  ok("…and auto falls back to the HPR and says why", ua.shown && ua.tag === "HPR" && /do not solve/.test(ua.note ?? ""));

  const undated: RowCapital = { dated: false, accountIds: ["x"], reason: "no dated record here, for a reason" };
  const nx = measuredReturn(row(undated), "xirr", AS_OF);
  ok("an undated whole account names its own reason in the XIRR column", !nx.shown && (nx.shown ? "" : nx.reason) === "no dated record here, for a reason");
  const holding = measuredReturn(row(undefined), "xirr", AS_OF);
  ok("a holding inside an account keeps the per-holding refusal", !holding.shown && /holding/i.test(holding.shown ? "" : holding.reason));
  const noCost = measuredReturn(row(short, null), "xirr", AS_OF);
  ok("a sub-year dated row that reports no cost is absent, never zero", !noCost.shown);

  const cov = returnCoverage([row(dated()), row(dated()), row(short, 20), row(undefined)], "xirr", AS_OF);
  ok("the XIRR column counts RATES, not cells shown", cov.xirr === 2 && cov.shown === 3 && cov.absent === 1,
    JSON.stringify(cov));
  const cc = returnCoverage([row(dated()), row(one, 21), row(undefined)], "cagr", AS_OF);
  ok("the CAGR column counts the several-payment rows apart from the undated ones", cc.staggered === 1 && cc.cagr === 1,
    JSON.stringify(cc));
}

console.log(fails ? `\n${fails} FAILED` : "\nall dated-capital checks passed");
process.exit(fails ? 1 : 0);
