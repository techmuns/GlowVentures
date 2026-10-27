import "./index.css";
import { bootstrapRuntimeBook } from "./lib/runtimeBook";
import { recoverChunkLoad } from './lib/chunkRecovery';
import { initializeNavigationEntry } from './lib/navigationMemory';

initializeNavigationEntry();
let recovering = false;
window.addEventListener('vite:preloadError', event => {
  recovering = recoverChunkLoad((event as Event & { payload: unknown }).payload) || recovering;
});

// App and every module-level financial index initialize only after one complete
// verified version has been selected. A failed load retains the compiled book.
void bootstrapRuntimeBook().then(() => import("./renderApp")).catch(error => {
  if (recovering || recoverChunkLoad(error)) return;
  const root = document.getElementById("root");
  if (!root) return;
  root.textContent = "The dashboard could not open. Reload to try again.";
  const retry = document.createElement("button"); retry.textContent = "Reload";
  retry.onclick = () => window.location.reload(); root.appendChild(retry);
});
