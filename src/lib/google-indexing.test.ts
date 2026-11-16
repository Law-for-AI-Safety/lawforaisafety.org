import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GOOGLE_INDEXING_SERVICE_ACCOUNT, googleIndexing, TOKEN_LIFETIME_S } from "../../test/fakes/google-indexing";
import { afterTasks } from "../../test/next-after";
import { notifyGoogleIndexing, notifyGoogleIndexingLater } from "./google-indexing";

function onProduction(credentials = GOOGLE_INDEXING_SERVICE_ACCOUNT) {
  vi.stubEnv("DEPLOY_CONTEXT", "production");
  vi.stubEnv("GOOGLE_INDEXING_SERVICE_ACCOUNT", credentials);
}

const updated = (path: string) => ({ path, type: "URL_UPDATED" as const });

describe("notifyGoogleIndexing", () => {
  it("signs in as the service account and sends each URL with its type", async () => {
    onProduction();
    await notifyGoogleIndexing([updated("/opportunities/a-job"), { path: "/opportunities/gone", type: "URL_DELETED" }]);
    expect(googleIndexing.notifications).toEqual([
      { url: "https://lawforaisafety.org/opportunities/a-job", type: "URL_UPDATED" },
      { url: "https://lawforaisafety.org/opportunities/gone", type: "URL_DELETED" },
    ]);
    expect(googleIndexing.tokensIssued).toBe(1);
  });

  it("reuses the access token until shortly before it expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T09:00:00Z"));
    onProduction();
    await notifyGoogleIndexing([updated("/opportunities/a")]);
    vi.setSystemTime(new Date(Date.now() + (TOKEN_LIFETIME_S - 120) * 1000));
    await notifyGoogleIndexing([updated("/opportunities/b")]);
    expect(googleIndexing.tokensIssued).toBe(1);

    vi.setSystemTime(new Date(Date.now() + 90 * 1000));
    await notifyGoogleIndexing([updated("/opportunities/c")]);
    expect(googleIndexing.tokensIssued).toBe(2);
    expect(googleIndexing.notifications.map((n) => n.url)).toHaveLength(3);
  });

  it("signs in afresh when the credentials change", async () => {
    onProduction();
    await notifyGoogleIndexing([updated("/a")]);
    onProduction(` ${GOOGLE_INDEXING_SERVICE_ACCOUNT}\n`.replace("{", '{"project_id":"other",'));
    await notifyGoogleIndexing([updated("/b")]);
    expect(googleIndexing.tokensIssued).toBe(2);
    expect(googleIndexing.notifications).toHaveLength(2);
  });

  it("sends nothing off the production deploy", async () => {
    vi.stubEnv("GOOGLE_INDEXING_SERVICE_ACCOUNT", GOOGLE_INDEXING_SERVICE_ACCOUNT);
    vi.stubEnv("DEPLOY_CONTEXT", "deploy-preview");
    await notifyGoogleIndexing([updated("/")]);
    expect(googleIndexing.tokensIssued).toBe(0);
  });

  it("sends nothing without credentials, or for no URLs", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    await notifyGoogleIndexing([updated("/")]);
    onProduction(" ");
    await notifyGoogleIndexing([updated("/")]);
    onProduction();
    await notifyGoogleIndexing([]);
    expect(googleIndexing.tokensIssued).toBe(0);
  });

  it("only logs unusable credentials, without quoting the key", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
    for (const credentials of [
      "not json",
      "null",
      JSON.stringify({ client_email: "x@example.com" }),
      JSON.stringify({ client_email: "x@example.com", private_key: "-----BEGIN PRIVATE KEY-----\nsecret-ish\n-----END PRIVATE KEY-----" }),
    ]) {
      onProduction(credentials);
      await expect(notifyGoogleIndexing([updated("/")])).resolves.toBeUndefined();
    }
    // A well-formed key Google doesn't know is refused at the token endpoint.
    onProduction(JSON.stringify({ client_email: "indexing@test-project.iam.gserviceaccount.com", private_key: otherKey }));
    await notifyGoogleIndexing([updated("/")]);

    expect(googleIndexing.notifications).toEqual([]);
    expect(errors).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(errors.mock.calls)).not.toContain("secret-ish");
  });

  it("only logs a failed or malformed sign-in, and tries again next time", async () => {
    onProduction();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    googleIndexing.failNextToken("http");
    await notifyGoogleIndexing([updated("/")]);
    googleIndexing.failNextToken("network");
    await notifyGoogleIndexing([updated("/")]);
    googleIndexing.failNextToken("malformed");
    await notifyGoogleIndexing([updated("/")]);
    expect(errors).toHaveBeenCalledTimes(3);
    expect(googleIndexing.notifications).toEqual([]);

    await notifyGoogleIndexing([updated("/")]);
    expect(googleIndexing.notifications).toHaveLength(1);
  });

  it("only logs a refused or failed notification, and still sends the rest", async () => {
    onProduction();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    googleIndexing.failNextPublish("http");
    googleIndexing.failNextPublish("network");
    await expect(notifyGoogleIndexing([updated("/a"), updated("/b"), updated("/c")])).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledTimes(2);
    expect(googleIndexing.notifications.map((n) => n.url)).toEqual(["https://lawforaisafety.org/c"]);
  });
});

describe("notifyGoogleIndexingLater", () => {
  it("sends once the response is done", async () => {
    onProduction();
    notifyGoogleIndexingLater([updated("/opportunities/a-job")]);
    await afterTasks.settled();
    expect(googleIndexing.notifications).toEqual([{ url: "https://lawforaisafety.org/opportunities/a-job", type: "URL_UPDATED" }]);
  });
});
