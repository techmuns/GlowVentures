// HOW A TABLE IS ARRANGED, AND WHICH RETURNS IT SHOWS — REMEMBERED.  npm run test:family
//
// *"make default All ratios showing coloumns as selected … and remeber it the
//  next time user always comes. Also when i am drag and drop rearranging the
//  coloumns then the system needs to remeber the exact position and save it even
//  when i am changing the tab"*
//
// ── WHAT IS HELD HERE, AND WHY ON CONSTRUCTED INPUTS ────────────────────────
//
// The rules are pure (`tableView.ts`, `returnMeasures.ts`) and the memory is a
// module over `localStorage` (`viewMemory.ts`), so each is exercised directly:
//
//   • a column the current tab does not draw KEEPS its place, and a move made on
//     another tab does not lose it — the defect, asserted against the rule it
//     replaced so the suite cannot pass on a case where the two agree;
//   • a column never placed goes beside its own family (a new return beside the
//     other returns) or after the column it is declared after;
//   • with nothing saved, the table is its declared order, exactly;
//   • the return picker's default is every measure, a saved pick wins over it,
//     and a `?ret=` address wins over both;
//   • the memory returns ONE object per unchanged key (`useSyncExternalStore`
//     loops on anything else), tells every reader of a key when it changes, and
//     re-reads a key another browser tab wrote.
import {
  arrangeColumns, visibleOrder, moveColumn, nudgeColumn, parseStoredView, visibleSort, storedView,
} from "../tableView";
import {
  DEFAULT_RETURN_MEASURES, normaliseMeasures, resolveReturnMeasures, parseSavedMeasures, returnMeasuresKey,
} from "../returnMeasures";
import { readMemory, writeMemory, subscribeMemory, resetMemoryForTests } from "../viewMemory";
import { withReturnCols } from "../returnColumns";
import type { ReturnMeasure } from "../analytics";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const same = (a: readonly unknown[], b: readonly unknown[]) => JSON.stringify(a) === JSON.stringify(b);

// The Portfolio Monitor's own two column lists, one per axis kind.
const CATEGORY = ["security", "qty", "avgCost", "invested", "investedOn", "cmp", "day", "mv",
  "weight", "pnl", "realised", "return", "sector", "entity"];
const SECURITY = ["security", "qty", "avgCost", "invested", "investedOn", "cmp", "day", "mv",
  "viaFunds", "totalExposure", "weight", "pnl", "realised", "return", "sector", "entity"];
const ALL: ReturnMeasure[] = ["absolute", "cagr", "xirr", "ytd", "calendar"];
const cols = (base: string[], m: ReturnMeasure[]) => withReturnCols(base, m) as string[];

/** The rule this replaced: keep only what is drawn, append the rest at the end. */
const oldRule = (stored: string[], declared: string[]) => {
  const fixed = declared[0];
  const kept = stored.filter((c) => declared.includes(c));
  return kept.length
    ? [fixed, ...kept.filter((c) => c !== fixed), ...declared.filter((c) => c !== fixed && !kept.includes(c))]
    : [...declared];
};

// ── 1. Nothing saved: the declared order, exactly ───────────────────────────
{
  for (const [name, d] of [["category", cols(CATEGORY, ["auto"])], ["security", cols(SECURITY, ALL)]] as const) {
    ok(`nothing saved → the ${name} table draws its declared order`, same(visibleOrder([], d), d));
  }
}

// ── 2. A column the tab does not draw keeps its place ───────────────────────
{
  const sec = cols(SECURITY, ["auto"]);
  const cat = cols(CATEGORY, ["auto"]);
  // On All Securities the reader puts Market value, Via funds and Total exposure
  // straight after the name.
  let full = moveColumn([], sec, "mv", "qty")!;
  full = moveColumn(full, sec, "viaFunds", "qty")!;
  full = moveColumn(full, sec, "totalExposure", "qty")!;
  const secDrawn = visibleOrder(full, sec);
  ok("on All Securities the three sit where the reader put them",
    same(secDrawn.slice(0, 4), ["security", "mv", "viaFunds", "totalExposure"]), secDrawn.slice(0, 5).join(","));
  // On Category the two security-only columns are not drawn…
  const catDrawn = visibleOrder(full, cat);
  ok("on Category Market value is still second, and the two it does not draw are not drawn",
    catDrawn[1] === "mv" && !catDrawn.includes("viaFunds") && catDrawn.length === cat.length, catDrawn.join(","));
  // …and the reader moves Avg cost after Invested on while there.
  full = moveColumn(full, cat, "avgCost", "cmp")!;
  const back = visibleOrder(full, sec);
  ok("back on All Securities, the columns only it draws are exactly where they were",
    same(back.slice(0, 4), ["security", "mv", "viaFunds", "totalExposure"]), back.join(","));
  ok("…and the move made on Category carried across too",
    back.indexOf("avgCost") === back.indexOf("investedOn") + 1, back.join(","));
  // LOAD-BEARING: the rule this replaced loses them.
  const lossy = oldRule(oldRule(secDrawn, cat).filter((c) => c !== "avgCost"), sec);
  ok("the old rule would have sent Via funds and Total exposure past Entities, to the far right",
    lossy.indexOf("viaFunds") > lossy.indexOf("entity") && lossy.indexOf("totalExposure") > lossy.indexOf("entity"), lossy.join(","));
}

// ── 3. A column never placed goes where it belongs ──────────────────────────
{
  const auto = cols(CATEGORY, ["auto"]);
  // The reader drags the one return column to just after Weight.
  const full = moveColumn([], auto, "ret:auto", "pnl")!;
  const five = cols(CATEGORY, ALL);
  const drawn = visibleOrder(full, five);
  const at = drawn.indexOf("weight");
  ok("ticking every measure puts the five where the reader put the return column, in the picker's order",
    same(drawn.slice(at + 1, at + 6), ALL.map((m) => `ret:${m}`)), drawn.join(","));
  ok("…and nothing else moved", same(drawn.filter((c) => !c.startsWith("ret:")), auto.filter((c) => !c.startsWith("ret:"))
    .map((c) => c).sort((a, b) => full.indexOf(a) - full.indexOf(b))));
  // The old rule appended them at the very end, past Sector and Entities.
  const lossy = oldRule(visibleOrder(full, auto), five);
  ok("the old rule would have put them after Entities", lossy.indexOf("ret:absolute") > lossy.indexOf("entity"), lossy.join(","));

  // A measure ticked later lands beside its own siblings, even when they were split up.
  const two = cols(CATEGORY, ["absolute", "xirr"]);
  let f2 = moveColumn([], two, "ret:xirr", "qty")!;          // XIRR dragged to the front
  const three = cols(CATEGORY, ["absolute", "cagr", "xirr"]);
  const d3 = visibleOrder(f2, three);
  ok("a newly ticked CAGR sits right after Absolute, where Absolute is",
    d3.indexOf("ret:cagr") === d3.indexOf("ret:absolute") + 1 && d3[1] === "ret:xirr", d3.join(","));
  f2 = moveColumn(f2, three, "ret:cagr", "ret:xirr")!;
  ok("and the reader can still put it anywhere", visibleOrder(f2, three)[1] === "ret:cagr");

  // A column that is not a return goes after the one it is declared after.
  const moved = moveColumn([], CATEGORY, "mv", "qty")!;       // Market value second, saved on Category
  const secDrawn = visibleOrder(moved, SECURITY);
  ok("Via funds and Total exposure follow Market value wherever the reader put it",
    same(secDrawn.slice(1, 4), ["mv", "viaFunds", "totalExposure"]), secDrawn.join(","));
}

// ── 4. Moves and nudges ─────────────────────────────────────────────────────
{
  const d = cols(CATEGORY, ["auto"]);
  ok("the first column is never moved", moveColumn([], d, "security", "qty") === null);
  ok("a column not drawn cannot be carried", moveColumn([], d, "viaFunds", "qty") === null);
  const toFront = visibleOrder(moveColumn([], d, "weight", "security")!, d);
  ok("a drop on the first column lands right after it", toFront[0] === "security" && toFront[1] === "weight", toFront.join(","));
  // A column dropped at the end goes after the last DRAWN one, not after a hidden one.
  const withHidden = moveColumn([], cols(SECURITY, ["auto"]), "viaFunds", null)!;   // saved on All Securities: Via funds last
  const endCat = moveColumn(withHidden, d, "qty", null)!;
  ok("dropped at the end on Category, Quantity goes after Entities and before the hidden Via funds",
    endCat.indexOf("qty") === endCat.indexOf("entity") + 1 && endCat.indexOf("viaFunds") > endCat.indexOf("qty"), endCat.join(","));
  const n1 = visibleOrder(nudgeColumn([], d, "invested", -1)!, d);
  ok("a nudge left swaps with the drawn neighbour", n1[2] === "invested" && n1[3] === "avgCost", n1.join(","));
  ok("a nudge never passes the first column", nudgeColumn([], d, "qty", -1) === null);
  ok("…nor falls off the end", nudgeColumn([], d, "entity", 1) === null);
  // A nudge on Category steps over the drawn neighbour and leaves a hidden column where it was.
  const hid = moveColumn([], SECURITY, "viaFunds", "weight")!; // saved on All Securities: Total exposure, then Via funds
  const nudged = nudgeColumn(hid, CATEGORY, "weight", -1)!;
  ok("a nudge on Category steps over the drawn neighbour", visibleOrder(nudged, CATEGORY).indexOf("weight") === CATEGORY.indexOf("mv"),
    visibleOrder(nudged, CATEGORY).join(","));
  const secAfter = visibleOrder(nudged, SECURITY);
  ok("…and the columns it does not draw keep their own order beside Market value",
    same(secAfter.slice(secAfter.indexOf("mv"), secAfter.indexOf("mv") + 3), ["mv", "totalExposure", "viaFunds"]), secAfter.join(","));
}

// ── 5. What was saved, from any build ───────────────────────────────────────
{
  const p = parseStoredView({ order: ["a", 3, "b", "a", ""], sort: { col: "b", dir: "sideways" } });
  ok("a saved order drops what is not a column id, once each; a bad sort is no sort",
    !!p && same(p.order, ["a", "b"]) && p.sort === null);
  ok("anything that is not an object is nothing saved", parseStoredView("[1,2]") === null && parseStoredView(null) === null);
  ok("a sort on a column this tab does not draw is not applied…", visibleSort({ col: "viaFunds", dir: "desc" }, CATEGORY) === null);
  ok("…and is applied again where it is drawn", visibleSort({ col: "viaFunds", dir: "desc" }, SECURITY)?.col === "viaFunds");
}

// ── 6. The return picker: every measure by default, a pick remembered ──────
{
  ok("the default is the five measures, in the picker's order", same(DEFAULT_RETURN_MEASURES, ALL));
  const def = resolveReturnMeasures(null, null);
  ok("nothing saved and no address → every measure", same(def.measures, ALL) && def.from === "default");
  const saved = resolveReturnMeasures(null, ["auto"]);
  ok("a saved pick wins over the default", same(saved.measures, ["auto"]) && saved.from === "saved");
  const addr = resolveReturnMeasures("xirr,cagr", ["auto"]);
  ok("an address wins over a saved pick, in the picker's order", same(addr.measures, ["cagr", "xirr"]) && addr.from === "address");
  ok("?ret=auto names the methodology view", same(resolveReturnMeasures("auto", null).measures, ["auto"]));
  ok("an address naming nothing falls back to the saved pick", same(resolveReturnMeasures("garbage", ["ytd"]).measures, ["ytd"]));
  ok("a concrete measure beats auto in one list", same(normaliseMeasures(["auto", "calendar", "absolute"]) ?? [], ["absolute", "calendar"]));
  ok("an empty list is no pick", normaliseMeasures([]) === null && parseSavedMeasures({ measures: ["cagr"] }) === null);
  ok("each page saves its own pick", returnMeasuresKey("monitor") !== returnMeasuresKey("private-market"));
}

// ── 7. The memory ───────────────────────────────────────────────────────────
{
  const store = new Map<string, string>();
  const handlers: ((e: { key: string | null }) => void)[] = [];
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    addEventListener: (type: string, h: (e: { key: string | null }) => void) => { if (type === "storage") handlers.push(h); },
  };
  resetMemoryForTests();
  const key = "glow:tableView:monitor:v1";
  store.set(key, JSON.stringify({ order: ["security", "mv"], sort: null }));
  const a = readMemory(key, parseStoredView), b = readMemory(key, parseStoredView);
  ok("two reads of an unchanged key return the same object", !!a && a === b);
  let heard = 0;
  const off = subscribeMemory(key, () => { heard++; });
  writeMemory(key, { order: ["security", "qty"], sort: null });
  ok("a save reaches every reader of the key", heard === 1 && readMemory(key, parseStoredView)?.order[1] === "qty");
  ok("…and is written to the browser's storage", JSON.parse(store.get(key) ?? "{}").order?.[1] === "qty");
  // Another browser tab writes the key.
  store.set(key, JSON.stringify({ order: ["security", "weight"], sort: null }));
  handlers.forEach((h) => h({ key }));
  ok("another tab's change is read again and heard", heard === 2 && readMemory(key, parseStoredView)?.order[1] === "weight");
  off();
  writeMemory(key, { order: ["security"], sort: null });
  ok("a reader that has gone hears nothing", heard === 2);
  // THE MONITOR'S TWO OLD KEYS BECAME ONE. A reader who only ever arranged the
  // security axis (saved under `monitor-stock`) keeps that arrangement; where
  // both were saved, the Category table's own key wins.
  const legacy = "glow:tableView:monitor-stock:v1";
  store.delete(key);
  store.set(legacy, JSON.stringify({ order: ["security", "viaFunds", "mv"], sort: null }));
  resetMemoryForTests();
  ok("an arrangement saved under the old security-axis key is read under the new one",
    same(storedView("monitor", ["monitor-stock"]).order, ["security", "viaFunds", "mv"]));
  store.set(key, JSON.stringify({ order: ["security", "qty"], sort: null }));
  resetMemoryForTests();
  ok("…and the table's own key wins where both were saved",
    same(storedView("monitor", ["monitor-stock"]).order, ["security", "qty"]));
  ok("…and a table with no legacy key reads nothing from one",
    storedView("sectors", []).order.length === 0);
  // A pick saved on one page load is what the next one opens on.
  const rk = returnMeasuresKey("monitor");
  writeMemory(rk, ["auto"]);
  resetMemoryForTests();
  ok("a saved return pick survives a fresh page load", same(readMemory(rk, parseSavedMeasures) ?? [], ["auto"]));
  // A storage that throws (a private window) leaves the defaults, never a crash.
  (globalThis as unknown as { window: unknown }).window = {
    get localStorage(): Storage { throw new Error("blocked"); },
    addEventListener: () => {},
  };
  resetMemoryForTests();
  ok("a blocked store reads as nothing saved", readMemory(key, parseStoredView) === null);
  writeMemory(key, { order: ["security", "qty"], sort: null });
  ok("…and a change is still kept for this page load", readMemory(key, parseStoredView)?.order[1] === "qty");
}

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall table-arrangement and return-pick checks passed");
