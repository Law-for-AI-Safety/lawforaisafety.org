import { describe, expect, it, vi } from "vitest";
import { getClientIp } from "@/lib/rate-limit";

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/newsletter", { headers });
}

describe("getClientIp", () => {
  it("trusts Netlify's client IP header", () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");

    expect(getClientIp(requestWith({ "x-nf-client-connection-ip": " 203.0.113.7 " }))).toBe(
      "203.0.113.7",
    );
  });

  it("ignores a client-supplied x-forwarded-for on Netlify", () => {
    vi.stubEnv("DEPLOY_CONTEXT", "deploy-preview");

    expect(getClientIp(requestWith({ "x-forwarded-for": "198.51.100.1" }))).toBe("unknown");
  });

  it("uses the first x-forwarded-for address off Netlify", () => {
    expect(getClientIp(requestWith({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" }))).toBe(
      "198.51.100.1",
    );
  });

  it("puts a request with no address in the shared unknown bucket", () => {
    expect(getClientIp(requestWith({}))).toBe("unknown");
    expect(getClientIp(requestWith({ "x-forwarded-for": " " }))).toBe("unknown");
  });
});
