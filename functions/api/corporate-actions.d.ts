export function readBoundedJson(response: Response): Promise<unknown>;
export function onRequestGet(context: {
  request: Request; waitUntil(promise: Promise<unknown>): void;
  env?: { ASSETS: { fetch(request: Request): Promise<Response> } };
}): Promise<Response>;
