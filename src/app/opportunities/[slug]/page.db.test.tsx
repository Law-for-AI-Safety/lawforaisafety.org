import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { opportunities } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { dataCache } from "../../../../test/next-cache";
import { deleteOpportunity, updateOpportunity } from "@/lib/opportunities-flow";
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

  it("labels an event's dates and button as an event's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    await db.insert(opportunities).values({ ...JOB, slug: "an-event", type: "event", startDate: "2026-11-20", deadline: "2026-11-10" });
    render(await OpportunityPage(params("an-event")));
    expect(screen.getByText("Event")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Register by")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", JOB.applyUrl);
  });

  it("closes an event with no deadline once it has taken place", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    await db.insert(opportunities).values({ ...JOB, slug: "past-event", type: "event", startDate: "2026-10-30" });
    render(await OpportunityPage(params("past-event")));
    expect(screen.getByText("Registration closed on 30 Oct 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Register" })).not.toBeInTheDocument();
  });

  it("still shows the CTA on the deadline day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    await db.insert(opportunities).values({ ...JOB, slug: "closing-job", deadline: "2026-10-30" });
    render(await OpportunityPage(params("closing-job")));
    expect(screen.getByRole("link", { name: "Apply now" })).toHaveAttribute("href", JOB.applyUrl);
    expect(screen.queryByText("Closed")).not.toBeInTheDocument();
  });

  it("shows an edit made through the flow at once", async () => {
    render(await OpportunityPage(params(JOB.slug)));
    const { type, org, summary, description, locationCountry, remote, applyUrl } = JOB;
    await updateOpportunity(
      JOB.slug,
      { type, title: "Renamed Job", org, summary, description, locationCountry, remote, applyUrl },
      "admin@example.com",
    );

    cleanup();
    render(await OpportunityPage(params(JOB.slug)));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Renamed Job");
  });

  it("is a 404 at once when the listing is deleted through the flow", async () => {
    render(await OpportunityPage(params(JOB.slug)));
    await deleteOpportunity(JOB.slug, "admin@example.com");
    await expect(OpportunityPage(params(JOB.slug))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("keeps a closed listing out of search results", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    await db.insert(opportunities).values({ ...JOB, slug: "closed-job", deadline: "2026-10-30" });
    expect(await generateMetadata(params("closed-job"))).toMatchObject({ robots: { index: false } });
    expect(await generateMetadata(params(JOB.slug))).not.toHaveProperty("robots");
  });

  it("caches nothing extra for a made-up address", async () => {
    render(await OpportunityPage(params(JOB.slug)));
    const cached = dataCache.size;
    await expect(OpportunityPage(params("no-such-opportunity"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(dataCache.size).toBe(cached);
  });

  it("gives the page its own metadata", async () => {
    expect(await generateMetadata(params(JOB.slug))).toMatchObject({
      title: `${JOB.title} at ${JOB.org} | Opportunities | Law for AI Safety`,
      alternates: { canonical: `/opportunities/${JOB.slug}` },
    });
  });
});
