// THE FAMILY'S ANSWER TO THE DUPLICATE POLICY, AT THE PLACE IT IS APPLIED.
// Run: node scripts/ingest/__tests__/separateInvestments.test.mjs
//
//   "both are separate investments" — the family, 28 Sep 2026, about the two
//   pairs this book had been counting once.
//
// Check (c) in `reconcile.mjs` finds holdings whose figures coincide on two
// accounts' statements, and its policy — carry both, count once — tags them so
// every consolidated figure counts the pair ONCE. The family has said the two
// pairs this book tagged are two investments each, and `SEPARATE_INVESTMENTS`
// in `shared/separateInvestments.mjs` is that answer.
//
// ── WHAT THIS SUITE IS FOR ──────────────────────────────────────────────────
//
// The answer moves money: every consolidated figure gains the second statement
// of each pair, ₹3.17 Cr on this book. So its BOUNDARIES are the claims, and
// each is asserted from both sides —
//
//   • a pair it names is detected exactly as before and NEVER grouped;
//   • a pair it does not name is grouped exactly as before, so the policy
//     still carries the next pair a drop brings;
//   • a THIRD account reporting the same figures is a new question, and is
//     grouped: a decision about two accounts says nothing about a third;
//   • it is keyed on the security AND the provider AND the account, so a near
//     miss on any one of them is grouped;
//   • the income-only folios reporting the same two holdings count two
//     incomes, not one reported twice;
//   • and on the committed archive it is LOAD-BEARING: the coincidence is
//     really there, so without the answer the pairs would be grouped again.
//
// The synthetic cases exercise the rule; the archive cases prove it is the rule
// the book was built under. Neither alone is enough — the archive would pass
// whatever the table said, being the thing it was written for.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  duplicateHoldings, duplicateAifEarnings, applyDedupePolicy, consolidatedValue,
} from "../reconcile.mjs";
import {
  SEPARATE_INVESTMENTS, sameAccount, separateInvestmentFor, separateIncomeFor,
} from "../../../shared/separateInvestments.mjs";
import { planDedupeReplay, tagsUnder } from "../../lib/dedupeReplay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const AUDIT = path.join(ROOT, "public/audit");

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("separateInvestments");

const [SPECIAL_OPPS, TRANSITION] = SEPARATE_INVESTMENTS;

/**
 * One account's statement carrying one holding. The figures are the ones
 * check (c) keys on — security, quantity, unit cost, market value — so two of
 * these with the same figures are exactly the coincidence the policy exists for.
 */
function statement({ provider, accountNo }, securityKey, { owner = `owner-${accountNo}`, asOf = "2026-06-30", figures = {} } = {}) {
  return {
    docKey: `${provider}-${accountNo}-${asOf}-holdings`,
    status: "parsed",
    provider, accountNo, owner, ownerId: owner, asOf, reportType: "holdings",
    holdings: [{
      security: securityKey, securityKey, assetClass: "AIF",
      quantity: 990429.684, unitCost: 100, marketValue: 14580412.51,
      ...figures,
      dedupeGroup: null, alsoReportedUnder: [],
    }],
  };
}
const two = (d, key = d.securityKey, opts = {}) => d.accounts.slice(0, 2).map((a) => statement(a, key, opts));

// ── 1. A PAIR THE FAMILY NAMED IS DETECTED AND NEVER GROUPED ────────────────
for (const d of SEPARATE_INVESTMENTS) {
  const docs = two(d);
  const r = duplicateHoldings(docs);
  ok(`${d.securityKey}: the named pair is not a dedupe group`, r.groups.length === 0,
    JSON.stringify(r.groups.map((g) => g.dedupeGroup)));
  ok(`${d.securityKey}: …and is reported as confirmed separate, with the date`,
    r.confirmedSeparate.length === 1 && r.confirmedSeparate[0].confirmed === d.confirmed
      && r.confirmedSeparate[0].occurrences.length === 2);
  applyDedupePolicy(docs, r.groups);
  ok(`${d.securityKey}: no row is tagged`, docs.every((x) => x.holdings.every((h) => !h.dedupeGroup && !h.alsoReportedUnder.length)));
  ok(`${d.securityKey}: the consolidated value counts both`, consolidatedValue(docs).doubleCounted === 0);
}

// ── 2. …AND WITHOUT THE ANSWER THE SAME PAIR IS GROUPED ─────────────────────
//
// The load-bearing half: the synthetic pair really is the coincidence the
// policy exists for, so it is the decision — and nothing else — keeping it apart.
for (const d of SEPARATE_INVESTMENTS) {
  const docs = two(d);
  const r = duplicateHoldings(docs, { decisions: [] });
  ok(`${d.securityKey}: with no answer the pair IS grouped`,
    r.groups.length === 1 && r.groups[0].dedupeGroup === `dg-${d.securityKey}-2` && r.confirmedSeparate.length === 0);
  applyDedupePolicy(docs, r.groups);
  ok(`${d.securityKey}: …tagged on both rows, each naming the other owner`,
    docs.every((x) => x.holdings[0].dedupeGroup === `dg-${d.securityKey}-2` && x.holdings[0].alsoReportedUnder.length === 1));
  const mv = docs[0].holdings[0].marketValue;
  ok(`${d.securityKey}: …and counted once — the second statement's value left out`,
    Math.abs(consolidatedValue(docs).doubleCounted - mv) < 0.01, `${consolidatedValue(docs).doubleCounted} vs ${mv}`);
}

// ── 3. A THIRD ACCOUNT IS A NEW QUESTION ────────────────────────────────────
//
// Every account in a group must be named. A group reaching one the family was
// not asked about is grouped exactly as before — all three rows of it,
// because splitting it would decide the third account's question for them.
{
  const third = { provider: SPECIAL_OPPS.accounts[0].provider, accountNo: "99999" };
  const docs = [...two(SPECIAL_OPPS), statement(third, SPECIAL_OPPS.securityKey)];
  const r = duplicateHoldings(docs);
  ok("a third, unnamed account puts the whole group back under the policy",
    r.groups.length === 1 && r.groups[0].occurrences.length === 3 && r.confirmedSeparate.length === 0,
    JSON.stringify({ groups: r.groups.length, confirmed: r.confirmedSeparate.length }));
  ok("…and separateInvestmentFor refuses the three",
    separateInvestmentFor(SPECIAL_OPPS.securityKey, [...SPECIAL_OPPS.accounts, third]) === null);
}

// ── 4. A NEAR MISS ON ANY OF THE THREE KEYS IS GROUPED ──────────────────────
{
  // The same two accounts, a different security: the answer was about one holding.
  const other = "some-other-fund-class-a1";
  const r = duplicateHoldings(two(SPECIAL_OPPS, other));
  ok("the named accounts holding a DIFFERENT security are grouped",
    r.groups.length === 1 && r.groups[0].securityKey === other);

  // The same account numbers under another provider: an account is its
  // provider and its number together.
  const elsewhere = SPECIAL_OPPS.accounts.map((a) => ({ ...a, provider: "Some Other House" }));
  const r2 = duplicateHoldings(elsewhere.map((a) => statement(a, SPECIAL_OPPS.securityKey)));
  ok("the named account NUMBERS under another provider are grouped",
    r2.groups.length === 1 && r2.confirmedSeparate.length === 0);

  // One named account and one unnamed: a pair the family was not asked about.
  const half = [statement(SPECIAL_OPPS.accounts[0], SPECIAL_OPPS.securityKey),
    statement({ ...SPECIAL_OPPS.accounts[0], accountNo: "37703" }, SPECIAL_OPPS.securityKey)];
  const r3 = duplicateHoldings(half);
  ok("one named account beside an unnamed one is grouped", r3.groups.length === 1);

  // The two pairs' accounts crossed: Transition's trusts under 360 ONE's key.
  const crossed = TRANSITION.accounts.map((a) => statement(a, SPECIAL_OPPS.securityKey));
  ok("one decision's accounts under ANOTHER decision's security are grouped",
    duplicateHoldings(crossed).groups.length === 1);
}

// ── 5. AN ACCOUNT NUMBER IS COMPARED AS TEXT ────────────────────────────────
//
// A reader that parsed the number rather than keeping the printed string must
// not slip a named account out of its decision — nor could one with a leading
// zero stripped slip in, since `0037702` is not the account printed.
{
  ok("a number and the same digits as text are one account",
    sameAccount({ provider: "P", accountNo: "37702" }, { provider: "P", accountNo: 37702 }));
  ok("a leading zero is a different account",
    !sameAccount({ provider: "P", accountNo: "37702" }, { provider: "P", accountNo: "037702" }));
  ok("no accounts at all names nothing", separateInvestmentFor(SPECIAL_OPPS.securityKey, []) === null);
}

// ── 6. THE INCOME-ONLY FOLIOS COUNT TWO INCOMES ─────────────────────────────
//
// 360 ONE Alternates' folios 1000632 and 1000633 report the distributions on
// the same two holdings, with byte-identical figures. Two separate holdings
// earn two incomes, so the answer covers them too — and only them.
{
  const earning = ({ provider, accountNo }) => ({
    docKey: `${provider}-${accountNo}-2026-06-04-aif-earnings`, status: "parsed",
    provider, accountNo, owner: `owner-${accountNo}`, asOf: "2026-06-04", reportType: "aif-earnings", holdings: [],
    aifEarnings: { class: "A3", units: 990429.684, totalIncome: 738106, netIncome: 664295, tds: 73811 },
  });
  const docs = SPECIAL_OPPS.incomeFolios.map(earning);
  const [decided] = duplicateAifEarnings(docs);
  ok("the named income folios are two incomes", decided?.confirmedSeparate === SPECIAL_OPPS.confirmed
    && decided.doubleCountRisk === null);
  const [undecided] = duplicateAifEarnings(docs, { decisions: [] });
  ok("…and without the answer they are one income reported twice",
    undecided?.confirmedSeparate === null && undecided.doubleCountRisk === 738106);
  const stranger = duplicateAifEarnings([earning(SPECIAL_OPPS.incomeFolios[0]),
    earning({ provider: SPECIAL_OPPS.incomeFolios[0].provider, accountNo: "1000634" })]);
  ok("a named folio beside an unnamed one is still one income reported twice",
    stranger.length === 1 && stranger[0].confirmedSeparate === null);
  ok("a decision with no income folios covers no income",
    separateIncomeFor(TRANSITION.accounts, [TRANSITION]) === null);
}

// ── 7. THE TABLE ITSELF ─────────────────────────────────────────────────────
{
  ok("the family's answer names both pairs", SEPARATE_INVESTMENTS.length === 2,
    SEPARATE_INVESTMENTS.map((d) => d.securityKey).join(", "));
  for (const d of SEPARATE_INVESTMENTS) {
    ok(`${d.securityKey}: names at least two accounts`, d.accounts.length >= 2);
    ok(`${d.securityKey}: names no account twice`,
      d.accounts.every((a, i) => d.accounts.findIndex((b) => sameAccount(a, b)) === i));
    ok(`${d.securityKey}: carries the date it was given`, /^\d{4}-\d{2}-\d{2}$/.test(d.confirmed));
  }
  ok("no two decisions share a security",
    new Set(SEPARATE_INVESTMENTS.map((d) => d.securityKey)).size === SEPARATE_INVESTMENTS.length);
}

// ── 8. ON THE COMMITTED ARCHIVE ─────────────────────────────────────────────
//
// The rule the book was built under. The archive is read fresh for each run,
// its tags cleared, so what the policy decides is decided here rather than read
// back off the disk.
const manifest = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));
const archive = () => manifest
  .map((e) => path.join(AUDIT, e.docKey, "document.json"))
  .filter((f) => fs.existsSync(f))
  .map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const cleared = () => {
  const docs = archive();
  for (const d of docs) for (const h of d.holdings ?? []) { h.dedupeGroup = null; h.alsoReportedUnder = []; }
  return docs;
};
{
  const onDisk = archive();
  const tagged = onDisk.flatMap((d) => (d.holdings ?? []).filter((h) => h.dedupeGroup).map((h) => `${d.docKey} · ${h.securityKey}`));
  ok("the archive on disk carries the answer — no holding is tagged", tagged.length === 0, tagged.slice(0, 4).join("; "));

  const docs = cleared();
  const r = duplicateHoldings(docs);
  applyDedupePolicy(docs, r.groups);
  ok("with the family's answer the archive groups nothing", r.groups.length === 0,
    r.groups.map((g) => g.dedupeGroup).join(", "));
  for (const d of SEPARATE_INVESTMENTS) {
    const hits = r.confirmedSeparate.filter((c) => c.securityKey === d.securityKey);
    ok(`${d.securityKey}: detected on the archive and filed as confirmed separate`, hits.length >= 1);
    ok(`${d.securityKey}: …only ever on the accounts the family named`,
      hits.every((c) => c.occurrences.every((o) => d.accounts.some((n) => sameAccount(n, { provider: manifestProvider(o.docKey), accountNo: o.accountNo })))));
  }
  ok("…and the consolidated value counts every row", consolidatedValue(docs).doubleCounted === 0);

  const without = cleared();
  const r0 = duplicateHoldings(without, { decisions: [] });
  applyDedupePolicy(without, r0.groups);
  for (const d of SEPARATE_INVESTMENTS) {
    ok(`${d.securityKey}: WITHOUT the answer the archive groups it again — the coincidence is real`,
      r0.groups.some((g) => g.securityKey === d.securityKey));
  }
  ok("…and the consolidated value would leave the second statements out",
    consolidatedValue(without).doubleCounted > 0);
  ok("the answer moves nothing else — every other group is the same with or without it",
    JSON.stringify(r0.groups.filter((g) => !SEPARATE_INVESTMENTS.some((d) => d.securityKey === g.securityKey)).map((g) => g.dedupeGroup))
      === JSON.stringify(r.groups.map((g) => g.dedupeGroup)));

  const incomes = duplicateAifEarnings(cleared());
  ok("the archive's income-only pair is two incomes",
    incomes.length === 1 && incomes[0].confirmedSeparate === SPECIAL_OPPS.confirmed && incomes[0].doubleCountRisk === null,
    JSON.stringify(incomes.map((i) => [i.confirmedSeparate, i.doubleCountRisk])));
}

// ── 9. THE REPLAY LANDS THE ANSWER, AND TAKES IT BACK ────────────────────────
//
// `npm run replay:dedupe` is how a change to the table reaches the committed
// archive without the PDF passwords, through `planDedupeReplay` — the function
// called here. Its gate accepts only tags the policy itself writes, so each
// direction is asserted, and so is a refusal.
{
  const onDisk = archive();
  const named = (docs) => docs.flatMap((d, i) => (d.holdings ?? []).map((h, j) => ({ i, j, d, h })))
    .filter(({ h }) => SEPARATE_INVESTMENTS.some((x) => x.securityKey === h.securityKey));
  const apply = (docs, plan) => plan.writes.map((w) => ({ ...JSON.parse(w.text) })).reduce((out, doc) => {
    out[out.findIndex((d) => d.docKey === doc.docKey)] = doc;
    return out;
  }, docs.map((d) => structuredClone(d)));

  const landed = planDedupeReplay(onDisk, SEPARATE_INVESTMENTS);
  ok("with the answer on disk the replay is a no-op — its --check control",
    landed.updates.length === 0 && landed.refusals.length === 0, JSON.stringify(landed.refusals.slice(0, 2)));

  // WITHDRAWN: with no answer, every row the policy groups gets its group's tag
  // back. Not every row of a named security: a statement issued at another date
  // (37702's July) or a depository's copy of the units prints figures that do
  // not coincide, and the policy never grouped those.
  const noAnswer = tagsUnder(onDisk, []);
  const rows = named(onDisk).filter(({ i, j }) => noAnswer[i][j].dedupeGroup);
  const rowId = (docKey, key) => `${docKey} · ${key}`;
  const withdrawn = planDedupeReplay(onDisk, []);
  ok("an answer withdrawn is accepted, not refused — the untagged pairs are the policy's own writing",
    withdrawn.refusals.length === 0, withdrawn.refusals.slice(0, 2).join(" | "));
  ok("…and tags exactly the rows the policy groups, every one of them",
    rows.length >= 4
      && JSON.stringify(withdrawn.updates.map((u) => rowId(u.docKey, u.securityKey)).sort())
        === JSON.stringify(rows.map(({ d, h }) => rowId(d.docKey, h.securityKey)).sort())
      && withdrawn.updates.every((u) => u.to),
    `${withdrawn.updates.length} update(s) over ${rows.length} grouped row(s)`);
  const retagged = apply(onDisk, withdrawn);
  const again = planDedupeReplay(retagged, []);
  ok("…after which the same run is a no-op", again.updates.length === 0 && again.refusals.length === 0);

  // AND BACK: from the re-tagged archive the answer lands again, untagging them all.
  const relanded = planDedupeReplay(retagged, SEPARATE_INVESTMENTS);
  ok("from the tagged archive the answer lands again, on the same rows",
    relanded.refusals.length === 0 && relanded.updates.length === rows.length && relanded.updates.every((u) => u.to === null));
  ok("…and every document it writes comes back byte for byte what is on disk now",
    relanded.writes.every((w) => JSON.stringify(JSON.parse(w.text)) === JSON.stringify(onDisk[w.index])));

  // REFUSED: half a group untagged is a state the policy writes under no answer.
  const half = structuredClone(retagged);
  const one = named(half).find(({ h }) => h.securityKey === TRANSITION.securityKey && h.dedupeGroup);
  one.h.dedupeGroup = null; one.h.alsoReportedUnder = [];
  const halfPlan = planDedupeReplay(half, []);
  ok("a group with one member untagged and one tagged is refused under no answer",
    halfPlan.refusals.some((r) => r.includes(TRANSITION.securityKey)), halfPlan.refusals.join(" | "));
  // …and a tag the policy never writes at all.
  const forged = structuredClone(onDisk);
  const other = forged.find((d) => (d.holdings ?? []).length && !named([d]).length);
  other.holdings[0].dedupeGroup = "dg-not-the-policys-1";
  const forgedPlan = planDedupeReplay(forged, SEPARATE_INVESTMENTS);
  ok("a tag the policy never writes is refused", forgedPlan.refusals.some((r) => r.includes("dg-not-the-policys-1")));
  ok("…and a refused plan is still a plan to write nothing there",
    !forgedPlan.writes.some((w) => w.index === forged.indexOf(other)));
}

/** The provider an archive document was issued by, read off its own document. */
function manifestProvider(docKey) {
  const e = manifest.find((m) => m.docKey === docKey);
  return e?.provider ?? null;
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
