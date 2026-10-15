import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { defaultDirs } from "./content-files";
import { contentRouteSlugs, FIXED_RESERVED, hasDedicatedRoute, importedModules, reservedSlugs, slugProblem, slugProblems } from "./slugs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cms-slugs-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function write(file: string, text = "") {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

write("app/page.tsx", 'import c from "../content/home.json";');
write("app/layout.tsx");
write("app/sitemap.ts");
write("app/Nav.tsx");
write("app/about/page.tsx", "export default function About() {}");
write("app/guide/page.tsx", 'import content from "../../content/guide.json";');
// Routes that only mention their content file, or import something else.
write("app/commented/page.tsx", '// Renders content/commented.json one day.\n/* import c from "../../content/commented.json"; */\nexport default function P() {}');
write("app/quoted/page.tsx", 'const note = "import x from \'../../content/quoted.json\'";\nexport default note;');
write("app/other/page.tsx", 'import c from "../../content/guide.json";\nimport d from "../../not-content/other.json";');
write("app/aliased/page.tsx", 'import type { Metadata } from "next";\nimport * as content from "@/content/aliased.json";');
write("app/flow/step/page.tsx");
write("app/(group)/grouped/page.tsx");
write("app/_private/page.tsx");
write("app/@modal/page.tsx");
write("app/[slug]/page.tsx");
write("public/images/a.webp");
write("public/robots-extra.txt");

const dirs = { appDir: path.join(root, "app"), publicDir: path.join(root, "public") };

describe("reservedSlugs", () => {
  it("takes the fixed names, the homepage's, and every top-level name of the app and public folders", () => {
    expect([...reservedSlugs(dirs)].sort()).toEqual(
      [...FIXED_RESERVED, "home", "page", "layout", "sitemap", "Nav", "about", "guide", "commented", "quoted", "other", "aliased", "flow", "grouped", "images"].sort(),
    );
  });

  it("covers the real site's routes", () => {
    const reserved = reservedSlugs(defaultDirs());
    for (const slug of ["admin", "api", "apply", "newsletter", "og-assets", "privacy-policy", "red-lines-dialogue", "field-building", "sitemap", "robots", "opengraph-image", "images", "documents"]) {
      expect(reserved.has(slug), slug).toBe(true);
    }
  });
});

describe("hasDedicatedRoute", () => {
  it("is true only when the route's own page file imports the content file", () => {
    expect(hasDedicatedRoute(dirs, "guide")).toBe(true);
    expect(hasDedicatedRoute(dirs, "home")).toBe(true);
    expect(hasDedicatedRoute(dirs, "aliased")).toBe(true);
    for (const slug of ["about", "flow", "sitemap", "missing", "commented", "quoted", "other"]) {
      expect(hasDedicatedRoute(dirs, slug), slug).toBe(false);
    }
  });

  it("finds the real site's dedicated routes", () => {
    const { appDir, publicDir } = defaultDirs();
    for (const slug of ["home", "field-building", "red-lines-dialogue"]) expect(hasDedicatedRoute({ appDir, publicDir }, slug), slug).toBe(true);
  });
});

describe("importedModules", () => {
  it("reads import specifiers and skips comments", () => {
    const source = [
      'import a from "./a";',
      "import * as b from '../b';",
      'import type { C } from "c";',
      'import "./side-effect.css";',
      'const url = "https://example.org"; import d from "./d";',
      '// import e from "./e";',
      '/* import f from "./f"; */',
    ].join("\n");
    expect(importedModules(source)).toEqual(["./a", "../b", "c", "./side-effect.css", "./d"]);
  });
});

describe("slugProblem", () => {
  it.each(["a", "new-page", "page-2", "2026-review"])("accepts %j", (slug) => {
    expect(slugProblem(slug, dirs)).toBeNull();
  });

  it.each(["Upper", "two--hyphens", "-start", "end-", "under_score", "dot.json", "space here", "é", ""])("refuses the form of %j", (slug) => {
    expect(slugProblem(slug, dirs)).toMatch(/only lowercase letters, digits and single hyphens/);
  });

  it("refuses a slug longer than 60 characters", () => {
    expect(slugProblem("a".repeat(60), dirs)).toBeNull();
    expect(slugProblem("a".repeat(61), dirs)).toMatch(/longer than 60/);
  });

  it.each(["admin", "api", "apply", "newsletter", "og-assets", "privacy-policy", "about", "flow", "grouped", "sitemap", "images"])(
    "refuses the reserved %j",
    (slug) => {
      expect(slugProblem(slug, dirs)).toBe(`The page address "/${slug}" is already used by the site`);
    },
  );

  it("accepts a reserved slug whose own route renders it", () => {
    expect(slugProblem("guide", dirs)).toBeNull();
    expect(slugProblem("home", dirs)).toBeNull();
  });
});

describe("slugProblems and contentRouteSlugs", () => {
  const slugs = ["about", "guide", "home", "new-page", "Bad"];

  it("name each broken file", () => {
    expect(slugProblems(slugs, dirs)).toEqual([
      'content/about.json: The page address "/about" is already used by the site',
      'content/Bad.json: The page address "Bad" may use only lowercase letters, digits and single hyphens between them',
    ]);
  });

  it("leave the content route only the valid pages without a route of their own", () => {
    expect(contentRouteSlugs(slugs, dirs)).toEqual(["new-page"]);
  });
});
