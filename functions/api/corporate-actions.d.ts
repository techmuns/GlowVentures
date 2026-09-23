export function readBoundedJson(response: Response): Promise<unknown>;
export function onRequestGet(context: {
  request: Request; waitUntil(promise: Promise<unknown>): void;
}): Promise<Response>;
