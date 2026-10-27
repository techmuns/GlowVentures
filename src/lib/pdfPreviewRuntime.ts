import { PDFWorker, type PDFDocumentProxy } from 'pdfjs-dist';

let worker: PDFWorker | undefined;
export function preparePdfPreview() {
  if (!worker || worker.destroyed) {
    const started = new PDFWorker({ verbosity: 0 });
    worker = started;
    void started.promise.catch(() => { if (worker === started) worker = undefined; started.destroy(); });
  }
  return worker;
}

// Short-lived, bounded RAM only. PDF.js transfers input buffers to its worker,
// so pass a copy and retain neither passwords nor anything in browser storage.
const bytes = new Map<string, { data: Uint8Array; saved: number }>();
const remembering = new Set<string>();
const MAX_BYTES = 16 * 1024 * 1024;
export function cachedPdfBytes(url: string) {
  for (const [key, item] of bytes) if (Date.now() - item.saved > 60_000) bytes.delete(key);
  const item = bytes.get(url);
  if (!item) return undefined;
  bytes.delete(url); bytes.set(url, item);
  return item.data.slice();
}

export async function rememberPdfBytes(url: string, pdf: PDFDocumentProxy, size: number) {
  if (size > MAX_BYTES / 2 || bytes.has(url) || remembering.has(url)) return;
  remembering.add(url);
  const data = await pdf.getData().catch(() => null).finally(() => remembering.delete(url));
  if (!data || data.byteLength > MAX_BYTES / 2 || pdf.loadingTask.destroyed) return;
  bytes.set(url, { data, saved: Date.now() });
  let total = [...bytes.values()].reduce((sum, item) => sum + item.data.byteLength, 0);
  for (const [key, item] of bytes) {
    if (total <= MAX_BYTES) break;
    bytes.delete(key); total -= item.data.byteLength;
  }
}

/** Serialize canvas painting: foreground pages run first, prefetch waits for
 * idle time. A page's own PDF.js continuation yields between drawing chunks. */
export class PdfRenderQueue {
  private jobs: { run: () => Promise<void>; priority: () => number; resolve: () => void; reject: (error: unknown) => void; signal: AbortSignal }[] = [];
  private running = false;
  private scheduled = false;
  run(run: () => Promise<void>, priority: () => number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      this.jobs.push({ run, priority, signal, resolve, reject });
      this.wake();
    });
  }
  wake() {
    if (this.running || this.scheduled || !this.jobs.length) return;
    this.scheduled = true;
    const start = () => {
      this.scheduled = false;
      this.jobs.sort((a, b) => a.priority() - b.priority());
      const job = this.jobs.shift();
      if (!job) return;
      if (job.signal.aborted) { job.resolve(); this.wake(); return; }
      this.running = true;
      void job.run().then(job.resolve, job.reject).finally(() => { this.running = false; this.wake(); });
    };
    if (this.jobs.some(job => !job.signal.aborted && job.priority() === 0)) queueMicrotask(start);
    else if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 100 });
    else setTimeout(start, 32);
  }
}

/** Retain nearby painted pages for reverse scrolling, under a fixed pixel
 * budget. Evict immediately on a distant jump; canvas count stays bounded. */
export class PdfCanvasCache {
  private entries = new Map<number, HTMLCanvasElement>();
  touch(page: number) {
    const canvas = this.entries.get(page);
    if (canvas) { this.entries.delete(page); this.entries.set(page, canvas); }
  }
  keep(page: number, canvas: HTMLCanvasElement, center: number) {
    this.drop(page);
    this.entries.set(page, canvas);
    this.trim(center);
  }
  drop(page: number) {
    const canvas = this.entries.get(page);
    if (canvas) {
      canvas.parentElement?.querySelector('mark[data-pdf-source-value]')?.remove();
      canvas.remove(); canvas.width = 0; canvas.height = 0; this.entries.delete(page);
    }
  }
  trim(center: number) {
    for (const page of this.entries.keys()) if (Math.abs(page - center) > 2) this.drop(page);
    let pixels = [...this.entries.values()].reduce((sum, canvas) => sum + canvas.width * canvas.height, 0);
    for (const [page, canvas] of this.entries) {
      if (this.entries.size <= 4 && pixels <= 16_000_000) break;
      if (page === center) continue;
      pixels -= canvas.width * canvas.height;
      this.drop(page);
    }
  }
  clear() { for (const page of this.entries.keys()) this.drop(page); }
}
