import { useEffect, useMemo, useState } from "react";
import { isCompanyShare } from "@/lib/analytics";
import { bookIsinBridge, heldFundVehicles, type HeldFund, type StockExposureState } from "@/lib/lookthrough";
import { fetchStockExposure } from "./stockExposureClient";
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
const LOADING: StockExposureState = { status: "loading" };

export function useStockExposure(
  consolidated: Position[],
  enabled: boolean,
  /**
   * ── WHOSE FUNDS ARE LOOKED THROUGH (Stage 10fz) ─────────────────────────
   *
   * By default the vehicles are struck over `consolidated` — every fund the
   * scope holds. A view filtered to ONE member must strike them over that
   * member's funds only: the Monitor's Security view with Entity = Ankita
   * printed ₹1.21 Cr of ICICI Bank "via funds" beside her own ₹0.27 Cr, and
   * every rupee of it was Helios Flexi Cap — a folio in Ajay's name — weighted
   * against Ankita's book. `vehiclesFrom` narrows the FUNDS only; the ISIN
   * bridge and the company keys stay on `consolidated`, because which company
   * a fund's line names does not depend on who holds the fund.
   *
   * `scopeKey` tags the answer with the scope it was struck for. The state
   * outlives a change of inputs until the new fetch lands, and for a member
   * filter that would print the previous member's look-through under the new
   * member's name for a tick; a mismatched tag reads `loading` instead.
   */
  scope?: { vehiclesFrom?: Position[]; scopeKey?: string },
): StockExposureState {
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
  const vehicleSet = scope?.vehiclesFrom ?? consolidated;
  const heldVehicles = useMemo<HeldFund[]>(() => heldFundVehicles(vehicleSet), [vehicleSet]);
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

  // The server applies the canonical promoter ring-fence before returning rows.
  const scopeKey = scope?.scopeKey;
  const [exposure, setExposure] = useState<{ scopeKey: string | undefined; state: StockExposureState }>(
    { scopeKey: undefined, state: LOADING });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchStockExposure(heldVehicles, isinToBookKey, bookCompanyKeys).then((s) => { if (live) setExposure({ scopeKey, state: s }); });
    return () => { live = false; };
  }, [enabled, heldVehicles, isinToBookKey, bookCompanyKeys, scopeKey]);
  return exposure.scopeKey === scopeKey ? exposure.state : LOADING;
}
