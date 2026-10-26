import { useEffect, useRef, type RefObject } from 'react';

/** Loading and failed source dialogs need the same keyboard treatment as the
 * loaded statement, including when the archive never responds. */
export function usePreviewDialog(onClose: () => void, dialog: RefObject<HTMLElement>, initial: RefObject<HTMLElement>) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    initial.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return; }
      if (e.key !== 'Tab') return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) return;
      if (e.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); opener?.focus?.({ preventScroll: true }); };
  }, [dialog, initial]);
}
