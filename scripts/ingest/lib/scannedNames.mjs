import { securityKeyOf } from "../../../shared/securityKey.mjs";

/**
 * A SCANNED ROW TAKES THE NAME ANOTHER STATEMENT PRINTS FOR ITS ISIN.
 *
 * A quantity read off a scan is checked by the page; a NAME is not — OCR spells
 * `SANSHI TRUST FD I CL E` as `SANSHI TRUST FDICLE`, and the security key is
 * derived from the name, so a scanned row would join to nothing. The ISIN is
 * checked (its own check digit), so where a statement read from a TEXT LAYER
 * prints the same ISIN, its name is used — one company only, by the rule
 * `backfillSecurityNames` applies — and the OCR'd words stay in
 * `printedSecurity`. A row no other statement names keeps the scan's own words,
 * and the document lists which, so nobody mistakes them for a printed name.
 *
 * THE SAME DEPOSITORY'S NAME FIRST. A depository's security master names an
 * ISIN one way on every participant's statement, and a fund's own statement
 * names its class another — `SANSHI TRUST - FD I CL E - Restricted
 * Transferability` on Ajay's ICICI NSDL statement, `Sanshi Fund-I — Class E` on
 * a Motilal one. Both are the same ISIN under two keys, so "one company" found
 * neither and the scanned row kept OCR's words (a bare `Restricted
 * Transferability` for Sanshi). The scan prints the depository's own master
 * name, so a statement of the same depository names it; any text-layer name
 * stands only where every statement printing the ISIN agrees.
 */
export const isScanned = (d) => (d.warnings ?? []).some((w) => w.code === "text-recovered-from-scan");
const depositoryOf = (provider) => (/\(NSDL demat\)$/.test(provider ?? "") ? "NSDL" : null);
export function nameScannedHoldings(docs) {
  const byIsin = new Map();
  for (const d of docs) {
    if (isScanned(d) || d.status === "failed") continue;
    for (const k of ["holdings", "capitalGains", "transactions", "openLots"]) {
      for (const r of d[k] ?? []) {
        if (!r?.isin || !r.security) continue;
        (byIsin.get(r.isin) ?? byIsin.set(r.isin, []).get(r.isin)).push({ name: r.security, depository: depositoryOf(d.provider) });
      }
    }
  }
  const oneCompany = (names) => {
    if (!names.length || new Set(names.map((n) => securityKeyOf(n))).size !== 1) return null;
    const cased = (c) => (/[a-z]/.test(c) ? 1 : 0);
    return [...new Set(names)].sort((a, b) => cased(b) - cased(a) || b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))[0];
  };
  let renamed = 0;
  for (const d of docs.filter(isScanned)) {
    // Carried scans already have these derived notes. Replace them so replaying
    // the same evidence is byte-identical, rather than appending duplicates.
    d.warnings = (d.warnings ?? []).filter(w => !["security-name-from-isin", "security-name-from-scan"].includes(w.code));
    const own = [], disputed = [];
    let here = 0;
    const depository = depositoryOf(d.provider);
    for (const h of d.holdings ?? []) {
      const named = (h.isin && byIsin.get(h.isin)) || [];
      const same = depository ? named.filter((x) => x.depository === depository) : [];
      const pick = oneCompany((same.length ? same : named).map((x) => x.name));
      if (!pick) {
        if (named.length) disputed.push(`${h.security} (${h.isin}: ${[...new Set(named.map((x) => x.name))].join(" / ")})`);
        else own.push(`${h.security} (${h.isin})`);
        continue;
      }
      h.printedSecurity ??= h.security;
      h.security = pick;
      h.securityKey = securityKeyOf(pick);
      here++;
    }
    renamed += here;
    if (here) {
      d.securityNameSource = "isin";
      d.warnings.push({ code: "security-name-from-isin",
        detail: `a scan's security names are OCR'd and cannot be checked; ${here} holding(s) take the name a statement read from a text layer `
          + `prints against the same (check-digit-verified) ISIN — ${depository ? `the ${depository} depository's own name where one of its statements prints it` : "one company only"} — `
          + "and the scan's own words are kept in `printedSecurity`." });
    }
    if (own.length || disputed.length) {
      d.warnings.push({ code: "security-name-from-scan",
        detail: `${own.length + disputed.length} holding(s) carry the name as OCR read it`
          + (own.length ? `; no other statement in this book prints the ISIN of ${own.join("; ")}` : "")
          + (disputed.length ? `; the statements that print the ISIN name different companies for ${disputed.join("; ")}` : "")
          + ". The ISIN and the quantity are checked; the spelling of the name is not." });
    }
  }
  return renamed;
}

