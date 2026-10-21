// A book is compiled into the app. Load a new verified deployment as a whole;
// never replace positions while leaving the old capital/lot modules in memory.
const KEY = 'glow:publication-refresh';
const RETRY_MS = 300_000;
const isRevision = value => typeof value === 'string' && /^[a-f0-9]{20}$/.test(value);
const blockers = new WeakMap();
export const publicationRefreshBlocked = (browser = globalThis.window) => !!(browser && blockers.get(browser)?.());

export function refreshForPublication({ revision, published, browser, blocked = false, now = Date.now() }) {
  if (blocked || browser.navigator?.onLine === false || published?.schemaVersion !== 1 || !isRevision(published.revision) || published.revision === revision) return false;
  try {
    let previous;
    try { previous = JSON.parse(browser.sessionStorage.getItem(KEY) ?? 'null'); } catch { previous = null; }
    if (previous?.revision === published.revision && Number.isFinite(previous.at) && now >= previous.at && now - previous.at < RETRY_MS) return false;
    const mark = JSON.stringify({ revision: published.revision, at: now });
    browser.sessionStorage.setItem(KEY, mark);
    if (browser.sessionStorage.getItem(KEY) !== mark) return false;
  } catch { return false; } // no persisted guard means a broken build could loop
  browser.location.reload(); // preserves the current URL, member scope and filters
  return true;
}

export function startPublicationRefresh({ revision, path = '/publication.json', browser = globalThis.window, intervalMs = 30_000 }) {
  if (!browser) return { check: async () => {}, stop: () => {} };
  const doc = browser.document;
  let active = true, checking = false, dirty = false, route = browser.location.pathname, request = null;
  const syncRoute = () => {
    if (browser.location.pathname !== route) { route = browser.location.pathname; dirty = false; }
  };
  // Conservative: any draft/scenario edit defers replacement until navigation.
  // File selection has its own upload busy marker and is not an unsaved form.
  const edited = event => {
    syncRoute();
    const target = event.target;
    if (target?.type !== 'file' && (/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '') || target?.isContentEditable)) dirty = true;
  };
  const blocked = () => {
    syncRoute();
    const target = doc.activeElement;
    return dirty || doc.visibilityState === 'hidden' || (typeof doc.hasFocus === 'function' && !doc.hasFocus())
      || (target?.type !== 'file' && (/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '') || !!target?.isContentEditable))
      || !!doc.querySelector('[data-publication-busy="true"], [data-publication-dirty="true"], [role="dialog"]');
  };
  blockers.set(browser, blocked);
  const check = async () => {
    syncRoute();
    if (!active || checking || doc.visibilityState === 'hidden' || browser.navigator?.onLine === false) return;
    checking = true; request = new AbortController();
    const timeout = browser.setTimeout(() => request?.abort(), 8_000);
    try {
      const response = await browser.fetch(path, { method: 'GET', cache: 'no-store', credentials: 'same-origin', signal: request.signal });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
      const published = await response.json();
      // Let router/member-scope effects finish the destination URL first.
      await new Promise(resolve => browser.setTimeout(resolve, 0));
      if (!active) return;
      syncRoute();
      refreshForPublication({ revision, published, browser, blocked: blocked() });
    } catch { /* keep the last verified version on outage or expired session */ }
    finally { browser.clearTimeout(timeout); request = null; checking = false; }
  };
  const wake = () => { void check(); };
  const timer = browser.setInterval(wake, intervalMs);
  browser.addEventListener('focus', wake);
  doc.addEventListener('visibilitychange', wake);
  doc.addEventListener('input', edited, true); doc.addEventListener('change', edited, true);
  wake();
  return { check, stop: () => {
    active = false; request?.abort(); browser.clearInterval(timer);
    browser.removeEventListener('focus', wake); doc.removeEventListener('visibilitychange', wake);
    doc.removeEventListener('input', edited, true); doc.removeEventListener('change', edited, true);
    if (blockers.get(browser) === blocked) blockers.delete(browser);
  } };
}
