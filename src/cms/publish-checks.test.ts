import { describe, expect, it } from "vitest";
import { contentRoutes, defaultDirs } from "./content-files";
import { problemPathKey, publishChecks, type CheckContext } from "./publish-checks";

const real = defaultDirs();
const ctx: CheckContext = { publicDir: real.publicDir, routes: contentRoutes(real, ["field-building"]) };

const hero = { type: "hero", heading: "Heading", lede: "Lede." };
const page = (extra: Record<string, unknown> = {}) => ({
  title: "Title",
  description: "Description.",
  updatedAt: "2026-10-15",
  blocks: [hero],
  ...extra,
});
const check = (value: unknown, slug = "a-page") =>
  publishChecks(slug, value, ctx).map((p) => `${problemPathKey(p.path)}: ${p.message}`);

describe("publish checks", () => {
  it("pass a complete page whose links and images all exist", () => {
    const value = page({
      shareImage: "/images/team-group.webp",
      blocks: [
        { ...hero, lede: "See [field-building](/field-building), [FOI](/freedom-of-information#x) and [mail](mailto:a@b.org)." },
        { type: "teamGrid", heading: "Team", members: [{ name: "A", role: "R", bio: "B", photo: "/images/karolina-gruzel.webp", photoAlt: "A" }] },
      ],
    });
    expect(check(value)).toEqual([]);
  });

  it("need a title and a description", () => {
    expect(check(page({ title: "", description: "" }))).toEqual(["title: Required", "description: Required"]);
  });

  it("find empty required fields anywhere", () => {
    const value = page({ blocks: [hero, { type: "cardList", style: "bullets", heading: "", items: [{ title: "T", body: "" }] }] });
    expect(check(value)).toEqual(["blocks.1.heading: Required", "blocks.1.items.0.body: Required"]);
  });

  it("find malformed links and links to pages that do not exist", () => {
    const value = page({ blocks: [{ ...hero, lede: "[x](javascript:alert)" }, { type: "textSection", heading: "H", body: "[gone](/no-such-page) and [admin](/admin)" }] });
    expect(check(value)).toEqual([
      expect.stringMatching(/^blocks\.0\.lede: Only https:, mailto: and site links/),
      "blocks.1.body: The link /no-such-page does not lead to a page on this site",
      "blocks.1.body: The link /admin does not lead to a page on this site",
    ]);
  });

  it("need alt text with every photo", () => {
    const value = page({ blocks: [hero, { type: "teamGrid", heading: "Team", members: [{ name: "A", role: "R", bio: "B", photo: "/images/karolina-gruzel.webp" }] }] });
    expect(check(value)).toEqual(["blocks.1.members.0.photoAlt: A photo needs alt text, and alt text needs a photo"]);
    const blank = page({ blocks: [hero, { type: "teamGrid", heading: "Team", members: [{ name: "A", role: "R", bio: "B", photo: "/images/karolina-gruzel.webp", photoAlt: "" }] }] });
    expect(check(blank)).toEqual(["blocks.1.members.0.photoAlt: Required"]);
  });

  it("find images that do not exist, and look up only well-formed ones", () => {
    expect(check(page({ shareImage: "/images/missing.webp" }))).toEqual(["shareImage: The image /images/missing.webp does not exist"]);
    expect(check(page({ shareImage: "../../etc/passwd" }))).toEqual(["shareImage: Pick an image from /images/"]);
  });

  it("need exactly one main heading", () => {
    expect(check(page({ blocks: [] }))).toEqual([
      "blocks: Add at least one block",
      "blocks.0: The first block must be the hero",
      "blocks: A page needs exactly one main heading (from its hero block); this one has 0",
    ]);
    expect(check(page({ blocks: [hero, hero] }))).toEqual([
      "blocks.1: This page can have at most 1 hero block(s)",
      "blocks: A page needs exactly one main heading (from its hero block); this one has 2",
    ]);
  });

  it("report what they can of a value that is not a page", () => {
    expect(check(null)).toEqual([": Invalid input: expected object, received null"]);
    expect(check([])).toEqual([": Invalid input: expected object, received array"]);
    expect(check({ blocks: "x", shareImage: 3 })).toContain("blocks: A page needs exactly one main heading (from its hero block); this one has 0");
    expect(check({ blocks: [null, { type: "teamGrid", members: "x" }, { type: "teamGrid", members: [null, { photo: 1 }] }] })).toContain(
      "blocks: A page needs exactly one main heading (from its hero block); this one has 0",
    );
  });
});

describe("publish checks on photos and buttons", () => {
  it("check each photo exists and each button's site link leads to a page", () => {
    const value = page({
      blocks: [
        hero,
        {
          type: "milestones",
          heading: "Story",
          entries: [
            {
              title: "One",
              body: "Text.",
              photos: [{ image: "/images/team-group.webp", alt: "Team" }, { image: "/images/nobody.webp", alt: "Nobody" }],
              buttons: [{ label: "Go", href: "/nowhere" }, { label: "Read", href: "/field-building" }],
            },
          ],
        },
        { type: "quoteBand", quote: "Q.", photos: [{ image: "/images/gone.webp", alt: "Gone" }] },
      ],
    });
    expect(check(value)).toEqual([
      "blocks.1.entries.0.photos.1.image: The image /images/nobody.webp does not exist",
      "blocks.2.photos.0.image: The image /images/gone.webp does not exist",
      "blocks.1.entries.0.buttons.0.href: The link /nowhere does not lead to a page on this site",
    ]);
  });
});

describe("publish checks on documents", () => {
  it("check the picked PDF exists", () => {
    const section = (file: string) => page({ blocks: [hero, { type: "textSection", body: "B.", documents: [{ file, title: "T", linkText: "L" }] }] });
    expect(check(section("/documents/red-lines-dialogue-mep-beke-letter-2026-09-01.pdf"))).toEqual([]);
    expect(check(section("/documents/missing.pdf"))).toEqual(["blocks.1.documents.0.file: The document /documents/missing.pdf does not exist"]);
  });
});
