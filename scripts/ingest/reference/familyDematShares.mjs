// AJAY'S MOTILAL DEMAT (1201090012539150): THE TWO LISTED SHARES ITS 31 OCT 2026
// DP HOLDINGS STATEMENT RECORDS THAT ITS 31 JUL TAPE DID NOT, HARVESTED WITHOUT
// DISTURBING THE REST OF THE STATEMENT.
//
// Ajay's main Motilal Oswal demat sent a TRANSACTION statement (31 Jul 2026) and
// no holding statement, so the account is `transactionsOnly`: its 31 Jul closing
// balances are valued live off the tape (`depositoryShareCandidates` /
// `depositoryFundHoldings`), and its own note on screen asks for "that account's
// own holding statement from its custodian". That statement has now arrived (the
// family's own CDSL DP Holdings statement as on 31 Oct 2026, UCC H19119,
// `source/november-2026-f/`). The client flagged the clearest gap: the dashboard
// showed Kingfa at ~Rs 1.2 Cr (1,808 units on HDFC Securities) when the family
// also holds 17,675 units of it on this demat, ~Rs 12 Cr more; Manorama likewise.
//
// WHY THE STATEMENT IS READ BUT THE ACCOUNT STAYS transactionsOnly. The 31 Oct
// statement is a Motilal CDSL statement: every rate it prints is the holding's
// LAST DEPOSITORY MOVEMENT price, not a valuation (Stage 10cz), so NONE of its 22
// holdings carries a market value. It is therefore not a valued snapshot
// (`check-reads.mjs` `valued()`), and it does not force the account's date
// forward. That matters because this demat's funds moved: on 1 Oct 2026 ICICI
// Prudential, Bandhan and Kotak fund units (~Rs 50 Cr) transferred OFF it to AMC
// folios whose own statements are not in the book. Making this statement the
// account's authoritative holdings document would flip it off `transactionsOnly`,
// stop the tape, and DROP those funds (they are not on the 31 Oct statement and
// their destinations are not loaded) — understating the book. So the account
// keeps its tape (its funds stay exactly as today, to be reconciled when the AMC
// folio / CAMS statements arrive), and `build-book` leaves the 31 Oct document out
// of the account's own processing (it is not grouped into the account). This file
// takes the listed shares its tape and the MOPWM roll both miss and adds them as the
// account's unvalued holdings, each pointing at the real archived statement row for
// provenance (`publicationViews.test.ts`). They are valued at the live quote, never at
// the statement's last-movement rate.
//
// WHICH ROWS. The explicit allowlist `HARVEST_ISINS` below, verified isin-by-isin against
// the 31 Jul tape (`positionsAsOf`, read live by `depositoryShareCandidates`), the MOPWM
// rolls (`BOOK_SHARE_ROLLS`), the 21 Oct advised balances and every other account.
// Harvested: Kingfa, Manorama (Stage 10ps); Deepak Fertilisers (Stage 10pt — the client
// confirmed on 20 Nov that its 15,000 here is a holding SEPARATE from the 10,930 on Ajay's
// HDFC Securities, a different custodian). Each is Ajay's own, absent everywhere else, and
// its NSE symbol is in the committed corporate-action capture (`public/data/
// corporate-actions.json`) so the live quote may value it.
// NOT harvested, already in the book once: OneSource, Vedanta Aluminium, Insolation, MPS
// (the tape — their `positionsAsOf` equals this statement); KRBL, TAAL Tech, Tega, Zota
// (MOPWM rolls, with cost); Motilal Arbitrage, Liquid BeES (advised balances); Motilal
// Founders Fund (acct 90410016104); DSP Silver, 360 ONE SOF-8, NIIOF, Zepto (fund/ETF
// records, the tape and the review). NOT harvested YET: BSE (40,000), Tatva Chintan
// (21,185) — on the statement but their symbols are not in the capture, so a harvest adds
// an uncovered, unpriced row; they land once the capture names them. Neuland (4,625) — a
// review gap whose resolution re-runs reconcile:review (which also drops BSE), so the two
// go together in a reviewGaps pass. NUVAMA (INE531F01023) IS harvested below: its 31 Jul
// tape closing was 3,695, but this 31 Oct statement — the authoritative depository unit
// count — holds 9,500 (a later purchase; both post the Rs-2 sub-division), so the newer
// count supersedes the stale tape. It is the one harvested ISIN also present in
// `positionsAsOf`, so `build-book` skips its tape row there to avoid a double-count (Stage 10pz).

/** The 31 Oct 2026 DP Holdings statement this record harvests from. */
export const DEMAT_SHARES_DOCKEY = "motilal-oswal-financial-services-demat-1201090012539150-2026-10-31-holdings";
export const DEMAT_SHARES_ACCOUNT = "motilal-oswal-financial-services-demat-1201090012539150";

/** The ISINs harvested — see the WHICH ROWS note above; each verified against the tape, the
 * rolls, the advised balances and other accounts, and named by the corporate-action capture.
 * Kingfa/Manorama/Deepak were ABSENT from the 31 Jul tape; Nuvama SUPERSEDES its own stale tape
 * row (3,695 → the 31 Oct statement's 9,500), which `build-book` skips in `positionsAsOf`. */
export const HARVEST_ISINS = new Set([
  "INE473D01015" /* Kingfa */, "INE00VM01036" /* Manorama */, "INE501A01019" /* Deepak Fertilisers */,
  "INE531F01023" /* Nuvama Wealth (31 Oct 9,500 supersedes the 31 Jul tape's 3,695) */,
]);

/**
 * The harvested listed shares as `UnvaluedStatementHolding` rows, read straight from the
 * extracted statement document so every field (securityKey, quantity, pointer) is
 * the statement's own. `octDoc` is the archived `document.json` for
 * `DEMAT_SHARES_DOCKEY`; returns [] when it is absent (nothing is invented).
 *
 * They join `unpricedStatementShareCandidates` on the live basis — listed, no
 * usable statement price, valued at the live quote only; the statement basis keeps
 * nothing here. Their book-wide identity (so they sit under the same company as the
 * HDFC Securities holdings) is resolved there by NSE symbol, not changed here.
 */
export function familyDematShares(octDoc) {
  if (!octDoc || !Array.isArray(octDoc.holdings)) return [];
  const provider = octDoc.provider ?? "Motilal Oswal Financial Services (demat)";
  const units = (v) => v.toLocaleString("en-IN", { maximumFractionDigits: 3 });
  const money = (v) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 3 })}`;
  const out = [];
  octDoc.holdings.forEach((h, i) => {
    if (!HARVEST_ISINS.has(h.isin) || h.assetClass !== "Equity" || !(typeof h.quantity === "number" && h.quantity > 0)) return;
    const lmr = typeof h.lastMovementRate === "number" && h.lastMovementRate > 0 ? h.lastMovementRate : null;
    // The row's own cause, in the one shape `unvaluedHoldings.test.ts` holds a
    // Motilal CDSL last-movement row to: the printed rate is the last depository
    // movement's price (Stage 10cz), never a valuation, so it carries a quantity
    // and no value and is valued at the live quote.
    const reason = lmr !== null
      ? `the ${provider} statement of ${octDoc.asOf} prints the price of this holding's last depository movement — `
        + `${money(lmr)} a unit — not a valuation of the ${units(h.quantity)} unit(s) held, so it carries a quantity and no value`
      : `the ${provider} statement of ${octDoc.asOf} prints no rate for this holding, so it carries a quantity and no value`;
    out.push({
      statementRecord: { document: octDoc.docKey, pointer: `/holdings/${i}` },
      accountId: DEMAT_SHARES_ACCOUNT,
      ownerId: octDoc.ownerId,
      securityKey: h.securityKey,
      security: h.security,
      isin: h.isin,
      assetClass: "Equity",
      quantity: h.quantity,
      faceValue: h.faceValue ?? null,
      lastMovementRate: lmr,
      lastMovementValue: typeof h.lastMovementValue === "number" ? h.lastMovementValue : null,
      lastMovementDate: h.lastMovementDate ?? null,
      lastMovementSide: h.lastMovementSide ?? null,
      asOf: octDoc.asOf ?? null,
      sameUnitsReportedBy: null,
      reason,
    });
  });
  return out;
}
