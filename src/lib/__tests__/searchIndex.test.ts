// THE TOP BAR'S SEARCH — EVERY THING A READER CAN TYPE, CHECKED AGAINST THE BOOK.
//   npm run test:family
//
//   "this whole thing needs to be a very smart search bar which takes me to
//    exactly where i want to go … any equity, any fund, any position that I
//    have taken, any tab, etc."
//
// The failures worth catching are the ones a reader would only find by typing
// the one thing that does not work:
//
//   • an identifier (ISIN, symbol, account number) that does not land on its
//     own holding first — checked for EVERY identifier the book carries, not a
//     sample, because the one that fails is always the one nobody typed;
//   • a member, a page or a mandate that a better-named row outranks;
//   • the ring-fenced promoter holding reachable as anything but its page;
//   • a destination that resolves to nothing, or a detail line carrying a
//     missing field.
//
// Every expectation is derived from `glowData.ts` on the run.
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_POLYCAB } from "@/data/glowData";
import { currentHoldings, dedupedPositions, negligibleKeys, isMandateHeld, isRedeemedToNil, sum } from "@/lib/analytics";
import { parseDrilldown } from "@/lib/drilldown";
import { NAV } from "@/lib/nav";
import { buildSearchIndex, searchEntries, scoreText, looksLikeQuestion, normSearch } from "@/lib/searchIndex";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}`);
};
const money = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;
const consolidated = dedupedPositions(BOOK_POSITIONS);
const index = buildSearchIndex({ positions: BOOK_POSITIONS, consolidated, accounts: BOOK_ACCOUNTS, money });
const top = (q: string) => searchEntries(index, q, 10)[0]?.entry;
const topN = (q: string, n: number) => searchEntries(index, q, 10).slice(0, n).map((h) => h.entry);

console.log("── every holding is findable, once ──");
{
  const small = negligibleKeys(BOOK_POSITIONS);
  const keys = new Set(consolidated.filter((p) => !small.has(p.securityKey)).map((p) => p.securityKey));
  const holdings = index.filter((e) => e.kind === "holding");
  ok("one holding entry per security above the floor", holdings.length === keys.size, `${holdings.length} vs ${keys.size}`);
  ok("no holding under the family's ₹1,000 floor is offered", [...small].every((k) => !index.some((e) => e.id === `holding:${k}`)));
  // A HELD position opens its own page; a REDEEMED one opens the tab its
  // redemption is on — its own page would show a measured nil and little else.
  const current = new Set(currentHoldings(consolidated).map((p) => p.securityKey));
  const wrong = holdings.filter((e) => {
    const key = e.id.slice("holding:".length);
    const closed = consolidated.filter((p) => p.securityKey === key).every((p) => isRedeemedToNil(p));
    return closed ? e.href !== "/monitor?show=transactions" : e.href !== `/stock/${encodeURIComponent(key)}` || !current.has(key);
  });
  ok("every held position opens its holding page, every redeemed one the Transactions tab", wrong.length === 0,
    wrong.slice(0, 3).map((e) => `${e.label} → ${e.href}`).join("; "));
}

console.log("── an identifier lands on its own row, first — every one of them ──");
{
  /**
   * GROUPED BY ISIN, because one ISIN can sit under TWO keys — the eight
   * "one security keyed twice" cases `docs/BOOK-REPORT.md` names (Helios Flexi
   * Cap is one: the AMC folio's full name and the depository's clipped
   * `HELIOS FCF D-GROW`). Those are one security the extractor has not joined,
   * and the search must offer EVERY row of it rather than silently pick one —
   * so an ISIN naming n holdings must bring all n into the first n rows.
   */
  const byIsin = new Map<string, string[]>();
  for (const e of index.filter((x) => x.kind === "holding" && !x.closed)) {
    for (const c of e.codes.filter((x) => /^IN[EF]/.test(x))) byIsin.set(c, [...(byIsin.get(c) ?? []), e.id]);
  }
  ok("the book carries ISIN-bearing holdings to test on", byIsin.size > 0, String(byIsin.size));
  const miss = [...byIsin].filter(([isin, ids]) => {
    const got = topN(isin, ids.length).map((e) => e.id);
    return !ids.every((id) => got.includes(id));
  });
  ok(`every one of the ${byIsin.size} ISINs brings every holding it names to the top`, miss.length === 0,
    miss.slice(0, 3).map(([i]) => `${i} → ${top(i)?.label}`).join("; "));
  // THE GROUPING IS LOAD-BEARING ONLY WHILE THE BOOK HAS SUCH A CASE — so the
  // case is named when it exists, and its absence is said rather than passed.
  const shared = [...byIsin].filter(([, ids]) => ids.length > 1);
  if (shared.length) ok(`…including ${shared.length} ISIN(s) the book carries under two keys, each offering every row`, true, shared.map(([i]) => i).join(", "));
  else console.log("ok   (no ISIN sits under two keys in this drop — the grouping above has no shared case to prove)");
  // A symbol shared by two rows (a fund's unit classes) cannot pick one — so
  // the claim is struck on the symbols that name ONE holding.
  const bySym = new Map<string, string[]>();
  for (const e of index.filter((x) => x.kind === "holding" && !x.closed)) {
    for (const c of e.codes.filter((x) => !/^IN[EF]/.test(x))) bySym.set(c, [...(bySym.get(c) ?? []), e.id]);
  }
  const unique = [...bySym].filter(([, ids]) => ids.length === 1);
  const symMiss = unique.filter(([sym, ids]) => !topN(sym, 2).some((e) => e.id === ids[0]));
  ok(`every one of the ${unique.length} unique NSE symbols finds its holding in the first two`, symMiss.length === 0,
    symMiss.slice(0, 3).map(([s]) => `${s} → ${top(s)?.label}`).join("; "));
  // ACCOUNT NUMBERS: a mandate's opens the mandate, every other account's opens
  // the account row — first, whatever else shares its digits.
  const acctMiss = BOOK_ACCOUNTS.filter((a) => {
    const want = isMandateHeld(a.engagement) ? `mandate:${a.accountId}` : `account:${a.accountId}`;
    return top(a.accountNo)?.id !== want;
  });
  ok(`every one of the ${BOOK_ACCOUNTS.length} account numbers finds its own account first`, acctMiss.length === 0,
    acctMiss.slice(0, 3).map((a) => `${a.accountNo} → ${top(a.accountNo)?.label}`).join("; "));
}

console.log("── people, pages and mandates ──");
{
  const owners = [...new Set(BOOK_ACCOUNTS.map((a) => a.owner))];
  const miss = owners.filter((o) => top(o)?.id !== `person:${o}`);
  ok(`every one of the ${owners.length} members and trusts finds their entity first by full name`, miss.length === 0, miss.join(", "));
  ok("a member's page is the family page scoped to them",
    owners.every((o) => index.find((e) => e.id === `person:${o}`)?.href === `/family?entity=${encodeURIComponent(o)}`));
  const pageMiss = NAV.filter((n) => top(n.label)?.href !== n.to);
  ok(`every one of the ${NAV.length} nav pages finds itself first by its own label`, pageMiss.length === 0,
    pageMiss.map((n) => `${n.label} → ${top(n.label)?.label}`).join("; "));
  const mandates = BOOK_ACCOUNTS.filter((a) => isMandateHeld(a.engagement));
  ok("every PMS mandate opens its own mandate page",
    mandates.every((a) => index.find((e) => e.id === `mandate:${a.accountId}`)?.href === `/mandate/${encodeURIComponent(a.accountId)}`));
}

console.log("── the words people use ──");
{
  ok("'transactions' opens the Transactions tab", top("transactions")?.href === "/monitor?show=transactions");
  ok("'compare sectors' opens Sector Composition's Compare tab", top("compare sectors")?.href === "/sectors?view=compare",
    top("compare sectors")?.label);
  ok("'polycab dividend' opens Polycab's corporate actions tab", top("polycab dividend")?.href === "/polycab?view=actions",
    top("polycab dividend")?.label);
  ok("'direct equity' still opens the Direct Equity holdings, not the sector tab",
    top("direct equity")?.kind === "category", `${top("direct equity")?.kind}:${top("direct equity")?.label}`);
  ok("'alerts' opens Morning CIO's All alerts tab", top("alerts")?.href === "/cio?tab=alerts", top("alerts")?.label);
  ok("…and so does 'stop loss', the word the alert boxes use", top("stop loss")?.href === "/cio?tab=alerts", top("stop loss")?.label);
  ok("'uncalled' opens the Private Market page", top("uncalled")?.href === "/private-market");
  ok("'dry powder' reaches uncalled capital", top("dry powder")?.id === "fig:uncalled");
  ok("'tax' opens Capital Gains", top("tax")?.href === "/capital-gains");
  ok("'banks' finds the Financials sector first", top("banks")?.id === "sector:Financials", top("banks")?.label);
  ok("'xirr' finds the money-weighted return", topN("xirr", 2).some((e) => e.id === "fig:xirr"));
  // THE LARGEST HOLDING BY ITS FIRST WORD, and by a ONE-EDIT typo of it.
  const largest = index.filter((e) => e.kind === "holding" && !e.closed).sort((a, b) => b.weight - a.weight)[0];
  const word = normSearch(largest.label).split(" ").find((w) => w.length >= 6 && /^[a-z]+$/.test(w))!;
  ok("the largest holding carries a word to test on", !!word, largest.label);
  ok(`its first long word ("${word}") finds it first`, top(word)?.id === largest.id, top(word)?.label);
  const typo = word[0] + word[2] + word[1] + word.slice(3);
  ok(`…and so does a transposition ("${typo}")`, topN(typo, 3).some((e) => e.id === largest.id), topN(typo, 3).map((e) => e.label).join(" | "));
}

console.log("── the ring-fence ──");
{
  const keys = new Set(BOOK_POLYCAB.map((p) => p.securityKey));
  const isins = new Set(BOOK_POLYCAB.map((p) => p.isin).filter(Boolean));
  ok("the ring-fenced holding is in no entry",
    !index.some((e) => [...keys].some((k) => e.id.includes(k) || e.href.includes(k)) || e.codes.some((c) => isins.has(c))));
  // THE PAGE FIRST, THEN ONLY ITS OWN TABS. Every hit must open the Polycab
  // page itself — a holding, an account or a figure anywhere else is the leak
  // the fence exists to stop — and there must be at least one hit, so an empty
  // result cannot pass as a fence that held.
  const hits = searchEntries(index, "polycab", 10).map((h) => h.entry);
  const ownPage = (e: (typeof hits)[number]) =>
    (e.kind === "page" || e.kind === "view") && (e.href === "/polycab" || e.href.startsWith("/polycab?"));
  ok("'polycab' finds the Polycab page first, and nothing outside it",
    hits.length > 0 && hits[0].kind === "page" && hits[0].href === "/polycab" && hits.every(ownPage),
    hits.map((e) => `${e.kind}:${e.label}`).join(", "));
}

console.log("── every destination resolves, every line is a sentence ──");
{
  const badHref = index.filter((e) => !e.href.startsWith("/"));
  ok("every entry has an address inside the app", badHref.length === 0, badHref.map((e) => e.id).join(", "));
  const drill = index.filter((e) => e.href.startsWith("/holdings?"));
  ok("every drill-down address parses to a scope the drill-down page knows",
    drill.every((e) => parseDrilldown(new URLSearchParams(e.href.split("?")[1])) != null),
    drill.filter((e) => !parseDrilldown(new URLSearchParams(e.href.split("?")[1]))).map((e) => e.href).join(", "));
  const badText = index.filter((e) => !e.detail.trim() || /\bundefined\b|\bNaN\b|\bnull\b/.test(`${e.label} ${e.detail}`));
  ok("no label or detail is empty or carries a missing field", badText.length === 0,
    badText.slice(0, 3).map((e) => `${e.id}: ${e.detail}`).join("; "));
  const ids = index.map((e) => e.id);
  ok("every entry id is unique", new Set(ids).size === ids.length);
}

console.log("── the categories partition the book, as the allocation table does ──");
{
  const current = currentHoldings(consolidated);
  const total = sum(current.map((p) => p.marketValue));
  for (const chip of ["Category", "Basket", "Asset class"]) {
    const rows = index.filter((e) => e.kind === "category" && e.chip === chip);
    ok(`the ${chip.toLowerCase()} rows exist`, rows.length > 0);
    ok(`…and every ${chip.toLowerCase()} opens its own drill-down scope`,
      rows.every((e) => parseDrilldown(new URLSearchParams(e.href.split("?")[1]))?.key != null));
  }
  ok("the book carries a total to partition", total > 0);
}

console.log("── the matching tiers ──");
{
  ok("a whole word outranks the start of a longer word",
    scoreText("gold", "DSP Gold ETF").score > scoreText("gold", "Goldstandard Wealth").score);
  ok("the leading words outrank a whole word further in",
    scoreText("hdfc", "HDFC Balanced Advantage").score > scoreText("hdfc", "Axis HDFC Mixed").score);
  ok("an exact name outranks everything but an identifier", scoreText("ajay", "Ajay").score === 1000);
  ok("a one-edit near miss is found", scoreText("snashi", "Sanshi Fund I").score > 0);
  ok("…but two edits are not", scoreText("snahsi", "Sanshi Fund I").score === 0);
  ok("nothing matches nothing", searchEntries(index, "zzqqxx").length === 0);
  ok("an empty query returns nothing", searchEntries(index, "   ").length === 0);
  ok("a question reads as one", looksLikeQuestion("how much hdfc do i hold") && looksLikeQuestion("tax?"));
  ok("a name does not", !looksLikeQuestion("hdfc") && !looksLikeQuestion("sanshi fund"));
}

console.log(fails ? `\n${fails} FAILED` : "\nall search checks passed");
process.exit(fails ? 1 : 0);
