import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { contentRoutePage, contentRoutePages, sitemapEntries, siteDirs, sitePages, SITE_URL, titleCardPages, type SiteDirs } from "./site";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cms-site-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function write(file: string, text = "") {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

const page = (title: string, updatedAt = "2026-10-01") =>
  JSON.stringify({ title, description: `About ${title}.`, updatedAt, blocks: [{ type: "hero", heading: title, lede: "Hello." }] });

write("app/page.tsx", 'import c from "../../content/home.json";');
write("app/guide/page.tsx", 'import c from "../../content/guide.json";');
write("app/red-lines-dialogue/page.tsx");
write("app/red-lines-dialogue/confirm/page.tsx");
write("app/apply/success/page.tsx");
write("app/newsletter/confirmed/page.tsx");
write("app/privacy-policy/page.tsx");
write("app/privacy-policy/[locale]/page.tsx");
write("app/[slug]/page.tsx");
write("app/admin/page.tsx");
write("public/images/a.webp");
write("content/home.json", page("Home", "2026-09-01"));
write("content/guide.json", page("Guide", "2026-08-01"));
write("content/new-page.json", page("New page"));
write("content/admin.json", page("Admin"));
write("content/_redirects.json", '{"redirects":[]}');
write("extra/test-page.json", page("Test page", "2026-10-15"));
write("clash/new-page.json", page("Again"));

const dirs: SiteDirs = { contentDir: path.join(root, "content"), appDir: path.join(root, "app"), publicDir: path.join(root, "public") };
const withExtra: SiteDirs = { ...dirs, extraContentDir: path.join(root, "extra") };

describe("siteDirs", () => {
  it("reads content/, src/app and public/, and adds the extra directory only when it is set", () => {
    expect(siteDirs("/repo", {})).toEqual({ contentDir: "/repo/content", appDir: "/repo/src/app", publicDir: "/repo/public" });
    expect(siteDirs("/repo", { CMS_EXTRA_CONTENT_DIR: "test/fixtures/content" }).extraContentDir).toBe("/repo/test/fixtures/content");
  });
});

describe("sitePages", () => {
  it("lists every content page with its path, the homepage at /", () => {
    expect(sitePages(dirs).map((p) => [p.slug, p.path, p.page.title])).toEqual([
      ["admin", "/admin", "Admin"],
      ["guide", "/guide", "Guide"],
      ["home", "/", "Home"],
      ["new-page", "/new-page", "New page"],
    ]);
  });

  it("adds the extra directory's pages, and refuses a slug in both", () => {
    expect(sitePages(withExtra).map((p) => p.slug)).toContain("test-page");
    expect(() => sitePages({ ...dirs, extraContentDir: path.join(root, "clash") })).toThrow(/new-page.json is in both/);
  });

  it("throws on an invalid page", () => {
    write("bad/broken.json", "{}");
    expect(() => sitePages({ ...dirs, contentDir: path.join(root, "bad") })).toThrow(/content\/broken.json is invalid/);
  });
});

describe("the content route", () => {
  it("serves the pages without a route of their own, and never a reserved slug", () => {
    expect(contentRoutePages(withExtra).map((p) => p.slug)).toEqual(["new-page", "test-page"]);
  });

  it("finds one page, or none", () => {
    expect(contentRoutePage(dirs, "new-page")?.page.title).toBe("New page");
    for (const slug of ["guide", "home", "admin", "missing"]) expect(contentRoutePage(dirs, slug), slug).toBeNull();
  });
});

describe("titleCardPages", () => {
  it("is every page visitors can reach but the homepage", () => {
    expect(titleCardPages(withExtra).map((p) => p.slug)).toEqual(["guide", "new-page", "test-page"]);
  });
});

describe("sitemapEntries", () => {
  it("lists reachable content pages with their dates and other public pages without one, homepage first", () => {
    expect(sitemapEntries(withExtra)).toEqual([
      { url: SITE_URL, lastModified: new Date("2026-09-01T00:00:00Z"), changeFrequency: "monthly", priority: 1 },
      { url: `${SITE_URL}/guide`, lastModified: new Date("2026-08-01T00:00:00Z"), changeFrequency: "monthly", priority: 0.6 },
      { url: `${SITE_URL}/new-page`, lastModified: new Date("2026-10-01T00:00:00Z"), changeFrequency: "monthly", priority: 0.6 },
      { url: `${SITE_URL}/red-lines-dialogue`, changeFrequency: "weekly", priority: 0.7 },
      { url: `${SITE_URL}/test-page`, lastModified: new Date("2026-10-15T00:00:00Z"), changeFrequency: "monthly", priority: 0.6 },
    ]);
  });
});
