import { describe, expect, it, vi } from "vitest";
import { dynamicParams, generateStaticParams, GET } from "./route";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("the share cards made from page titles", () => {
  it("are built for every content page but the homepage", () => {
    vi.stubEnv("CMS_EXTRA_CONTENT_DIR", "test/fixtures/content");
    const slugs = generateStaticParams().map((p) => p.slug);
    expect(slugs).toContain("field-building");
    expect(slugs).toContain("cms-test-page");
    expect(slugs).not.toContain("home");
    expect(dynamicParams).toBe(false);
  });

  it("are PNG images", async () => {
    const response = await GET(new Request("http://localhost/og-assets/field-building"), params("field-building"));
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });

  it("are a 404 for any other page", async () => {
    await expect(GET(new Request("http://localhost/og-assets/home"), params("home"))).rejects.toThrow();
  });
});
