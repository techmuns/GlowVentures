import assert from "node:assert/strict";
import { isChunkLoadError, recoverChunkLoad } from "../chunkRecovery";

const errors = [
  new TypeError("Failed to fetch dynamically imported module: https://local.test/assets/StockInfo-old.js"),
  new TypeError("error loading dynamically imported module: https://local.test/assets/StockInfo-old.js"),
  new TypeError("Importing a module script failed."),
  new Error("Unable to preload CSS for /assets/StockInfo-old.css"),
  Object.assign(new Error("Loading chunk 1 failed"), { name: "ChunkLoadError" }),
];
for (const error of errors) assert.equal(isChunkLoadError(error), true);
for (const error of [new Error("Failed to fetch"), new Error("Cannot read properties of undefined"), new SyntaxError("Unexpected token"), null, "network"]) {
  assert.equal(isChunkLoadError(error), false, "real runtime/API errors keep their normal boundary");
}
const stored = new Map<string, string>();
let reloads = 0;
const browser = {
  sessionStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); } },
  navigator: { onLine: true }, location: { reload: () => { reloads++; } },
};
assert.equal(recoverChunkLoad(errors[0], browser, 100_000), true);
assert.equal(reloads, 1);
assert.equal(recoverChunkLoad(errors[0], browser, 100_001), false, "preload event and boundary share one guard");
assert.equal(recoverChunkLoad(errors[1], { ...browser }, 100_002), false, "guard survives a document reload and another failed chunk");
assert.equal(recoverChunkLoad(errors[0], browser, 160_000), true, "a later deployment can recover again");
assert.equal(reloads, 2);
browser.navigator.onLine = false;
assert.equal(recoverChunkLoad(errors[0], browser, 220_000), false, "offline never reloads automatically");
browser.navigator.onLine = true;
assert.equal(recoverChunkLoad(new Error("application bug"), browser, 220_000), false);
assert.equal(recoverChunkLoad(errors[0], { ...browser, get sessionStorage(): never { throw new Error("blocked"); } }, 220_000), false);
assert.equal(recoverChunkLoad(errors[0], { ...browser, sessionStorage: { getItem: () => null, setItem: () => {} } }, 220_000), false, "a silently rejected write cannot start a reload loop");
assert.equal(reloads, 2);
console.log("PASS: chunk classification, shared reload guard, offline and restricted storage");
