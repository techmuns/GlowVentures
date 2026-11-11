import { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';

/** Long source coverage belongs in a readable dialog, not a screen reader's icon label. */
export function HomeReturnCoverage({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return <><button type="button" className="home-hint" aria-label="Return calculation and coverage" title="Return calculation and coverage" onClick={() => setOpen(true)}><Info size={13} /></button>
    <dialog ref={dialog} className="home-widget-dialog home-coverage-dialog" aria-label="Return calculation and coverage" onCancel={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      {open && <div className="home-widget-dialog-content"><div className="home-widget-dialog-heading"><div><span className="home-eyebrow">THE RECORDS BEHIND THE RETURN</span><h2>Calculation & coverage</h2></div><button type="button" className="home-widget-close" aria-label="Close return coverage" onClick={() => setOpen(false)}><X size={18} /></button></div><div className="home-coverage-text">{text}</div></div>}
    </dialog></>;
}
