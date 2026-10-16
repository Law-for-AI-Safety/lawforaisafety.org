import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { appRoutes, isSiteRoute, publicRoutes, siteRoutes } from "./routes";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cms-routes-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function touch(file: string) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), "");
}

for (const file of [
  "app/page.tsx",
  "app/layout.tsx",
  "app/about/page.tsx",
  // The content route: its pages come from content/, so it must not match every path.
  "app/[slug]/page.tsx",
  "app/info/[slug]/page.tsx",
  "app/(group)/grouped/page.tsx",
  "app/_private/page.tsx",
  "app/@modal/page.tsx",
  "app/admin/page.tsx",
  "app/admin/inner/page.tsx",
  "app/api/thing/route.ts",
  "app/docs/[locale]/page.tsx",
  "app/blog/[...slug]/page.js",
  "app/shop/[[...rest]]/page.mdx",
  "app/about/team/notes.txt",
  "public/images/a.webp",
  "public/documents/letter.pdf",
]) {
  touch(file);
}

const routes = siteRoutes({
  appDir: path.join(root, "app"),
  publicDir: path.join(root, "public"),
  contentPaths: ["/field-building"],
});

describe("appRoutes", () => {
  it("finds pages, drops groups, and leaves out private folders, slots, admin, api and the content route", () => {
    expect(appRoutes(path.join(root, "app")).map((r) => `/${r.join("/")}`).sort()).toEqual([
      "/",
      "/about",
      "/blog/[...slug]",
      "/docs/[locale]",
      "/grouped",
      "/info/[slug]",
      "/shop/[[...rest]]",
    ]);
  });
});

describe("publicRoutes", () => {
  it("lists every public file", () => {
    expect(publicRoutes(path.join(root, "public")).map((r) => r.join("/")).sort()).toEqual([
      "documents/letter.pdf",
      "images/a.webp",
    ]);
  });
});

describe("isSiteRoute", () => {
  it.each([
    "/",
    "/#contact",
    "/?x=1",
    "/about",
    "/about#team",
    "/about?ref=x",
    "/grouped",
    "/docs/nl",
    "/blog/a",
    "/blog/a/b",
    "/shop",
    "/shop/x/y",
    "/images/a.webp",
    "/documents/letter.pdf",
    "/field-building",
    "/field-building#contact",
    "/%61bout",
  ])("leads somewhere: %j", (href) => {
    expect(isSiteRoute(href, routes)).toBe(true);
  });

  it.each([
    "/nowhere",
    "/about/",
    "/about/team",
    "/about/team/notes.txt",
    "/admin",
    "/admin/inner",
    "/api/thing",
    "/_private",
    "/docs",
    "/docs/nl/extra",
    "/blog",
    "/images",
    "/about/../admin",
    "/./about",
    "//about",
    "/%E0%A4%A",
    "about",
    "https://lawforaisafety.org/about",
  ])("leads nowhere: %j", (href) => {
    expect(isSiteRoute(href, routes)).toBe(false);
  });

  it("has no homepage without a root page", () => {
    expect(isSiteRoute("/", [["about"]])).toBe(false);
  });
});

describe("the real site", () => {
  const real = siteRoutes({
    appDir: path.resolve("src/app"),
    publicDir: path.resolve("public"),
    contentPaths: [],
  });

  it("includes the public pages and files and leaves out admin", () => {
    for (const href of ["/", "/field-building", "/red-lines-dialogue", "/privacy-policy", "/privacy-policy/nl", "/apply/success", "/logo.svg"]) {
      expect(isSiteRoute(href, real), href).toBe(true);
    }
    expect(isSiteRoute("/admin", real)).toBe(false);
    expect(isSiteRoute("/admin/login", real)).toBe(false);
  });
});
