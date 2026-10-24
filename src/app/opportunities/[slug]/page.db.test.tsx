import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("keeps a closed listing's page up, marked closed and with no CTA", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    await db.insert(opportunities).values({ ...JOB, slug: "closed-job", deadline: "2026-10-30" });
    render(await OpportunityPage(params("closed-job")));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(JOB.title);
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("Applications closed on 30 Oct 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Apply now" })).not.toBeInTheDocument();
  });

  it("still shows the CTA on the deadline day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    await db.insert(opportunities).values({ ...JOB, slug: "closing-job", deadline: "2026-10-30" });
    render(await OpportunityPage(params("closing-job")));
    expect(screen.getByRole("link", { name: "Apply now" })).toHaveAttribute("href", JOB.applyUrl);
    expect(screen.queryByText("Closed")).not.toBeInTheDocument();
  });

  it("gives the page its own metadata", async () => {
    expect(await generateMetadata(params(JOB.slug))).toMatchObject({
      title: `${JOB.title} at ${JOB.org} | Opportunities | Law for AI Safety`,
      alternates: { canonical: `/opportunities/${JOB.slug}` },
    });
  });
});
