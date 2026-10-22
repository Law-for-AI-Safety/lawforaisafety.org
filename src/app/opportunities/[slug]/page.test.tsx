import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withOpportunities } from "../../../../test/fakes/opportunities-dir";
import { getOpportunities } from "@/opportunities/data";
import type { Opportunity } from "@/opportunities/types";
import OpportunityPage, { dynamicParams, generateMetadata, generateStaticParams } from "./page";

const JOB: Opportunity = {
  slug: "fixture-job",
  type: "job",
  title: "Fixture Job",
  org: "Fixture Org",
  summary: "A short summary.",
  description: "A longer description.",
  location: "Remote",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-01-01",
};

const COURSE: Opportunity = {
  ...JOB,
  slug: "fixture-course",
  type: "course",
  title: "Fixture Course",
  applyUrl: "https://example.com/enrol",
};

let restore: () => void;
beforeEach(() => {
  restore = withOpportunities([JOB, COURSE]).restore;
});
afterEach(() => restore());

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("an opportunity's detail page", () => {
  it("builds static params for every listing", () => {
    expect(generateStaticParams()).toEqual(getOpportunities().map((o) => ({ slug: o.slug })));
  });

  it("is a 404 for any other address", async () => {
    expect(dynamicParams).toBe(false);
    await expect(OpportunityPage(params("no-such-opportunity"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateMetadata(params("no-such-opportunity"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders a job's title, org, facts and an Apply now CTA", async () => {
    render(await OpportunityPage(params(JOB.slug)));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(JOB.title);
    expect(screen.getByText(JOB.org)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: JOB.applyLabel ?? "Apply now" });
    expect(cta).toHaveAttribute("href", JOB.applyUrl);
  });

  it("renders a course's View course CTA", async () => {
    render(await OpportunityPage(params(COURSE.slug)));
    expect(screen.getByRole("link", { name: COURSE.applyLabel ?? "View course" })).toHaveAttribute(
      "href",
      COURSE.applyUrl,
    );
  });

  it("gives the page its own metadata", async () => {
    expect(await generateMetadata(params(JOB.slug))).toMatchObject({
      title: `${JOB.title} at ${JOB.org} | Opportunities | Law for AI Safety`,
      alternates: { canonical: `/opportunities/${JOB.slug}` },
    });
  });
});
