import { useEffect, useMemo, useState } from "react";
import { BOOK_POLYCAB } from "@/data/glowData";
import { isCompanyShare, isFundVehicle } from "@/lib/analytics";
import { loadStockExposure, type HeldFund, type StockExposureState } from "@/lib/lookthrough";
import type { Position } from "@/lib/types";

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
  const heldVehicles = useMemo<HeldFund[]>(() => {
    const m = new Map<string, HeldFund>();
    for (const p of consolidated) {
      if (!isFundVehicle(p)) continue;
      const e = m.get(p.securityKey)
        ?? { securityKey: p.securityKey, name: p.security, marketValue: 0, assetClass: p.assetClass };
      e.marketValue += p.marketValue;
      m.set(p.securityKey, e);
    }
    return [...m.values()];
  }, [consolidated]);

  /**
   * ISIN → THE BOOK'S OWN KEY, which is the only tier that can join a
   * depository's `SBI - EQ` to an AMC's `State Bank of India`. Without it those
   * two stand as separate rows and the family's own question — how much of this
   * company do I hold altogether — gets two answers.
   */
  const isinToBookKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of consolidated) {
      if (!isCompanyShare(p) || !p.isin) continue;
      const k = p.isin.trim().toUpperCase();
      if (k && !m.has(k)) m.set(k, p.securityKey);
    }
    return m;
  }, [consolidated]);

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
    loadStockExposure(heldVehicles, isinToBookKey, ringFenced).then((s) => { if (live) setExposure(s); });
    return () => { live = false; };
  }, [enabled, heldVehicles, isinToBookKey, ringFenced]);
  return exposure;
}
