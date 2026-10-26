import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { opportunitySubmissions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import NewOpportunityPage from "../new/page";
import SubmissionPage from "./[id]/page";
import SubmissionsPage from "./page";

const PENDING = {
  authProvider: "google" as const,
  status: "pending" as const,
  name: "Sam Submitter",
  email: "sam@example.org",
  type: "event" as const,
  title: "AI Law Summit",
  org: "Example Org",
  applyUrl: "https://example.org/register",
  location: "Brussels, Belgium",
  startDate: "2026-11-20",
  description: "A day of talks.",
  note: "I'm one of the organisers.",
};

async function insert(values: Partial<typeof opportunitySubmissions.$inferInsert> = {}) {
  const [row] = await db.insert(opportunitySubmissions).values({ ...PENDING, ...values }).returning();
  return row;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  await db.delete(opportunitySubmissions);
});

describe("the submissions list", () => {
  it("lists confirmed submissions, pending first, and never drafts", async () => {
    await insert({ title: "Old One", status: "rejected", createdAt: new Date("2026-10-01") });
    await insert({ title: "Waiting One", createdAt: new Date("2026-09-01") });
    await insert({ title: "Unconfirmed", status: "draft" });

    render(await SubmissionsPage());
    const links = screen.getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual(["Waiting One at Example Org", "Old One at Example Org"]);
    expect(screen.getByText("To review")).toBeInTheDocument();
  });

  it("names a link-only submission by its address", async () => {
    await insert({ title: null, org: null, sourceUrl: "https://example.org/post" });
    render(await SubmissionsPage());
    expect(screen.getByRole("link", { name: "https://example.org/post" })).toBeInTheDocument();
  });
});

describe("a submission's page", () => {
  it("shows what was sent and who sent it, with a way to publish it", async () => {
    const row = await insert();
    render(await SubmissionPage(params(row.id)));

    expect(screen.getByText("I'm one of the organisers.")).toBeInTheDocument();
    expect(screen.getByText(/Sam Submitter \(sam@example.org\), email confirmed via Google/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://example.org/register" })).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(screen.getByRole("link", { name: "Create listing from this" })).toHaveAttribute(
      "href",
      `/admin/opportunities/new?submission=${row.id}`,
    );
    await userEvent.click(screen.getByRole("button", { name: "Reject…" }));
    expect(screen.getByRole("checkbox", { name: /Email the submitter/ })).toBeChecked();
  });

  it("shows the outcome, with no actions, once decided", async () => {
    const row = await insert({ status: "rejected", reviewedBy: "admin@example.com", rejectionReason: "Duplicate" });
    render(await SubmissionPage(params(row.id)));
    expect(screen.getByText(/Rejected by admin@example.com/)).toHaveTextContent("Reason: Duplicate");
    expect(screen.queryByRole("link", { name: "Create listing from this" })).not.toBeInTheDocument();
  });

  it("is a 404 for a draft or a made-up id", async () => {
    const draft = await insert({ status: "draft" });
    await expect(SubmissionPage(params(draft.id))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(SubmissionPage(params("nope"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("creating a listing from a submission", () => {
  it("starts the form from what was sent", async () => {
    const row = await insert();
    render(await NewOpportunityPage({ searchParams: Promise.resolve({ submission: row.id }) }));

    expect(screen.getByText(/sent in by Sam Submitter/)).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("AI Law Summit");
    expect(screen.getByLabelText("Type")).toHaveValue("event");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-11-20");
    expect(screen.getByLabelText(/Location note/)).toHaveValue("Brussels, Belgium");
  });

  it("is a 404 for a submission already dealt with", async () => {
    const row = await insert({ status: "published" });
    await expect(NewOpportunityPage({ searchParams: Promise.resolve({ submission: row.id }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
