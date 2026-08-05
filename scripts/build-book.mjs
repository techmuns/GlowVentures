#!/usr/bin/env node
// Build src/data/glowData.ts from the audit archive.
//
//   npm run build-book        (after `npm run inventory && npm run extract`)
//
// The book is GENERATED, never hand-edited. It regenerates byte-identically from
// source/ alone: every figure here traces to one document in public/audit/, and
// there is no state in this script that the statements did not supply — no
// timestamps, no ordering by hash-map insertion, no defaults standing in for a
// figure a report did not print.
//
// WHAT THIS SCRIPT WILL NOT DO. It will not fill a gap. Where the corpus does
// not support a figure the field is null or the array is empty, and the reason
// is printed at the end of the run and written into the build report. An
// unrealised short/long-term split, for instance, needs per-lot purchase dates;
// the capital REGISTER in this drop is a capital-account ledger, not a lot
// register, so that split stays null and the UI renders "—". Estimating it from
// the average holding period would produce a number nobody could check.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OWNERS, ownerById } from "../shared/owners.mjs";
import { resolveSector, UNCLASSIFIED } from "../shared/sectors.mjs";
import { sourceFor } from "./ingest/precedence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_DIR = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public", "audit");
const OUT = process.env.GLOW_BOOK_OUT ?? path.join(ROOT, "src", "data", "glowData.ts");
const REPORT = path.join(ROOT, "docs", "BOOK-REPORT.md");

const r2 = (n) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// ── Load ─────────────────────────────────────────────────────────────────────

function loadArchive() {
  if (!fs.existsSync(AUDIT_DIR)) return [];
  return fs.readdirSync(AUDIT_DIR).sort()
    .map((dir) => path.join(AUDIT_DIR, dir, "document.json"))
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, "utf8")))
    .filter((d) => d.status !== "failed");
}

/** account key — provider + account number is the identity, as in the archive. */
const acctKey = (d) => (d.accountNo ? `${d.provider}::${d.accountNo}` : null);
const accountIdOf = (provider, accountNo) =>
  `${provider.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${accountNo}`;

/**
 * The document precedence names as authoritative for a fact, among those for
 * one account. Falls back to nothing rather than to "whichever we saw last" —
 * that fallback is what precedence.mjs exists to prevent.
 */
function authoritative(docs, provider, fact) {
  const rule = sourceFor(provider, fact);
  if (!rule) return null;
  for (const rt of rule.reportTypes) {
    const hit = docs.find((d) => d.reportType === rt);
    if (hit) return hit;
  }
  return null;
}

/**
 * One account, one report type, SEVERAL DATES — keep the newest.
 *
 * The book is a position SNAPSHOT, and this drop is the first to carry the same
 * report for one account at two as-of dates: 360 ONE bundles CRN37702 and
 * CRN60117 at both 31 May 2026 and 30 Jun 2026. Precedence answers "which REPORT
 * is authoritative"; it says nothing about which ISSUE of that report, so both
 * matched and `find` returned whichever sorted first — the MAY one, quietly
 * showing a month-old market value while a newer statement sat in the archive.
 *
 * Superseded documents stay in the archive (they are provenance, and the Data
 * Audit browser lists them); they simply do not feed the book, and each one is
 * named in the build report so the choice is visible rather than implied.
 */
function newestPerReportType(group, notes, label) {
  const best = new Map();
  for (const d of group) {
    const cur = best.get(d.reportType);
    // Ties break on docKey so the book stays byte-identical across runs.
    const newer = !cur
      || (d.asOf ?? "") > (cur.asOf ?? "")
      || ((d.asOf ?? "") === (cur.asOf ?? "") && d.docKey < cur.docKey);
    if (newer) best.set(d.reportType, d);
  }
  const kept = new Set([...best.values()].map((d) => d.docKey));
  for (const d of group) {
    if (kept.has(d.docKey)) continue;
    notes.push(`${label}: ${d.reportType} ${d.asOf ?? "(no date)"} superseded by ${best.get(d.reportType).asOf} — \`${d.docKey}\` not used`);
  }
  return group.filter((d) => kept.has(d.docKey));
}

// ── Build ────────────────────────────────────────────────────────────────────

function build(docs) {
  const notes = [];
  const byAccount = new Map();
  for (const d of docs) {
    const k = acctKey(d);
    if (!k) continue;
    (byAccount.get(k) ?? byAccount.set(k, []).get(k)).push(d);
  }

  const symbols = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/nseSymbols.json"), "utf8")); }
    catch { return {}; }
  })();

  // ── ISIN, joined across the drop's own documents ─────────────────────────
  //
  // Only some reports print an ISIN, and in this drop only one does — glued to
  // the security name, which the extractor now splits apart. The appraisal that
  // supplies the holdings prints none, so a position's ISIN comes from another
  // report ABOUT THE SAME SECURITY in the same drop. That is the same kind of
  // join the account number and owner already use: this book's own paperwork,
  // applied only where it is unambiguous.
  //
  // A securityKey that two documents give DIFFERENT ISINs for is left with none
  // and reported — two identifiers for one key means the key is wrong, and
  // guessing which is right would bake that error in.
  const isinByKey = new Map();
  const isinConflicts = new Map();
  for (const d of docs) {
    for (const arr of [d.holdings, d.transactions, d.capitalGains, d.income]) {
      for (const x of arr ?? []) {
        if (!x?.isin || !x.securityKey) continue;
        const seen = isinByKey.get(x.securityKey);
        if (seen && seen !== x.isin) {
          isinConflicts.set(x.securityKey, [...new Set([...(isinConflicts.get(x.securityKey) ?? [seen]), x.isin])]);
          continue;
        }
        isinByKey.set(x.securityKey, x.isin);
      }
    }
  }
  for (const k of isinConflicts.keys()) isinByKey.delete(k);

  // Asset class per security, from the reports that DO print one. Same kind of
  // join as the ISIN above: this drop's own paperwork, never inferred from text.
  const classByKey = new Map();
  for (const d of docs) {
    for (const arr of [d.holdings, d.transactions]) {
      for (const x of arr ?? []) {
        if (x?.securityKey && x.assetClass && !classByKey.has(x.securityKey)) classByKey.set(x.securityKey, x.assetClass);
      }
    }
  }

  const accounts = [];
  const positions = [];
  const capitalGains = [];
  const accountCashFlows = {};
  const accountReturns = {};
  const corporateActionsAll = [];
  const realisedByClass = new Map();
  const accountBridges = {};
  const unclassified = new Map();
  /** Accounts read in full and deliberately left OUT — see excludedFromBook. */
  const excludedAccounts = [];

  for (const [key, allIssues] of [...byAccount.entries()].sort()) {
    const group = newestPerReportType(allIssues, notes, `account ${key}`);
    const sample = group.find((d) => d.reportType === "appraisal") ?? group[0];
    const provider = sample.provider;
    const accountNo = sample.accountNo;
    const accountId = accountIdOf(provider, accountNo);

    // ── the account ──
    // as-of is the APPRAISAL's date: the holdings are what the account view
    // shows, and a later transaction statement does not restate them.
    const holdingsDoc = authoritative(group, provider, "holdings");
    const asOf = holdingsDoc?.asOf ?? sample.asOf ?? null;
    const inception = group.map((d) => d.inceptionDate).find(Boolean) ?? null;
    const ownerId = group.map((d) => d.ownerId).find(Boolean) ?? null;

    /**
     * AN ACCOUNT ITS OWN STATEMENT SAYS IS SOMEBODY ELSE'S.
     *
     * The mutual-fund folio reader reads the holder's TAX STATUS off the page.
     * Three of those folios are held by `HOPE INDIA TRUST` — a separate taxpayer
     * — and the scheme disclosure has no holder at all. Reading them was right;
     * ADDING them to a family total would put ₹2.50 Cr of somebody else's money
     * into this family's net worth.
     *
     * `excludedFromBook` carries the reason, and it is honoured HERE rather than
     * by a filter somewhere further downstream, so the exclusion happens once and
     * the reason travels with it into the build report. Three properties matter:
     *
     *   • the account is NOT in `accounts`, so no page can sum it by accident;
     *   • the reason is printed, so a reader can see the money exists and why it
     *     is not counted — the opposite of a figure quietly going missing;
     *   • it is REVERSIBLE by one entry in shared/owners.mjs, because whether the
     *     family consolidates its trust is the family's decision, not a parser's.
     */
    const excluded = group.map((d) => d.excludedFromBook).find(Boolean) ?? null;
    if (excluded) {
      const value = group.map((d) => d.totals?.totalMarketValue).find(isNum) ?? null;
      excludedAccounts.push({ accountId, provider, accountNo, owner: group.map((d) => d.owner).find(Boolean) ?? null, value, reason: excluded });
      notes.push(`account ${accountNo} (${provider}) is NOT in the book: ${excluded}`
        + (value !== null ? ` Value on its own statement: ${value.toLocaleString("en-IN")}.` : ""));
      continue;
    }
    if (!ownerId) notes.push(`account ${accountNo} (${provider}) resolved to no canonical owner`);

    accounts.push({
      accountId,
      provider,
      accountNo,
      ownerId,
      owner: ownerById(ownerId)?.displayName ?? null,
      strategy: group.map((d) => d.strategy).find(Boolean) ?? null,
      engagement: group.map((d) => d.engagement).find((e) => e && e !== "unknown") ?? "unknown",
      providerEngagement: group.map((d) => d.providerEngagement).find(Boolean) ?? null,
      members: sample.members ?? [],
      asOf,
      inceptionDate: inception,
      custodian: provider,
    });

    // ── positions ──
    // Primitives come from the appraisal; the sector from the fact sheet and the
    // accrued income / IRR from CURRENT PORTFOLIO, each per precedence.
    const sectorDoc = authoritative(group, provider, "providerSector");
    const incomeDoc = authoritative(group, provider, "accruedIncome");
    const sectorByKey = new Map((sectorDoc?.holdings ?? []).map((h) => [h.securityKey, h.providerSector]));
    const incomeByKey = new Map((incomeDoc?.holdings ?? []).map((h) => [h.securityKey, h]));

    /**
     * COST BASIS FROM THE BROKER'S OPENING POSITIONS — checked on quantity.
     *
     * A depository holding statement prints ISIN, quantity, rate and value and
     * NO COST: the depository holds shares, it did not buy them. So the one
     * account in this book with ISINs was also the one with no cost basis, no
     * unrealised P&L and no return — ten positions rendering `—` for figures the
     * same broker prints two files away.
     *
     * The broker's Global Details ledger opens each security with the position
     * carried forward and its total cost. That is the cost of the SAME shares,
     * as long as it is the same shares — so the join requires the quantities to
     * MATCH EXACTLY. Belrise carries 12,500 into the year and the depository
     * statement shows 12,500 on 31/03; it sold 6,000 on 25/06, and if the
     * valuation had been dated after that the quantities would disagree and this
     * would supply nothing rather than pricing 12,500 shares at the cost of
     * 6,500.
     *
     * Every position that takes a cost this way records `costBasisSource:
     * "opening-position"`, so a reader can see that the figure came from another
     * document and which check let it.
     */
    const openingCost = new Map();
    /** Dated acquisition lots for this account, by security. See openLots below. */
    const lotsByKey = new Map();
    for (const d of group) {
      for (const p of d.positionsAsOf?.positions ?? []) {
        if (p.securityKey && p.opening) openingCost.set(p.securityKey, p.opening);
      }
      for (const l of d.openLots ?? []) {
        if (!l.securityKey) continue;
        lotsByKey.set(l.securityKey, [...(lotsByKey.get(l.securityKey) ?? []), l]);
      }
    }
    const costFor = (key, quantity) => {
      const o = openingCost.get(key);
      if (!o || !isNum(o.quantity) || !isNum(quantity) || !isNum(o.totalCost)) return null;
      if (Math.abs(o.quantity - quantity) > 1e-6) return null;   // not the same shares
      return r2(o.totalCost);
    };

    // ── income, by EVENT TYPE rather than by report ──
    //
    // The two statements overlap but neither contains the other. The DIVIDEND
    // STATEMENT is authoritative for cash dividends — it alone carries the ex
    // and received dates, the per-unit rate and the TDS. CORPORATE BENEFITS is
    // authoritative for NON-CASH actions — a bonus issue, a split, a rights
    // entitlement — which the dividend statement has no row shape for.
    //
    // Preferring one report wholesale, as this did, silently dropped every bonus
    // and split in the book. So each event goes to the reader that owns its
    // KIND, and a cash event listed by both is deduped on (date, security,
    // amount) with the dividend statement winning.
    const CASH_KIND = /^dividend$/i;
    const cashSeen = new Set();
    const dividendByKey = new Map();
    const corporateActions = [];
    const ordered = [
      ...group.filter((d) => d.reportType === "dividend-statement"),
      ...group.filter((d) => d.reportType !== "dividend-statement"),
    ];
    for (const d of ordered) {
      for (const ev of d.income ?? []) {
        if (!ev.securityKey) continue;
        const isCash = CASH_KIND.test(ev.kind ?? "");
        if (isCash) {
          if (!isNum(ev.netAmount)) continue;
          const k = `${ev.exDate ?? ""}|${ev.securityKey}|${ev.netAmount}`;
          if (cashSeen.has(k)) continue;         // same event, both reports
          cashSeen.add(k);
          dividendByKey.set(ev.securityKey, r2((dividendByKey.get(ev.securityKey) ?? 0) + ev.netAmount));
        } else {
          // Non-cash: a bonus prints Amount 0.00, and that zero is REAL — the
          // entitlement is the substance. Carried as an action, never summed
          // into dividend income.
          corporateActions.push({
            security: ev.security,
            securityKey: ev.securityKey,
            accountId,
            kind: ev.kind,
            exDate: ev.exDate,
            quantity: ev.quantity,
            entitlement: ev.entitlement,
            amount: ev.netAmount,
            source: ev.source,
          });
        }
      }
    }

    for (const h of holdingsDoc?.holdings ?? []) {
      const providerSector = sectorByKey.get(h.securityKey) ?? h.providerSector ?? null;
      const { sector, matchedBy } = resolveSector(providerSector);
      if (providerSector && matchedBy === null) {
        unclassified.set(providerSector, (unclassified.get(providerSector) ?? 0) + 1);
      }
      const cp = incomeByKey.get(h.securityKey);
      // Where the holdings statement prints no cost, the broker's opening
      // position supplies it — but only when the quantities agree exactly.
      const joinedCost = isNum(h.totalCost) ? null : costFor(h.securityKey, h.quantity);
      const costBasis = isNum(h.totalCost) ? h.totalCost : joinedCost;
      const marketValue = h.marketValue;
      /**
       * THE SHORT/LONG-TERM SPLIT, WHERE — AND ONLY WHERE — LOT DATES EXIST.
       *
       * India's threshold for listed equity is 12 months. A lot bought more than
       * 12 months before the valuation date is long-term; anything else is short.
       * This is a statutory rule applied to a dated fact, not an estimate.
       *
       * It is computed for exactly one account, because exactly one broker in
       * this drop publishes a lot register. Every other position keeps `null` on
       * all three fields and renders `—`, which is the truth: nobody knows, and
       * a split assumed from an average holding period would be a tax figure
       * somebody might act on.
       */
      const lots = lotsByKey.get(h.securityKey) ?? [];
      const dated = lots.filter((l) => l.purchaseDate && isNum(l.totalCost));
      let stCostBasis = null;
      let ltCostBasis = null;
      let daysToLT = null;
      if (dated.length && asOf) {
        const asOfMs = Date.parse(asOf);
        const LT_DAYS = 365;
        stCostBasis = 0;
        ltCostBasis = 0;
        let soonest = null;
        for (const l of dated) {
          const held = Math.round((asOfMs - Date.parse(l.purchaseDate)) / 86400000);
          if (held >= LT_DAYS) ltCostBasis = r2(ltCostBasis + l.totalCost);
          else {
            stCostBasis = r2(stCostBasis + l.totalCost);
            const toGo = LT_DAYS - held;
            if (soonest === null || toGo < soonest) soonest = toGo;
          }
        }
        daysToLT = soonest;
      }
      positions.push({
        securityKey: h.securityKey,
        security: h.security,
        symbol: symbols[h.securityKey] ?? null,
        // Enrichment, never identity — undefined where no statement gives one.
        isin: h.isin ?? isinByKey.get(h.securityKey) ?? undefined,
        accountId,
        memberId: h.memberId ?? null,
        sector: h.assetClass === "Cash" ? "Cash" : sector,
        providerSector,
        assetClass: h.assetClass,
        quantity: h.quantity,
        avgCost: h.unitCost,
        currentPrice: h.marketPrice,
        costBasis,
        /** "opening-position" where the cost came from the broker's ledger, not this statement. */
        costBasisSource: joinedCost !== null ? "opening-position" : undefined,
        marketValue,
        // Derived from whatever cost we ended up with, so a joined cost yields a
        // gain on the same basis. Both stay null when there is no cost at all —
        // a market value with no basis under it is not a profit of its own size.
        unrealizedPnL: isNum(marketValue) && isNum(costBasis) ? r2(marketValue - costBasis) : h.gainLoss,
        returnPct: isNum(marketValue) && isNum(costBasis) && costBasis
          ? r2(((marketValue - costBasis) / costBasis) * 100)
          : h.pctGainLoss,
        stCostBasis,
        ltCostBasis,
        daysToLT,
        accruedIncome: h.accruedIncome ?? cp?.accruedIncome ?? null,
        dividendReceived: dividendByKey.get(h.securityKey) ?? null,
        positionIrrPct: cp?.positionIrrPct ?? null,
        dedupeGroup: h.dedupeGroup ?? undefined,
        alsoReportedUnder: h.alsoReportedUnder?.length ? h.alsoReportedUnder : undefined,
      });
    }

    // ── time-weighted returns, per account ──
    //
    // Each manager publishes its OWN period vocabulary and its OWN benchmark:
    // Goldstandard prints MTD / QTD / YTD against N50TRI, Green Lantern and
    // Carnelian print trailing 1m / 3m / 1y against S&P BSE 500 Total Return.
    // Those are different measurements over different windows against different
    // indices, so every series is carried with its own vocabulary intact and the
    // page renders the columns each account actually has. Folding them together
    // would put a trailing one-month return under a month-to-date heading.
    const returnDocs = group
      .filter((d) => (d.returns ?? []).length)
      // fact sheet first: it is the one the provider publishes to the client.
      .sort((a, b) => (a.reportType === "fact-sheet" ? -1 : 0) - (b.reportType === "fact-sheet" ? -1 : 0));
    const seriesByReport = returnDocs.map((d) => ({
      reportType: d.reportType,
      source: d.docKey,
      series: d.returns.map((r) => ({
        series: r.series,
        isBenchmark: r.isBenchmark,
        mtd: r.mtd, qtd: r.qtd, fytd: r.fytd,
        m1: r.m1, m3: r.m3, m6: r.m6, y1: r.y1,
        si: r.si, siAnnualised: r.siAnnualised, feeBasis: r.feeBasis,
      })),
    }));
    if (seriesByReport.length) accountReturns[accountId] = seriesByReport;
    else notes.push(`account ${accountNo}: no time-weighted return series in any statement`);

    // ── the value bridge ──
    //
    // opening → contributions → withdrawals → realised → unrealised → income →
    // fees → closing, over ONE window. Two windows are available per account and
    // they are not interchangeable: the performance summary runs the financial
    // year to date, the fact sheet and performance appraisal run since
    // inception. Both are carried, each labelled with its own window; nothing is
    // added across them.
    const bridges = [];
    for (const d of group) {
      const f = d.flows;
      if (!f || !f.periodFrom || !f.periodTo) continue;
      const has = ["openingCorpus", "contribution", "withdrawal", "netCapitalInOut",
        "realized", "unrealized", "income", "fees", "expenses", "corpus"]
        .filter((k) => isNum(f[k]));
      if (!has.length) continue;
      bridges.push({
        reportType: d.reportType,
        source: d.docKey,
        periodFrom: f.periodFrom,
        periodTo: f.periodTo,
        basis: f.periodFrom === inception ? "since-inception" : "financial-year-to-date",
        opening: f.openingCorpus,
        contribution: f.contribution,
        withdrawal: f.withdrawal,
        netCapitalInOut: f.netCapitalInOut,
        realized: f.realized,
        unrealized: f.unrealized,
        income: f.income,
        fees: f.fees,
        expenses: f.expenses,
        closing: f.corpus,
        profit: f.profit,
      });
    }
    if (bridges.length) {
      // Widest window first, so the since-inception view leads.
      bridges.sort((a, b) => a.periodFrom.localeCompare(b.periodFrom));
      accountBridges[accountId] = bridges;
    } else {
      notes.push(`account ${accountNo}: no flow block in any statement, so no value bridge`);
    }

    corporateActionsAll.push(...corporateActions);

    // ── realised capital gains ──
    const cgDoc = group.find((d) => (d.capitalGains ?? []).length);
    if (cgDoc) {
      const lots = cgDoc.capitalGains;
      capitalGains.push({
        // A HUMAN label, not the internal accountId — this string is rendered.
        // One row per ACCOUNT, not per owner: the realised windows differ by
        // provider (Green Lantern to 25 Jun, Carnelian to 10 Jul), and summing
        // across them would add two different measurement periods together.
        entity: `${ownerById(ownerId)?.displayName ?? accountNo} · ${provider.split(" ")[0]} ${accountNo}`,
        accountId,
        ownerId,
        realisedST: r2(sum(lots.map((l) => (isNum(l.shortTerm) ? l.shortTerm : 0)))),
        realisedLT: r2(sum(lots.map((l) => (isNum(l.longTerm) ? l.longTerm : 0)))),
        // No lot dates in this corpus → no unrealised split. Null renders "—".
        unrealisedST: null,
        unrealisedLT: null,
        periodFrom: cgDoc.periodFrom ?? null,
        periodTo: cgDoc.periodTo ?? null,
        lots: lots.length,
        source: cgDoc.docKey,
      });
      // ── the same total, split by ASSET CLASS ──
      //
      // The canonical realised figure nets two unlike books: an equity mandate
      // that lost money and a liquid-fund cash sweep that made some. Netted,
      // the sweep flatters the equity result with nothing on screen to say so.
      // The class is JOINED from the same security's rows on an appraisal or
      // transaction statement — the capital gain statement prints none — and a
      // security neither carries is left `null` and NAMED. "Mutual Fund" in a
      // printed name is not a classification any statement made.
      for (const l of lots) {
        const cls = classByKey.get(l.securityKey) ?? null;
        const k = `${accountId}|${cls ?? ""}`;
        const e = realisedByClass.get(k) ?? {
          accountId, entity: `${ownerById(ownerId)?.displayName ?? accountNo} · ${provider.split(" ")[0]} ${accountNo}`,
          assetClass: cls, lots: 0, realisedST: 0, realisedLT: 0, securities: new Set(),
        };
        e.lots += 1;
        e.realisedST += isNum(l.shortTerm) ? l.shortTerm : 0;
        e.realisedLT += isNum(l.longTerm) ? l.longTerm : 0;
        e.securities.add(l.security);
        realisedByClass.set(k, e);
      }
    }
    // An account with NO capital gain statement is recorded as such, with an
    // empty realised block. Omitting it entirely would let the page average
    // three accounts and call it the family's realised gain; a zero would say
    // the account realised nothing, which nobody measured.
    else {
      capitalGains.push({
        entity: `${ownerById(ownerId)?.displayName ?? accountNo} · ${provider.split(" ")[0]} ${accountNo}`,
        accountId, ownerId,
        realisedST: null, realisedLT: null, unrealisedST: null, unrealisedLT: null,
        periodFrom: null, periodTo: null, lots: 0, source: null,
        absent: "no capital gain statement issued for this account in this drop",
      });
    }

    // ── dated cash flows, for money-weighted return ──
    //
    // Sign convention (types.ts CashFlow): amount < 0 = capital IN, > 0 = OUT.
    //
    // EXTERNAL capital movements only. A trade moves cash between the bank
    // balance and the holdings inside the same account; it is not a flow into or
    // out of the account, and counting it would make the return meaningless.
    //
    // The CAPITAL REGISTER is the account's capital account and is used where
    // the provider issues one; the bank book's Dep/With column is the fallback
    // for the one provider that does not (Carnelian). The choice is checked, not
    // assumed: the total is compared against the performance summary's own
    // stated Net Capital In/Out over the same window, and a disagreement is
    // reported rather than absorbed.
    const register = group.find((d) => d.reportType === "capital-register" && (d.cashFlows ?? []).length);
    const bank = group.find((d) => d.reportType === "bank-book" && (d.cashFlows ?? []).length);
    const src = register ?? bank;
    const flows = [];
    if (src) {
      for (const c of src.cashFlows ?? []) {
        if (!c.date) continue;
        const move = c.kind === "capital-register" ? c.amount : c.depositWithdrawal;
        if (!isNum(move) || move === 0) continue;
        flows.push({ date: c.date, amount: r2(-move), description: c.description });
      }
    }

    // The window's OPENING portfolio value is itself a flow for this purpose:
    // capital already at work on day one. Without it a return over the window is
    // computed against the few thousand rupees of TDS that moved during it, and
    // comes out absurd. The closing value is appended by the app at compute time.
    const perf = group.find((d) => d.reportType === "performance-summary" && isNum(d.flows?.openingCorpus));
    if (perf && flows.length) {
      flows.push({
        date: perf.flows.periodFrom ?? src?.periodFrom ?? asOf,
        amount: r2(-perf.flows.openingCorpus),
        description: `Opening portfolio value ${perf.flows.periodFrom ?? ""}`.trim(),
      });
    } else if (flows.length) {
      notes.push(`account ${accountNo}: cash flows carry no opening portfolio value — `
        + `no performance summary for the window, so a money-weighted return over it cannot be computed`);
    }

    if (flows.length) {
      flows.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
      accountCashFlows[accountId] = flows;

      // Cross-check against the provider's own statement of the same figure.
      const net = r2(sum(flows
        .filter((f) => !/^opening portfolio value/i.test(f.description))
        .map((f) => -f.amount)));
      const stated = group.find((d) => isNum(d.flows?.netCapitalInOut)
        && d.flows.periodFrom === src?.periodFrom && d.flows.periodTo === src?.periodTo);
      if (stated && Math.abs(net - stated.flows.netCapitalInOut) > 1) {
        notes.push(`account ${accountNo}: cash flows sum to ${net} but the performance `
          + `summary states Net Capital In/Out of ${stated.flows.netCapitalInOut} over the same window`);
      }
    } else {
      notes.push(`account ${accountNo}: no external capital movements found, so no `
        + `money-weighted return series`);
    }
  }

  /**
   * The same flows, keyed by OWNER — what `entityXirrPct` reads.
   *
   * A person's money-weighted return is over everything they own, so their
   * accounts' flows merge. The opening values merge with them: each is that
   * account's capital at work when its window opened, and the terminal value
   * the app appends is the owner's whole current market value.
   */
  const entityCashFlows = {};
  for (const a of accounts) {
    const flows = accountCashFlows[a.accountId];
    if (!flows || !a.ownerId) continue;
    const name = ownerById(a.ownerId)?.displayName;
    if (!name) continue;
    entityCashFlows[name] = [...(entityCashFlows[name] ?? []), ...flows];
  }
  for (const k of Object.keys(entityCashFlows)) {
    entityCashFlows[k].sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
  }

  positions.sort((a, b) => a.accountId.localeCompare(b.accountId) || a.securityKey.localeCompare(b.securityKey));
  accounts.sort((a, b) => a.accountId.localeCompare(b.accountId));
  capitalGains.sort((a, b) => a.accountId.localeCompare(b.accountId));

  const owners = OWNERS
    .filter((o) => accounts.some((a) => a.ownerId === o.ownerId))
    .map((o) => ({ ownerId: o.ownerId, displayName: o.displayName }));

  /**
   * CARRY BOTH, COUNT ONCE.
   *
   * The same position can appear on two family members' statements — this drop's
   * 360 ONE Special Opportunities Fund Series 8 Class A3 is reported identically
   * under CRN37702 and CRN60117. Neither row is suppressed: both are in
   * `positions`, both show on their own account view, and each carries
   * `alsoReportedUnder` naming the other. But the CONSOLIDATED total counts each
   * `dedupeGroup` once, exactly as `dedupedPositions` does in the app and
   * `consolidatedValue` does in the reconciler. Summing both put 1.46 Cr into the
   * book's headline twice.
   */
  const seenGroups = new Set();
  let totalValue = 0;
  let doubleCounted = 0;
  for (const p of positions) {
    const mv = isNum(p.marketValue) ? p.marketValue : 0;
    if (p.dedupeGroup) {
      if (seenGroups.has(p.dedupeGroup)) { doubleCounted += mv; continue; }
      seenGroups.add(p.dedupeGroup);
    }
    totalValue += mv;
  }
  totalValue = r2(totalValue);
  if (doubleCounted) {
    notes.push(`${seenGroups.size} holding(s) reported under more than one member: both rows are carried, `
      + `and ${r2(doubleCounted).toLocaleString("en-IN")} is excluded from the consolidated total so each is counted once`);
  }
  const asOf = accounts.map((a) => a.asOf).filter(Boolean).sort().at(-1) ?? "";

  /**
   * NAV HISTORY — deliberately empty.
   *
   * A NAV series needs dated portfolio values. This corpus carries exactly two
   * per account: the opening market value on the performance summary and the
   * closing one. Two points are not a series, and drawing a line between them
   * would assert a path through the period that nothing measured. Left empty,
   * and the reason is in the build report.
   */
  const navHistory = [];
  notes.push("navHistory is EMPTY: the corpus carries an opening and a closing "
    + "portfolio value per account and nothing between them. Two points are not a "
    + "series; interpolating between them would draw a path nothing measured.");
  // The short/long split is produced wherever a lot register exists and left
  // NULL everywhere else — counted rather than asserted, so this note cannot go
  // stale the way its predecessor did (it claimed the split was impossible on
  // every position while the broker's lot register sat unread in `source/`).
  {
    const withSplit = positions.filter((p) => p.stCostBasis !== null || p.ltCostBasis !== null);
    const accountsWithSplit = [...new Set(withSplit.map((p) => p.accountId))];
    notes.push(withSplit.length
      ? `unrealised short/long-term split is populated on ${withSplit.length} of ${positions.length} position(s), `
        + `across ${accountsWithSplit.length} of ${accounts.length} account(s) (${accountsWithSplit.join(", ")}): `
        + "those are the accounts whose broker publishes a LOT REGISTER with dated acquisitions. "
        + "It is NULL on the rest, because the capital register the managed accounts issue is a "
        + "capital-account ledger (contributions, withdrawals, TDS transfers) and carries no purchase dates."
      : "unrealised short/long-term split is NULL on every position: it needs per-lot purchase dates, "
        + "and no statement in this drop carries a lot register.");
  }

  return {
    accounts, positions, owners, capitalGains, accountCashFlows, entityCashFlows, navHistory,
    excludedAccounts,
    // Sorted deterministically: classified first (biggest book first), the
    // unclassified remainder last. Insertion order would make the emitted file
    // depend on map iteration, and the book must regenerate byte-identically.
    realisedByClass: [...realisedByClass.values()]
      .map((e) => ({
        accountId: e.accountId, entity: e.entity, assetClass: e.assetClass, lots: e.lots,
        realisedST: r2(e.realisedST), realisedLT: r2(e.realisedLT),
        securities: [...e.securities].sort(),
      }))
      .sort((a, b) =>
        (a.assetClass === null) - (b.assetClass === null)
        || (a.assetClass ?? "").localeCompare(b.assetClass ?? "")
        || a.entity.localeCompare(b.entity)),
    accountReturns, accountBridges,
    corporateActions: corporateActionsAll.sort((a, b) =>
      (a.exDate ?? "").localeCompare(b.exDate ?? "") || a.securityKey.localeCompare(b.securityKey)),
    summary: {
      asOf,
      listedValue: totalValue,
      privateValue: 0,
      totalValue,
      positionsCount: positions.length,
      entitiesCount: owners.length,
      startupsCount: 0,
      accountsCount: accounts.length,
    },
    unclassified: [...unclassified.entries()].map(([providerSector, count]) => ({ providerSector, count })),
    notes,
  };
}

// ── Emit ─────────────────────────────────────────────────────────────────────

/** Stable JSON: keys in the order given, two-space indent, no trailing spaces. */
const j = (v) => JSON.stringify(v, null, 2);

function emit(book) {
  const L = [];
  L.push("// GENERATED — do not edit by hand. Rebuild with `npm run build-book`.");
  L.push("//");
  L.push("// Source: the audit archive under public/audit/, itself generated from the");
  L.push("// statements in source/ by `npm run extract`. Every figure below traces to one");
  L.push("// document; nothing here is estimated, interpolated or defaulted.");
  L.push("//");
  L.push("// Fields that are null are NOT ZERO. They are measurements this corpus does not");
  L.push("// carry, and the UI renders them as an em dash. See docs/BOOK-REPORT.md for the");
  L.push("// list and what document would supply each.");
  L.push("import type {");
  L.push("  Account, AccountBridge, AccountReturnBlock, BookSummary, CashFlow, CorporateAction,");
  L.push("  EntityCG, FundInvestment, NavPoint, Position, RealisedByClass, StartupInvestment,");
  L.push('} from "@/lib/types";');
  L.push("");
  L.push(`/** Newest report date across all accounts. Individual accounts can be older. */`);
  L.push(`export const BOOK_AS_OF = ${JSON.stringify(book.summary.asOf)};`);
  L.push("");
  L.push(`export const BOOK_SUMMARY: BookSummary = ${j(book.summary)};`);
  L.push("");
  L.push("/** Account registry — one row per (provider, account no). Positions join on accountId. */");
  L.push(`export const BOOK_ACCOUNTS: Account[] = ${j(book.accounts)};`);
  L.push("");
  L.push("/** Canonical owners with at least one account in the book. */");
  L.push(`export const BOOK_OWNERS = ${j(book.owners)};`);
  L.push("");
  L.push(`export const BOOK_POSITIONS: Position[] = ${j(book.positions)};`);
  L.push("");
  L.push("/**");
  L.push(" * Empty, and deliberately so: the corpus carries an opening and a closing");
  L.push(" * portfolio value per account and nothing between them. Two points are not a");
  L.push(" * series. A monthly valuation statement would populate this.");
  L.push(" */");
  L.push(`export const BOOK_NAV_HISTORY: NavPoint[] = ${j(book.navHistory)};`);
  L.push("");
  L.push("/**");
  L.push(" * Realised short/long-term gains as the MANAGER split them, per account.");
  L.push(" * `unrealisedST` / `unrealisedLT` are null: that split needs per-lot purchase");
  L.push(" * dates, which no statement in this drop carries.");
  L.push(" */");
  L.push(`export const BOOK_CAPITAL_GAINS: EntityCG[] = ${j(book.capitalGains)};`);
  L.push("");
  L.push("/** The canonical realised total, split by asset class — the headline nets these. */");
  L.push(`export const BOOK_REALISED_BY_CLASS: RealisedByClass[] = ${j(book.realisedByClass)};`);
  L.push("");
  L.push("/**");
  L.push(" * Dated external capital flows per account, for money-weighted return.");
  L.push(" * Sign: amount < 0 = capital in, > 0 = capital out, per `CashFlow` in types.ts.");
  L.push(" */");
  L.push(`export const BOOK_ACCOUNT_CASH_FLOWS: Record<string, CashFlow[]> = ${j(book.accountCashFlows)};`);
  L.push("");
  L.push("/**");
  L.push(" * The same flows keyed by OWNER — a person's money-weighted return is over");
  L.push(" * everything they own, so their accounts' flows merge here.");
  L.push(" */");
  L.push(`export const BOOK_ENTITY_CASH_FLOWS: Record<string, CashFlow[]> = ${j(book.entityCashFlows)};`);
  L.push("");
  L.push("/**");
  L.push(" * Time-weighted returns per account, as each manager publishes them.");
  L.push(" *");
  L.push(" * Each carries its OWN period vocabulary and its OWN benchmark, kept apart:");
  L.push(" * Goldstandard prints MTD / QTD / FYTD against N50TRI, Green Lantern and");
  L.push(" * Carnelian trailing 1m / 3m / 1y against S&P BSE 500. `siAnnualised` says");
  L.push(" * whether since-inception is annualised — false under a year, per the");
  L.push(" * reports' own disclosure. `feeBasis` says whether returns are net of fees.");
  L.push(" */");
  L.push(`export const BOOK_ACCOUNT_RETURNS: Record<string, AccountReturnBlock[]> = ${j(book.accountReturns)};`);
  L.push("");
  L.push("/**");
  L.push(" * The value bridge per account: opening → capital → realised → unrealised →");
  L.push(" * income → fees → closing, each block over ONE window and labelled with it.");
  L.push(" * Windows are NOT interchangeable and nothing is added across them.");
  L.push(" */");
  L.push(`export const BOOK_ACCOUNT_BRIDGES: Record<string, AccountBridge[]> = ${j(book.accountBridges)};`);
  L.push("");
  L.push("/**");
  L.push(" * NON-CASH corporate actions — bonuses, splits, rights. Kept apart from");
  L.push(" * dividend income: a bonus prints Amount 0.00 and its substance is the");
  L.push(" * entitlement, not a cash figure to be summed.");
  L.push(" */");
  L.push(`export const BOOK_CORPORATE_ACTIONS: CorporateAction[] = ${j(book.corporateActions)};`);
  L.push("");
  L.push("// No private-markets holdings in this book: all five accounts are listed-equity");
  L.push("// PMS mandates. These stay empty rather than being removed, so a later drop that");
  L.push("// does carry them needs no change to the contract.");
  L.push("export const BOOK_PE_FUNDS: FundInvestment[] = [];");
  L.push("export const BOOK_PREIPO_FUNDS: FundInvestment[] = [];");
  L.push("export const BOOK_UNLISTED_COMPANIES: FundInvestment[] = [];");
  L.push("export const BOOK_DEBT_FUNDS: FundInvestment[] = [];");
  L.push("export const BOOK_CLOSED_FUNDS: FundInvestment[] = [];");
  L.push("export const BOOK_STARTUPS: StartupInvestment[] = [];");
  L.push("");
  return L.join("\n");
}

function report(book) {
  const L = [];
  L.push("# Book report");
  L.push("");
  L.push("What `npm run build-book` put in `src/data/glowData.ts`, and what it could not.");
  L.push("Generated — **do not edit by hand**.");
  L.push("");
  L.push("## Totals");
  L.push("");
  L.push("| | |");
  L.push("| --- | ---: |");
  L.push(`| Consolidated market value | ${book.summary.totalValue.toLocaleString("en-IN")} |`);
  L.push(`| Positions | ${book.summary.positionsCount} |`);
  L.push(`| Accounts | ${book.accounts.length} |`);
  L.push(`| Owners | ${book.owners.length} |`);
  L.push(`| Newest as-of | ${book.summary.asOf} |`);
  L.push("");
  L.push("## Per account");
  L.push("");
  L.push("| Account | Provider | Owner | Strategy | As of | Positions | Market value |");
  L.push("| --- | --- | --- | --- | --- | ---: | ---: |");
  for (const a of book.accounts) {
    const ps = book.positions.filter((p) => p.accountId === a.accountId);
    const mv = sum(ps.map((p) => (isNum(p.marketValue) ? p.marketValue : 0)));
    L.push(`| ${a.accountNo} | ${a.provider} | ${a.owner ?? "—"} | ${a.strategy ?? "—"} | ${a.asOf ?? "—"} | ${ps.length} | ${r2(mv).toLocaleString("en-IN")} |`);
  }
  L.push("");
  L.push("## Per owner");
  L.push("");
  L.push("| Owner | Accounts | Positions | Market value |");
  L.push("| --- | ---: | ---: | ---: |");
  for (const o of book.owners) {
    const accs = book.accounts.filter((a) => a.ownerId === o.ownerId);
    const ps = book.positions.filter((p) => accs.some((a) => a.accountId === p.accountId));
    L.push(`| ${o.displayName} | ${accs.length} | ${ps.length} | ${r2(sum(ps.map((p) => (isNum(p.marketValue) ? p.marketValue : 0)))).toLocaleString("en-IN")} |`);
  }
  L.push("");
  L.push("## Read, and deliberately NOT in the book");
  L.push("");
  if (!book.excludedAccounts?.length) {
    L.push("_None — every account this pipeline could read belongs to a canonical owner._");
  } else {
    L.push("These statements were read COMPLETELY. They are absent from every total above");
    L.push("because they belong to somebody else, and that is a different thing from a");
    L.push("document the pipeline could not open — the coverage table in");
    L.push("`docs/EXTRACTION-REPORT.md` has those. Each one becomes part of the book with a");
    L.push("single entry in `shared/owners.mjs`, if the family says it should be.");
    L.push("");
    L.push("| Account | Provider | Holder | Value on its own statement | Why it is out |");
    L.push("| --- | --- | --- | ---: | --- |");
    for (const a of book.excludedAccounts) {
      L.push(`| ${a.accountNo ?? "—"} | ${a.provider} | ${a.owner ?? "—"} | ${isNum(a.value) ? r2(a.value).toLocaleString("en-IN") : "—"} | ${a.reason.replace(/\s+/g, " ")} |`);
    }
    const known = book.excludedAccounts.filter((a) => isNum(a.value));
    if (known.length) {
      L.push("");
      L.push(`Together they carry **${r2(sum(known.map((a) => a.value))).toLocaleString("en-IN")}** across `
        + `${known.length} account(s). That figure is stated so nobody has to wonder whether `
        + "the money was missed or excluded.");
    }
  }
  L.push("");
  L.push("## Sector allocation");
  L.push("");
  const bySector = new Map();
  for (const p of book.positions) {
    const mv = isNum(p.marketValue) ? p.marketValue : 0;
    bySector.set(p.sector, (bySector.get(p.sector) ?? 0) + mv);
  }
  L.push("| Sector | Market value | Share |");
  L.push("| --- | ---: | ---: |");
  for (const [s, mv] of [...bySector.entries()].sort((a, b) => b[1] - a[1])) {
    L.push(`| ${s} | ${r2(mv).toLocaleString("en-IN")} | ${(mv / book.summary.totalValue * 100).toFixed(2)}% |`);
  }
  L.push("");
  L.push("## Unclassified sectors");
  L.push("");
  if (!book.unclassified.length) L.push("_None — every provider sector mapped to a GICS sector._");
  else {
    L.push("Add these to `shared/sectors.mjs`. Until then they render as Unclassified —");
    L.push("never guessed into the nearest plausible bucket.");
    L.push("");
    for (const u of book.unclassified) L.push(`- **${u.providerSector}** — ${u.count} position(s)`);
  }
  L.push("");
  L.push("## What this corpus does not support");
  L.push("");
  for (const n of book.notes) L.push(`- ${n}`);
  L.push("");
  return L.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

const docs = loadArchive();
if (!docs.length) {
  console.error("No documents in the audit archive. Run `npm run extract` first.");
  process.exit(1);
}
const book = build(docs);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, emit(book));
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, report(book));

console.log(`Book: ${book.positions.length} position(s) across ${book.accounts.length} account(s), ${book.owners.length} owner(s).`);
console.log(`  consolidated market value ${book.summary.totalValue.toLocaleString("en-IN")} as of ${book.summary.asOf}`);
const withGains = book.capitalGains.filter((c) => c.realisedST !== null).length;
console.log(`  cash-flow series for ${Object.keys(book.accountCashFlows).length} account(s); realised gains for ${withGains} of ${book.capitalGains.length} account(s)`);
if (book.unclassified.length) {
  console.log(`  ${book.unclassified.length} UNCLASSIFIED sector(s): ${book.unclassified.map((u) => u.providerSector).join(", ")}`);
}
for (const n of book.notes) console.log(`  ! ${n}`);
console.log("  src/data/glowData.ts");
console.log("  docs/BOOK-REPORT.md");
