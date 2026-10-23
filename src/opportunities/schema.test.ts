import { describe, expect, it } from "vitest";
import { opportunitySchema, parseOpportunity } from "./schema";

function valid() {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    slug: "test-job",
    type: "job" as const,
    title: "Test Job",
    org: "Test org",
    summary: "A short summary.",
    description: "A longer description.",
    location: "Remote",
    remote: true,
    applyUrl: "https://example.com/apply",
    publishedAt: "2026-01-01",
  };
}

describe("opportunitySchema", () => {
  it("accepts a minimal valid job", () => {
    expect(parseOpportunity(valid())).toEqual(valid());
  });

  it("accepts every optional field filled in", () => {
    const full = {
      ...valid(),
      orgUrl: "https://example.com",
      commitment: "Full-time",
      compensation: "$100k",
      deadline: "2026-02-01",
      startDate: "2026-03-01",
      endDate: "2026-06-01",
      tags: ["Tag"],
      applyLabel: "Apply now",
      sourceUrl: "https://example.com/original-posting",
    };
    expect(parseOpportunity(full)).toEqual(full);
  });

  it("rejects an unknown key", () => {
    expect(opportunitySchema.safeParse({ ...valid(), extra: true }).success).toBe(false);
  });

  it("rejects a bad slug", () => {
    expect(opportunitySchema.safeParse({ ...valid(), slug: "Not Valid" }).success).toBe(false);
  });

  it("rejects a non-ISO date", () => {
    expect(opportunitySchema.safeParse({ ...valid(), deadline: "1 Feb 2026" }).success).toBe(false);
  });

  it("rejects a date that doesn't exist on the calendar", () => {
    expect(opportunitySchema.safeParse({ ...valid(), deadline: "2024-02-30" }).success).toBe(false);
  });

  it("accepts a real leap day", () => {
    expect(opportunitySchema.safeParse({ ...valid(), deadline: "2024-02-29" }).success).toBe(true);
  });

  it("rejects a non-URL applyUrl", () => {
    expect(opportunitySchema.safeParse({ ...valid(), applyUrl: "not a url" }).success).toBe(false);
  });

  it("rejects an empty required field", () => {
    expect(opportunitySchema.safeParse({ ...valid(), title: "" }).success).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(opportunitySchema.safeParse({ ...valid(), type: "internship" }).success).toBe(false);
  });
});
