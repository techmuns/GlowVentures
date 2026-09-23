import { CorporateActionReturns } from "@/components/CorporateActionReturns";
import { PageHeader } from "@/components/PageHeader";

export function CorporateActions() {
  return <div>
    <PageHeader title="Corporate actions & dividends" subtitle="Glow Central Research’s NSE and Screener events, matched to statement holdings." />
    <CorporateActionReturns />
  </div>;
}
