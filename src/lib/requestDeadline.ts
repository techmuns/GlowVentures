/** AbortController works on older supported browsers that lack timeout/any.
 * Dispose after reading the response body to release the timer and listener.
 */
export function requestDeadline(ms: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), ms);
  if (parent?.aborted) cancel();
  else parent?.addEventListener("abort", cancel, { once: true });
  return { signal: controller.signal, dispose() {
    clearTimeout(timer);
    parent?.removeEventListener("abort", cancel);
  } };
}
