import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { after } from "next/server";
import { SITE_URL } from "@/cms/site";
import { isProductionDeploy } from "@/lib/deploy-context";

/**
 * Google's Indexing API asks Google to recrawl a job posting soon after it opens or changes,
 * and to drop it once it closes, rather than waiting for the sitemap. Google allows it only for
 * pages with `JobPosting` markup (or livestreams), so callers send only listings whose page
 * carries one (see `carriesJobPosting` in src/lib/opportunities-flow.ts), never CMS pages.
 *
 * It signs in as a service account whose JSON key is `GOOGLE_INDEXING_SERVICE_ACCOUNT`, and
 * which Search Console lists as an Owner of the site. The app signs a JWT for the indexing
 * scope with the account's private key, exchanges it at Google's token endpoint for an access
 * token, and keeps that token until shortly before it expires. Notifications go out only from
 * the production deploy, with the key set, so a preview or local run never announces anything.
 *
 * A notification is a courtesy, never part of the change itself: it can't fail the write that
 * caused it, and each request is given up after `REQUEST_TIMEOUT_MS`. A missed one costs only
 * a slower recrawl. Google's default quota is 200 publish requests a day.
 */

export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const INDEXING_PUBLISH_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";
export const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
export const REQUEST_TIMEOUT_MS = 5000;

/** Google accepts an assertion that lives at most an hour. */
const JWT_LIFETIME_S = 60 * 60;
/** A token is renewed this long before Google says it expires, so none is sent stale. */
const TOKEN_RENEW_MARGIN_MS = 60 * 1000;

export type IndexingNotificationType = "URL_UPDATED" | "URL_DELETED";
export type IndexingNotification = { path: string; type: IndexingNotificationType };

type ServiceAccount = { clientEmail: string; privateKey: KeyObject };

/** Unusable credentials. Its message never quotes the key. */
class CredentialsError extends Error {}

/**
 * The service account in `raw`, the JSON key file Google Cloud gives out. Throws
 * `CredentialsError` when it is unusable.
 */
function serviceAccount(raw: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CredentialsError("GOOGLE_INDEXING_SERVICE_ACCOUNT is not JSON");
  }
  const { client_email: clientEmail, private_key: pem } = (parsed ?? {}) as Record<string, unknown>;
  if (typeof clientEmail !== "string" || typeof pem !== "string") {
    throw new CredentialsError("GOOGLE_INDEXING_SERVICE_ACCOUNT has no client_email or private_key");
  }
  try {
    return { clientEmail, privateKey: createPrivateKey(pem) };
  } catch {
    // The parser's message can quote the key, so it is not passed on.
    throw new CredentialsError("GOOGLE_INDEXING_SERVICE_ACCOUNT's private_key is not a valid PEM private key");
  }
}

/** The access token in use, for the credentials it was issued to. */
let cached: { credentials: string; value: string; expiresAt: number } | null = null;

/** Forgets the access token, so the next notification signs in afresh. For tests. */
export function forgetGoogleAccessToken(): void {
  cached = null;
}

function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

/** The RS256 JWT a service account signs to ask Google's token endpoint for the indexing scope. */
function signedAssertion(account: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({ iss: account.clientEmail, scope: INDEXING_SCOPE, aud: GOOGLE_TOKEN_ENDPOINT, iat: now, exp: now + JWT_LIFETIME_S }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), account.privateKey);
  return `${header}.${claims}.${base64url(signature)}`;
}

async function accessToken(credentials: string): Promise<string> {
  if (cached && cached.credentials === credentials && cached.expiresAt - TOKEN_RENEW_MARGIN_MS > Date.now()) {
    return cached.value;
  }
  cached = null;
  const account = serviceAccount(credentials);
  const assertion = signedAssertion(account);

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`token request refused: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new Error("token response has no access_token or expires_in");
  }
  cached = { credentials, value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cached.value;
}

/**
 * Tells Google about each listing page in `notifications` (site paths such as
 * `/opportunities/x`): `URL_UPDATED` for one that opened or changed, `URL_DELETED` for one
 * that closed or was removed. Does nothing off the production deploy or without credentials,
 * and never throws.
 */
export async function notifyGoogleIndexing(notifications: IndexingNotification[]): Promise<void> {
  const credentials = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT?.trim();
  if (!credentials || !isProductionDeploy() || notifications.length === 0) return;

  let token: string;
  try {
    token = await accessToken(credentials);
  } catch (e) {
    console.error("[google-indexing] Could not sign in", e instanceof CredentialsError ? e.message : e);
    return;
  }
  // One request per URL: the API takes one notification at a time.
  for (const { path, type } of notifications) {
    const url = new URL(path, SITE_URL).href;
    try {
      const response = await fetch(INDEXING_PUBLISH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, type }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        console.error(`[google-indexing] ${type} for ${url} refused: ${response.status} ${await response.text()}`);
      }
    } catch (e) {
      console.error(`[google-indexing] ${type} for ${url} failed`, e);
    }
  }
}

/**
 * `notifyGoogleIndexing` once the response has been sent, so the person or script whose change
 * it announces never waits on Google. For use while handling a request.
 */
export function notifyGoogleIndexingLater(notifications: IndexingNotification[]): void {
  after(() => notifyGoogleIndexing(notifications));
}
