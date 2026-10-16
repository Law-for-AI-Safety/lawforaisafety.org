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

  it("keeps the site from being framed, so the preview opens in its own tab", async () => {
    const rules = await nextConfig.headers!();
    const csp = rules.find((rule) => rule.source === "/:path*")!.headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toContain("frame-ancestors 'none'");
  });

  it("is disallowed in robots.txt", () => {
    expect(robots().rules).toMatchObject([{ disallow: expect.arrayContaining(["/admin"]) }]);
  });
});
