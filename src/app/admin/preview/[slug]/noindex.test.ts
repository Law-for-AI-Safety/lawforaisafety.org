import { describe, expect, it } from "vitest";
import nextConfig from "../../../../../next.config";
import robots from "../../../robots";
import { metadata } from "./page";

describe("the draft preview is never indexed", () => {
  it("carries a noindex robots tag", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("is sent with an X-Robots-Tag noindex header, as is the rest of the admin", async () => {
    const rules = await nextConfig.headers!();
    const admin = rules.find((rule) => rule.source === "/admin/:path*");
    expect(admin?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
  });

  it("keeps the site from being framed, except the preview, by the site's own editor", async () => {
    const rules = await nextConfig.headers!();
    const header = (source: string, key: string) => rules.find((rule) => rule.source === source)!.headers.find((h) => h.key === key)?.value;
    expect(header("/:path*", "Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(header("/:path*", "X-Frame-Options")).toBe("DENY");
    // Being the later rule, the preview's headers replace the site's.
    expect(rules.findIndex((rule) => rule.source === "/admin/preview/:path*")).toBeGreaterThan(rules.findIndex((rule) => rule.source === "/:path*"));
    expect(header("/admin/preview/:path*", "Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(header("/admin/preview/:path*", "X-Frame-Options")).toBe("SAMEORIGIN");
    expect(header("/:path*", "Content-Security-Policy")).toMatch(/frame-src 'self' /);
  });

  it("is disallowed in robots.txt", () => {
    expect(robots().rules).toMatchObject([{ disallow: expect.arrayContaining(["/admin"]) }]);
  });
});
