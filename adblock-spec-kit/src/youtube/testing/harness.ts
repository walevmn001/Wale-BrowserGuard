/**
 * Dependency-free test helpers for the YouTube engine suites.
 *
 * These stand-ins let the world-aware `main/` hooks be driven in Node without a
 * browser: a fake window with `fetch`/`XMLHttpRequest` stand-ins and a scratch
 * space, a real `Response` builder (Node 20 has a global `Response`), and a
 * `Headers` helper. Nothing here imports a test framework or the engine.
 */

export interface ResponseOptions {
  readonly status?: number;
  readonly statusText?: string;
  readonly headers?: HeadersInit;
  readonly url?: string;
}

/** Builds a real `Response`, optionally giving it a non-empty `url`. */
export function makeResponse(text: string, init: ResponseOptions = {}): Response {
  const { url, ...rest } = init;
  const response = new Response(text, rest);
  if (typeof url === 'string') {
    try {
      Object.defineProperty(response, 'url', { value: url, configurable: true });
    } catch {
      // ignore: the response is still usable without a url.
    }
  }
  return response;
}

export function makeHeaders(init?: HeadersInit): Headers {
  return new Headers(init);
}

export interface FakeXhrInstance {
  open(...args: unknown[]): void;
  send(body?: unknown): void;
  responseText: string;
  response: unknown;
  responseType: string;
  status: number;
  readyState: number;
  addEventListener(type: string, cb: () => void): void;
}

/** A deterministic XHR stand-in whose events are dispatched by the test. */
export class FakeXhr implements FakeXhrInstance {
  openArgs: unknown[] = [];
  sentBody: unknown = undefined;
  responseText = '';
  response: unknown = '';
  responseType = '';
  status = 0;
  readyState = 0;
  private readonly listeners = new Map<string, Array<() => void>>();

  open(...args: unknown[]): void {
    this.openArgs = args;
  }

  send(body?: unknown): void {
    this.sentBody = body;
  }

  addEventListener(type: string, cb: () => void): void {
    const list = this.listeners.get(type);
    if (list === undefined) {
      this.listeners.set(type, [cb]);
    } else {
      list.push(cb);
    }
  }

  /** Fires every listener registered for `type`, in registration order. */
  dispatch(type: string): void {
    const list = this.listeners.get(type);
    if (list === undefined) {
      return;
    }
    for (const cb of list) {
      cb();
    }
  }
}

export interface FakeWindow {
  fetch: (input: unknown, init?: unknown) => Promise<Response>;
  XMLHttpRequest: new () => FakeXhr;
  /** Free scratch space for guard keys set by the engine under test. */
  readonly scratch: Record<string, unknown>;
}

/** A minimal fake window with `fetch`/`XMLHttpRequest` stand-ins. */
export function makeFakeWindow(): FakeWindow {
  return {
    fetch: async (): Promise<Response> => new Response('', { status: 200 }),
    XMLHttpRequest: FakeXhr,
    scratch: {},
  };
}
