import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { adminAuditLog, cmsRoles, newsletters } from "@/drizzle/schema";
import { setStoredCmsPermission } from "@/lib/cms-store";
import { assignSlug } from "@/lib/newsletter-store";
import { startAdminSession } from "@/lib/session";
import { brevo } from "../../../test/fakes/brevo";
import { emails } from "../../../test/fakes/email";
import { indexNow, INDEXNOW_KEY } from "../../../test/fakes/indexnow";
import { afterTasks } from "../../../test/next-after";
import { dataCache } from "../../../test/next-cache";
import { cookieJar } from "../../../test/next-headers";
import { navigation } from "../../../test/next-navigation";
import {
  cancelNewsletter,
  createNewsletter,
  recoverNewsletter,
  saveNewsletter,
  scheduleNewsletter,
  sendTestNewsletter,
  setNewsletterOnWeb,
} from "../admin/(protected)/newsletters/actions";
import AdminNewslettersPage from "../admin/(protected)/newsletters/page";
import AdminNewsletterPage from "../admin/(protected)/newsletters/[id]/page";
import sitemap from "../sitemap";
import { SENT_CHECK_SECONDS } from "@/newsletter/archive";
import ArchivePage, { metadata as archiveMetadata } from "./page";
import IssuePage, { generateMetadata } from "./[slug]/page";

vi.mock("next/headers", () => import("../../../test/next-headers"));

/**
 * The newsletter on the website, end to end against a real database and the Brevo fake: when
 * an issue becomes public, what its page shows, taking it down and putting it back, and the
 * archive, sitemap and search-engine pings that follow it.
 */

const ADMINS = { draft: "draft@example.com", publish: "publish@example.com", superadmin: "tech@example.com" };
type Who = keyof typeof ADMINS;

async function signInAs(who: Who) {
  cookieJar.reset();
  await startAdminSession({ email: ADMINS[who], name: `${who} person` });
}

const FIELDS = {
  subject: "November update",
  previewText: "What we did this month",
  body: "Hello **everyone**.\n\n- [Apply](/field-building)",
  publishOnWeb: true,
};
const NOW = new Date("2026-11-15T12:00:00Z");
const SEND_AT = "2026-11-22T09:00:00.000Z";
const AFTER_SEND = new Date("2026-11-22T09:30:00Z");

beforeEach(async () => {
  vi.stubEnv("ADMIN_EMAILS", Object.values(ADMINS).join(","));
  vi.stubEnv("TECH_ADMIN_EMAILS", ADMINS.superadmin);
  vi.stubEnv("DEPLOY_CONTEXT", "production");
  vi.stubEnv("INDEXNOW_KEY", INDEXNOW_KEY);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await db.delete(newsletters);
  await db.delete(cmsRoles);
  await db.delete(adminAuditLog);
  await setStoredCmsPermission(ADMINS.draft, "draft", "seed");
  await setStoredCmsPermission(ADMINS.publish, "publish", "seed");
});

// A page view can leave a cached read refreshing in the background; let it finish within its own test.
afterEach(() => dataCache.settle());

const row = async (id: string) => (await db.select().from(newsletters).where(eq(newsletters.id, id)))[0];
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const SHARE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630 };
/** The metadata, under a parent whose Open Graph has `images`, or no Open Graph at all for null. */
const metadataFor = (slug: string, images: unknown[] | null = [SHARE_IMAGE]) =>
  generateMetadata(params(slug), Promise.resolve({ openGraph: images ? { images } : null }) as never);
const campaignCalls = () => brevo.calls.filter((c) => c.startsWith("GET /v3/emailCampaigns/"));
const audit = async () =>
  (await db.select().from(adminAuditLog)).filter((r) => r.action !== "login").map((r) => ({ action: r.action, actor: r.actorEmail, detail: r.detail }));

/** A tested draft, handed to Brevo for `when` (null: send now). Returns its id, campaign and slug. */
async function handOver({ fields = FIELDS, when = SEND_AT as string | null } = {}) {
  await signInAs("superadmin");
  const created = await createNewsletter();
  if (!created.ok) throw new Error(created.message);
  const saved = await saveNewsletter(created.id, fields, 1);
  if (!saved.ok) throw new Error(saved.message);
  const tested = await sendTestNewsletter(created.id, saved.version);
  if (!tested.ok) throw new Error(tested.message);
  const scheduled = await scheduleNewsletter(created.id, saved.version, when, 120);
  if (!scheduled.ok) throw new Error(scheduled.message);
  emails.reset();
  await db.delete(adminAuditLog);
  const handed = await row(created.id);
  return { id: created.id, campaignId: handed.brevoCampaignId!, slug: handed.slug! };
}

/** An issue Brevo has sent, at `AFTER_SEND`. */
async function sentIssue(fields = FIELDS) {
  const issue = await handOver({ fields });
  vi.setSystemTime(AFTER_SEND);
  brevo.finishSending(issue.campaignId, new Date("2026-11-22T09:05:00Z"));
  return issue;
}

async function archiveLinks(): Promise<string[]> {
  cleanup();
  render(await ArchivePage());
  return screen.queryAllByRole("listitem").map((li) => within(li).getByRole("link").textContent!);
}

describe("the issue's address", () => {
  it("is its subject and the day it goes out, fixed when it is handed to Brevo", async () => {
    const { slug } = await handOver();
    expect(slug).toBe("november-update-2026-11-22");
  });

  it("is unique, and falls back to 'newsletter' for a subject with nothing to keep", async () => {
    const first = await handOver();
    const second = await handOver();
    const third = await handOver({ fields: { ...FIELDS, subject: "Ça · ü?" } });
    const fourth = await handOver({ fields: { ...FIELDS, subject: "…" } });
    expect([first.slug, second.slug, third.slug, fourth.slug]).toEqual([
      "november-update-2026-11-22",
      "november-update-2026-11-22-2",
      "ca-u-2026-11-22",
      "newsletter-2026-11-22",
    ]);
  });

  it("differs for two issues handed over at once", async () => {
    await signInAs("superadmin");
    const ids = await Promise.all([1, 2].map(async () => {
      const created = await createNewsletter();
      if (!created.ok) throw new Error();
      return created.id;
    }));
    const slugs = await Promise.all(ids.map((id) => assignSlug(id, "Same", new Date(SEND_AT))));
    expect(new Set(slugs)).toEqual(new Set(["same-2026-11-22", "same-2026-11-22-2"]));
  });

  it("goes when a scheduled issue is cancelled, or a hand-over fails or is undone, since nothing went out with it", async () => {
    const cancelled = await handOver();
    expect(await cancelNewsletter(cancelled.id)).toEqual({ ok: true });
    expect((await row(cancelled.id)).slug).toBeNull();

    vi.spyOn(console, "error").mockImplementation(() => {});
    const { id, version } = await (async () => {
      const created = await createNewsletter();
      if (!created.ok) throw new Error();
      const saved = await saveNewsletter(created.id, FIELDS, 1);
      if (!saved.ok) throw new Error();
      await sendTestNewsletter(created.id, saved.version);
      return { id: created.id, version: saved.version };
    })();
    brevo.failNext("PUT /v3/emailCampaigns");
    expect(await scheduleNewsletter(id, version, SEND_AT, 120)).toMatchObject({ ok: false, reason: "brevo" });
    expect((await row(id)).slug).toBeNull();

    // An interrupted hand-over that Brevo never scheduled is undone the same way.
    await db.update(newsletters).set({ state: "submitting", slug: "left-behind-2026-11-22", submittedAt: NOW }).where(eq(newsletters.id, id));
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000));
    expect(await recoverNewsletter(id)).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ state: "draft", slug: null });
  });
});

describe("the email's View in browser link", () => {
  it("points at the issue's page when it will be on the website", async () => {
    const { campaignId, slug } = await handOver();
    expect(brevo.campaign(campaignId).htmlContent).toContain(
      `<a href="https://lawforaisafety.test/newsletter/${slug}" style="color:#1b334c;">View in browser</a>`,
    );
  });

  it("is left out when it won't be", async () => {
    const { campaignId } = await handOver({ fields: { ...FIELDS, publishOnWeb: false } });
    expect(brevo.campaign(campaignId).htmlContent).not.toContain("View in browser");
  });

  it("is a stand-in in the test copy, which has no address yet", async () => {
    await signInAs("draft");
    const created = await createNewsletter();
    if (!created.ok) throw new Error();
    const saved = await saveNewsletter(created.id, FIELDS, 1);
    if (!saved.ok) throw new Error();
    await sendTestNewsletter(created.id, saved.version);
    expect(emails.to(ADMINS.draft)[0].html).toContain('href="https://lawforaisafety.org/newsletter#test-view-in-browser-link"');
  });
});

describe("going public", () => {
  it("waits for Brevo to report it sent: scheduled or sending is not enough", async () => {
    const { campaignId, slug } = await handOver();
    expect(await archiveLinks()).toEqual([]);
    await expect(IssuePage(params(slug))).rejects.toThrow("NEXT_NOT_FOUND");
    // Before its time, Brevo isn't asked at all.
    expect(campaignCalls()).toEqual([]);

    vi.setSystemTime(AFTER_SEND);
    brevo.startSending(campaignId);
    expect(await archiveLinks()).toEqual([]);

    brevo.finishSending(campaignId, new Date("2026-11-22T09:05:00Z"));
    vi.setSystemTime(new Date(AFTER_SEND.getTime() + SENT_CHECK_SECONDS * 1000));
    await archiveLinks(); // served the cached "not yet" while it asks again
    await dataCache.settle();
    expect(await archiveLinks()).toEqual(["November update"]);
  });

  it("shows an issue handed over after the archive was cached", async () => {
    expect(await archiveLinks()).toEqual([]);
    const sent = await handOver({ when: null });
    expect(await archiveLinks()).toEqual(["November update"]);

    // Recovering an interrupted hand-over that Brevo did schedule counts too.
    await signInAs("superadmin");
    const created = await createNewsletter();
    if (!created.ok) throw new Error();
    await db.update(newsletters).set({ ...FIELDS, subject: "Recovered", state: "submitting", slug: "recovered-2026-11-15", submittedAt: NOW }).where(eq(newsletters.id, created.id));
    const campaign = brevo.campaigns.find((c) => c.id === sent.campaignId)!;
    brevo.campaigns.push({ ...campaign, id: 99, subject: "Recovered" });
    await db.update(newsletters).set({ brevoCampaignId: 99 }).where(eq(newsletters.id, created.id));
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000));
    expect(await archiveLinks()).toEqual(["November update"]);
    expect(await recoverNewsletter(created.id)).toEqual({ ok: true });
    expect(await archiveLinks()).toEqual(["November update", "Recovered"]);
  });

  it("records when Brevo sent it, tells the search engines once, and stops asking Brevo", async () => {
    const { id, slug } = await sentIssue();
    expect(await archiveLinks()).toEqual(["November update"]);
    expect((await row(id)).sentAt).toEqual(new Date("2026-11-22T09:05:00Z"));
    expect(indexNow.urls()).toEqual([`https://lawforaisafety.org/newsletter/${slug}`, "https://lawforaisafety.org/newsletter"]);

    const asked = campaignCalls().length;
    vi.setSystemTime(new Date(AFTER_SEND.getTime() + 3 * SENT_CHECK_SECONDS * 1000));
    await archiveLinks();
    await dataCache.settle();
    render(await IssuePage(params(slug)));
    expect(campaignCalls()).toHaveLength(asked);
    expect(indexNow.pings).toHaveLength(1);
  });

  it("asks Brevo at most once every few minutes while it is not yet sent", async () => {
    const { campaignId } = await handOver();
    vi.setSystemTime(AFTER_SEND);
    brevo.startSending(campaignId);
    for (let i = 0; i < 3; i++) await archiveLinks();
    expect(campaignCalls()).toHaveLength(1);
  });

  it("goes up when an admin page is the first to see it sent", async () => {
    const { id, slug } = await sentIssue();
    await signInAs("draft");
    render(await AdminNewslettersPage());
    await afterTasks.settled();
    expect((await row(id)).sentAt).toEqual(new Date("2026-11-22T09:05:00Z"));
    expect(indexNow.urls()).toEqual([`https://lawforaisafety.org/newsletter/${slug}`, "https://lawforaisafety.org/newsletter"]);

    const asked = campaignCalls().length;
    expect(await archiveLinks()).toEqual(["November update"]);
    expect(campaignCalls()).toHaveLength(asked);
  });

  it("is recorded as sent with no ping when it isn't going on the website", async () => {
    const { id } = await sentIssue({ ...FIELDS, publishOnWeb: false });
    await signInAs("draft");
    render(await AdminNewsletterPage({ params: Promise.resolve({ id }) }));
    await afterTasks.settled();
    expect((await row(id)).sentAt).not.toBeNull();
    expect(indexNow.pings).toEqual([]);
    expect(await archiveLinks()).toEqual([]);
  });

  it("leaves out an issue no longer in the database, though the cached list still has it", async () => {
    const { id } = await handOver();
    expect(await archiveLinks()).toEqual([]);
    await db.delete(newsletters).where(eq(newsletters.id, id));
    vi.setSystemTime(AFTER_SEND);
    expect(await archiveLinks()).toEqual([]);
    expect(campaignCalls()).toEqual([]);
  });

  it("stays hidden, and asks again next time, when Brevo can't be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await sentIssue();
    brevo.failNext("GET /v3/emailCampaigns");
    expect(await archiveLinks()).toEqual([]);
    expect(await archiveLinks()).toEqual(["November update"]);
  });

  it("dates a send-now issue by when Brevo sent it", async () => {
    const { slug } = await handOver({ when: null });
    expect(slug).toBe("november-update-2026-11-15");
    render(await IssuePage(params(slug)));
    expect(screen.getByText("15 November 2026")).toHaveAttribute("dateTime", NOW.toISOString());
  });
});

describe("an issue's page", () => {
  it("shows the issue in the site's layout, with the sign-up form and none of the email's parts", async () => {
    const { slug } = await sentIssue();
    const { container } = render(await IssuePage(params(slug)));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("November update");
    expect(screen.getByText("22 November 2026")).toHaveAttribute("dateTime", "2026-11-22T09:05:00.000Z");
    expect(screen.getByText("everyone").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Apply" })).toHaveAttribute("href", "/field-building");
    expect(screen.getByRole("link", { name: "All issues" })).toHaveAttribute("href", "/newsletter");
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Get the next issue by email" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(container.querySelector("article")!.textContent).not.toMatch(/unsubscribe|View in browser|You are receiving this/i);
    expect(screen.queryByRole("link", { name: /unsubscribe|view in browser/i })).toBeNull();
    expect(container.querySelector("img[src$='logo-email.png']")).toBeNull();
  });

  it("has a title, a description from the preview text, and Open Graph tags", async () => {
    const { slug } = await sentIssue();
    expect(await metadataFor(slug)).toEqual({
      title: "November update | Newsletter | Law for AI Safety",
      description: "What we did this month",
      alternates: { canonical: `/newsletter/${slug}` },
      openGraph: {
        type: "article",
        title: "November update",
        description: "What we did this month",
        url: `/newsletter/${slug}`,
        publishedTime: "2026-11-22T09:05:00.000Z",
        images: [SHARE_IMAGE],
      },
    });
    expect((await metadataFor(slug, null)).openGraph).not.toHaveProperty("images");
  });

  it("describes itself by its date when it has no preview text", async () => {
    const { slug } = await sentIssue({ ...FIELDS, previewText: "  " });
    expect((await metadataFor(slug)).description).toBe("The Law for AI Safety newsletter of 22 November 2026.");
  });

  it("is a 404 for any other address", async () => {
    await sentIssue();
    await expect(IssuePage(params("no-such-issue-2026-11-22"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(metadataFor("no-such-issue-2026-11-22")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("the archive", () => {
  it("lists every issue on the website, newest first, with its date and preview text", async () => {
    await sentIssue({ ...FIELDS, subject: "First" });
    vi.setSystemTime(NOW);
    const second = await handOver({ fields: { ...FIELDS, subject: "Second", previewText: "" }, when: "2026-11-29T09:00:00.000Z" });
    await handOver({ fields: { ...FIELDS, subject: "Not on the web", publishOnWeb: false }, when: "2026-11-29T09:00:00.000Z" });
    vi.setSystemTime(new Date("2026-11-29T10:00:00Z"));
    for (const campaign of brevo.campaigns.filter((c) => c.status === "queued")) brevo.finishSending(campaign.id, new Date("2026-11-29T09:01:00Z"));

    expect(await archiveLinks()).toEqual(["Second", "First"]);
    const first = within(screen.getByRole("link", { name: "First" }).closest("li")!);
    expect(first.getByText("22 November 2026")).toBeInTheDocument();
    expect(first.getByText("What we did this month")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Second" })).toHaveAttribute("href", `/newsletter/${second.slug}`);
    expect(screen.getByRole("heading", { name: "Get the next issue by email" })).toBeInTheDocument();
  });

  it("says when there are no issues yet", async () => {
    render(await ArchivePage());
    expect(screen.getByText("No issues yet. Sign up below to get the first one.")).toBeInTheDocument();
  });

  it("has its own title, description and canonical address", () => {
    expect(archiveMetadata).toMatchObject({
      title: "Newsletter | Law for AI Safety",
      description: "Past issues of the Law for AI Safety newsletter.",
      alternates: { canonical: "/newsletter" },
    });
  });

  it("puts every public issue in the sitemap, dated by when it went out", async () => {
    const { slug } = await sentIssue();
    await handOver({ fields: { ...FIELDS, subject: "Later" }, when: "2026-12-01T09:00:00.000Z" });
    const entries = await sitemap();
    expect(entries.find((e) => e.url === "https://lawforaisafety.org/newsletter")).toBeDefined();
    expect(entries.filter((e) => e.url.startsWith("https://lawforaisafety.org/newsletter/"))).toEqual([
      { url: `https://lawforaisafety.org/newsletter/${slug}`, lastModified: new Date("2026-11-22T09:05:00Z"), changeFrequency: "yearly", priority: 0.5 },
    ]);
  });
});

describe("taking an issue off the website and putting it back", () => {
  it("is for those who may publish, and is audited", async () => {
    const { id, slug } = await sentIssue();
    expect(await archiveLinks()).toEqual(["November update"]);
    indexNow.reset();

    await signInAs("draft");
    expect(await setNewsletterOnWeb(id, false)).toMatchObject({ ok: false, reason: "forbidden" });

    await signInAs("publish");
    expect(await setNewsletterOnWeb(id, false)).toEqual({ ok: true });
    await afterTasks.settled();
    expect(await archiveLinks()).toEqual([]);
    await expect(IssuePage(params(slug))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(indexNow.urls()).toEqual([`https://lawforaisafety.org/newsletter/${slug}`, "https://lawforaisafety.org/newsletter"]);

    expect(await setNewsletterOnWeb(id, true)).toEqual({ ok: true });
    await afterTasks.settled();
    expect(await archiveLinks()).toEqual(["November update"]);
    render(await IssuePage(params(slug)));
    expect(indexNow.pings).toHaveLength(2);

    const detail = { newsletter: id, subject: "November update", page: `/newsletter/${slug}`, sent: true };
    expect(await audit()).toEqual([
      { action: "newsletter_web_unpublish", actor: ADMINS.publish, detail },
      { action: "newsletter_web_publish", actor: ADMINS.publish, detail },
    ]);
  });

  it("does nothing when it is already that way", async () => {
    const { id } = await sentIssue();
    await signInAs("publish");
    expect(await setNewsletterOnWeb(id, true)).toEqual({ ok: true });
    expect(await audit()).toEqual([]);
  });

  it("puts an issue sent while off the website up at once, recording when it was sent", async () => {
    const { id, slug } = await sentIssue({ ...FIELDS, publishOnWeb: false });
    await signInAs("publish");
    expect(await setNewsletterOnWeb(id, true)).toEqual({ ok: true });
    await afterTasks.settled();
    expect((await row(id)).sentAt).toEqual(new Date("2026-11-22T09:05:00Z"));
    expect(await archiveLinks()).toEqual(["November update"]);
    expect(indexNow.urls()).toEqual([`https://lawforaisafety.org/newsletter/${slug}`, "https://lawforaisafety.org/newsletter"]);
  });

  it("changes the scheduled email's View in browser link to match, telling no search engine", async () => {
    const { id, campaignId, slug } = await handOver();
    await signInAs("publish");
    expect(await setNewsletterOnWeb(id, false)).toEqual({ ok: true });
    expect(brevo.campaign(campaignId)).toMatchObject({ status: "queued", scheduledAt: SEND_AT });
    expect(brevo.campaign(campaignId).htmlContent).not.toContain("View in browser");

    expect(await setNewsletterOnWeb(id, true)).toEqual({ ok: true });
    expect(brevo.campaign(campaignId).htmlContent).toContain(`https://lawforaisafety.test/newsletter/${slug}`);
    await afterTasks.settled();
    expect(indexNow.pings).toEqual([]);
    expect((await audit()).map((a) => a.detail)).toEqual([
      expect.objectContaining({ sent: false }),
      expect.objectContaining({ sent: false }),
    ]);
  });

  it("leaves the email alone once Brevo is sending it", async () => {
    const { id, campaignId } = await handOver();
    const html = brevo.campaign(campaignId).htmlContent;
    brevo.startSending(campaignId);
    await signInAs("publish");
    expect(await setNewsletterOnWeb(id, false)).toEqual({ ok: true });
    expect(brevo.campaign(campaignId).htmlContent).toBe(html);
    expect((await row(id)).publishOnWeb).toBe(false);
  });

  it("refuses a draft, an unknown newsletter or a bad argument, and changes nothing when Brevo fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await signInAs("publish");
    const created = await createNewsletter();
    if (!created.ok) throw new Error();
    expect(await setNewsletterOnWeb(created.id, false)).toMatchObject({ ok: false, reason: "invalid", message: expect.stringMatching(/checkbox in the editor/) });
    expect(await setNewsletterOnWeb("00000000-0000-4000-8000-000000000000", false)).toMatchObject({ ok: false, reason: "not_found" });
    expect(await setNewsletterOnWeb(created.id, "no")).toMatchObject({ ok: false, reason: "invalid" });

    const { id } = await handOver();
    await signInAs("publish");
    brevo.failNext("GET /v3/emailCampaigns");
    expect(await setNewsletterOnWeb(id, false)).toMatchObject({ ok: false, reason: "brevo" });
    expect((await row(id)).publishOnWeb).toBe(true);
    expect(await audit()).toEqual([]);
  });
});

describe("in the admin", () => {
  it("ticks 'Also publish on the website' by default, and saving the change needs a new test", async () => {
    await signInAs("draft");
    const created = await createNewsletter();
    if (!created.ok) throw new Error();
    const saved = await saveNewsletter(created.id, FIELDS, 1);
    if (!saved.ok) throw new Error();
    await sendTestNewsletter(created.id, saved.version);
    const user = userEvent.setup();
    render(await AdminNewsletterPage({ params: Promise.resolve({ id: created.id }) }));

    const box = screen.getByRole("checkbox", { name: "Also publish on the website" });
    const preview = () => (screen.getByTitle("Email preview") as HTMLIFrameElement).getAttribute("srcdoc");
    expect(box).toBeChecked();
    expect(screen.getByText("Test of this version sent")).toBeInTheDocument();
    expect(preview()).toContain("View in browser");

    await user.click(box);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(preview()).not.toContain("View in browser");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(await row(created.id)).toMatchObject({ publishOnWeb: false, version: saved.version + 1, testedVersion: saved.version });
  });

  it("shows a sent issue's page, and lets a publisher take it down", async () => {
    const { id, slug } = await sentIssue();
    await signInAs("publish");
    const user = userEvent.setup();
    render(await AdminNewsletterPage({ params: Promise.resolve({ id }) }));
    const section = within(screen.getByRole("region", { name: "On the website" }));
    expect(section.getByRole("link", { name: `/newsletter/${slug}` })).toHaveAttribute("href", `/newsletter/${slug}`);
    expect((screen.getByTitle("The newsletter as sent") as HTMLIFrameElement).getAttribute("srcdoc")).toContain(
      `https://lawforaisafety.test/newsletter/${slug}`,
    );
    await user.click(section.getByRole("button", { name: "Take it off the website" }));
    await vi.waitFor(() => expect(navigation.refresh).toHaveBeenCalled());
    expect((await row(id)).publishOnWeb).toBe(false);

    cleanup();
    render(await AdminNewsletterPage({ params: Promise.resolve({ id }) }));
    const after = within(screen.getByRole("region", { name: "On the website" }));
    expect(after.getByText("Not on the website.")).toBeInTheDocument();
    expect(after.getByRole("button", { name: "Put it back on the website" })).toBeInTheDocument();
  });

  it("says what will happen to a scheduled issue, and shows a refusal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { id } = await handOver();
    await signInAs("publish");
    const user = userEvent.setup();
    render(await AdminNewsletterPage({ params: Promise.resolve({ id }) }));
    const section = within(screen.getByRole("region", { name: "On the website" }));
    expect(section.getByText("It goes on the website once Brevo has sent it.")).toBeInTheDocument();
    brevo.failNext("GET /v3/emailCampaigns");
    await user.click(section.getByRole("button", { name: "Don't put it on the website" }));
    expect(await section.findByRole("alert")).toHaveTextContent("Brevo could not update the campaign.");

    await db.update(newsletters).set({ publishOnWeb: false }).where(eq(newsletters.id, id));
    cleanup();
    render(await AdminNewsletterPage({ params: Promise.resolve({ id }) }));
    const off = within(screen.getByRole("region", { name: "On the website" }));
    expect(off.getByText("It won't go on the website.")).toBeInTheDocument();
    expect(off.getByRole("button", { name: "Put it on the website" })).toBeInTheDocument();
  });

  it("tells a drafter who can change it", async () => {
    const { id } = await sentIssue();
    await signInAs("draft");
    render(await AdminNewsletterPage({ params: Promise.resolve({ id }) }));
    const section = within(screen.getByRole("region", { name: "On the website" }));
    expect(section.getByText("Someone with permission to publish website pages can change this.")).toBeInTheDocument();
    expect(section.queryByRole("button")).toBeNull();
  });
});
