import { route } from "./network";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DEFAULT_TOKEN = "test-turnstile-token";

export type Verification = { secret: string; response: string; remoteip: string | null };

/**
 * Stands in for Cloudflare Turnstile. A token verifies only once a test has accepted it, and
 * every siteverify request is recorded so a test can assert on what was sent.
 * `test/setup-env.ts` resets it before each test.
 */
class FakeTurnstile {
  readonly verifications: Verification[] = [];
  private accepted = new Set<string>();
  private failures: ("http" | "network")[] = [];

  /** Makes `token` verify as human, and returns it. */
  accept(token = DEFAULT_TOKEN): string {
    this.accepted.add(token);
    return token;
  }

  /**
   * Does what Cloudflare's widget script does once a visitor passes: puts an accepted token
   * in a hidden input inside the rendered `.cf-turnstile` element.
   */
  solve(container: ParentNode = document): string {
    const widget = container.querySelector(".cf-turnstile");
    if (!widget) throw new Error("no Turnstile widget is rendered");
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "cf-turnstile-response";
    input.value = this.accept();
    widget.append(input);
    return input.value;
  }

  /** The next siteverify call answers with a server error, or with `network` fails to connect. */
  failNext(kind: "http" | "network" = "http"): void {
    this.failures.push(kind);
  }

  reset(): void {
    this.verifications.length = 0;
    this.accepted.clear();
    this.failures = [];
  }

  async handle(request: Request): Promise<Response> {
    const form = await request.formData();
    const response = String(form.get("response"));
    this.verifications.push({
      secret: String(form.get("secret")),
      response,
      remoteip: form.has("remoteip") ? String(form.get("remoteip")) : null,
    });
    const failure = this.failures.shift();
    if (failure === "network") throw new TypeError("fetch failed");
    if (failure === "http") return new Response("Internal error", { status: 500 });
    return Response.json({ success: this.accepted.has(response) });
  }
}

export const turnstile = new FakeTurnstile();
route(SITEVERIFY_URL, (request) => turnstile.handle(request));
