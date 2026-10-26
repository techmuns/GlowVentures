import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Lock } from "lucide-react";
import { getDocument, GlobalWorkerOptions, PasswordResponses, Util, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PublishedFile } from "@/lib/statementPreview";
import { pdfSourceMatch, type PdfSourceTarget } from '@/lib/pdfSourceHighlight';

GlobalWorkerOptions.workerSrc = workerUrl;
const ASSETS = `${import.meta.env.BASE_URL}pdf-assets/`;
const CONTROL = "rounded-md border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-slate-200 disabled:opacity-40";

/** Draw the original bytes inside the app. Native PDF plugins are blocked by
 * Chrome when ANY ancestor is sandboxed, including the Muns dashboard frame. */
export default function PdfPreview({ url, file, title, initialPage, sourceTarget }: { url: string; file: PublishedFile; title: string; initialPage?: number; sourceTarget?: PdfSourceTarget }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<"loading" | "password" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const unlock = useRef<((password: string) => void) | null>(null);
  const [page, setPage] = useState(file.part?.from ?? 1);
  const [zoom, setZoom] = useState("fit");
  const [width, setWidth] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [highlightMissing, setHighlightMissing] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setStatus("loading"); setPdf(null); setError(""); setPassword("");
    const task = getDocument({ url, withCredentials: true,
      cMapUrl: `${ASSETS}cmaps/`, standardFontDataUrl: `${ASSETS}standard_fonts/`,
      wasmUrl: `${ASSETS}wasm/`, iccUrl: `${ASSETS}iccs/`, verbosity: 0 });
    task.onPassword = (update: (value: string) => void, reason: number) => {
      if (!alive) return;
      unlock.current = update;
      setPassword("");
      setError(reason === PasswordResponses.INCORRECT_PASSWORD ? "Incorrect password. Try again." : "");
      setStatus("password");
    };
    task.promise.then(doc => {
      if (!alive) return;
      unlock.current = null;
      setPdf(doc); setPage(Math.max(1, Math.min(file.part?.from ?? 1, doc.numPages)));
      setStatus("ready");
    }).catch(() => {
      if (!alive) return;
      setError("This PDF could not be opened. Download the original or switch to Text as read.");
      setStatus("error");
    });
    return () => { alive = false; unlock.current = null; void task.destroy().catch(() => {}); };
  }, [url, file.part?.from]);

  useEffect(() => {
    if (pdf && initialPage && initialPage >= 1 && initialPage <= pdf.numPages) setPage(initialPage);
  }, [pdf, initialPage]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [status]);

  useEffect(() => {
    if (!pdf || !width || !paper.current) return;
    let alive = true;
    let render: RenderTask | undefined;
    let scrollFrame = 0;
    const host = paper.current;
    const canvas = document.createElement("canvas");
    canvas.className = "mx-auto block bg-white shadow";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${title}, page ${page} of ${pdf.numPages}`);
    const surface = document.createElement('div');
    surface.className = 'relative mx-auto';
    surface.append(canvas); host.replaceChildren(surface);
    setDrawing(true); setRenderError("");
    setHighlightMissing(!!sourceTarget && !initialPage);
    void pdf.getPage(page).then(async source => {
      if (!alive) return;
      const size = source.getViewport({ scale: 1 });
      // Bound the backing canvas on large/zoomed pages, including Retina screens.
      const scale = zoom === "fit" ? Math.max(0.1, (width - 32) / size.width) : Number(zoom);
      const view = source.getViewport({ scale });
      const pixels = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (view.width * view.height)));
      canvas.width = Math.ceil(view.width * pixels); canvas.height = Math.ceil(view.height * pixels);
      canvas.style.width = `${view.width}px`; canvas.style.height = `${view.height}px`;
      surface.style.width = `${view.width}px`; surface.style.height = `${view.height}px`;
      render = source.render({ canvas, viewport: view, transform: [pixels, 0, 0, pixels, 0, 0] });
      await render.promise;
      if (!alive) return;
      canvas.dataset.pdfPage = String(page); setDrawing(false);
      if (sourceTarget && page === initialPage) {
        const text = await source.getTextContent().catch(() => null);
        if (!alive) return;
        if (!text) { setHighlightMissing(true); return; }
        const items = text.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number; height: number } => 'str' in item);
        const match = pdfSourceMatch(items, sourceTarget);
        setHighlightMissing(!match);
        if (match) {
          const { item, start, end } = match;
          const matrix = Util.transform(view.transform, item.transform);
          const height = Math.hypot(matrix[2], matrix[3]);
          // PDF.js combines some rows into one text run. Measure the prefix
          // proportionally, but never mark the entire row for a single number.
          const measure = document.createElement('canvas').getContext('2d')!;
          measure.font = `${height}px sans-serif`;
          const full = measure.measureText(item.str).width || 1;
          const left = measure.measureText(item.str.slice(0, start)).width / full;
          const fraction = measure.measureText(item.str.slice(start, end)).width / full;
          const marker = document.createElement('mark');
          marker.dataset.pdfSourceValue = sourceTarget.value;
          marker.dataset.pdfSourceField = sourceTarget.field ?? '';
          marker.setAttribute('aria-label', `Source value ${sourceTarget.value}`);
          Object.assign(marker.style, { position: 'absolute', pointerEvents: 'none',
            left: `${matrix[4] + item.width * scale * left - 2}px`, top: `${matrix[5] - height * 0.9 - 2}px`,
            width: `${item.width * scale * fraction + 4}px`, height: `${height * 1.15 + 4}px`,
            background: 'rgba(255, 230, 0, 0.6)', border: '1px solid #d9ac00', borderRadius: '2px', mixBlendMode: 'multiply' });
          surface.append(marker);
          scrollFrame = requestAnimationFrame(() => {
            const scroller = viewport.current;
            if (!alive || !scroller) return;
            const r = marker.getBoundingClientRect(), v = scroller.getBoundingClientRect();
            const ratio = v.height / scroller.clientHeight || 1;
            scroller.scrollTop += (r.top - v.top - (v.height - r.height) / 2) / ratio;
            scroller.scrollLeft += (r.left - v.left - (v.width - r.width) / 2) / ratio;
          });
        }
      }
    }).catch(() => {
      if (alive) { setRenderError("This page could not be displayed. Try another page or download the original."); setDrawing(false); }
    });
    return () => { alive = false; render?.cancel(); cancelAnimationFrame(scrollFrame); };
  }, [pdf, page, zoom, width, title, initialPage, sourceTarget?.value, sourceTarget?.isin, sourceTarget?.field, sourceTarget?.initialIsin]);

  return (
    <section aria-label="PDF preview" data-preview-pdf data-pdf-state={status}
      className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-800">
      {status === "password" ? (
        <form className="m-auto flex w-full max-w-sm flex-col gap-3 p-6" onSubmit={e => {
          e.preventDefault(); const submit = unlock.current; if (!submit) return;
          unlock.current = null; setStatus("loading"); setPassword(""); submit(password);
        }}>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-100"><Lock className="h-4 w-4" /> Enter PDF password</div>
          <label htmlFor="statement-pdf-password" className="text-xs text-slate-400">Statement password</label>
          <input id="statement-pdf-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="off" autoFocus className={CONTROL} />
          {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          <button type="submit" className="btn-primary">Open PDF</button>
        </form>
      ) : status === "error" ? <p role="alert" className="p-6 text-sm text-slate-300">{error}</p>
        : status === "loading" ? <div role="status" className="m-auto flex items-center gap-2 p-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Opening PDF…</div>
        : pdf && <>
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-3 py-2" role="toolbar" aria-label="PDF controls">
            <button type="button" className={CONTROL} aria-label="Previous PDF page" disabled={page <= 1} onClick={() => setPage(n => n - 1)}><ChevronLeft className="h-4 w-4" /></button>
            <label className="flex items-center gap-1 text-xs text-slate-300">Page
              <input aria-label="PDF page" type="number" min={1} max={pdf.numPages} value={page} className={`${CONTROL} w-16`}
                onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= pdf.numPages) setPage(n); }} />
              of {pdf.numPages}
            </label>
            <button type="button" className={CONTROL} aria-label="Next PDF page" disabled={page >= pdf.numPages} onClick={() => setPage(n => n + 1)}><ChevronRight className="h-4 w-4" /></button>
            <select aria-label="PDF zoom" className={`${CONTROL} ml-auto`} value={zoom} onChange={e => setZoom(e.target.value)}>
              <option value="fit">Fit width</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option>
            </select>
            {highlightMissing && <span role="status" className="text-xs text-slate-400">Exact number could not be uniquely highlighted in this statement.</span>}
          </div>
          <div ref={viewport} className="min-h-0 flex-1 overflow-auto p-4">
            {drawing && <p role="status" className="mb-2 text-xs text-slate-400">Loading page…</p>}
            {renderError && <p role="alert" className="mb-2 text-sm text-red-400">{renderError}</p>}
            <div ref={paper} />
          </div>
        </>}
    </section>
  );
}
