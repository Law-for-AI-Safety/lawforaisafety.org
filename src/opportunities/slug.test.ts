import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Senior Compliance Manager")).toBe("senior-compliance-manager");
  });

  it("strips accents and punctuation", () => {
    expect(slugify("Café & Résumé, Inc.")).toBe("cafe-resume-inc");
  });

  it("collapses repeated separators and trims leading/trailing hyphens", () => {
    expect(slugify("  --Too   Many---Spaces--  ")).toBe("too-many-spaces");
  });

  it("caps length", () => {
    const long = "word ".repeat(30);
    expect(slugify(long).length).toBeLessThanOrEqual(60);
  });
});

describe("uniqueSlug", () => {
  it("uses the base when it's free", () => {
    expect(uniqueSlug("acme-job", new Set())).toBe("acme-job");
  });

  it("slugifies a non-slug base first", () => {
    expect(uniqueSlug("Acme Job!", new Set())).toBe("acme-job");
  });

  it("appends -2, -3... on collision", () => {
    expect(uniqueSlug("acme-job", new Set(["acme-job"]))).toBe("acme-job-2");
    expect(uniqueSlug("acme-job", new Set(["acme-job", "acme-job-2"]))).toBe("acme-job-3");
  });

  it("falls back to a generic root when the text slugifies to nothing", () => {
    expect(uniqueSlug("!!!", new Set())).toBe("opportunity");
  });
});
