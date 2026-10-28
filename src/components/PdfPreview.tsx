import { useNavigationState, useNavigationValue, numberNavigation } from "@/lib/useNavigationState";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Loader2, Lock } from "lucide-react";
import { getDocument, GlobalWorkerOptions, PasswordResponses, Util, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PublishedFile } from "@/lib/statementPreview";
import { pdfSourceMatch, type PdfSourceTarget } from '@/lib/pdfSourceHighlight';
import { cachedPdfBytes, pdfPageSizes, preparePdfPreview, rememberPdfBytes, rememberPdfSize, PdfCanvasCache, PdfRenderQueue } from '@/lib/pdfPreviewRuntime';
export { preparePdfPreview } from '@/lib/pdfPreviewRuntime';

GlobalWorkerOptions.workerSrc = workerUrl;
const ASSETS = `${import.meta.env.BASE_URL}pdf-assets/`;
const CONTROL = "rounded-md border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-slate-200 disabled:opacity-40";

/** Keep every page's place in the document, but only allocate canvases near the
 * viewport. Scrolling a long statement must not retain hundreds of bitmaps. */
const PdfPage = memo(function PdfPage({ pdf, number, center, width, height, availableWidth, zoom, title, viewport, target, onHighlightMissing, onSize, onPaint, queue, cache, current, restorePosition }: {
  pdf: PDFDocumentProxy; number: number; width: number; height: number; availableWidth: number; zoom: string; title: string;
  viewport: RefObject<HTMLDivElement>; target?: PdfSourceTarget;
  onHighlightMissing: (missing: boolean) => void; onSize: (number: number, width: number, height: number) => void;
  onPaint: () => void; queue: PdfRenderQueue; cache: PdfCanvasCache; current: RefObject<{ page: number; fraction: number }>;
  center: number; restorePosition: boolean;
}) {
  const paper = useRef<HTMLDivElement>(null);
  const focused = useRef("");
  const [nearby, setNearby] = useState(false);
  const [drawing, setDrawing] = useState(true);
  const [error, setError] = useState(false);
  const painted = useRef<{ key: string; canvas: HTMLCanvasElement }>();
  const markerRef = useRef<HTMLElement>();
  const matched = useRef('');
  const matchFound = useRef(false);

  useEffect(() => {
    // A busy main thread can deliver several entries for this page at once
    // (left the range, came back). Only the newest describes it now.
    const observer = new IntersectionObserver(entries => setNearby(entries[entries.length - 1].isIntersecting), {
      root: viewport.current, rootMargin: "100% 0px",
    });
    observer.observe(paper.current!);
    return () => observer.disconnect();
  }, [viewport]);

  useEffect(() => {
    if (!nearby || !availableWidth || !center || Math.abs(number - center) > 1) return;
    const key = JSON.stringify([availableWidth, zoom, target]);
    if (painted.current?.key === key && painted.current.canvas.parentElement === paper.current
      && (!target || (matched.current === key && (!matchFound.current || markerRef.current?.isConnected)))) {
      cache.touch(number);
      return;
    }
    let alive = true;
    let render: RenderTask | undefined;
    let scrollFrame = 0;
    const abort = new AbortController();
    const host = paper.current!;
    // Do not leave an old source marker at stale coordinates during zoom.
    markerRef.current?.remove();
    const canvas = document.createElement("canvas");
    canvas.className = "block bg-white";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${title}, page ${number} of ${pdf.numPages}`);
    setDrawing(!painted.current?.canvas.isConnected); setError(false);
    void (async () => {
      const source = await pdf.getPage(number);
      if (!alive) return;
      const size = source.getViewport({ scale: 1 });
      onSize(number, size.width, size.height);
      const scale = zoom === 'fit' ? Math.max(0.1, (availableWidth - 32) / size.width) : Number(zoom);
      const view = source.getViewport({ scale });
      // Keep the old bitmap visible while zooming; replace it atomically once
      // the new canvas is fully painted, rather than flashing an empty page.
      if (painted.current?.canvas.isConnected) {
        painted.current.canvas.style.width = `${view.width}px`;
        painted.current.canvas.style.height = `${view.height}px`;
      }
      const pixels = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (view.width * view.height)));
      canvas.width = Math.ceil(view.width * pixels); canvas.height = Math.ceil(view.height * pixels);
      canvas.style.width = `${view.width}px`; canvas.style.height = `${view.height}px`;
      await queue.run(async () => {
        if (!alive) return;
        render = source.render({ canvas, viewport: view, transform: [pixels, 0, 0, pixels, 0, 0] });
        // PDF.js already yields drawing chunks with requestAnimationFrame.
        await render.promise;
      }, () => Math.abs(number - (current.current?.page ?? number)), abort.signal);
      if (!alive) return;
      markerRef.current?.remove();
      if (!cache.keep(number, canvas, current.current?.page ?? number)) return;
      canvas.dataset.pdfPage = String(number);
      host.append(canvas);
      painted.current = { key, canvas };
      setDrawing(false); onPaint();
      if (!target) return;
      const text = await source.getTextContent().catch(() => null);
      if (!alive) return;
      matched.current = key;
      if (!text) { onHighlightMissing(true); return; }
      const items = text.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number; height: number } => 'str' in item);
      const match = pdfSourceMatch(items, target);
      matchFound.current = !!match;
      onHighlightMissing(!match);
      if (!match) return;
      const { item, start, end } = match;
      const matrix = Util.transform(view.transform, item.transform);
      const height = Math.hypot(matrix[2], matrix[3]);
      // A text run can span a row; mark only the matched number within it.
      const measure = document.createElement('canvas').getContext('2d')!;
      measure.font = `${height}px sans-serif`;
      const full = measure.measureText(item.str).width || 1;
      const left = measure.measureText(item.str.slice(0, start)).width / full;
      const fraction = measure.measureText(item.str.slice(start, end)).width / full;
      const marker = document.createElement('mark');
      marker.dataset.pdfSourceValue = target.value;
      marker.dataset.pdfSourceField = target.field ?? '';
      marker.setAttribute('aria-label', `Source value ${target.value}`);
      Object.assign(marker.style, { position: 'absolute', pointerEvents: 'none',
        left: `${matrix[4] + item.width * scale * left - 2}px`, top: `${matrix[5] - height * 0.9 - 2}px`,
        width: `${item.width * scale * fraction + 4}px`, height: `${height * 1.15 + 4}px`,
        background: 'rgba(255, 230, 0, 0.6)', border: '1px solid #d9ac00', borderRadius: '2px', mixBlendMode: 'multiply' });
      host.append(marker);
      markerRef.current = marker;
      const focusKey = JSON.stringify([scale, target]);
      // Returning to a highlighted page by scrolling should not pull the user
      // back to its number. Recenter only on a new citation or zoom level.
      if (restorePosition || focused.current === focusKey) return;
      scrollFrame = requestAnimationFrame(() => {
        const scroller = viewport.current;
        if (!alive || !scroller || !marker) return;
        focused.current = focusKey;
        if (host.offsetTop >= scroller.scrollTop + scroller.clientHeight || host.offsetTop + host.offsetHeight <= scroller.scrollTop) return;
        const r = marker.getBoundingClientRect(), v = scroller.getBoundingClientRect();
        const ratio = v.height / scroller.clientHeight || 1;
        scroller.scrollTop += (r.top - v.top - (v.height - r.height) / 2) / ratio;
        scroller.scrollLeft += (r.left - v.left - (v.width - r.width) / 2) / ratio;
      });
    })().catch(() => { if (alive) { setError(true); setDrawing(false); } });
    return () => {
      alive = false; abort.abort(); render?.cancel(); cancelAnimationFrame(scrollFrame);
      if (canvas.parentElement !== host) { canvas.width = 0; canvas.height = 0; }
    };
  }, [nearby, pdf, number, center, availableWidth, zoom, title, viewport, target?.value, target?.isin, target?.field, target?.initialIsin, onHighlightMissing, onSize, onPaint, queue, cache, current, restorePosition]);

  return <div ref={paper} data-pdf-paper={number} className="relative mx-auto bg-white shadow"
    style={{ width, height, contain: 'layout paint' }}>
    {error ? <p role="alert" className="absolute left-3 top-3 text-sm text-red-700">Page {number} could not be displayed. Download the original to view it.</p>
      : nearby && drawing && <p role="status" className="absolute left-3 top-3 text-xs text-slate-600">Loading page {number}…</p>}
  </div>;
});

/** Draw the original bytes inside the app. Native PDF plugins are blocked by
 * Chrome when ANY ancestor is sandboxed, including the Muns dashboard frame. */
export default function PdfPreview({ url, file, title, initialPage, sourceTarget }: { url: string; file: PublishedFile; title: string; initialPage?: number; sourceTarget?: PdfSourceTarget }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<"loading" | "password" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const unlock = useRef<((password: string) => void) | null>(null);
  const [page, setPage, restored] = useNavigationValue(`pdf-page:${url}`, initialPage ?? file.part?.from ?? 1, numberNavigation);
  const [zoom, setZoom] = useNavigationState<string>(`pdf-zoom:${url}`, "fit", ["fit", "1", "1.5", "2"]);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState<{ width: number; height: number }[]>([]);
  const [highlightMissing, setHighlightMissing] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const anchor = useRef({ page, fraction: 0 });
  const scrollFrame = useRef(0);
  const viewportHeight = useRef(0);
  const requestedPage = useRef(initialPage ?? file.part?.from ?? 1);
  requestedPage.current = restored ? page : initialPage ?? file.part?.from ?? 1;
  const cache = useMemo(() => new PdfCanvasCache(), [pdf]);
  const queue = useMemo(() => new PdfRenderQueue(), [pdf]);
  const layout = useMemo(() => {
    let top = 16;
    return pages.map(size => {
      const scale = zoom === 'fit' ? Math.max(0.1, (width - 32) / size.width) : Number(zoom);
      const item = { top, width: size.width * scale, height: size.height * scale };
      top += item.height + 16;
      return item;
    });
  }, [pages, width, zoom]);
  const onSize = useCallback((number: number, width: number, height: number) => {
    rememberPdfSize(url, number, width, height);
    setPages(previous => {
      const old = previous[number - 1];
      if (!old || (old.width === width && old.height === height)) return previous;
      const next = previous.slice(); next[number - 1] = { width, height }; return next;
    });
  }, [url]);
  const onPaint = useCallback(() => {
    if (pdf) void rememberPdfBytes(url, pdf, file.bytes);
  }, [pdf, url, file.bytes]);
  useEffect(() => () => cache.clear(), [cache]);

  const jumpToPage = (number: number) => {
    const scroller = viewport.current;
    const paper = layout[number - 1];
    if (!scroller || !paper) return;
    anchor.current = { page: number, fraction: 0 };
    scroller.scrollTop = paper.top - 16;
    cache.trim(number); queue.wake(); setPage(number);
  };

  useEffect(() => {
    let alive = true;
    setStatus("loading"); setPdf(null); setPages([]); setError(""); setPassword("");
    const data = cachedPdfBytes(url);
    const task = getDocument({ ...(data ? { data } : { url }), worker: preparePdfPreview(), withCredentials: true,
      cMapUrl: `${ASSETS}cmaps/`, standardFontDataUrl: `${ASSETS}standard_fonts/`,
      wasmUrl: `${ASSETS}wasm/`, iccUrl: `${ASSETS}iccs/`, verbosity: 0 });
    task.onPassword = (update: (value: string) => void, reason: number) => {
      if (!alive) return;
      unlock.current = update;
      setPassword("");
      setError(reason === PasswordResponses.INCORRECT_PASSWORD ? "Incorrect password. Try again." : "");
      setStatus("password");
    };
    task.promise.then(async doc => {
      // Paint the requested page immediately. Distant pages use lightweight
      // size placeholders and resolve their actual dimensions only nearby.
      const first = await doc.getPage(Math.max(1, Math.min(requestedPage.current, doc.numPages)));
      const size = first.getViewport({ scale: 1 });
      if (!alive) return;
      unlock.current = null;
      const known = pdfPageSizes(url, { width: size.width, height: size.height });
      setPdf(doc); setPages(Array.from({ length: doc.numPages }, (_, index) => known.pages.get(index + 1) ?? known.fallback));
      setPage(current => Math.max(1, Math.min(current, doc.numPages)));
      setStatus("ready");
    }).catch(() => {
      if (!alive) return;
      setError("This PDF could not be opened. Download the original or switch to Text as read.");
      setStatus("error");
    });
    return () => { alive = false; unlock.current = null; void task.destroy().catch(() => {}); };
  }, [url, file.part?.from]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => { viewportHeight.current = element.clientHeight; setWidth(element.clientWidth); };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [status]);

  useLayoutEffect(() => {
    if (!pdf || !width) return;
    cancelAnimationFrame(scrollFrame.current);
    const scroller = viewport.current!;
    const saved = anchor.current;
    const paper = layout[saved.page - 1];
    if (paper) scroller.scrollTop = paper.top - 16 + saved.fraction * paper.height;
  }, [pdf, layout, width]);

  useLayoutEffect(() => {
    if (restored || !pdf || !width) return;
    jumpToPage(Math.max(1, Math.min(initialPage ?? file.part?.from ?? 1, pdf.numPages)));
    // Width changes preserve the reading position via the anchor above.
  }, [pdf, !!width, initialPage, file.part?.from, restored, sourceTarget?.value, sourceTarget?.isin]);

  useEffect(() => {
    setHighlightMissing(!!sourceTarget && !initialPage);
  }, [initialPage, sourceTarget?.value, sourceTarget?.isin, sourceTarget?.field, sourceTarget?.initialIsin]);

  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);

  const trackPage = () => {
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      const scroller = viewport.current;
      if (!scroller) return;
      const top = scroller.scrollTop, bottom = top + viewportHeight.current;
      // Binary search cached geometry; no per-frame DOM scan or layout reads.
      let low = 0, high = layout.length - 1;
      while (low < high) {
        const mid = (low + high + 1) >>> 1;
        if (layout[mid].top <= top) low = mid; else high = mid - 1;
      }
      let index = low, largest = -1;
      for (let i = low; i < layout.length && layout[i].top < bottom; i++) {
        const paper = layout[i];
        const visible = Math.min(paper.top + paper.height, bottom) - Math.max(paper.top, top);
        if (visible > largest) { index = i; largest = visible; }
      }
      const paper = layout[index];
      if (!paper) return;
      const number = index + 1;
      const changed = number !== anchor.current.page;
      anchor.current = { page: number, fraction: (top - paper.top + 16) / paper.height };
      if (changed) { cache.trim(number); queue.wake(); setPage(number); }
    });
  };

  return (
    <section aria-label="PDF preview" data-preview-pdf data-pdf-state={status} data-navigation-pending={status === "loading" || !pdf || !width ? "" : undefined}
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
            <button type="button" className={CONTROL} aria-label="Previous PDF page" disabled={page <= 1} onClick={() => jumpToPage(page - 1)}><ChevronLeft className="h-4 w-4" /></button>
            <label className="flex items-center gap-1 text-xs text-slate-300">Page
              <input aria-label="PDF page" type="number" min={1} max={pdf.numPages} value={page} className={`${CONTROL} w-16`}
                onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= pdf.numPages) jumpToPage(n); }} />
              of {pdf.numPages}
            </label>
            <button type="button" className={CONTROL} aria-label="Next PDF page" disabled={page >= pdf.numPages} onClick={() => jumpToPage(page + 1)}><ChevronRight className="h-4 w-4" /></button>
            <select aria-label="PDF zoom" className={`${CONTROL} ml-auto`} value={zoom} onChange={e => setZoom(e.target.value)}>
              <option value="fit">Fit width</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option>
            </select>
            {highlightMissing && <span role="status" className="text-xs text-slate-400">Exact number could not be uniquely highlighted in this statement.</span>}
          </div>
          <div ref={viewport} data-pdf-scroll data-navigation-scroll="pdfpreview-1" onScroll={trackPage} tabIndex={0} aria-label="PDF document pages"
            className="relative min-h-0 flex-1 overflow-auto p-4" style={{ overflowAnchor: "none" }}>
            <div className="grid w-max min-w-full gap-4">
              {layout.map((paper, index) => <PdfPage key={index} pdf={pdf} number={index + 1}
                center={Math.abs(index + 1 - page) <= 2 ? page : 0}
                width={paper.width} height={paper.height} availableWidth={width} zoom={zoom}
                title={title} viewport={viewport} target={index + 1 === initialPage ? sourceTarget : undefined}
                onHighlightMissing={setHighlightMissing} onSize={onSize} onPaint={onPaint}
                queue={queue} cache={cache} current={anchor} restorePosition={restored} />)}
            </div>
          </div>
        </>}
    </section>
  );
}
