import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { Location } from 'react-router-dom';
import { navigationMemory } from './navigationMemory';
import { isTableExporting } from './tableExportSnapshot';

type Point = { id: string; top: number; left: number };
const parse = (raw: unknown): Point[] | null => Array.isArray(raw) && raw.every(p => p && typeof p.id === 'string'
  && Number.isFinite(p.top) && p.top >= 0 && Number.isFinite(p.left) && p.left >= 0) ? raw : null;

/** Restore after lazy content arrives; source overlays keep their origin's entry. */
export function useNavigationScroll(mainRef: RefObject<HTMLElement>, location: Location) {
  const previousPath = useRef<string>();
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const entry = location.key;
    const saved = navigationMemory.read(entry, '@scroll', parse);
    const ports = () => new Map<string, HTMLElement>([
      ['main', main],
      ...Array.from(main.querySelectorAll<HTMLElement>('[data-navigation-scroll]')).map(el => [el.dataset.navigationScroll!, el] as [string, HTMLElement]),
    ]);
    const snapshot = () => [...ports()].map(([id, el]) => ({ id, top: el.scrollTop, left: el.scrollLeft }));
    if (!saved && previousPath.current !== location.pathname) main.scrollTop = 0;
    previousPath.current = location.pathname;
    let latest = saved ?? snapshot(), restoring = !!saved, frame = 0;
    const save = () => {
      if (restoring || isTableExporting()) return;
      latest = snapshot(); navigationMemory.write(entry, '@scroll', latest);
    };
    const stop = () => { restoring = false; observer.disconnect(); resize.disconnect(); };
    const restore = () => {
      if (!restoring || isTableExporting()) return;
      const current = ports();
      let complete = true;
      for (const point of latest) {
        const el = current.get(point.id);
        if (!el) { complete = false; continue; }
        el.scrollTop = point.top; el.scrollLeft = point.left;
        if (Math.abs(el.scrollTop - point.top) > 1 || Math.abs(el.scrollLeft - point.left) > 1) complete = false;
      }
      if (complete) stop();
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); };
    const observer = new MutationObserver(schedule), resize = new ResizeObserver(schedule);
    if (restoring) { observer.observe(main, { childList: true, subtree: true }); resize.observe(main); schedule(); }
    // A reader's input takes precedence over an unfinished asynchronous restore.
    const interact = () => { if (restoring) stop(); save(); };
    main.addEventListener('scroll', save, true);
    main.addEventListener('pointerdown', interact, true);
    main.addEventListener('wheel', interact, { passive: true, capture: true });
    main.addEventListener('touchstart', interact, { passive: true, capture: true });
    main.addEventListener('keydown', interact, true);
    return () => {
      // The DOM may already contain the next page. Persist the last captured
      // positions rather than reading that page into the outgoing entry.
      navigationMemory.write(entry, '@scroll', latest);
      stop(); cancelAnimationFrame(frame);
      main.removeEventListener('scroll', save, true);
      main.removeEventListener('pointerdown', interact, true);
      main.removeEventListener('wheel', interact, true);
      main.removeEventListener('touchstart', interact, true);
      main.removeEventListener('keydown', interact, true);
    };
  }, [location.key, location.pathname, mainRef]);
}
