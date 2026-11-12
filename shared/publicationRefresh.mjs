// A book is compiled into the app. Load a new verified deployment as a whole;
// never replace positions while leaving the old capital/lot modules in memory.
const isRevision = value => typeof value === 'string' && /^[a-f0-9]{20}$/.test(value);
const blockers = new WeakMap();
export const publicationRefreshBlocked = (browser = globalThis.window) => !!(browser && blockers.get(browser)?.());

export function startPublicationRefresh({ revision, readerRevision, onAvailable = () => {}, onBlocked = () => {}, path = '/publication.json', browser = globalThis.window, intervalMs = 30_000 }) {
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
    if (target?.type !== 'file' && !target?.closest?.('[data-publication-transient="true"]')
      && (/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '') || target?.isContentEditable)) dirty = true;
    onBlocked(blocked());
  };
  const blocked = () => {
    syncRoute();
    const target = doc.activeElement;
    return dirty || doc.visibilityState === 'hidden' || (typeof doc.hasFocus === 'function' && !doc.hasFocus())
      || (target?.type !== 'file' && !target?.closest?.('[data-publication-transient="true"]')
        && (/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '') || !!target?.isContentEditable))
      || !!doc.querySelector('[data-publication-busy="true"], [data-publication-dirty="true"], [role="dialog"]');
  };
  blockers.set(browser, blocked);
  const readiness = () => { if (active) onBlocked(blocked()); };
  const check = async () => {
    syncRoute();
    if (active) onBlocked(blocked());
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
      // An older/incompatible statement processor can keep advertising a book
      // this app cannot read. Reloading cannot fix that and used to loop.
      if (published?.schemaVersion !== 1 || !isRevision(published.revision)
        || (readerRevision && published.readerRevision && published.readerRevision !== readerRevision)) return;
      onBlocked(blocked());
      if (published.revision !== revision) onAvailable(published);
    } catch { /* keep the last verified version on outage or expired session */ }
    finally { browser.clearTimeout(timeout); request = null; checking = false; }
  };
  const wake = () => { void check(); };
  const timer = browser.setInterval(wake, intervalMs);
  browser.addEventListener('focus', wake);
  browser.addEventListener('glow:statements-updated', wake);
  doc.addEventListener('visibilitychange', wake);
  doc.addEventListener('input', edited, true); doc.addEventListener('change', edited, true);
  doc.addEventListener('focusin', readiness, true); doc.addEventListener('focusout', readiness, true);
  wake();
  return { check, stop: () => {
    active = false; request?.abort(); browser.clearInterval(timer);
    browser.removeEventListener('focus', wake); browser.removeEventListener('glow:statements-updated', wake); doc.removeEventListener('visibilitychange', wake);
    doc.removeEventListener('input', edited, true); doc.removeEventListener('change', edited, true);
    doc.removeEventListener('focusin', readiness, true); doc.removeEventListener('focusout', readiness, true);
    if (blockers.get(browser) === blocked) blockers.delete(browser);
  } };
}
