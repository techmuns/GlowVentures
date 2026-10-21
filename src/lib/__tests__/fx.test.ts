// THE DISPLAY RATE IS A PUBLISHED ONE, OR THERE IS NO USD (Stage 10fx).
//   npm run test:family
//
// `DEFAULT_INR_PER_USD = 83.5` divided every USD figure in the cockpit whenever
// /api/fx did not answer — a rate nobody published on any date. These checks
// pin what replaced it: the feed's rate, else the last one this browser
// fetched (with its date), else INR with no conversion at all.
import * as fx from "@/lib/fx";
import { effectiveCurrency, rateOf, readSavedRate, resolveFx, saveRate, type FxRate } from "@/lib/fx";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
};
const live: FxRate = { inrPerUsd: 88.12, date: "2026-10-20", fetchedAt: "2026-10-21T04:00:00.000Z" };
const older: FxRate = { inrPerUsd: 87.4, date: "2026-10-14", fetchedAt: "2026-10-14T09:30:00.000Z" };

// ── NO DEFAULT RATE EXISTS ──────────────────────────────────────────────────
ok("the module exports no static fallback rate", !("DEFAULT_INR_PER_USD" in fx));
for (const s of [resolveFx(undefined, null), resolveFx(null, null)]) {
  ok(`with no feed and nothing saved (${s.status}) there is no rate`, rateOf(s) === null);
  ok(`…and USD renders as INR (${s.status})`, effectiveCurrency("USD", s) === "INR");
}
ok("the fetch still in flight is 'pending', a failed one 'unavailable'",
  resolveFx(undefined, null).status === "pending" && resolveFx(null, null).status === "unavailable");

// ── THE FEED'S RATE WINS, AND A SAVED ONE IS USED ONLY WITH ITS OWN DATE ────
{
  const s = resolveFx(live, older);
  ok("the feed's rate is the one in use", s.status === "live" && rateOf(s) === 88.12);
  ok("…and USD is shown", effectiveCurrency("USD", s) === "USD");
}
{
  const failed = resolveFx(null, older);
  ok("with the feed down the last fetched rate is used", failed.status === "saved" && rateOf(failed) === 87.4);
  ok("…carrying its own publication date and fetch time", failed.status === "saved"
    && failed.rate.date === "2026-10-14" && failed.rate.fetchedAt.startsWith("2026-10-14") && failed.feed === "failed");
  const pending = resolveFx(undefined, older);
  ok("while the feed is still loading the saved rate says so", pending.status === "saved" && pending.feed === "pending");
}
ok("INR never needs a rate", effectiveCurrency("INR", resolveFx(null, null)) === "INR");

// ── THE STORE ROUND-TRIPS AND REFUSES WHAT IS NOT A RATE ────────────────────
{
  const st = memory();
  ok("an empty store yields no saved rate", readSavedRate(st) === null);
  saveRate(live, st);
  const back = readSavedRate(st);
  ok("a saved rate reads back intact", !!back && back.inrPerUsd === 88.12 && back.date === "2026-10-20" && back.fetchedAt === live.fetchedAt);
  for (const bad of ["{", JSON.stringify({ inrPerUsd: 0, date: null, fetchedAt: "x" }),
    JSON.stringify({ inrPerUsd: "88", date: null, fetchedAt: "x" }), JSON.stringify({ inrPerUsd: 88 })]) {
    st.m.set("glow:fx:last", bad);
    ok(`a malformed saved value is not a rate (${bad.slice(0, 24)})`, readSavedRate(st) === null);
  }
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  ok("blocked storage reads as nothing saved", readSavedRate(throwing) === null);
  let threw = false;
  try { saveRate(live, throwing); } catch { threw = true; }
  ok("…and saving into it does not throw", !threw);
}

console.log(fails ? `\n${fails} FAILED` : "\nall fx checks passed");
process.exit(fails ? 1 : 0);
