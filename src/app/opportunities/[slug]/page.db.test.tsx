import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { opportunities } from "@/drizzle/schema";
import { db } from "@/lib/db";
import OpportunityPage, { generateMetadata } from "./page";

const JOB = {
  slug: "fixture-job",
  type: "job" as const,
  title: "Fixture Job",
  org: "Fixture Org",
  summary: "A short summary.",
  description: "A longer description.",
  locationCountry: "GLOBAL",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-01-01",
  createdBy: "admin@example.com",
};

const COURSE = {
  ...JOB,
  slug: "fixture-course",
  type: "course" as const,
  title: "Fixture Course",
  applyUrl: "https://example.com/enrol",
};

beforeEach(async () => {
  await db.delete(opportunities);
  await db.insert(opportunities).values([JOB, COURSE]);
});

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("an opportunity's detail page", () => {
  it("is a 404 for any other address", async () => {
    await expect(OpportunityPage(params("no-such-opportunity"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateMetadata(params("no-such-opportunity"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders a job's title, org, facts and an Apply now CTA", async () => {
    render(await OpportunityPage(params(JOB.slug)));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(JOB.title);
    expect(screen.getByText(JOB.org)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Apply now" });
    expect(cta).toHaveAttribute("href", JOB.applyUrl);
  });

  it("renders a course's View course CTA", async () => {
    render(await OpportunityPage(params(COURSE.slug)));
    expect(screen.getByRole("link", { name: "View course" })).toHaveAttribute("href", COURSE.applyUrl);
  });

  it("gives the page its own metadata", async () => {
    expect(await generateMetadata(params(JOB.slug))).toMatchObject({
      title: `${JOB.title} at ${JOB.org} | Opportunities | Law for AI Safety`,
      alternates: { canonical: `/opportunities/${JOB.slug}` },
    });
  });
});
