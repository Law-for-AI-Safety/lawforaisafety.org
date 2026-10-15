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
  contentHash,
  readContentFile,
  siteDocuments,
  siteImages,
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

  it("and the test page in test/fixtures/content passes it too", () => {
    expect(checkContent({ ...real, contentDir: path.resolve("test/fixtures/content") })).toEqual([]);
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
      "content/field-building.json: shareImage: The image /images/missing.webp does not exist",
      "content/field-building.json: blocks.0.lede: The link /no-such-page does not lead to a page on this site",
      "content/field-building.json: blocks.0.lede: The link /admin does not lead to a page on this site",
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
    expect(checkContent(dirs)).toEqual([
      "content/team.json: blocks.1.members.0.photo: The image /images/nobody.webp does not exist",
    ]);
  });

  it("checks one file's text before it is committed, against the repo's routes", () => {
    const routes = contentRoutes(real, ["field-building", "draft-page"]);
    const draft = printContent({ ...valid, blocks: [{ ...valid.blocks[0], lede: "See [the draft](/draft-page)." }] });
    expect(checkContentText("draft-page", draft, real.publicDir, routes)).toEqual([]);
    expect(checkContentText("draft-page", draft.trimEnd(), real.publicDir, routes)).toEqual([
      "content/draft-page.json is not in canonical form; run npm run content:format",
    ]);
    expect(checkContentText("draft-page", draft, real.publicDir, contentRoutes(real, []))).toEqual([
      "content/draft-page.json: blocks.0.lede: The link /draft-page does not lead to a page on this site",
    ]);
  });

  it("accepts a share image that exists", () => {
    write("field-building", printContent(withImage(valid, "/images/team-group.webp")));
    expect(checkContent(dirs)).toEqual([]);
  });

  it("leaves files starting with _ out of the pages", () => {
    write("a", "{}");
    write("_redirects", "{}");
    expect(contentSlugs(dirs.contentDir)).toEqual(["a"]);
  });

  it("reports a page whose address is reserved or malformed", () => {
    const page = printContent({ ...valid, blocks: [valid.blocks[0]] });
    write("apply", page);
    write("Bad-Name", page);
    expect(checkContent(dirs)).toEqual([
      'content/Bad-Name.json: The page address "Bad-Name" may use only lowercase letters, digits and single hyphens between them',
      'content/apply.json: The page address "/apply" is already used by the site',
    ]);
  });

  describe("the redirects file", () => {
    const redirects = (text: string) => fs.writeFileSync(path.join(dirs.contentDir, "_redirects.json"), text);
    const canonical = (list: { from: string; to: string }[]) => `${JSON.stringify({ redirects: list }, null, 2)}\n`;

    it("passes when valid and canonical", () => {
      write("field-building", printContent(valid));
      redirects(canonical([{ from: "/old-name", to: "/field-building" }]));
      expect(checkContent(dirs)).toEqual([]);
    });

    it("reports broken rules, using the content pages as the real pages", () => {
      write("field-building", printContent(valid));
      redirects(canonical([{ from: "/field-building", to: "/nowhere" }]));
      expect(checkContent(dirs)).toEqual([
        "content/_redirects.json: /field-building → /nowhere: /field-building is reserved by the site and cannot be redirected",
        "content/_redirects.json: /field-building → /nowhere: /nowhere is not a page on this site",
      ]);
    });

    it("reports a file that is not JSON, and one not in canonical form, which content:format fixes", () => {
      redirects("{");
      expect(checkContent(dirs)).toEqual([expect.stringMatching(/^content\/_redirects\.json is not valid JSON/)]);
      redirects('{"redirects":[{"from":"/a","to":"https://example.org"}]}');
      expect(checkContent(dirs)).toEqual(["content/_redirects.json is not in canonical form; run npm run content:format"]);
      expect(formatContentFiles(dirs.contentDir)).toEqual(["_redirects"]);
      expect(checkContent(dirs)).toEqual([]);
      expect(formatContentFiles(dirs.contentDir)).toEqual([]);
    });
  });

  it("refuses to format a file it cannot make valid", () => {
    write("field-building", printContent({ ...valid, title: "" }));
    expect(() => formatContentFiles(dirs.contentDir)).toThrow(ContentError);
    expect(() => formatContentFiles(dirs.contentDir)).toThrow(/Required\n {2}→ at title/);
  });
});

describe("content hashes", () => {
  it("are the file's git blob id", () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(contentHash("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
    // Counts bytes, not characters: `printf '\xc3\xa9' | git hash-object --stdin`
    expect(contentHash("\u00e9")).toBe("4b04fff51468d8ab5201ab02b725dc477bc7cb45");
  });

  it("are read with the file, and a page with no file has none", () => {
    const file = readContentFile(real.contentDir, "field-building")!;
    expect(file.text).toBe(fs.readFileSync(path.join(real.contentDir, "field-building.json"), "utf8"));
    expect(file.hash).toBe(contentHash(file.text));
    expect(readContentFile(real.contentDir, "no-such-page")).toBeNull();
    expect(readContentFile(real.contentDir, "../package")).toBeNull();
  });
});

describe("siteImages", () => {
  it("lists the images an image field accepts, as site paths", () => {
    const images = siteImages(real.publicDir);
    expect(images).toContain("/images/team-group.webp");
    expect(images).toEqual([...images].sort());
  });

  it("leaves out files an image field would refuse, and copes with no images folder", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cms-images-"));
    try {
      expect(siteImages(root)).toEqual([]);
      fs.mkdirSync(path.join(root, "images"));
      for (const name of ["b.webp", "a.png", "Upper.jpg", "notes.txt"]) fs.writeFileSync(path.join(root, "images", name), "");
      expect(siteImages(root)).toEqual(["/images/a.png", "/images/b.webp"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("siteDocuments", () => {
  it("lists the PDFs a document field accepts, and copes with no documents folder", () => {
    expect(siteDocuments(real.publicDir)).toEqual(["/documents/red-lines-dialogue-mep-beke-letter-2026-09-01.pdf"]);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cms-documents-"));
    try {
      expect(siteDocuments(root)).toEqual([]);
      fs.mkdirSync(path.join(root, "documents"));
      for (const name of ["b.pdf", "a.pdf", "Upper.pdf", "notes.txt"]) fs.writeFileSync(path.join(root, "documents", name), "");
      expect(siteDocuments(root)).toEqual(["/documents/a.pdf", "/documents/b.pdf"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
