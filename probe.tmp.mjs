import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
await p.goto("http://127.0.0.1:4173/polycab", { waitUntil: "networkidle" });
console.log(await p.evaluate(() => {
  const th = document.querySelector('th[data-col="security"]');
  const btn = th.querySelector("[data-col-button]");
  return JSON.stringify({
    thClass: th.className,
    thTransform: getComputedStyle(th).textTransform,
    btnTransform: getComputedStyle(btn).textTransform,
    thInner: th.innerText,
    btnInner: btn.innerText,
  }, null, 1);
}));
await b.close();
