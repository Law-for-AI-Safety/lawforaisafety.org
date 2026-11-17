import { render, screen, within } from "@testing-library/react";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import userEvent from "@testing-library/user-event";
import { newsletterSignups, newsletters, rateLimitHits } from "@/drizzle/schema";
import { setSignupEnabled } from "@/lib/feature-flags";
import { emails } from "../../../test/fakes/email";
import { turnstile } from "../../../test/fakes/turnstile";
import IssuePage, { generateMetadata } from "./[slug]/page";
import { GET as shareImage } from "./[slug]/share-image/route";
import UpdatesPage from "./page";
import { dataCache } from "../../../test/next-cache";

/**
 * The public pages of newsletter issues on the website: the list and each issue's page, with
 * its metadata and share card. Issues are written straight to the table here; the admin side
 * that ticks them is tested in src/app/admin/(protected)/newsletters/website.db.test.tsx.
 */

const NOW = new Date("2026-11-15T12:00:00Z");
const ISSUE = {
  subject: "November update",
  previewText: "What we did this month",
  body: "Hello **everyone**.\n\n- [Field building](/field-building)\n- [The Act](https://example.org/act)\n\nFish & chips, 3 < 4.",
  state: "submitted" as const,
  scheduledAt: new Date("2026-11-10T09:00:00Z"),
  sentAt: new Date("2026-11-10T09:00:00Z"),
  webPublished: true,
  webSlug: "november-update",
  createdBy: "admin@example.com",
  updatedBy: "admin@example.com",
  submittedBy: "admin@example.com",
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await db.delete(newsletters);
  await db.insert(newsletters).values([
    ISSUE,
    { ...ISSUE, subject: "October update", previewText: "", body: "A quieter month.", scheduledAt: new Date("2026-10-08T09:00:00Z"), sentAt: new Date("2026-10-08T09:00:00Z"), webSlug: "october-update" },
    { ...ISSUE, subject: "Event next week", webPublished: false, webSlug: null },
    { ...ISSUE, subject: "December update", scheduledAt: new Date("2026-12-10T09:00:00Z"), sentAt: null, webSlug: "december-update" },
    // Its send time has passed, but Brevo hasn't been heard to have sent it.
    { ...ISSUE, subject: "Unconfirmed", sentAt: null, webSlug: "unconfirmed" },
    { ...ISSUE, subject: "Draft", state: "draft", webSlug: "draft" },
  ]);
});

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("the updates list", () => {
  it("lists only issues on the website, newest first, with their date and summary", async () => {
    render(await UpdatesPage());
    const items = screen.getAllByRole("listitem").map((li) => within(li).getByRole("link").textContent);
    expect(items).toEqual(["November update", "October update"]);
    expect(screen.getByRole("link", { name: "November update" })).toHaveAttribute("href", "/updates/november-update");
    expect(screen.getByText("10 November 2026")).toHaveAttribute("dateTime", "2026-11-10T09:00:00.000Z");
    expect(screen.getByText("What we did this month")).toBeInTheDocument();
    // Without preview text, the start of the body stands in.
    expect(screen.getByText("A quieter month.")).toBeInTheDocument();
    const signup = within(screen.getByRole("region", { name: "Get these by email" }));
    expect(signup.getByRole("textbox", { name: "Email address" })).toBeRequired();
    expect(signup.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    expect(signup.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy-policy");
  });

  it("says when there are none", async () => {
    await db.delete(newsletters);
    render(await UpdatesPage());
    expect(screen.getByText("No updates yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("an issue's page", () => {
  it("renders the body as sent, with text kept as text and links checked", async () => {
    render(await IssuePage(params("november-update")));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("November update");
    expect(screen.getByText("everyone").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Field building" })).toHaveAttribute("href", "/field-building");
    expect(screen.getByRole("link", { name: "Field building" })).not.toHaveAttribute("target");
    const external = screen.getByRole("link", { name: "The Act" });
    expect(external).toHaveAttribute("href", "https://example.org/act");
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Fish & chips, 3 < 4.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All updates" })).toHaveAttribute("href", "/updates");
  });

  it("signs a reader up to the newsletter, confirmed by email as on the homepage", async () => {
    await db.delete(rateLimitHits);
    await setSignupEnabled(true, "admin@example.com");
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    const user = userEvent.setup();
    render(await IssuePage(params("november-update")));
    const signup = within(screen.getByRole("region", { name: "Get the next one by email" }));
    turnstile.solve();
    await user.type(signup.getByRole("textbox", { name: "Email address" }), "reader@example.com");
    // Slower than the fill time below which a submission counts as a bot's.
    vi.setSystemTime(NOW.getTime() + 5000);
    await user.click(signup.getByRole("button", { name: "Subscribe" }));
    expect(await signup.findByRole("status")).toHaveTextContent("Check your inbox to confirm your subscription.");
    expect(emails.to("reader@example.com")).toEqual([expect.objectContaining({ subject: "Confirm your subscription" })]);
    expect(await db.select().from(newsletterSignups)).toEqual([expect.objectContaining({ email: "reader@example.com", confirmedAt: null })]);
  });

  it("has its own title, description, canonical address and share card", async () => {
    const image = { url: "/updates/november-update/share-image", width: 1200, height: 630, alt: "November update" };
    expect(await generateMetadata(params("november-update"))).toEqual({
      title: "November update | Updates | Law for AI Safety",
      description: "What we did this month",
      alternates: { canonical: "/updates/november-update" },
      openGraph: {
        type: "article",
        url: "/updates/november-update",
        title: "November update",
        description: "What we did this month",
        publishedTime: "2026-11-10T09:00:00.000Z",
        siteName: "Law for AI Safety",
        images: [image],
      },
      twitter: { card: "summary_large_image", images: [image] },
    });
    const response = await shareImage(new Request("http://localhost/updates/november-update/share-image"), params("november-update"));
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("leaves Brevo's merge tags out of the page and its summary", async () => {
    await db.update(newsletters).set({ body: "Hi {{ contact.FIRSTNAME }}, a quieter month." }).where(eq(newsletters.webSlug, "october-update"));
    dataCache.reset();
    render(await IssuePage(params("october-update")));
    expect(screen.getByText("Hi, a quieter month.")).toBeInTheDocument();
    expect(screen.queryByText(/\{\{/)).toBeNull();
    expect(await generateMetadata(params("october-update"))).toMatchObject({ description: "Hi, a quieter month." });
  });

  it("describes an issue without preview text by the start of its body", async () => {
    expect(await generateMetadata(params("october-update"))).toMatchObject({ description: "A quieter month." });
    // Written around the admin, so the cached list is dropped by hand.
    await db.update(newsletters).set({ body: "" });
    dataCache.reset();
    const metadata = await generateMetadata(params("october-update"));
    expect(metadata.description).toBeUndefined();
    expect(metadata.openGraph).not.toHaveProperty("description");
  });

  it("is a 404, card included, for an issue not on the website or any other address", async () => {
    for (const slug of ["december-update", "unconfirmed", "draft", "no-such-issue"]) {
      await expect(IssuePage(params(slug)), slug).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(generateMetadata(params(slug)), slug).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(shareImage(new Request("http://localhost/"), params(slug)), slug).rejects.toThrow("NEXT_NOT_FOUND");
    }
  });
});
