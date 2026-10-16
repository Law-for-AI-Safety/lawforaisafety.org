import fs from "node:fs";
import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("sitemap.xml", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("lists the homepage first, then every public page", () => {
    expect(urls[0]).toBe("https://lawforaisafety.org");
    for (const page of ["field-building", "red-lines-dialogue", "mep-outreach", "council-of-europe", "freedom-of-information"]) {
      expect(urls, page).toContain(`https://lawforaisafety.org/${page}`);
    }
  });

  it("dates content pages by their files' updatedAt", () => {
    const { updatedAt } = JSON.parse(fs.readFileSync("content/field-building.json", "utf8"));
    expect(entries.find((e) => e.url.endsWith("/field-building"))?.lastModified).toEqual(new Date(updatedAt));
  });

  it("leaves out the admin, the flows' steps and anything not a page", () => {
    for (const url of urls) expect(url).not.toMatch(/\/(admin|api|apply|newsletter|og-assets)\b|\/(confirm|retry)$|\[/);
  });
});
