// A deployment can replace a route's hashed file while an older tab is open.
// Reload the document (and its current URL) once, never loop on a broken build,
// an offline connection, or a browser that cannot persist the reload guard.
const RELOAD_KEY = "glow:chunk-reload-at";
const RELOAD_WINDOW_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "ChunkLoadError" || /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS for/i.test(error.message);
}

type RecoveryBrowser = {
  readonly sessionStorage: Pick<Storage, "getItem" | "setItem">;
  readonly navigator: Pick<Navigator, "onLine">;
  readonly location: Pick<Location, "reload">;
};

export function recoverChunkLoad(error: unknown, browser: RecoveryBrowser = window, now = Date.now()): boolean {
  if (!isChunkLoadError(error) || browser.navigator.onLine === false) return false;
  try {
    const previous = Number(browser.sessionStorage.getItem(RELOAD_KEY));
    if (previous > 0 && now - previous < RELOAD_WINDOW_MS) return false;
    browser.sessionStorage.setItem(RELOAD_KEY, String(now));
    if (browser.sessionStorage.getItem(RELOAD_KEY) !== String(now)) return false;
  } catch {
    return false;
  }
  browser.location.reload();
  return true;
}
