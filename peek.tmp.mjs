import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
await p.goto("http://localhost:4173" + (process.argv[2] ?? "/private-market"), { waitUntil: "networkidle" });
const t = await p.evaluate(() => document.querySelector("main").innerText);
console.log(t.split("\n").slice(0, Number(process.argv[3] ?? 40)).map((l,i)=>`${i}: ${JSON.stringify(l)}`).join("\n"));
await b.close();
