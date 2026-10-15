import { describe, expect, it, vi } from "vitest";
import { TURNSTILE_FIELD_NAME, verifyTurnstile } from "@/lib/turnstile";
import { turnstile } from "../../test/fakes/turnstile";

function withToken(token: string): FormData {
  const form = new FormData();
  form.set(TURNSTILE_FIELD_NAME, token);
  return form;
}

describe("verifyTurnstile", () => {
  it("accepts a token Cloudflare verifies, sending the secret and client IP", async () => {
    const token = turnstile.accept();

    expect(await verifyTurnstile(withToken(token), "203.0.113.7")).toBe(true);
    expect(turnstile.verifications).toEqual([
      { secret: "test-turnstile-secret", response: token, remoteip: "203.0.113.7" },
    ]);
  });

  it("leaves out the client IP when it is unknown", async () => {
    await verifyTurnstile(withToken(turnstile.accept()), "unknown");

    expect(turnstile.verifications[0].remoteip).toBeNull();
  });

  it("rejects a token Cloudflare does not verify", async () => {
    expect(await verifyTurnstile(withToken("forged"), "203.0.113.7")).toBe(false);
  });

  it.each([
    ["missing", new FormData()],
    ["empty", withToken("")],
  ])("rejects a %s token without asking Cloudflare", async (_, form) => {
    expect(await verifyTurnstile(form, "203.0.113.7")).toBe(false);
    expect(turnstile.verifications).toEqual([]);
  });

  it("fails closed when Cloudflare answers with an error", async () => {
    const token = turnstile.accept();
    turnstile.failNext("http");

    expect(await verifyTurnstile(withToken(token), "203.0.113.7")).toBe(false);
  });

  it("fails closed when Cloudflare cannot be reached", async () => {
    const token = turnstile.accept();
    turnstile.failNext("network");

    expect(await verifyTurnstile(withToken(token), "203.0.113.7")).toBe(false);
  });

  it("refuses to run without a secret key", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");

    await expect(verifyTurnstile(withToken("any"), "203.0.113.7")).rejects.toThrow(
      "Missing required env var: TURNSTILE_SECRET_KEY",
    );
  });
});
