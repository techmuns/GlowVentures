import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Info } from 'lucide-react';

const GAP = 8, EDGE = 12;
const canPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

/**
 * Home's ⓘ: how a figure was worked out, in a popover. A click or tap pins it open;
 * a mouse hover shows it after a short delay. It sits in the top layer (the Popover
 * API), so a card's edge or the widget library's dialog never clips it, and it
 * stays in Home's DOM so it inherits Home's light and dark colours.
 */
export function Hint({ text, label = 'How this is calculated' }: { text: string; label?: string }) {
  const id = useId(), button = useRef<HTMLButtonElement>(null), pop = useRef<HTMLSpanElement | null>(null);
  const timer = useRef(0), pinned = useRef(false);
  const [open, setOpen] = useState(false);
  const place = () => {
    const b = button.current, el = pop.current;
    if (!b || !el) return;
    const r = b.getBoundingClientRect(), width = Math.min(320, window.innerWidth - EDGE * 2);
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - 24), window.innerWidth - EDGE - width);
    el.style.width = `${width}px`; el.style.left = `${left}px`; el.style.top = `${r.bottom + GAP}px`;
    const h = el.getBoundingClientRect().height, above = r.bottom + GAP + h > window.innerHeight - EDGE && r.top - GAP - h > EDGE;
    if (above) el.style.top = `${r.top - GAP - h}px`;
    el.style.transformOrigin = `${r.left + r.width / 2 - left}px ${above ? '100%' : '0'}`;
  };
  const show = (pin: boolean) => {
    window.clearTimeout(timer.current);
    pinned.current = pinned.current || pin;
    const el = pop.current;
    if (!el) return;
    if (canPopover) { if (!el.matches(':popover-open')) el.showPopover(); } else el.dataset.open = '';
    place(); setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(timer.current); pinned.current = false;
    const el = pop.current;
    if (el && canPopover && el.matches(':popover-open')) el.hidePopover();
    if (el) delete el.dataset.open;
    setOpen(false);
  };
  const later = (fn: () => void, ms: number) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(fn, ms); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { const t = e.target as Node; if (!button.current?.contains(t) && !pop.current?.contains(t)) hide(); };
    // Escape closes this popover first, not the dialog it may sit in.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); button.current?.focus(); } };
    const away = (e: Event) => { if (!pop.current?.contains(e.target as Node)) hide(); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', hide);
    };
  }, [open]);
  return <>
    <button type="button" ref={button} className="home-hint" aria-label={label} aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined}
      onClick={() => (open && pinned.current ? hide() : show(true))}
      onPointerEnter={e => { if (e.pointerType === 'mouse' && !open) later(() => show(false), 150); }}
      onPointerLeave={e => { if (e.pointerType === 'mouse' && !pinned.current) later(hide, 120); }}><Info size={13} /></button>
    <span ref={el => { pop.current = el; if (el && canPopover && !el.hasAttribute('popover')) el.setAttribute('popover', 'manual'); }}
      id={id} role="tooltip" className="home-hint-popover" data-home-hint-popover
      onPointerEnter={() => window.clearTimeout(timer.current)}
      onPointerLeave={e => { if (e.pointerType === 'mouse' && !pinned.current) later(hide, 120); }}>{text}</span>
  </>;
}

/** A summary tile: a label (with its ⓘ), one figure, an optional short note and link. */
export function Metric({ label, value, note, hint, link, attrs }: { label: string; value: ReactNode; note?: string; hint?: string; link?: { to: string; label: string; name?: string }; attrs?: Record<`data-${string}`, string | number> }) {
  return <div className="home-metric" {...attrs}><span>{label}{hint && <Hint text={hint} />}</span><strong>{value}</strong>{note && <small>{note}</small>}{link && <Link className="home-metric-link" to={link.to} aria-label={link.name}>{link.label}<ArrowUpRight size={12} /></Link>}</div>;
}
