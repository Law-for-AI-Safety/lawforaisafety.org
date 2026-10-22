import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkOpportunityFiles,
  formatOpportunityText,
  OpportunityFileError,
  opportunityFilePath,
  opportunitySlugs,
  printOpportunity,
  readOpportunityFiles,
  readValidOpportunityFiles,
} from "./files";
import type { Opportunity } from "./types";

const valid: Opportunity = {
  slug: "test-job",
  type: "job",
  title: "Test Job",
  org: "Test org",
  summary: "A short summary.",
  description: "A longer description.",
  location: "Remote",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-01-01",
};

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "opportunities-"));
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function write(slug: string, text: string) {
  fs.writeFileSync(path.join(dir, `${slug}.json`), text);
}

describe("opportunityFilePath", () => {
  it("is content/opportunities/<slug>.json", () => {
    expect(opportunityFilePath("test-job")).toBe("content/opportunities/test-job.json");
  });
});

describe("opportunitySlugs", () => {
  it("lists .json files, sorted, without the extension", () => {
    write("b-job", printOpportunity(valid));
    write("a-job", printOpportunity({ ...valid, slug: "a-job" }));
    expect(opportunitySlugs(dir)).toEqual(["a-job", "b-job"]);
  });

  it("is empty for a directory that doesn't exist", () => {
    expect(opportunitySlugs(path.join(dir, "missing"))).toEqual([]);
  });
});

describe("formatOpportunityText", () => {
  it("round-trips an already-canonical file", () => {
    const text = printOpportunity(valid);
    expect(formatOpportunityText("test-job", text)).toBe(text);
  });

  it("throws on invalid JSON", () => {
    expect(() => formatOpportunityText("test-job", "not json")).toThrow(OpportunityFileError);
  });

  it("throws when the content fails the schema", () => {
    expect(() => formatOpportunityText("test-job", JSON.stringify({ ...valid, title: "" }))).toThrow(OpportunityFileError);
  });

  it("throws when the filename doesn't match the slug inside", () => {
    expect(() => formatOpportunityText("other-name", printOpportunity(valid))).toThrow(/does not match its filename/);
  });
});

describe("readOpportunityFiles", () => {
  it("parses every file in the directory", () => {
    write("test-job", printOpportunity(valid));
    expect(readOpportunityFiles(dir)).toEqual([valid]);
  });

  it("throws when a file's slug doesn't match its filename", () => {
    write("wrong-name", printOpportunity(valid));
    expect(() => readOpportunityFiles(dir)).toThrow(/does not match its filename/);
  });
});

describe("readValidOpportunityFiles", () => {
  it("parses every file in the directory, same as readOpportunityFiles when all are valid", () => {
    write("test-job", printOpportunity(valid));
    expect(readValidOpportunityFiles(dir)).toEqual([valid]);
  });

  it("skips a pending import's stub file instead of throwing", () => {
    write("test-job", printOpportunity(valid));
    write("pending-example-com-aaaa", JSON.stringify({ url: "https://example.com/careers/role" }));
    expect(readValidOpportunityFiles(dir)).toEqual([valid]);
  });

  it("skips a file whose slug doesn't match its filename", () => {
    write("test-job", printOpportunity(valid));
    write("wrong-name", printOpportunity({ ...valid, slug: "test-job" }));
    expect(readValidOpportunityFiles(dir)).toEqual([valid]);
  });

  it("returns an empty list rather than throwing when every file is invalid", () => {
    write("pending-example-com-aaaa", JSON.stringify({ url: "https://example.com/careers/role" }));
    expect(readValidOpportunityFiles(dir)).toEqual([]);
  });
});

describe("checkOpportunityFiles", () => {
  it("passes a canonical, valid directory", () => {
    write("test-job", printOpportunity(valid));
    expect(checkOpportunityFiles(dir)).toEqual([]);
  });

  it("flags a file that isn't in canonical form", () => {
    write("test-job", JSON.stringify(valid)); // one-line, not pretty-printed
    expect(checkOpportunityFiles(dir)).toEqual([expect.stringContaining("not in canonical form")]);
  });

  it("flags an invalid file", () => {
    write("test-job", JSON.stringify({ ...valid, title: "" }));
    expect(checkOpportunityFiles(dir)).toEqual([expect.stringContaining("is invalid")]);
  });
});
