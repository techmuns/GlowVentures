import { readFileSync } from "node:fs";
import { extractLayout } from "./scripts/ingest/lib/layout.mjs";
import { parseNum } from "./scripts/ingest/lib/parseNum.mjs";
const r = await extractLayout(new Uint8Array(readFileSync(process.argv[2])));
const text = r.pages.map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");
const V = String.raw`(?:₹\s*)?(-?[\d,]+(?:\.\d+)?)(?:\s*\(\s*[\d.]+%\s*\))?`;
const trio = (a, b, c) => new RegExp(`${a}\\s+${b}\\s+${c}\\s*\\n\\s*${V}\\s+${V}\\s+${V}`);
const rows = {
  r1: trio("Capital Commitment", "Principal Payout", String.raw`NAV \(Net\)`),
  r2: trio("Gross Capital Contribution", String.raw`Income Payout \(Gross\)`, String.raw`Valuation \(Net\)`),
  r3: trio("Pending Drawdown", "Total Payout", "Units"),
  r4: trio("Undrawn Commitment", "Net Equalisation", "Face Value"),
};
for (const [k, re] of Object.entries(rows)) {
  const m = re.exec(text);
  console.log(k, m ? m.slice(1).map(parseNum) : "NO MATCH");
}
