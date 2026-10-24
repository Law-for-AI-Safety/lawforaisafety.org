import { describe, expect, it } from "vitest";
import { hasBearerSecret, timingSafeEqualStrings } from "./timing-safe-equal";

describe("timingSafeEqualStrings", () => {
  it("is true for equal strings", () => {
    expect(timingSafeEqualStrings("secret", "secret")).toBe(true);
  });

  it("is false for different strings, even of the same length", () => {
    expect(timingSafeEqualStrings("secret", "secrex")).toBe(false);
  });

  it("is false for different-length strings", () => {
    expect(timingSafeEqualStrings("secret", "secret-but-longer")).toBe(false);
  });
});

describe("hasBearerSecret", () => {
  function request(authorization?: string): Request {
    return new Request("http://localhost/", {
      headers: authorization === undefined ? undefined : { authorization },
    });
  }

  it("is true when the header matches 'Bearer <secret>'", () => {
    expect(hasBearerSecret(request("Bearer good-secret"), "good-secret")).toBe(true);
  });

  it("is false with the wrong secret", () => {
    expect(hasBearerSecret(request("Bearer wrong-secret"), "good-secret")).toBe(false);
  });

  it("is false with no authorization header", () => {
    expect(hasBearerSecret(request(), "good-secret")).toBe(false);
  });

  it("is false when no secret is configured, even if the header happens to match", () => {
    expect(hasBearerSecret(request("Bearer undefined"), undefined)).toBe(false);
  });
});
