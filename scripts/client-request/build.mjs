#!/usr/bin/env node
/**
 * THE CLIENT RECORDS REQUEST — "All records still needed from the client"
 * (Stage 10mq). Replaces the hand-made 27 October 2026 PDF, in its format.
 *
 *   npm run client:request              writes docs/client/Glow-Ventures-records-still-needed-<date>.pdf
 *   CHECKED=2026-11-11 npm run client:request
 *   CHROME=<path to chrome/edge> …      the browser that prints the PDF
 *
 * Three sections, as before:
 *   1. Named records — WRITTEN BY HAND (`ITEMS` below), because each one says
 *      what is wrong with a particular balance. Every item carries a `check`
 *      against the book; an item the book no longer bears out (cost now
 *      recovered, units changed, statement now newer) STOPS the build, so a
 *      request for something already supplied can never be printed.
 *   2. PMS stocks with no purchase date — DERIVED: every PMS line the
 *      dashboard's own `investedOnOf` leaves undated.
 *   3. Private investments carried at cost — DERIVED: every holding in the
 *      "Private investments at cost" section (`holdingBucket`).
 * Nothing here writes to the book.
 */
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECKED = process.env.CHECKED ?? new Date().toISOString().slice(0, 10);
const OUT = process.env.OUT ?? join(ROOT, "docs", "client", `Glow-Ventures-records-still-needed-${CHECKED}.pdf`);

// ── 1. The facts, read by the dashboard's own rules ──────────────────────────
const tmp = mkdtempSync(join(tmpdir(), "glow-request-"));
const bundle = join(tmp, "facts.mjs");
const factsFile = join(tmp, "facts.json");
await build({
  entryPoints: [join(ROOT, "scripts", "client-request", "facts.ts")],
  bundle: true, platform: "node", format: "esm", outfile: bundle, logLevel: "warning",
  alias: { "@": join(ROOT, "src") }, loader: { ".json": "json" },
  define: { "import.meta.env": JSON.stringify({ DEV: false, PROD: true, MODE: "production", BASE_URL: "/" }) },
});
const { execFileSync } = await import("node:child_process");
execFileSync(process.execPath, [bundle, factsFile], { stdio: "inherit" });
const F = JSON.parse(readFileSync(factsFile, "utf8"));
rmSync(tmp, { recursive: true, force: true });

const ACC = new Map(F.accounts.map((a) => [a.accountId, a]));
const near = (a, b) => a != null && b != null && Math.abs(a - b) <= 0.0005;
const pos = (accountId, key) => F.positions.find((p) => p.accountId === accountId && p.securityKey === key);
const unvalued = (accountId, key) => F.unvalued.find((u) => u.accountId === accountId && u.securityKey === key);
const movement = (accountId, prefix) => F.movements.find((m) => m.accountId === accountId && m.securityKey.startsWith(prefix));
const recoveredAt = (accountId, q) => F.recovered.some((r) => r.accountId === accountId && near(r.quantity, q));
const advised = (accountId, recordQuantity) => F.advised.find((b) => b.accountId === accountId && near(b.recordQuantity, recordQuantity));
const tradesOf = (accountId, key) => F.trades[`${accountId}|${key}`] ?? [];
const asOf = (accountId) => ACC.get(accountId)?.asOf;
const rolledThrough = (accountId) => F.rolls.filter((r) => r.accountId === accountId).map((r) => r.through).sort().at(-1);

const ICICI = "icici-bank-nsdl-demat-49794950";
const MO_AJAY = "motilal-oswal-financial-services-demat-1201090012539150";
const MO_ANKITA = "motilal-oswal-financial-services-demat-1201090012838316";
const MO_BHARAT = "motilal-oswal-financial-services-demat-1201090012838320";
const MO_AARTI = "motilal-oswal-financial-services-demat-1201090012838335";
const MO_TRUST = "motilal-oswal-financial-services-demat-1201090032387399";
const HDFC_BHARAT = "hdfc-bank-nsdl-demat-22025655";
const HDFC_SEC = "hdfc-securities-3110320";
const LKP = "lkp-securities-98245";

/** A position the book holds at `q` units with no cost recorded. */
const noCost = (accountId, key, q) => { const p = pos(accountId, key); return !!p && near(p.quantity, q) && p.costBasis == null; };
/** A position the book holds at `q` units with no purchase date. */
const undated = (accountId, key, q) => { const p = pos(accountId, key); return !!p && near(p.quantity, q) && !p.dated; };
/** A depository balance on a statement that values nothing, with no recovered cost. */
const bareUnits = (accountId, key, q) => { const u = unvalued(accountId, key); return !!u && near(u.quantity, q) && !recoveredAt(accountId, q); };
/** A closing balance on a transaction-only demat, with no recovered cost. */
const bareClosing = (accountId, prefix, q) => { const m = movement(accountId, prefix); return !!m && near(m.closing, q) && !recoveredAt(accountId, q); };

const SAME_HISTORY = "Send the original purchase records showing each date, shares bought and amount paid. If transferred from another account, include the transfer record and the earlier purchases. The holding statement already supplied shows only the share balance.";
const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const DATE = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// ── Section 1: written by hand, each checked against the book ────────────────
const ITEMS = [
  { holder: "Ajay Jaisinghani", account: "ICICI NSDL 49794950", what: "ESDS Software Solution", units: 330898, from: "Client accounts team and ICICI",
    send: "Explain why the purchase register shows 330,940 shares but the account shows 330,898: which 42 shares changed? Send the sale, transfer or share-change record. Confirm whether ESDS Partners LLC and ESDS Software Solution are the same shares, using the ISIN. Explain the Rs 774 difference between one payment and shares multiplied by the stated price.",
    check: () => noCost(ICICI, "esds-software-solution-limited-eq-new-fv-rs-1", 330898) },
  { holder: "Ajay Jaisinghani", account: "Motilal 1201090012539150", what: "Insolation Energy", units: 110000, from: "Motilal and ICICI",
    send: "Send the original purchases, sales, transfers and share-change records for these 110,000 Motilal shares. Show how they relate to Ajay's separate ICICI shares, so the same purchase is not counted twice. Each purchase must show its date, shares and amount paid.",
    check: () => bareClosing(MO_AJAY, "insolation-energy", 110000) },
  { holder: "Bharat Jaisinghani", account: "HDFC NSDL 22025655", what: "Insolation Energy", units: 91000, from: "HDFC or the earlier broker",
    send: "Send Bharat's original purchase records: date, shares bought and amount paid. If transferred from another account, send the transfer record and the old purchases. Ajay's purchase records cannot be used for Bharat.",
    check: () => bareUnits(HDFC_BHARAT, "insolation-energy", 91000) && asOf(HDFC_BHARAT) === "2026-03-31" },
  { holder: "Ajay Jaisinghani", account: "Motilal 1201090012539150", what: "Nuvama Wealth Management", units: 3695, from: "Motilal or the earlier broker",
    send: "Explain why the transaction report leaves 9,500 shares but the holding statement shows 3,695. Send the purchases, sales, transfers and split details, including the split on 26 December 2025. Show dates, quantities, purchase amounts and sale receipts.",
    check: () => bareClosing(MO_AJAY, "nuvama-wealth-management", 3695) },
  { holder: "Ajay Jaisinghani", account: "Motilal 1201090012539150", what: "Vedanta Aluminium Metal", units: 281000, from: "Motilal and the original broker",
    send: "For the 115,000 shares received from the Vedanta demerger on 30 April 2026, send the original Vedanta Ltd purchases and the cost assigned to the new shares. Show original dates, quantities and amounts. The separate July purchases of 90,000 and 76,000 shares are already recorded.",
    check: () => bareClosing(MO_AJAY, "vedanta-aluminium-metal", 281000) },
  ...[["Power Grid Corporation of India", "power-grid-corporation-of-india", 177], ["Sterlite Technologies", "sterlite-technologies", 25],
    ["Havells India", "havells-india", 20], ["KEI Industries", "kei-industries", 5], ["Vindhya Telelinks", "vindhya-telelinks", 5],
    ["Universal Cables", "universal-cables", 5], ["Finolex Cables", "finolex-cables-limited-new", 5]].map(([what, key, units]) => ({
    holder: "Bharat Jaisinghani", account: "HDFC NSDL 22025655", what, units, from: "HDFC or the earlier broker", send: SAME_HISTORY,
    check: () => bareUnits(HDFC_BHARAT, key, units) && asOf(HDFC_BHARAT) === "2026-03-31" })),
  { holder: "Ajay Jaisinghani", account: "ICICI NSDL 49794950", what: "Indian Bank, IndusInd Bank, Karur Vysya Bank and RBL Bank",
    unitsText: "Indian Bank 27,200; IndusInd Bank 15,950; Karur Vysya Bank 50,500; RBL Bank 40,900", from: "ICICI and the broker or account the shares came from",
    send: "These four holdings first appear on the 31 October 2026 statement. They are not on the 31 March statement, and the ICICI order book (24 June to 27 October) shows no purchase of them. Send the transfer-in record and the original purchases: date, shares and amount paid.",
    check: () => [["indian-bank", 27200], ["indusind-bank", 15950], ["karur-vysya-bank", 50500], ["rbl-bnk", 40900]]
      .every(([k, q]) => noCost(ICICI, k, q) && !tradesOf(ICICI, k).length) },
  { holder: "Ajay Jaisinghani", account: "ICICI NSDL 49794950", what: "City Union Bank", units: 104400, from: "ICICI and the broker or account the shares came from",
    send: "The ICICI order book shows 79,283 shares bought on 2 July 2026; the 31 October statement shows 104,400. Send the purchase or transfer record for the other 25,117 shares, with date, shares and amount paid.",
    check: () => noCost(ICICI, "city-union", 104400) && tradesOf(ICICI, "city-union").reduce((n, t) => n + (t.side === "buy" ? t.quantity : -t.quantity), 0) === 79283 },
  { holder: "Ajay Jaisinghani", account: "ICICI NSDL 49794950", what: "Vantage Oak Fund I, Class A2", units: 2275000, from: "Vantage Oak / fund manager",
    send: "Send the subscription or drawdown record (dates and amounts paid), the latest fund statement showing the NAV and its date, and the fund's SEBI AIF category. Ankita's Motilal demat 1201090012838316 also shows 1,225,000 units of this class; include her records too.",
    check: () => noCost(ICICI, "vof-i-class-a2", 2275000) && !!unvalued(MO_ANKITA, "vof-i-class-a2") },
  // Man Industries, Deepak Fertilisers and Kingfa: dated off the 30 June review's
  // purchases since Stage 10ms — no longer asked of HDFC Securities.
  { holder: "Ajay Jaisinghani", account: "HDFC Securities 3110320", what: "Sterlite Technologies and its demerged shares",
    unitsText: "Sterlite Technologies 1,850; STL Networks 1,850; Sterlite Electric 1,140; Sterlite Grid 5 1,140", from: "HDFC Securities",
    send: "Send the original Sterlite Technologies purchases (date, shares, amount paid) and the cost assigned to each demerged company. Sterlite Electric and Sterlite Grid 5 have no price on the statement yet.",
    check: () => noCost(HDFC_SEC, "sterlite-technologies", 1850) && noCost(HDFC_SEC, "stl-networks", 1850)
      && bareUnits(HDFC_SEC, "sterlite-electric", 1140) && bareUnits(HDFC_SEC, "sterlite-grid-5", 1140) },
  ...[["Ajay Jaisinghani", "Motilal 1201090012539150", MO_AJAY, 49.071, " The saved report for folio 470353 belongs to a different balance."],
    ["Ankita Jaisinghani", "Motilal 1201090012838316", MO_ANKITA, 257.411, ""],
    ["Bharat Jaisinghani", "Motilal 1201090012838320", MO_BHARAT, 3828.05, " The review closes at 3,816.251 units; explain the difference."],
    ["Aarti Jaisinghani", "Motilal 1201090012838335", MO_AARTI, 7679.495, " The review closes at 5,169.754 units; explain the difference."]].map(([holder, account, id, statement, extra]) => {
    const b = advised(id, statement);
    return { holder, account, what: "Nippon India Liquid BeES", units: b?.quantity, from: "Broker and fund registrar",
      unitsNote: `${fmt(statement)} on the 31 July statement`,
      send: `Send the full purchase, sale, transfer and payout-unit history from the first purchase to the family's 21 October balance of ${b ? fmt(b.quantity) : "—"} units, with dates, units and amounts paid.${extra}`,
      check: () => !!b && !recoveredAt(id, statement) && !recoveredAt(id, b.quantity) };
  }),
  { holder: "Bharat Jaisinghani", account: "LKP 98245", what: "Nippon India Liquid BeES", units: 17.111, from: "Broker and fund registrar",
    send: "Send the full purchase, sale, transfer and payout-unit history for these 17.111 units. Each purchase needs its date, units and amount paid.",
    check: () => noCost(LKP, "nip-etnf1d-rtliqbees", 17.111) },
  { holder: "Hope India Trust", account: "Kotak folio 4295974", what: "Kotak Liquid Direct Daily IDCW", units: 641.954, from: "Kotak fund company or registrar",
    send: "Send the missing transactions after 19 October 2023 through the latest statement, including units added from payouts. The saved history leaves 541.2893 units. Explain why the dated statement shows 641.448 but available units show 641.954, and confirm the cost for the agreed balance. The original 2019 purchase is already available.",
    check: () => noCost("kotak-mahindra-mutual-fund-4295974", "kotak-liquid-fund-direct-plan-daily-idcw", 641.954) },
  { holder: "Hope India Trust", account: "ABSL folio 1019265797", what: "ABSL Liquid Daily IDCW Direct", units: 7756.542, from: "ABSL fund company or registrar",
    send: "Send the missing transactions after 19 October 2023, including units added from payouts, linking 6,544.5539 units to 7,756.542 units. The original 10 July 2019 purchase and recorded cost are already available.",
    check: () => undated("aditya-birla-sun-life-mutual-fund-1019265797", "aditya-birla-sun-life-liquid-fund-daily-idcw-direct-plan", 7756.542) },
  { holder: "Hope India Trust", account: "ABSL folio 1038104611", what: "ABSL Liquid Growth Direct", units: 1752.565, from: "ABSL fund company or registrar",
    send: "Confirm whether old folio 1019265797 became current folio 1038104611. Send the folio-change record. The old folio has purchases and a sale leaving exactly 1,752.565 units. If these are different investments, send the original purchases for current folio 1038104611.",
    check: () => undated("aditya-birla-sun-life-mutual-fund-1038104611", "absl-liquid-fund-direct-growth", 1752.565) },
  { holder: "Hope India Trust", account: "Mirae folio 70413280453", what: "Mirae Asset Liquid Direct Growth", units: 316.19, from: "Mirae fund company or registrar",
    send: "Send the since-inception transaction history: each purchase date, units and amount. The 11 July 2019 entry on the saved statement is an opening balance, not a purchase. The cost is already available.",
    check: () => undated("mirae-asset-mutual-fund-70413280453", "mirae-asset-liquid-fund-formerly-mirae-asset-cash-management-fund-direct-plan-mirae-asset-liquid-fund-formerly-mirae-asset-cash-management-fund-direct-plan-growth", 316.19) },
  { holder: "Ajay Jaisinghani", account: "ICICI NSDL 49794950", what: "Grand Continent Hotels", units: 262125, from: "Client accounts team",
    send: "Confirm whether any extra money was paid on the 26 September 2024 bonus or split entry. If yes, send payment proof. The same amount appears again on that entry, so we need to confirm it was not a second payment.",
    check: () => !!pos(ICICI, "grand-continent-hotels") && near(pos(ICICI, "grand-continent-hotels").quantity, 262125) },
  { holder: "Ajay Jaisinghani", account: "Franklin India Credit AIF folio 10387", what: "Franklin India Credit AIF - Scheme I, Class DB2", units: 201254.604, from: "Franklin Templeton / fund manager",
    send: "Send a fund valuation or NAV dated after the investment on 22 October 2026, plus any later payments or payouts. The only statement on file is dated 22 October, the day of the investment. Purchase amount and date are already available.",
    check: () => asOf("franklin-india-credit-aif-10387") === "2026-10-22" },
  ...[["Ajay Jaisinghani", "Motilal 1201090012539150", MO_AJAY], ["Ankita Jaisinghani", "Motilal 1201090012838316", MO_ANKITA],
    ["Bharat Jaisinghani", "Motilal 1201090012838320", MO_BHARAT], ["Bharat Jaisinghani Family Trust", "Motilal 1201090032387399", MO_TRUST]].map(([holder, account, id]) => ({
    holder, account, what: "Current Motilal holding and cost statement", from: "Motilal",
    send: `Send the latest dated Motilal holding and purchase-cost report, plus transactions after 31 July 2026. The dashboard applies the later trades in the adviser's transaction report (through ${DATE(rolledThrough(id))}), but the latest Motilal statement on file is dated 31 July 2026. We need the broker's own statement to confirm what is still held.`,
    check: () => asOf(id) === "2026-07-31" && !!rolledThrough(id) })),
  { holder: "Bharat Jaisinghani", account: "Motilal 1201090012838320", what: "Invesco Contra Regular", units: 0.39, from: "Fund company or registrar",
    send: "Include this small balance in the same full fund transaction export, showing purchase dates, units and amounts. No separate document is needed.",
    check: () => bareUnits(MO_BHARAT, "inves-con-r-growth", 0.39) },
  { holder: "Bharat Jaisinghani", account: "Motilal 1201090012838320", what: "ICICI Nifty Next 50 Regular", units: 0.629, from: "Fund company or registrar",
    send: "Include this small balance in the same full fund transaction export, showing purchase dates, units and amounts. No separate document is needed.",
    check: () => bareUnits(MO_BHARAT, "icici-nft-nx-50-r-gr", 0.629) },
  ...[["Ankita Jaisinghani", "marathon-trends-advisory-pvt-ltd-5110758"], ["Ajay Jaisinghani", "marathon-trends-advisory-pvt-ltd-5110837"]].map(([holder, id]) => ({
    holder, account: `Marathon Trends ${ACC.get(id)?.accountNo ?? id}`, what: "Holding statement", from: "Marathon Trends Advisory",
    send: `Send the latest dated holding statement for this account, or confirm in writing that it is closed. The statements received (capital gains, dividends, income and expenses, transactions, up to ${DATE(asOf(id))}) do not state what the account holds.`,
    check: () => !F.positions.some((p) => p.accountId === id) && !!ACC.get(id) })),
  { holder: "Bharat Jaisinghani", account: "LKP account on the original report", what: "Files 519_06102026124925.xls and 666125807_06102026125819.xls", from: "LKP or the person who received the email",
    send: "Send the actual spreadsheets (XLSX or CSV), or a ZIP file or download link. Each saved attachment is only an email notice saying the file was removed. A fresh full LKP export covering the same period is also enough.",
    check: () => ["519_06102026124925.xls", "666125807_06102026125819.xls"].every((f) => new RegExp(`${f.replace(/\./g, "\\.")} NEVER ARRIVED`).test(readFileSync(join(ROOT, "docs", "EXTRACTION-REPORT.md"), "utf8"))) },
];

const failed = ITEMS.filter((it) => !it.check());
if (failed.length) {
  console.error("These requests are no longer borne out by the book — update or remove them:");
  for (const it of failed) console.error(`  • ${it.holder} | ${it.account} | ${it.what}`);
  process.exit(1);
}

// ── Section 2: PMS stocks the dashboard cannot date ──────────────────────────
const pmsGroups = new Map();
for (const p of F.positions) {
  if (p.engagement !== "PMS" || p.bucket !== "PMS mandates" || !(p.quantity > 0) || p.dated) continue;
  if (/^(cash|balance with banks|cash rec\/payable)$/i.test(p.security.trim())) continue;
  const g = pmsGroups.get(p.accountId) ?? [];
  g.push({ name: p.security, units: p.quantity, earlier: Number(/so ([\d.]+) of them are on no dated trade/.exec(p.undatedReason ?? "")?.[1]) || null, cost: p.costBasis });
  pmsGroups.set(p.accountId, g);
}
const pms = [...pmsGroups].map(([id, rows]) => ({ a: ACC.get(id), rows: rows.sort((x, y) => x.name.toLowerCase().localeCompare(y.name.toLowerCase())) }))
  .sort((x, y) => x.a.provider.localeCompare(y.a.provider) || x.a.accountNo.localeCompare(y.a.accountNo));
const pmsWithoutCost = pms.flatMap((g) => g.rows.filter((r) => r.cost == null));
if (pmsWithoutCost.length) { console.error("Section 2 says purchase costs are recorded, but these PMS lines have none:", pmsWithoutCost.map((r) => r.name)); process.exit(1); }

// ── Section 3: private investments carried at cost ───────────────────────────
const OWNER_LAST = "Not attributed to a member";
const privateRows = F.positions.filter((p) => p.bucket === "Private investments at cost" && p.valuedAtCost).map((p) => {
  const a = ACC.get(p.accountId);
  return { owner: a.owner, account: a.provider === "Consolidated review (MOPWM)" ? "MOPWM" : a.accountNo, name: p.security.replace(/ — /g, " - "), units: p.quantity, cost: p.costBasis };
}).sort((x, y) => (x.owner === OWNER_LAST) - (y.owner === OWNER_LAST) || (x.owner < y.owner ? -1 : x.owner > y.owner ? 1 : 0) || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
/** One investment per name as the review prints it; a name held by several holders counts once. */
const investmentOf = (name) => name.toLowerCase().replace(/\s+/g, " ").trim();
const distinctInvestments = new Set(privateRows.map((r) => investmentOf(r.name))).size;

// ── Section 4: valuations at the start of the year (written by hand; each checked) ──
// The return cards measure the financial year from 31 March 2026 and the calendar
// year from 31 December 2025. Where no valuation on or near that date is on file,
// an account is measured from its first later value, so the year's return starts
// late (12 Nov 2026: ~Rs 812 Cr of the book has no 31 December value, and the
// January–March fall is missed). Each row is held to the book: once a valuation
// on that date arrives (`BOOK_ACCOUNT_NAV_HISTORY`, or a verified return record
// opening on 1 April / 1 January), its check fails and the build stops.
const navsOf = (id) => F.navDates[id] ?? [];
/** No valuation on file within a week of 31 December 2025. */
const noDecValue = (id) => !!ACC.get(id) && !navsOf(id).some((d) => d <= "2026-01-07") && !((F.returnOpen[id] ?? "9999") <= "2026-01-01");
/** No valuation on file within a week of 31 March 2026, and no verified record opening there. */
const noMarValue = (id) => noDecValue(id) && !navsOf(id).some((d) => d <= "2026-04-07") && F.returnOpen[id] == null;
const firstOnFile = (id) => navsOf(id)[0] ?? asOf(id);
const many = (ids, f) => ids.every(f);
const sanshi = [["Aarti", "9039671821"], ["Ajay", "9039671912"], ["Ajay", "9069671634"], ["Ankita", "9069671554"], ["Bharat", "9039671854"]];
const MO_DEMATS = [["Ajay", MO_AJAY, "1201090012539150"], ["Ankita", MO_ANKITA, "1201090012838316"], ["Bharat", MO_BHARAT, "1201090012838320"],
  ["Aarti", MO_AARTI, "1201090012838335"], ["Bharat Jaisinghani Family Trust", MO_TRUST, "1201090032387399"]];
const BOTH = "31 December 2025 and 31 March 2026";
const OPENINGS = [
  { holder: "Ajay, Ankita, Aarti and Bharat Jaisinghani", account: `Sanshi Fund folios ${sanshi.map(([h, n]) => `${n} (${h})`).join(", ")}`, what: "Sanshi Fund-I (Class A2 and Class E)",
    onFile: `Earliest statement on file: ${DATE("2026-06-30")} (all five folios)`, from: "Sanshi Fund / fund administrator",
    send: `For each folio, the fund statement as at ${BOTH} showing units, class NAV and value, and every subscription, redemption and distribution after 31 December 2025. Also send the latest month-end statement after 30 June 2026 for each folio.`,
    check: () => many(sanshi.map(([, n]) => `sanshi-fund-${n}`), (id) => noMarValue(id) && asOf(id) === "2026-06-30") },
  { holder: "Ajay and Ankita Jaisinghani", account: "Buoyant Capital 103473 (Ajay) and 103472 (Ankita)", what: "Buoyant Opportunities Strategy",
    onFile: `Earliest valuation on file: ${DATE(firstOnFile("buoyant-capital-103473"))}`, from: "Buoyant Capital",
    send: `The portfolio statement as at ${BOTH} (holdings, cash and total value), and the capital and transaction statement from 1 January 2026 to 31 July 2026.`,
    check: () => many(["buoyant-capital-103473", "buoyant-capital-103472"], (id) => noMarValue(id) && firstOnFile(id) === "2026-07-31") },
  { holder: "Ajay and Ankita Jaisinghani", account: "Motilal Oswal Founders Fund 90410016104 (Ajay) and 90410016093 (Ankita)", what: "Motilal Oswal Founders Fund Series II",
    onFile: `Earliest valuation on file: ${DATE(firstOnFile("motilal-oswal-founders-fund-90410016104"))}`, from: "Motilal Oswal AMC / fund administrator",
    send: `The fund statement as at ${BOTH} showing units, NAV and value, and every drawdown, distribution and redemption from 1 January 2026 to 31 July 2026.`,
    check: () => many(["motilal-oswal-founders-fund-90410016104", "motilal-oswal-founders-fund-90410016093"], (id) => noMarValue(id) && firstOnFile(id) === "2026-07-31") },
  { holder: "Ankita Jaisinghani", account: "Carnelian Bharat Amritkaal Fund 4551", what: "Carnelian Bharat Amritkaal Fund",
    onFile: `Only statement on file: ${DATE(asOf("carnelian-bharat-amritkaal-fund-4551"))}`, from: "Carnelian / fund administrator",
    send: `The fund statement as at ${BOTH}, the latest statement after 31 July 2026, and every drawdown, distribution and redemption after 31 December 2025. With one statement on file, no return can be measured for this fund.`,
    check: () => noMarValue("carnelian-bharat-amritkaal-fund-4551") && asOf("carnelian-bharat-amritkaal-fund-4551") === "2026-07-31" },
  { holder: "Ankita Jaisinghani", account: "Motilal Oswal Active Momentum Fund 904168868444", what: "Motilal Oswal Active Momentum Fund",
    onFile: `Only statement on file: ${DATE(asOf("motilal-oswal-active-momentum-fund-904168868444"))} (the purchase)`, from: "Motilal Oswal AMC / fund administrator",
    send: "The latest statement showing units, NAV and value, and any payments or payouts after the 6 August 2026 purchase. The only statement on file is dated the day of purchase, so no return can be measured yet.",
    check: () => noMarValue("motilal-oswal-active-momentum-fund-904168868444") && asOf("motilal-oswal-active-momentum-fund-904168868444") === "2026-08-06" },
  { holder: "Ajay Jaisinghani", account: "HDFC Securities 3110320", what: "All shares in the account",
    onFile: `Earliest holding statement on file: ${DATE(asOf(HDFC_SEC))}`, from: "HDFC Securities",
    send: `The holding statement (shares and value) as at ${BOTH}. The trade details already received cover the purchases and sales.`,
    check: () => noMarValue(HDFC_SEC) && asOf(HDFC_SEC) === "2026-11-02" },
  { holder: "Ajay and Bharat Jaisinghani", account: "SVAN 8710067 (Ajay) and 8710090 (Bharat)", what: "SVAN PMS portfolio",
    onFile: `Earliest valuation on file: ${DATE(firstOnFile("svan-investment-managers-llp-8710067"))}`, from: "SVAN Investment Managers",
    send: `The portfolio statement as at ${BOTH} (holdings, cash and total value), and capital added or withdrawn from 1 January to 30 April 2026. The trade records already received date every stock.`,
    check: () => many(["svan-investment-managers-llp-8710067", "svan-investment-managers-llp-8710090"], (id) => noMarValue(id) && firstOnFile(id) === "2026-04-30") },
  { holder: "Ajay, Ankita, Bharat, Aarti and the Bharat Jaisinghani Family Trust", account: `Motilal demats ${MO_DEMATS.map(([h, , n]) => `${n} (${h})`).join(", ")}`, what: "All shares and funds in these demats",
    onFile: `Earliest holding statement on file: ${DATE("2026-07-31")}`, from: "Motilal",
    send: `The demat holding statement as at ${BOTH} for each account, showing the quantity of every share and fund. This is in addition to the current statement requested in section 1.`,
    check: () => many(MO_DEMATS, ([, id]) => noMarValue(id) && asOf(id) === "2026-07-31") },
  { holder: "Ajay and Aarti Jaisinghani", account: "Kotak folios 7111389 (Ajay) and 5372722 (Aarti)", what: "Kotak Multi Cap (both) and Kotak Flexi Cap (Aarti)",
    onFile: `Only statement on file: ${DATE(asOf("kotak-mahindra-mutual-fund-7111389"))}`, from: "Kotak fund company or registrar",
    send: "The full transaction statement from 1 January 2026 to date, with each purchase date, units and amount, including the Multi Cap purchases from April 2026. For Aarti's Flexi Cap, also the units held on 31 December 2025. The statement on file gives the balance only.",
    check: () => many(["kotak-mahindra-mutual-fund-7111389", "kotak-mahindra-mutual-fund-5372722"], (id) => noMarValue(id) && asOf(id) === "2026-11-02") },
  { holder: "Ankita Jaisinghani", account: "Bandhan folio 8691267", what: "Bandhan Large & Mid Cap",
    onFile: `Only statement on file: ${DATE(asOf("bandhan-mutual-fund-8691267"))}`, from: "Bandhan fund company or registrar",
    send: "The full transaction statement from the first purchase (April 2026) to date, with each date, units and amount.",
    check: () => noMarValue("bandhan-mutual-fund-8691267") && asOf("bandhan-mutual-fund-8691267") === "2026-09-30" },
  { holder: "Ajay Jaisinghani", account: "ICICI NSDL 49794950", what: "All shares in the demat",
    onFile: `Earliest holding statement on file: ${DATE("2026-03-31")}`, from: "ICICI",
    send: "The NSDL holding statement as at 31 December 2025 (quantity of every share), and the transaction statement from 1 January to 31 March 2026.",
    // The account's earliest holding statement is "As on 31 March 2026" (source/august-2026-e/).
    check: () => noDecValue(ICICI) && asOf(ICICI) === "2026-10-31" },
  { holder: "Ajay and Ankita Jaisinghani", account: "Carnelian 3517383 (Ajay); Goldstandard 100023 (Ajay) and 100022 (Ankita); V.E.C 128005 (Ajay)", what: "PMS portfolios",
    onFile: `Earliest valuation on file: ${DATE("2026-03-31")}; transaction statements start 1 April 2026`, from: "Carnelian, Goldstandard and V.E.C Assago",
    send: "The portfolio statement as at 31 December 2025 (holdings, cash and total value), and the transaction and capital statement from 1 January to 31 March 2026. The same from-inception transaction statement also answers the purchase dates in section 2.",
    check: () => many(["carnelian-asset-management-and-advisors-pvt-ltd-3517383", "goldstandard-wealth-private-limited-100023", "goldstandard-wealth-private-limited-100022", "v-e-c-assago-capital-management-llp-128005"],
      (id) => noDecValue(id) && firstOnFile(id) === "2026-03-31") },
  { holder: "Ajay and Ankita Jaisinghani", account: "V.E.C 128004 (Ankita); Green Lantern 510861 (Ajay) and 510854 (Ankita)", what: "PMS portfolios",
    onFile: `Earliest valuation on file: ${DATE("2026-03-31")}`, from: "V.E.C Assago and Green Lantern",
    send: "The portfolio statement as at 31 December 2025 (holdings, cash and total value). Their from-inception transaction statements are already on file.",
    check: () => many(["v-e-c-assago-capital-management-llp-128004", "green-lantern-capital-llp-510861", "green-lantern-capital-llp-510854"], (id) => noDecValue(id) && firstOnFile(id) === "2026-03-31") },
  { holder: "Ajay, Ankita, Bharat and Aarti Jaisinghani", account: "Helios 10056128, 10056154, 10063876; HDFC MF 15644806, 16002141, 15725046; Kotak 7125255; ICICI Prudential 36378950, 36379637", what: "Mutual fund folios",
    onFile: "Units on file from the 31 March 2026 opening balance", from: "Fund companies or registrars (or one CAS)",
    send: "An account statement for 1 January to 31 March 2026 for each folio, showing the units held on 31 December 2025 and every transaction to 31 March 2026. One consolidated account statement (CAS) for that period covers all nine folios.",
    check: () => many(["helios-mutual-fund-10056128", "helios-mutual-fund-10056154", "helios-mutual-fund-10063876", "hdfc-mutual-fund-15644806", "hdfc-mutual-fund-16002141",
      "hdfc-mutual-fund-15725046", "kotak-mahindra-mutual-fund-7125255", "icici-prudential-mutual-fund-36378950", "icici-prudential-mutual-fund-36379637"],
      (id) => noDecValue(id) && F.returnOpen[id] === "2026-04-01") },
];
const openingsFailed = OPENINGS.filter((it) => !it.check());
if (openingsFailed.length) {
  console.error("These start-of-year valuation requests are no longer borne out by the book — update or remove them:");
  for (const it of openingsFailed) console.error(`  • ${it.holder} | ${it.account}`);
  process.exit(1);
}

// ── Resolved since 27 October (written by hand; each checked) ────────────────
const RESOLVED = [
  ["Ankita Jaisinghani | Motilal 1201090012838316", "HDFC Balanced Advantage Regular (37,755.485 units)", "Sold on 23 September 2026; the adviser's transaction report supplies the purchase cost and sale.",
    () => F.rolls.some((r) => r.accountId === MO_ANKITA && near(r.statementQuantity, 37755.485) && r.quantity === 0)],
  ["Ajay Jaisinghani | ICICI NSDL 49794950", "Yash Highvoltage", "The ICICI order book with the 31 October statement records the 34,000 shares sold from 24 June to 9 July 2026, with the amounts received.",
    () => tradesOf(ICICI, "yash-highvoltage").filter((t) => t.side === "sell").reduce((n, t) => n + t.quantity, 0) === 34000],
  ["Ajay Jaisinghani | ICICI NSDL 49794950", "EMA Partners", "The ICICI order book records the sale of 44,000 shares on 26 October 2026; 643 shares remain.",
    () => tradesOf(ICICI, "ema-partners-india").filter((t) => t.side === "sell").reduce((n, t) => n + t.quantity, 0) === 44000],
  ["Ajay and Bharat Jaisinghani | SVAN 8710067 and 8710090", "Purchase dates for all 82 stocks", "SVAN's trade records to 4 November 2026 date every stock held.",
    () => !pmsGroups.has("svan-investment-managers-llp-8710067") && !pmsGroups.has("svan-investment-managers-llp-8710090")],
  ["Ajay Jaisinghani | Molecule Ventures 7810404", "Purchase dates for all 8 stocks", "Molecule's 2 November 2026 statements date every stock held.",
    () => !pmsGroups.has("molecule-ventures-llp-7810404")],
  ["Bharat Jaisinghani | LKP 98245", "Purchase dates for the 31 March balances (Belrise, Capri Global, Electronics Mart, Jyothy Labs, Varun Beverages, Pricol)", "LKP's capital gain statement to 31 July 2026 dates every unit held on 31 March: the lots still open and the lots sold after it, at the statement's own cost.",
    () => [["belrise-industries", 12500], ["capri-global-capital", 7000], ["electronics-mart-india", 10000], ["jyothy-labs", 4000], ["varun-beverages", 2700], ["pricol", 650]]
      .every(([k, q]) => { const p = pos(LKP, k); return !!p && near(p.quantity, q) && p.dated && p.dateSources.includes("lots"); })],
  ["Ajay Jaisinghani | ICICI NSDL 49794950", "Sotefin Bharat", "The family's investment register prints both purchases (12 July 2024 and 3 November 2025), and the 10:1 bonus makes them every one of the 1,71,879 shares; its cost is now carried.",
    () => { const p = pos(ICICI, "sotefin-bharat"); return !!p && near(p.quantity, 171879) && p.costBasis != null && p.dated; }],
  ["Ajay Jaisinghani | Bandhan folio 8652064", "Bandhan Large & Mid Cap and Arbitrage purchase dates", "Bandhan's own statement of 14 October 2026 dates every purchase and switch in from a nil opening on 2 April 2026.",
    () => ["bndh-l-and-mcf-dp-gr", "bandhan-amc-ltd-bandhan-mf-bandhan-arbitrage-fund-direct-pl-growth"]
      .every((k) => { const p = pos("bandhan-mutual-fund-8652064", k); return !!p && p.dated && p.dateSources.includes("allotments"); })],
  ["Ajay Jaisinghani | HDFC Securities 3110320", "Man Industries, Deepak Fertilisers and Kingfa purchase dates", "The 30 June review's transaction history dates every unit held, carried through the account's own later sales (Man Industries 10 January and 25 July 2025; Deepak Fertilisers 30 July 2024; Kingfa 22 November 2024).",
    () => ["man-industries-india", "deepak-fertilisers-and-petrochemicals", "kingfa-science-and-technology-india"]
      .every((k) => { const p = pos(HDFC_SEC, k); return !!p && p.dated && p.dateSources.includes("review-lots"); })],
  ["Ajay and Ankita Jaisinghani | Green Lantern 510861 and 510854", "Purchase dates for Ingersoll Rand, Ratnamani, Anup Engineering and Vedanta Aluminium", "Green Lantern's own from-inception trade records date every stock held; Vedanta Aluminium through the parent's purchases and the 30 April 2026 demerger.",
    () => !pmsGroups.has("green-lantern-capital-llp-510861") && !pmsGroups.has("green-lantern-capital-llp-510854")],
  ["Ajay Jaisinghani | MOPWM", "SOTEFIN (private investment valuation)", "Now listed and priced on the ICICI statement, so it is no longer valued at cost; its cost and dates are carried there (above).",
    () => !privateRows.some((r) => /sotefin/i.test(r.name))],
];
const resolvedFailed = RESOLVED.filter(([, , , c]) => !c());
if (resolvedFailed.length) { console.error("These 'resolved' notes are not borne out by the book:", resolvedFailed.map((r) => r[1])); process.exit(1); }

// ── Render ───────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rs = (n) => `Rs ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const checkedLong = DATE(CHECKED);

const s1 = ITEMS.map((it, i) => {
  const units = it.unitsText ? `<br>Recorded shares / units: ${esc(it.unitsText)}` : it.units != null ? `<br>Recorded shares / units: ${fmt(it.units)}${it.unitsNote ? ` (${esc(it.unitsNote)})` : ""}` : "";
  return `<tr><td>${esc(it.holder)}<br>${esc(it.account)}</td><td>${i + 1}. ${esc(it.what)}${units}</td><td>${esc(it.send)}</td><td>${esc(it.from)}</td></tr>`;
}).join("\n");

const s2 = pms.map(({ a, rows }) => `
<table class="grp"><thead>
<tr class="band"><th colspan="2">${esc(a.owner)} | ${esc(a.provider)}<br>Account ${esc(a.accountNo)} | Holding statement: ${DATE(a.asOf)} | ${rows.length} ${rows.length === 1 ? "stock needs" : "stocks need"} purchase dates</th></tr>
<tr class="cols"><th>Stock needing original purchase history</th><th class="num">Recorded shares</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${esc(r.name)}${r.earlier ? `<br>Dates missing for ${fmt(r.earlier)} earlier shares.` : ""}</td><td class="num">${fmt(r.units)}</td></tr>`).join("\n")}
</tbody></table>`).join("\n");

const s3 = privateRows.map((r, i) => {
  const ask = ["Value and its date; later payments / payouts."];
  if (r.units == null) ask.push("Shares / units, if applicable.");
  if (r.owner === OWNER_LAST) ask.push("Confirm the legal holder's name.");
  return `<tr><td>${esc(r.owner)}<br>${esc(r.account)}</td><td>${i + 1}. ${esc(r.name)}${r.units != null ? `<br>Recorded shares / units: ${fmt(r.units)}` : ""}</td><td>${rs(r.cost)}</td><td>${ask.join(" ")}</td></tr>`;
}).join("\n");

const sOpen = OPENINGS.map((it, i) => `<tr><td>${esc(it.holder)}<br>${esc(it.account)}</td><td>${i + 1}. ${esc(it.what)}<br>${esc(it.onFile)}</td><td>${esc(it.send)}</td><td>${esc(it.from)}</td></tr>`).join("\n");
const s4 = RESOLVED.map(([who, what, why]) => `<tr><td>${esc(who).replace(" | ", "<br>")}</td><td>${esc(what)}</td><td>${esc(why)}</td></tr>`).join("\n");
const pmsStocks = pms.reduce((n, g) => n + g.rows.length, 0);

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Glow Ventures — All client records needed</title><style>
@page { size: A4 landscape; margin: 16mm 12mm 16mm 12mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 9.5pt; margin: 0; }
h1 { font-size: 19pt; margin: 4mm 0 2mm; color: #1e293b; }
h2 { font-size: 16pt; margin: 6mm 0 2mm; color: #1e293b; break-after: avoid; }
p.lead { color: #475569; font-size: 9pt; margin: 0 0 4mm; line-height: 1.35; }
table { width: 100%; border-collapse: collapse; margin: 0 0 5mm; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: #26364a; color: #fff; text-align: left; font-weight: bold; padding: 2.6mm 3mm; font-size: 9pt; }
td { padding: 2.6mm 3mm; vertical-align: top; border-bottom: 0.3mm solid #dbe2ea; line-height: 1.35; }
tbody tr:nth-child(even) td { background: #f1f5f9; }
.s1 col.c1 { width: 19%; } .s1 col.c2 { width: 21%; } .s1 col.c3 { width: 47%; } .s1 col.c4 { width: 13%; }
.s3 col.c1 { width: 17%; } .s3 col.c2 { width: 37%; } .s3 col.c3 { width: 13%; } .s3 col.c4 { width: 33%; }
.s4 col.c1 { width: 25%; } .s4 col.c2 { width: 25%; } .s4 col.c3 { width: 50%; }
table.grp col.c1 { width: 75%; }
tr.band th { background: #e2e8f0; color: #1e293b; padding: 3mm; }
td.num, th.num { width: 25%; }
.newpage { break-before: page; }
</style></head><body>
<h1>All records still needed from the client</h1>
<p class="lead">Checked ${checkedLong} against the dashboard's records (latest statement dated ${DATE(F.bookAsOf)}). This list replaces the earlier lists (checked 27 October and 11 November 2026): records received since then are no longer requested and are listed in section 5, and the newer statements raised the new items below. Section 4 is new: the valuations at the start of the year that this year&#8217;s returns need. Includes all client requests: purchase and balance records, PMS stock history, and private investment valuations. One complete broker or fund export can answer several rows.</p>
<h2>1. Purchase, date, balance and other records</h2>
<table class="s1"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>
<thead><tr><th>Holder and account</th><th>Stock, fund or file</th><th>Exactly what to send</th><th>Ask for it from</th></tr></thead><tbody>
${s1}
</tbody></table>
<h2 class="newpage">2. PMS: stock purchase dates still needed</h2>
<p class="lead">For every stock listed below, ask the named PMS manager for the full original purchase and transfer history through the holding statement date. Include dates, shares, amounts paid, earlier shares brought into the account, sales, transfers, bonus shares and splits. Purchase costs are already recorded; the missing information is the original purchase dates. ${pmsStocks} stocks across ${pms.length} accounts.</p>
${s2.replace(/<table class="grp">/g, '<table class="grp"><colgroup><col class="c1"><col></colgroup>')}
<h2 class="newpage">3. Private investments: valuations still needed</h2>
<p class="lead">The list below covers ${distinctInvestments} investments held across ${privateRows.length} holder/account records. Purchase amounts and investment dates are already available. For each row, send the latest company or fund statement showing the investment value and its date, plus any later payments or payouts. Where units are missing, provide the shares or units if applicable; otherwise explain what the balance represents. This is needed to work out the return.</p>
<table class="s3"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>
<thead><tr><th>Holder and account</th><th>Investment</th><th>Amount already recorded</th><th>Exactly what to send</th></tr></thead><tbody>
${s3}
</tbody></table>
<h2 class="newpage">4. Valuations at the start of the year</h2>
<p class="lead">The financial-year return is measured from 31 March 2026 and the calendar-year return from 31 December 2025. Each needs every account's value on that date and the money paid in or out after it. For the accounts below, the earliest valuation on file is later, so their return for the year can only start from that later date. In particular, the January to March 2026 market fall is not captured for most of the book. A statement dated within a few days of 31 December 2025 or 31 March 2026 is enough.</p>
<table class="s1"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>
<thead><tr><th>Holder and account</th><th>Investment</th><th>Exactly what to send</th><th>Ask for it from</th></tr></thead><tbody>
${sOpen}
</tbody></table>
<h2>5. Received since 27 October: no longer needed</h2>
<table class="s4"><colgroup><col class="c1"><col class="c2"><col class="c3"></colgroup>
<thead><tr><th>Holder and account</th><th>Item on an earlier list</th><th>What answered it</th></tr></thead><tbody>
${s4}
</tbody></table>
</body></html>`;

const CANDIDATES = [process.env.CHROME, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) { console.error("No Chrome/Edge found; set CHROME."); process.exit(1); }
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
const band = (side, inner) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:7pt;color:#64748b;width:100%;margin:0 12mm;${side}">${inner}</div>`;
await page.pdf({
  path: OUT, format: "A4", landscape: true, printBackground: true, displayHeaderFooter: true,
  margin: { top: "16mm", bottom: "16mm", left: "12mm", right: "12mm" },
  headerTemplate: band("border-bottom:0.3mm solid #dbe2ea;padding-bottom:2mm;", `Glow Ventures | All client records needed | Checked ${checkedLong}`),
  footerTemplate: band("border-top:0.3mm solid #dbe2ea;padding-top:2mm;display:flex;justify-content:space-between;",
    `<span>Quantities refer to the named saved records; later transactions may change them.</span><span>Page <span class="pageNumber"></span></span>`),
});
await browser.close();
if (process.env.HTML_OUT) writeFileSync(process.env.HTML_OUT, html);
console.log(`${OUT.replace(ROOT + "\\", "").replace(ROOT + "/", "")}: ${ITEMS.length} named records, ${pmsStocks} PMS stocks in ${pms.length} accounts, ${privateRows.length} private records (${distinctInvestments} investments), ${OPENINGS.length} start-of-year valuations, ${RESOLVED.length} resolved.`);
