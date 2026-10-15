import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { defaultDirs } from "./content-files";
import { parseRedirects, printRedirects, readRedirects, redirectProblems, RedirectsError, REDIRECTS_FILE, type Redirect } from "./redirects";

const routes = [[], ["about"], ["field-building"], ["images", "a.webp"]];
const reserved = new Set(["admin", "apply", "about", "field-building"]);
const check = (redirects: Redirect[]) => redirectProblems(redirects, { reserved, routes });
const at = (r: Redirect) => `content/${REDIRECTS_FILE}: ${r.from} → ${r.to}`;

describe("redirectProblems", () => {
  it("accepts old addresses that lead to real pages or https: addresses", () => {
    expect(
      check([
        { from: "/old-page", to: "/field-building" },
        { from: "/older", to: "/field-building#contact" },
        { from: "/gone", to: "/" },
        { from: "/elsewhere", to: "https://example.org/page" },
      ]),
    ).toEqual([]);
  });

  it.each(["old-page", "/Old", "/a/b", "/a_b", "/", "https://example.org/x"])("refuses the old address %j", (from) => {
    const r = { from, to: "/about" };
    expect(check([r])).toEqual([`${at(r)}: the old address must be / followed by lowercase letters, digits and hyphens`]);
  });

  it("refuses a reserved old address, and one that is still a page", () => {
    const admin = { from: "/admin", to: "/about" };
    expect(check([admin])).toEqual([`${at(admin)}: /admin is reserved by the site and cannot be redirected`]);
    const page = { from: "/new-page", to: "/about" };
    expect(redirectProblems([page], { reserved, routes: [...routes, ["new-page"]] })).toEqual([
      `${at(page)}: /new-page is a page, so it cannot also be redirected`,
    ]);
  });

  it("refuses an old address redirected twice", () => {
    const r = { from: "/old", to: "/about" };
    expect(check([r, r])).toEqual([`${at(r)}: /old is redirected more than once`]);
  });

  it("refuses targets that are not pages or https: addresses", () => {
    const missing = { from: "/a", to: "/nowhere" };
    const bad = { from: "/b", to: "/about us" };
    const http = { from: "/c", to: "http://example.org" };
    const mail = { from: "/d", to: "mailto:a@b.org" };
    const noHost = { from: "/e", to: "https://localhost" };
    expect(check([missing, bad, http, mail, noHost])).toEqual([
      `${at(missing)}: /nowhere is not a page on this site`,
      `${at(bad)}: /about us is not a page on this site`,
      `${at(http)}: the new address must be a page on this site (starting with /) or an https: address`,
      `${at(mail)}: the new address must be a page on this site (starting with /) or an https: address`,
      `${at(noHost)}: the new address must be a page on this site (starting with /) or an https: address`,
    ]);
  });

  it("refuses loops and chains", () => {
    const self = { from: "/a", to: "/a" };
    expect(check([self])).toEqual([`${at(self)}: a redirect cannot lead to itself`]);
    const ab = { from: "/a", to: "/b" };
    const ba = { from: "/b", to: "/a#top" };
    expect(check([ab, ba])).toEqual([
      `${at(ab)}: /b is itself redirected; chains and loops are not allowed, point at the final page`,
      `${at(ba)}: /a is itself redirected; chains and loops are not allowed, point at the final page`,
    ]);
  });
});

describe("reading the redirects file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cms-redirects-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("has none without a file", () => {
    expect(readRedirects(dir)).toEqual([]);
  });

  it("reads the list, and prints it back the one canonical way", () => {
    const text = printRedirects([{ from: "/old", to: "/about" }]);
    expect(text).toBe('{\n  "redirects": [\n    {\n      "from": "/old",\n      "to": "/about"\n    }\n  ]\n}\n');
    fs.writeFileSync(path.join(dir, REDIRECTS_FILE), text);
    expect(readRedirects(dir)).toEqual([{ from: "/old", to: "/about" }]);
  });

  it("refuses text that is not JSON, or not of the right shape", () => {
    expect(() => parseRedirects("{")).toThrow(RedirectsError);
    expect(() => parseRedirects("{")).toThrow(/is not valid JSON/);
    expect(() => parseRedirects('{"redirects":[{"from":"/a"}]}')).toThrow(/is invalid/);
    expect(() => parseRedirects('{"redirects":[],"extra":1}')).toThrow(/is invalid/);
  });
});

describe("the site's redirects", () => {
  it("are served by next.config.ts as permanent redirects, one for each in the file", async () => {
    const expected = readRedirects(defaultDirs().contentDir).map(({ from, to }) => ({ source: from, destination: to, permanent: true }));
    expect(await nextConfig.redirects!()).toEqual(expected);
  });
});
