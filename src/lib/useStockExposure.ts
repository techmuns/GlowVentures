import { useEffect, useMemo, useState } from "react";
import { BOOK_POLYCAB } from "@/data/glowData";
import { isCompanyShare } from "@/lib/analytics";
import { bookIsinBridge, heldFundVehicles, loadStockExposure, type HeldFund, type StockExposureState } from "@/lib/lookthrough";
import type { Position } from "@/lib/types";
import { lookthroughCompanies } from "@/lib/recordedHoldings";

/**
 * ── THE FUND LOOK-THROUGH, WIRED THE SAME WAY WHEREVER IT IS READ ───────────
 *
 * `loadStockExposure` needs three things assembled out of the book — which fund
 * vehicles the family holds and at what value, the ISIN→key bridge, and the
 * ring-fenced security — and every one of them is a decision rather than a
 * lookup. They were assembled inside the Portfolio Monitor; the moment Sector
 * Composition grew its Consolidated view a second copy would have been a second
 * set of those decisions, and two of them are the kind that fail silently:
 *
 *   • a fund clubbed per POSITION rather than per `dedupeGroup` doubles the
 *     value a disclosure's percentages are applied to;
 *   • a missing ring-fence entry puts the promoter block back on a page the
 *     family asked never to name it.
 *
 * So they are made once, here, and both pages call this. Same reasoning as
 * `holdingBucket` and `companyExposure`: one definition, not a per-page reflex.
 *
 * `enabled` is false where a view does not ask what a fund holds — the Monitor's
 * other three axes group the book's own positions and must not pay for 21
 * fetches. Disabled, the state stays `loading`, which is the honest thing for a
 * caller that is not asking rather than a fabricated empty answer; no caller
 * renders it while disabled.
 */
export function useStockExposure(consolidated: Position[], enabled: boolean): StockExposureState {
  // Struck over the DEDUPED set — a fund two members' statements both report is
  // one fund at the value the book carries for both, because this feeds a
  // DERIVED exposure and a fund counted twice would double the share derived
  // from it. Clubbed on `securityKey`, so one scheme held by three members is
  // one vehicle with one disclosure.
  //
  // AND CURRENT HOLDINGS ONLY. A scheme redeemed to nil is not a fund this
  // family holds, so it must not be counted in "N of your M fund holdings
  // disclose". It contributes no exposure VALUE either way — `loadStockExposure`
  // drops a ₹0 fund's lines, because your share of a fund you hold none of is
  // none of everything in it. This used to say that it therefore moves the
  // DENOMINATOR and nothing else, and that was wrong: a filing that is read
  // still takes part in deciding which company an issuer's paper is filed
  // under, so a redeemed fund's filing can make a join the current ones cannot.
  // Measured — see `heldFundVehicles`.
  //
  // `heldFundVehicles` in `lookthrough.ts` is that set, shared with the suite so
  // the two cannot load different funds — which they did, and which hid a join
  // only the page depended on.
  const heldVehicles = useMemo<HeldFund[]>(() => heldFundVehicles(consolidated), [consolidated]);
  //
  // AND AN ARBITRAGE FUND IS NOT A VEHICLE TO LOOK THROUGH — that rule lives in
  // `heldFundVehicles` too, so the suite and this page cannot disagree on it.

  /**
   * ISIN → THE BOOK'S OWN KEY, which is the only tier that can join a
   * depository's `SBI - EQ` to an AMC's `State Bank of India`. Without it those
   * two stand as separate rows and the family's own question — how much of this
   * company do I hold altogether — gets two answers.
   *
   * AND THE LISTING'S ISIN WHERE THE STATEMENT PRINTED NONE — a company held
   * only through a PMS mandate carries no ISIN on any statement, so it joined to
   * nothing and stood twice. See `bookIsinBridge`, which is shared with the
   * suite so the two cannot build the index differently.
   */
  /*
   * AND THE COMPANIES A STATEMENT RECORDS AND NOTHING VALUES (Stage 10cz), by
   * the key the live layer files them under — so a fund's Kaynes line lands on
   * the family's own Kaynes whether or not a live quote has made that demat
   * line a row yet. See `lookthroughCompanies`.
   */
  const companies = useMemo(() => lookthroughCompanies(consolidated), [consolidated]);
  const isinToBookKey = useMemo(() => bookIsinBridge(companies).index, [companies]);
  const bookCompanyKeys = useMemo(
    () => new Set(companies.filter(isCompanyShare).map((p) => p.securityKey)), [companies]);

  /**
   * THE RING-FENCE, CARRIED ONTO THE DERIVED SIDE.
   *
   * `Polycab.tsx` is `BOOK_POLYCAB`'s only reader FOR DISPLAY and stays so: this
   * reads it to take a name OUT, never to put a figure in, and no value from it
   * reaches any cell. Without it the look-through would draw a Polycab row from
   * a scheme's disclosure — the fence is a decision about a SECURITY, and it has
   * to hold wherever that security is reported, including in somebody else's
   * portfolio. `check:pages` asserts no page names it.
   */
  const ringFenced = useMemo(() => ({
    keys: new Set(BOOK_POLYCAB.map((p) => p.securityKey)),
    isins: new Set(BOOK_POLYCAB.map((p) => (p.isin ?? "").trim().toUpperCase()).filter(Boolean)),
  }), []);

  const [exposure, setExposure] = useState<StockExposureState>({ status: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadStockExposure(heldVehicles, isinToBookKey, ringFenced, bookCompanyKeys).then((s) => { if (live) setExposure(s); });
    return () => { live = false; };
  }, [enabled, heldVehicles, isinToBookKey, ringFenced, bookCompanyKeys]);
  return exposure;
}
