/**
 * The app reaches the outside world (Turnstile, Brevo, Slack, GitHub) through the global
 * `fetch`, so that is the seam: `test/setup-env.ts` replaces it with `fakeFetch`. A request to
 * the app's own origin goes to the real route handler (`test/app-fetch.ts`); a request to a
 * service goes to the fake registered for its URL with `route` (or, for a REST API with many
 * paths, for its whole origin with `routeOrigin`); anything else throws, so no test can reach
 * a real service by accident.
 */
import { appFetch, APP_ORIGIN } from "../app-fetch";

type Handler = (request: Request) => Response | Promise<Response>;

const routes = new Map<string, Handler>();
const origins = new Map<string, Handler>();

/** Sends every request for `url` (origin and path, any query string) to `handler`. */
export function route(url: string, handler: Handler): void {
  const { origin, pathname } = new URL(url);
  routes.set(origin + pathname, handler);
}

/** Sends every request to `origin`, whatever its path, to `handler`. */
export function routeOrigin(origin: string, handler: Handler): void {
  origins.set(new URL(origin).origin, handler);
}

export async function fakeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    input instanceof Request ? new URL(input.url) : new URL(String(input), APP_ORIGIN);
  const request = new Request(input instanceof Request ? input : url, init);
  if (url.origin === APP_ORIGIN) return appFetch(request);
  const handler = routes.get(url.origin + url.pathname) ?? origins.get(url.origin);
  if (!handler) {
    throw new Error(
      `A test tried to reach ${request.method} ${url.origin}${url.pathname}, which has no ` +
        "fake. Add one in test/fakes/.",
    );
  }
  return handler(request);
}
