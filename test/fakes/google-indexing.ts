import { generateKeyPairSync, verify } from "node:crypto";
import { GOOGLE_TOKEN_ENDPOINT, INDEXING_PUBLISH_ENDPOINT, INDEXING_SCOPE, type IndexingNotificationType } from "@/lib/google-indexing";
import { route } from "./network";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SERVICE_ACCOUNT_EMAIL = "indexing@test-project.iam.gserviceaccount.com";

/**
 * What a test sets `GOOGLE_INDEXING_SERVICE_ACCOUNT` to, so the app's notifications go out (on
 * a production deploy): a service account key file in Google's format, with a key made for
 * this run, which the fake checks every assertion against.
 */
export const GOOGLE_INDEXING_SERVICE_ACCOUNT = JSON.stringify({
  type: "service_account",
  client_email: SERVICE_ACCOUNT_EMAIL,
  private_key: keys.privateKey.export({ type: "pkcs8", format: "pem" }),
});

/** How long the fake's access tokens last, as Google's do. */
export const TOKEN_LIFETIME_S = 3600;

export type IndexingPublish = { url: string; type: IndexingNotificationType };

type Failure = "http" | "network";

const decode = (part: string): Record<string, unknown> => JSON.parse(Buffer.from(part, "base64url").toString());

/**
 * What Google checks of a service account's assertion: an RS256 JWT signed with the account's
 * key, issued by it, for the token endpoint and the indexing scope, and not expired.
 */
function validAssertion(assertion: string): boolean {
  const [header, claims, signature] = assertion.split(".");
  if (!header || !claims || !signature) return false;
  if (!verify("sha256", Buffer.from(`${header}.${claims}`), keys.publicKey, Buffer.from(signature, "base64url"))) return false;
  const { alg } = decode(header);
  const { iss, aud, scope, exp } = decode(claims);
  return (
    alg === "RS256" &&
    iss === SERVICE_ACCOUNT_EMAIL &&
    aud === GOOGLE_TOKEN_ENDPOINT &&
    scope === INDEXING_SCOPE &&
    typeof exp === "number" &&
    exp * 1000 > Date.now()
  );
}

/**
 * Stands in for Google's OAuth token endpoint (for a service account's JWT) and the Indexing
 * API's publish endpoint. The token endpoint verifies the assertion's signature, issuer,
 * audience and scope; the publish endpoint takes only a token it issued that has not expired.
 * Every accepted notification is recorded so a test can assert on what Google would have been
 * told. `test/setup-env.ts` resets it before each test.
 */
class FakeGoogleIndexing {
  readonly notifications: IndexingPublish[] = [];
  /** How many access tokens have been issued. */
  tokensIssued = 0;
  private tokens = new Map<string, number>();
  private tokenFailures: (Failure | "malformed")[] = [];
  private publishFailures: Failure[] = [];

  /**
   * The next token request answers with an error, with `network` fails to connect, or with
   * `malformed` answers 200 without a token.
   */
  failNextToken(kind: Failure | "malformed" = "http"): void {
    this.tokenFailures.push(kind);
  }

  /** The next publish request answers with an error, or with `network` fails to connect. */
  failNextPublish(kind: Failure = "http"): void {
    this.publishFailures.push(kind);
  }

  reset(): void {
    this.notifications.length = 0;
    this.tokensIssued = 0;
    this.tokens.clear();
    this.tokenFailures = [];
    this.publishFailures = [];
  }

  async token(request: Request): Promise<Response> {
    const failure = this.tokenFailures.shift();
    if (failure === "network") throw new TypeError("fetch failed");
    if (failure === "http") return Response.json({ error: "internal_failure" }, { status: 500 });
    if (failure === "malformed") return Response.json({ token_type: "Bearer" });
    const form = new URLSearchParams(await request.text());
    if (form.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer") {
      return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
    }
    if (!validAssertion(form.get("assertion") ?? "")) return Response.json({ error: "invalid_grant" }, { status: 400 });
    const accessToken = `indexing-token-${++this.tokensIssued}`;
    this.tokens.set(accessToken, Date.now() + TOKEN_LIFETIME_S * 1000);
    return Response.json({ access_token: accessToken, expires_in: TOKEN_LIFETIME_S, token_type: "Bearer" });
  }

  async publish(request: Request): Promise<Response> {
    const expiresAt = this.tokens.get(request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "");
    if (expiresAt === undefined || expiresAt <= Date.now()) return Response.json({ error: { code: 401 } }, { status: 401 });
    const failure = this.publishFailures.shift();
    if (failure === "network") throw new TypeError("fetch failed");
    if (failure === "http") return Response.json({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
    const { url, type } = (await request.json()) as IndexingPublish;
    this.notifications.push({ url, type });
    return Response.json({ urlNotificationMetadata: { url } });
  }
}

export const googleIndexing = new FakeGoogleIndexing();
route(INDEXING_PUBLISH_ENDPOINT, (request) => googleIndexing.publish(request));
