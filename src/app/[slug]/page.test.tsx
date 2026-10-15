import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ContentRoutePage, { dynamicParams, generateMetadata, generateStaticParams } from "./page";

/**
 * The content route against the real content/ directory, plus the test page in
 * test/fixtures/content, added the way a test build adds it.
 */
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const withTestPage = () => vi.stubEnv("CMS_EXTRA_CONTENT_DIR", "test/fixtures/content");

describe("the content route", () => {
  it("builds no page of its own on the real site yet: every content page there has its own route", () => {
    expect(generateStaticParams()).toEqual([]);
  });

  it("builds the test page in a test build, and nothing else", () => {
    withTestPage();
    expect(generateStaticParams()).toEqual([{ slug: "cms-test-page" }]);
  });

  it("renders the page from its content file", async () => {
    withTestPage();
    render(await ContentRoutePage(params("cms-test-page")));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("CMS test page");
    expect(screen.getByRole("link", { name: "the field-building page" })).toHaveAttribute("href", "/field-building");
  });

  it("gives the page its metadata", async () => {
    withTestPage();
    expect(await generateMetadata(params("cms-test-page"))).toMatchObject({
      title: "CMS test page | Law for AI Safety",
      alternates: { canonical: "/cms-test-page" },
      openGraph: { images: [{ url: "/og-assets/cms-test-page", alt: "CMS test page" }] },
    });
  });

  it("is a 404 for any other address, rendering nothing on request", async () => {
    withTestPage();
    expect(dynamicParams).toBe(false);
    for (const slug of ["field-building", "home", "admin", "no-such-page"]) {
      await expect(ContentRoutePage(params(slug)), slug).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(generateMetadata(params(slug)), slug).rejects.toThrow("NEXT_NOT_FOUND");
    }
  });
});
