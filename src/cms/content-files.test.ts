import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkContent,
  checkContentText,
  ContentError,
  contentRoutes,
  contentSlugs,
  defaultDirs,
  formatContent,
  formatContentFiles,
  linksIn,
  printContent,
  type Dirs,
} from "./content-files";
import { pageSchema } from "./schema";

const real = defaultDirs();

const valid = {
  title: "Field-building and Coordination",
  description: "Description.",
  updatedAt: "2026-10-15",
  blocks: [
    { type: "hero", heading: "Heading", lede: "See [the FOI work](/freedom-of-information) and [mail](mailto:a@b.org)." },
    {
      type: "applicationSection",
      form: "apply",
      heading: "Get involved",
      intro: "Apply below.\n\n- [one](/#contact)\n- [two](https://example.org)",
      showForm: false,
      closedMessage: "Closed.",
    },
  ],
};

/** The page with a share image, keys in schema order. */
const withImage = (value: typeof valid, shareImage: string) => {
  const { title, description, updatedAt, blocks } = value;
  return { title, description, shareImage, updatedAt, blocks };
};

describe("the content directory", () => {
  it("holds field-building", () => {
    expect(contentSlugs(real.contentDir)).toContain("field-building");
  });

  it.each(contentSlugs(real.contentDir))("content/%s.json is valid, canonical, and links only to real pages", (slug) => {
    const text = fs.readFileSync(path.join(real.contentDir, `${slug}.json`), "utf8");
    expect(pageSchema(slug).safeParse(JSON.parse(text)).success).toBe(true);
    expect(formatContent(slug, text)).toBe(text);
  });

  it("passes the full check", () => {
    expect(checkContent(real)).toEqual([]);
  });
});

describe("with a scratch directory", () => {
  let dirs: Dirs;
  const write = (slug: string, text: string) => fs.writeFileSync(path.join(dirs.contentDir, `${slug}.json`), text);

  beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cms-content-"));
    dirs = { ...defaultDirs(root), appDir: real.appDir, publicDir: real.publicDir };
    fs.mkdirSync(dirs.contentDir);
  });
  afterEach(() => fs.rmSync(path.dirname(dirs.contentDir), { recursive: true, force: true }));

  it("lists only .json files, sorted", () => {
    write("b", "{}");
    write("a", "{}");
    fs.writeFileSync(path.join(dirs.contentDir, "notes.txt"), "");
    expect(contentSlugs(dirs.contentDir)).toEqual(["a", "b"]);
  });

  it("accepts a valid canonical file", () => {
    write("field-building", printContent(valid));
    expect(checkContent(dirs)).toEqual([]);
  });

  it("reports a file that is not canonical, and content:format fixes it", () => {
    const messy = JSON.stringify(
      {
        blocks: [{ ...valid.blocks[0], lede: "  [YouTube](http://www.youtube.com/@LawforAISafety)  " }, valid.blocks[1]],
        updatedAt: valid.updatedAt,
        description: ` ${valid.description}`,
        title: valid.title,
      },
      null,
      4,
    );
    write("field-building", messy);
    expect(checkContent(dirs)).toEqual(["content/field-building.json is not in canonical form; run npm run content:format"]);

    expect(formatContentFiles(dirs.contentDir)).toEqual(["field-building"]);
    const formatted = fs.readFileSync(path.join(dirs.contentDir, "field-building.json"), "utf8");
    expect(formatted).toMatch(/^\{\n {2}"title": "Field-building and Coordination",\n {2}"description": "Description\.",\n/);
    expect(formatted.endsWith("}\n")).toBe(true);
    expect(formatted).toContain('"lede": "[YouTube](https://www.youtube.com/@LawforAISafety)"');
    expect(checkContent(dirs)).toEqual([]);
    expect(formatContentFiles(dirs.contentDir)).toEqual([]);
  });

  it("reports a trailing newline missing as not canonical", () => {
    write("field-building", printContent(valid).trimEnd());
    expect(checkContent(dirs)).toEqual(["content/field-building.json is not in canonical form; run npm run content:format"]);
  });

  it("reports invalid JSON and invalid content", () => {
    write("field-building", "{ nope");
    write("new-page", printContent(valid));
    const problems = checkContent(dirs);
    expect(problems[0]).toMatch(/^content\/field-building\.json is not valid JSON/);
    expect(problems[1]).toMatch(/^content\/new-page\.json is invalid:\n.*This page cannot have a applicationSection block/);
  });

  it("reports links to pages that do not exist, and missing images", () => {
    const broken = structuredClone(valid) as typeof valid & { blocks: unknown[] };
    broken.blocks[0].lede = "See [nothing](/no-such-page) and [admin](/admin).";
    write("other-page", printContent({ ...valid, blocks: [valid.blocks[0]] }));
    write(
      "field-building",
      printContent({
        ...withImage(broken, "/images/missing.webp"),
        blocks: [
          ...broken.blocks,
          {
            type: "cardList",
            style: "numbered",
            items: [{ title: "Other", body: "Link to [a content page](/other-page)." }],
          },
        ],
      }),
    );
    expect(checkContent(dirs)).toEqual([
      "content/field-building.json: image /images/missing.webp is not in public/",
      "content/field-building.json: link /no-such-page does not lead to a page on this site",
      "content/field-building.json: link /admin does not lead to a page on this site",
    ]);
  });

  it("checks team photos exist", () => {
    const team = (photo: string) => ({
      title: "Team",
      description: "D.",
      updatedAt: "2026-10-15",
      blocks: [
        valid.blocks[0],
        { type: "teamGrid", heading: "Team", members: [{ name: "A", role: "R", bio: "B", photo, photoAlt: "Portrait of A" }] },
      ],
    });
    write("team", printContent(team("/images/karolina-gruzel.webp")));
    expect(checkContent(dirs)).toEqual([]);
    write("team", printContent(team("/images/nobody.webp")));
    expect(checkContent(dirs)).toEqual(["content/team.json: image /images/nobody.webp is not in public/"]);
  });

  it("checks one file's text before it is committed, against the repo's routes", () => {
    const routes = contentRoutes(real, ["field-building", "draft-page"]);
    const draft = printContent({ ...valid, blocks: [{ ...valid.blocks[0], lede: "See [the draft](/draft-page)." }] });
    expect(checkContentText("draft-page", draft, real.publicDir, routes)).toEqual([]);
    expect(checkContentText("draft-page", draft.trimEnd(), real.publicDir, routes)).toEqual([
      "content/draft-page.json is not in canonical form; run npm run content:format",
    ]);
    expect(checkContentText("draft-page", draft, real.publicDir, contentRoutes(real, []))).toEqual([
      "content/draft-page.json: link /draft-page does not lead to a page on this site",
    ]);
  });

  it("accepts a share image that exists", () => {
    write("field-building", printContent(withImage(valid, "/images/team-group.webp")));
    expect(checkContent(dirs)).toEqual([]);
  });

  it("refuses to format a file it cannot make valid", () => {
    write("field-building", printContent({ ...valid, title: "" }));
    expect(() => formatContentFiles(dirs.contentDir)).toThrow(ContentError);
    expect(() => formatContentFiles(dirs.contentDir)).toThrow(/Required\n {2}→ at title/);
  });
});

describe("linksIn", () => {
  it("finds every link target in rich text anywhere in the value", () => {
    expect(linksIn(valid)).toEqual(["/freedom-of-information", "mailto:a@b.org", "/#contact", "https://example.org"]);
  });

  it("skips strings that are not rich text and values that are not strings", () => {
    expect(linksIn({ a: "<b>not rich</b>", b: 3, c: null, d: true })).toEqual([]);
  });
});
