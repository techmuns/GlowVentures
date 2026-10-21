// A PRIVATE INVESTMENT'S STRATEGY AND DESCRIPTION, read from files in several
// layouts and matched to the real book by identity.
//   npm run test:family   (ONLY="investment profiles")
//
// The family supplies these in whatever file they keep — so the reader is held
// to FOUR layouts of the same facts (a CSV whose header is not on row 1 and
// whose columns are in another order, an .xlsx with the labels down column A,
// a JSON object keyed by name, a JSON array keyed by ISIN), and each must land
// on the same investments. Then the matcher is held to its refusals: a folio
// shared by many brands names none of them, a name the book does not carry
// matches nothing, a statement ledger with a Description column is not a
// profile table, and two different texts in one delivery are a conflict.
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_COMMITMENTS, BOOK_CORPORATE_ACTIONS } from "@/data/glowData";
import { privateBookFolios, investmentIdentities, bookFolios, privateBook } from "@/lib/privateBook";
import { matchProfiles, matchRecord, nameKey, SUPPLIED_PROFILES, type SuppliedProfile, type SuppliedProfiles } from "@/lib/investmentProfiles";
import { accountIndex } from "@/lib/accounts";
import { currentHoldings } from "@/lib/analytics";
import { privateCapital } from "@/lib/privateMarket";
import { schemeCalls } from "@/lib/capitalCalls";
import * as XLSX from "xlsx";
// @ts-expect-error — a node-only .mjs with no declaration; the test bundle runs under node.
import { profilesOfFile, profileHeader, deliveryOf } from "../../../scripts/lib/privateProfiles.mjs";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const book = { positions: BOOK_POSITIONS, accounts: BOOK_ACCOUNTS, commitments: BOOK_COMMITMENTS };
const { folios } = privateBookFolios(book, BOOK_CORPORATE_ACTIONS as never);
const inv = investmentIdentities(folios);
const fundOf = (pred: (i: (typeof inv)[number]) => boolean) => inv.find(pred);

// Investments picked off the book by what they ARE, so a renamed line fails loudly here.
const drink = inv.filter((i) => i.group === "brand:drinkprime");
const withIsin = fundOf((i) => i.isins.length === 1 && i.group !== "brand:drinkprime")!;
const sme = fundOf((i) => /india sme investments fund ii/i.test(i.label))!;
ok("the book carries DrinkPrime under more than one line", drink.length > 1, `${drink.length} lines`);
ok("the book carries a private line with an ISIN", !!withIsin, withIsin?.label);
ok("the book carries India SME Investments Fund II", !!sme && sme.folios.length > 1, sme?.folios.join(", "));

console.log("\n── the reader: one set of facts in four layouts ──");
const smeFolio = sme.folios[0];
const DESC = "Water purifiers on subscription";
const STRAT = "Debt and equity in Indian SMEs";
const ISIN_DESC = "Described by ISIN";
const csv = [
  "Glow family — private investment notes,,,",
  ",,,",
  `About the company,Fund strategy,Company name,Folio no`,
  `"${DESC}",,Drink Prime,`,
  `,${STRAT},,${smeFolio}`,
  `-,-,Total,`,
].join("\n");
const csvRecords = profilesOfFile(Buffer.from(csv), "notes.csv");
eq("CSV: the header on row 3, in its own order — two records", csvRecords.length, 2);
eq("CSV: the description is cited to its cell", csvRecords[0]?.description, { value: DESC, cell: "A4" });

const sheet = XLSX.utils.aoa_to_sheet([
  ["Investment", "Waterwala Labs Pvt. Ltd.", "India SME Investments Fund II"],
  ["Description", DESC, ""],
  ["Strategy", "", STRAT],
]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheet, "Profiles");
const xlsxRecords = profilesOfFile(Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })), "profiles.xlsx");
eq("XLSX: labels down column A — two records", xlsxRecords.length, 2);
eq("XLSX: a transposed cell is cited where it really is", xlsxRecords[1]?.strategy, { value: STRAT, cell: "C3" });

const keyed = profilesOfFile(Buffer.from(JSON.stringify({ DrinkPrime: { description: DESC } })), "p.json");
eq("JSON keyed by name — one record", keyed.map((r: SuppliedProfile) => r.identity.name), ["DrinkPrime"]);
const byIsin = profilesOfFile(Buffer.from(JSON.stringify({ investments: [{ ISIN: withIsin.isins[0], "Business description": ISIN_DESC }] })), "q.json");
eq("JSON array under a key, matched on ISIN", byIsin.map((r: SuppliedProfile) => r.identity.isin), [withIsin.isins[0]]);

const ledger = profilesOfFile(Buffer.from("Date,Scheme Name,Description,Amount\n2026-04-01,Some Fund,Purchase,1000\n"), "ledger.csv");
eq("a statement ledger with a Description column is not a profile table", ledger.length, 0);
eq("a header with a name and no strategy or description is not one", profileHeader(["Investment Name", "Investment Amount"]), null);
eq("delivery: an upload folder is its date", deliveryOf("source/uploads-2026-10-19/x/p.csv"), "2026-10-19");
eq("delivery: a month folder sorts by month and letter", deliveryOf("source/october-2026-c/p.csv"), "2026-10-00c");

console.log("\n── the matcher: every layout lands on the same investments ──");
const supplied = (file: string, delivery: string, recs: SuppliedProfile[]): SuppliedProfile[] =>
  recs.map((r) => ({ ...r, file, delivery }));
const all: SuppliedProfiles = {
  files: [{ file: "notes.csv", md5: "", records: 2 }, { file: "profiles.xlsx", md5: "", records: 2 }, { file: "p.json", md5: "", records: 1 }, { file: "q.json", md5: "", records: 1 }],
  records: [
    ...supplied("notes.csv", "2026-10-19", csvRecords),
    ...supplied("profiles.xlsx", "2026-10-19", xlsxRecords),
    ...supplied("p.json", "2026-10-19", keyed),
    ...supplied("q.json", "2026-10-19", byIsin),
  ],
};
const m = matchProfiles(inv, all);
for (const d of drink) eq(`DrinkPrime's description reaches ${d.label}`, m.byId.get(d.id)?.description.value, DESC);
eq("India SME's strategy, by folio alone and by name", m.byId.get(sme.id)?.strategy.value, STRAT);
eq("the ISIN record reaches its holding", m.byId.get(withIsin.id)?.description.value, ISIN_DESC);
eq("…matched on the ISIN", m.byId.get(withIsin.id)?.description.matchedOn, "ISIN");
eq("nothing supplied went unmatched", m.unmatched.map((u) => u.reason), []);
const untouched = inv.find((i) => i.id !== sme.id && i.id !== withIsin.id && i.group !== "brand:drinkprime")!;
ok("an investment no record names says so", m.byId.get(untouched.id)?.strategy.value === null && /none of the 4 profile files/.test(m.byId.get(untouched.id)?.strategy.reason ?? ""),
  m.byId.get(untouched.id)?.strategy.reason ?? "");

console.log("\n── the matcher's refusals ──");
const rec = (identity: Partial<SuppliedProfile["identity"]>, description = "x", delivery = "2026-10-19", file = "r.csv"): SuppliedProfile => ({
  file, delivery, sheet: null, at: "A2",
  identity: { name: null, aka: null, isin: null, folio: null, securityKey: null, ...identity },
  strategy: null, description: { value: description, cell: "B2" },
});
const mopwm = inv.filter((i) => i.folios.includes("MOPWM"));
ok("a folio shared by many brands names none of them", mopwm.length > 1 && matchRecord(rec({ folio: "MOPWM" }), inv).ids.length === 0,
  matchRecord(rec({ folio: "MOPWM" }), inv).reason ?? "");
eq("a name the book does not carry matches nothing", matchRecord(rec({ name: "Kiranakart Technologies" }), inv).ids, []);
eq("a folio narrows a name it does not hold to nothing", matchRecord(rec({ name: "Drink Prime", folio: smeFolio }), inv).ids, []);
eq("names compare without case, spacing or legal suffix", nameKey("WATERWALA LABS PVT. LTD."), nameKey("Waterwala Labs Private Limited"));
const clash = matchProfiles(inv, { files: [{ file: "a.csv", md5: "", records: 2 }], records: [rec({ name: "Drink Prime" }, "one"), rec({ name: "DrinkPrime" }, "two")] });
ok("two texts in one delivery are a conflict, and neither is shown", clash.byId.get(drink[0].id)?.description.value === null
  && /disagree/.test(clash.byId.get(drink[0].id)?.description.reason ?? ""));
const newer = matchProfiles(inv, { files: [{ file: "a.csv", md5: "", records: 2 }], records: [rec({ name: "Drink Prime" }, "old", "2026-09-00"), rec({ name: "Drink Prime" }, "new", "2026-10-19")] });
eq("the newest delivery wins", newer.byId.get(drink[0].id)?.description.value, "new");

console.log("\n── the canonical model carries it, and a row combines it ──");
const accIdx = accountIndex(BOOK_ACCOUNTS);
const cap = privateCapital(BOOK_COMMITMENTS ?? [], BOOK_ACCOUNTS, BOOK_POSITIONS);
const attached = bookFolios({
  positions: currentHoldings(BOOK_POSITIONS), allPositions: BOOK_POSITIONS, accounts: BOOK_ACCOUNTS,
  commitments: cap.onPage, accIdx, schemes: schemeCalls(cap.onPage, (c) => c.name, () => null), profiles: all,
});
ok("every folio of DrinkPrime carries the description", attached.filter((f) => drink.some((d) => d.id === f.fundKey)).every((f) => f.profile.description.value === DESC));
const brandRow = privateBook(attached, "brand").sections.atCost.groups.find((g) => g.key === "brand:drinkprime")
  ?? privateBook(attached, "brand").sections.private.groups.find((g) => g.key === "brand:drinkprime");
eq("the DrinkPrime brand row shows the one text its lines share", brandRow?.profile.description.value, DESC);
const owners = privateBook(attached, "owner").sections.atCost.groups;
ok("a member row over different investments shows none, and says to open it",
  owners.some((g) => g.profile.description.value === null && /open the row/.test(g.profile.description.reason ?? "")));
ok("the book's own folios carry a profile on every line", folios.every((f) => f.profile && f.profile.strategy && f.profile.description));
ok(`what the build read from source/ is well-formed (${SUPPLIED_PROFILES.records.length} records)`,
  SUPPLIED_PROFILES.records.every((r) => r.file && r.at && (r.strategy || r.description)));

if (fails) { console.log(`\n${fails} failing`); process.exit(1); }
console.log("\nall investment-profile checks pass");
