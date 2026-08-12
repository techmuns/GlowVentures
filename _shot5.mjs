import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
for (const key of ["aurobindo-pharma", "aditya-birla-capital"]) {
  const p = await b.newPage({ viewport: { width: 1300, height: 1700 } });
  await p.goto(`http://localhost:4174/stock/${key}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(16000);
  const t = await p.locator("body").innerText();
  const i = t.search(/Ratio analysis/i);
  console.log(`\n===== ${key}`);
  console.log(i < 0 ? "(no card)" : t.slice(i, i + 900).split("\n").slice(0, 26).join("\n"));
  await p.locator("text=Ratio analysis").first().scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: `docs/page-check/ratios-${key}.png`, clip: { x: 220, y: 0, width: 1060, height: 1000 } });
  await p.close();
}
await b.close();
