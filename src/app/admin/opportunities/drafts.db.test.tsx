import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions, opportunities, opportunitiesAuditLog } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { startAdminSession } from "@/lib/session";
import { getCachedOpportunities, getOpportunityBySlug } from "@/opportunities/data";
import { navigation } from "../../../../test/next-navigation";
import { cookieJar } from "../../../../test/next-headers";
import OpportunityPreviewPage from "../opportunity-preview/[slug]/page";
import EditOpportunityForm from "./[slug]/EditOpportunityForm";
import EditOpportunityPage from "./[slug]/page";
import OpportunitiesLayout from "./layout";
import NewOpportunityForm from "./new/NewOpportunityForm";
import OpportunitiesListPage from "./page";

vi.mock("next/headers", () => import("../../../../test/next-headers"));

const PUBLISHED = {
  slug: "live-job",
  type: "job" as const,
  title: "Live Job",
  org: "Fixture Org",
  summary: "A short summary.",
  description: "A longer description.",
  locationCountry: "GLOBAL",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-01-01",
  createdBy: "admin@example.com",
};
const DRAFT = { ...PUBLISHED, slug: "draft-job", title: "Draft Job", status: "draft" as const, publishedAt: null };

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(async () => {
  cookieJar.reset();
  await db.delete(adminSessions);
  await db.delete(opportunitiesAuditLog);
  await db.delete(opportunities);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  await db.insert(opportunities).values([PUBLISHED, DRAFT]);
  await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
});

describe("drafts in the admin", () => {
  it("counts them in the header, linking to the list's drafts", async () => {
    render(await OpportunitiesLayout({ children: null }));
    expect(screen.getByRole("link", { name: "Drafts (1 to publish)" })).toHaveAttribute("href", "/admin/opportunities#drafts");
  });

  it("leaves the header's drafts link out when there are none", async () => {
    await db.delete(opportunities);
    render(await OpportunitiesLayout({ children: null }));
    expect(screen.queryByRole("link", { name: /Drafts/ })).not.toBeInTheDocument();
  });

  it("lists them apart from the published listings, marked and with a preview link", async () => {
    render(await OpportunitiesListPage());
    const drafts = screen.getByRole("region", { name: "Drafts (1)" });
    expect(within(drafts).getByRole("link", { name: "Draft Job" })).toHaveAttribute("href", "/admin/opportunities/draft-job");
    expect(within(drafts).getByText("Draft")).toBeInTheDocument();
    expect(within(drafts).getByRole("link", { name: "Preview" })).toHaveAttribute("href", "/admin/opportunity-preview/draft-job");
    expect(within(drafts).queryByText("Live Job")).not.toBeInTheDocument();

    const published = screen.getByRole("region", { name: "Published" });
    expect(within(published).getByRole("link", { name: "Live Job" })).toBeInTheDocument();
  });

  it("marks a draft's edit page, with a link to preview it", async () => {
    render(await EditOpportunityPage(params(DRAFT.slug)));
    expect(screen.getByText("Not on the public site until it is published.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preview it as it would look" })).toHaveAttribute(
      "href",
      "/admin/opportunity-preview/draft-job",
    );
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
  });

  it("shows a published listing's edit page its date and live link, with no Publish button", async () => {
    render(await EditOpportunityPage(params(PUBLISHED.slug)));
    expect(screen.getByText(/Published 1 Jan 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View it live" })).toHaveAttribute("href", "/opportunities/live-job");
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });
});

describe("publishing a draft from its edit page", () => {
  it("saves the edits and puts it on the public board, dated today", async () => {
    const draft = (await getOpportunityBySlug(DRAFT.slug))!;
    render(<EditOpportunityForm opportunity={draft} />);
    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.type(screen.getByLabelText("Title"), "Edited Draft Job");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByText(/Published and live now/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View it live" })).toHaveAttribute("href", "/opportunities/draft-job");
    expect(await getOpportunityBySlug(DRAFT.slug)).toMatchObject({ title: "Edited Draft Job", status: "published", publishedAt: "2026-11-04" });
    expect((await getCachedOpportunities()).map((o) => o.slug)).toContain(DRAFT.slug);
    // So the page's draft banner and the header's count catch up.
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it("goes back to the list once a draft is removed, rather than refreshing a page that is gone", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const draft = (await getOpportunityBySlug(DRAFT.slug))!;
    render(<EditOpportunityForm opportunity={draft} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove this listing" }));
    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/admin/opportunities"));
    expect(window.confirm).toHaveBeenCalledWith('Remove "Draft Job"? This deletes the draft.');
    expect(navigation.refresh).toHaveBeenCalled();
    expect(await getOpportunityBySlug(DRAFT.slug)).toBeNull();
  });

  it("shows the notice, with no navigation, once a published listing is removed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const live = (await getOpportunityBySlug(PUBLISHED.slug))!;
    render(<EditOpportunityForm opportunity={live} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove this listing" }));
    expect(await screen.findByText(/Removed:/)).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("keeps it a draft on Save draft, with the form still open to publish", async () => {
    const draft = (await getOpportunityBySlug(DRAFT.slug))!;
    render(<EditOpportunityForm opportunity={draft} />);
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText(/Draft saved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
    // So the page's heading and the Remove prompt pick up an edited title.
    expect(navigation.refresh).toHaveBeenCalled();
    expect(await getOpportunityBySlug(DRAFT.slug)).toMatchObject({ status: "draft", publishedAt: undefined });
  });

  it("shows why publishing failed", async () => {
    const draft = (await getOpportunityBySlug(DRAFT.slug))!;
    await db.delete(opportunities);
    render(<EditOpportunityForm opportunity={draft} />);
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("There is no such listing.")).toBeInTheDocument();
  });
});

describe("saving a new listing as a draft", () => {
  async function fillIn() {
    await userEvent.type(screen.getByLabelText("Title"), "New Role");
    await userEvent.type(screen.getByLabelText("Organisation"), "Acme");
    await userEvent.type(screen.getByLabelText(/^Summary/), "A short summary.");
    await userEvent.type(screen.getByLabelText(/^Description/), "A longer description.");
    await userEvent.selectOptions(screen.getByLabelText("Country"), "GLOBAL");
    await userEvent.type(screen.getByLabelText("Apply link or email"), "https://example.com/apply");
  }

  it("creates it off the public site, with links to preview and publish it", async () => {
    render(<NewOpportunityForm />);
    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    expect(await screen.findByText(/Saved as a draft, not yet on the site/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preview it" })).toHaveAttribute("href", "/admin/opportunity-preview/acme-new-role");
    expect(screen.getByRole("link", { name: "edit and publish it" })).toHaveAttribute("href", "/admin/opportunities/acme-new-role");
    expect(await getOpportunityBySlug("acme-new-role")).toMatchObject({ status: "draft" });
    expect((await getCachedOpportunities()).map((o) => o.slug)).not.toContain("acme-new-role");
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it("isn't offered for a listing made from a submission, which goes live at once", () => {
    render(<NewOpportunityForm submissionId="00000000-0000-0000-0000-000000000000" />);
    expect(screen.queryByRole("button", { name: "Save as draft" })).not.toBeInTheDocument();
  });
});

describe("the admin preview of a listing", () => {
  it("shows a draft as its public page would, marked as a preview", async () => {
    render(await OpportunityPreviewPage(params(DRAFT.slug)));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Draft Job");
    expect(screen.getByRole("link", { name: "Apply now" })).toHaveAttribute("href", DRAFT.applyUrl);
    expect(screen.getByText(/Preview of a draft/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to editing" })).toHaveAttribute("href", "/admin/opportunities/draft-job");
    // The public board wouldn't show the draft, so the preview doesn't send the admin there.
    expect(screen.queryByRole("link", { name: "← All opportunities" })).not.toBeInTheDocument();
  });

  it("says when the listing is already published", async () => {
    render(await OpportunityPreviewPage(params(PUBLISHED.slug)));
    expect(screen.getByText(/Preview of a published listing/)).toBeInTheDocument();
  });

  it("is a 404 for a made-up slug", async () => {
    await expect(OpportunityPreviewPage(params("no-such-job"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sends a signed-out visitor to log in", async () => {
    cookieJar.reset();
    await expect(OpportunityPreviewPage(params(DRAFT.slug))).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });

  it("sends an admin outside the opportunities team back to the admin", async () => {
    vi.stubEnv("OPPORTUNITIES_TEAM_EMAILS", "someone-else@example.com");
    await expect(OpportunityPreviewPage(params(DRAFT.slug))).rejects.toThrow("NEXT_REDIRECT:/admin");
  });
});
