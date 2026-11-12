import { INDEXNOW_ENDPOINT } from "@/lib/indexnow";
import { route } from "./network";

/** What a test sets `INDEXNOW_KEY` to, so the app's pings go out (on a production deploy). */
export const INDEXNOW_KEY = "test-indexnow-key-0123456789";

export type IndexNowPing = { host: string; key: string; keyLocation: string; urlList: string[] };

/**
 * Stands in for the IndexNow endpoint. Every ping is recorded so a test can assert on the URLs
 * the engines would have been told about. `test/setup-env.ts` resets it before each test.
 */
class FakeIndexNow {
  readonly pings: IndexNowPing[] = [];
  private failures: ("http" | "network")[] = [];

  /** Every URL pinged so far, in order. */
  urls(): string[] {
    return this.pings.flatMap((ping) => ping.urlList);
  }

  /** The next ping answers with a server error, or with `network` fails to connect. */
  failNext(kind: "http" | "network" = "http"): void {
    this.failures.push(kind);
  }

  reset(): void {
    this.pings.length = 0;
    this.failures = [];
  }

  async handle(request: Request): Promise<Response> {
    this.pings.push((await request.json()) as IndexNowPing);
    const failure = this.failures.shift();
    if (failure === "network") throw new TypeError("fetch failed");
    if (failure === "http") return new Response("Unprocessable", { status: 422 });
    return new Response(null, { status: 202 });
  }
}

export const indexNow = new FakeIndexNow();
route(INDEXNOW_ENDPOINT, (request) => indexNow.handle(request));
