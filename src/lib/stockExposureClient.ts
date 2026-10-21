import type { HeldFund, StockExposure, StockExposureState } from "./lookthrough";
import { requestDeadline } from "./requestDeadline";
import manifest from "../data/readModels.json";
import { markDeploymentChanged } from "./deploymentVersion";

// Tab switches and unrelated quote ticks reuse the exact valuation request.
// Keep a small bounded session cache; source files are tied to the build revision.
const pending = new Map<string, Promise<StockExposureState>>();
export function fetchStockExposure(funds: HeldFund[], identities: ReadonlyMap<string, string>, companyKeys: ReadonlySet<string>): Promise<StockExposureState> {
  const body = JSON.stringify({ revision: manifest.revision,
    funds: [...funds].sort((a, b) => a.securityKey.localeCompare(b.securityKey)),
    identities: [...identities].sort(([a], [b]) => a.localeCompare(b)), companyKeys: [...companyKeys].sort() });
  let result = pending.get(body);
  if (!result) {
    result = (async (): Promise<StockExposureState> => {
      const deadline = requestDeadline(15_000);
      try {
        const response = await fetch("/api/stock-exposure", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: deadline.signal });
        if (response.status === 409) {
          const data = await response.json();
          if (data.status === "revision_changed") {
            markDeploymentChanged();
            return { status: "loading" }; // App presents the reload prompt immediately.
          }
        }
        if (!response.ok) return { status: "unreachable" };
        const data = await response.json();
        if (data.status !== "ok" || !Array.isArray(data.byKey)) return { status: "unreachable" };
        return { ...data, byKey: new Map<string, StockExposure>(data.byKey) };
      } catch { return { status: "unreachable" }; }
      finally { deadline.dispose(); }
    })().then((value) => { if (value.status !== "ok") pending.delete(body); return value; });
    if (pending.size >= 8) pending.delete(pending.keys().next().value!);
    pending.set(body, result);
  }
  return result;
}
