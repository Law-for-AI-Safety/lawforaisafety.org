import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { adminAuditLog, newsletters } from "@/drizzle/schema";
import { startAdminSession } from "@/lib/session";
import { brevo } from "../../../../../test/fakes/brevo";
import { INDEXNOW_KEY, indexNow } from "../../../../../test/fakes/indexnow";
import { navigation } from "../../../../../test/next-navigation";
import { cookieJar } from "../../../../../test/next-headers";
import IssuePage from "../../../newsletter/[slug]/page";
import NewsletterSignupPage from "../../../newsletter/page";
import sitemap from "../../../sitemap";
import { POST as sweep } from "../../../api/cron/sweep/route";
import {
  cancelNewsletter,
  createNewsletter,
  recoverNewsletter,
  reopenNewsletter,
  saveNewsletter,
  scheduleNewsletter,
  sendTestNewsletter,
  setNewsletterOnWebsite,
} from "./actions";
import NewslettersPage from "./page";
import NewsletterPage from "./[id]/page";

vi.mock("next/headers", () => import("../../../../../test/next-headers"));

/**
 * Newsletter issues on the website: ticking and unticking from the admin, at every stage, and
 * what that does to the public pages, the sitemap and the search engines, never to the email.
 */

const ADMIN = "reviewer@example.com";
const FIELDS = { subject: "November update", previewText: "What we did this month", body: "Hello **everyone**." };
const NOW = new Date("2026-11-15T12:00:00Z");
const IN_A_WEEK = "2026-11-22T09:00:00.000Z";
const PAGE = "https://lawforaisafety.org/newsletter/november-update";
const LIST = "https://lawforaisafety.org/newsletter";

beforeEach(async () => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  vi.stubEnv("DEPLOY_CONTEXT", "production");
  vi.stubEnv("INDEXNOW_KEY", INDEXNOW_KEY);
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await db.delete(newsletters);
  await db.delete(adminAuditLog);
  cookieJar.reset();
  await startAdminSession({ email: ADMIN, name: "Admin" });
});

const row = async (id: string) => (await db.select().from(newsletters).where(eq(newsletters.id, id)))[0];
const audit = async () =>
  (await db.select().from(adminAuditLog)).filter((r) => r.action.startsWith("newsletter_web")).map((r) => ({ action: r.action, detail: r.detail }));
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
/** The sitemap's issue pages; the newsletter page itself is always listed. */
const sitemapUrls = async () => (await sitemap()).map((e) => e.url).filter((url) => url.startsWith(`${LIST}/`));

/** Whether the issue's page is up, as a visitor would find it. */
async function isUp(slug = "november-update"): Promise<boolean> {
  try {
    await IssuePage(params(slug));
    return true;
  } catch (e) {
    if ((e as Error).message === "NEXT_NOT_FOUND") return false;
    throw e;
  }
}

/**
 * A saved, tested draft. It is unticked, so each test ticks it when it means to: a new issue
 * starts ticked (see "a new issue" below), which is set straight in the database here to keep
 * it out of the audit log.
 */
async function draft(fields = FIELDS): Promise<{ id: string; version: number }> {
  const created = await createNewsletter();
  if (!created.ok) throw new Error(created.message);
  await db.update(newsletters).set({ webPublished: false }).where(eq(newsletters.id, created.id));
  const saved = await saveNewsletter(created.id, fields, 1);
  if (!saved.ok) throw new Error(saved.message);
  const tested = await sendTestNewsletter(created.id, saved.version);
  if (!tested.ok) throw new Error(tested.message);
  return { id: created.id, version: saved.version };
}

/** Plays Brevo finishing a scheduled campaign. */
function sentByBrevo(campaignId: number, at: string) {
  Object.assign(brevo.campaign(campaignId), { status: "sent", sentDate: at });
}

async function sweepOnce(): Promise<Record<string, number>> {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const response = await sweep(new Request("https://lawforaisafety.test/api/cron/sweep", { method: "POST", headers: { Authorization: "Bearer test-cron-secret" } }));
  return response.json();
}

/** Runs `fn` while the database refuses every website address, as if each were taken. */
async function refuseSlugs(fn: () => Promise<void>) {
  await db.execute(`CREATE OR REPLACE FUNCTION refuse_slug() RETURNS trigger AS $$ BEGIN
    IF NEW.web_slug IS NOT NULL THEN RAISE unique_violation USING MESSAGE = 'taken'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await db.execute("CREATE TRIGGER refuse_slug BEFORE UPDATE ON newsletters FOR EACH ROW EXECUTE FUNCTION refuse_slug()");
  try {
    await fn();
  } finally {
    await db.execute("DROP TRIGGER refuse_slug ON newsletters");
  }
}

async function send(id: string, version: number, when: string | null = null) {
  const result = await scheduleNewsletter(id, version, when, 120);
  if (!result.ok) throw new Error(result.message);
}

describe("a new issue", () => {
  it("starts ticked, so it goes up once sent with nothing more to do", async () => {
    const created = await createNewsletter();
    if (!created.ok) throw new Error(created.message);
    expect((await row(created.id)).webPublished).toBe(true);
    const saved = await saveNewsletter(created.id, FIELDS, 1);
    if (!saved.ok) throw new Error(saved.message);
    await sendTestNewsletter(created.id, saved.version);
    await send(created.id, saved.version);
    expect(await isUp()).toBe(true);
    expect(indexNow.urls()).toEqual([PAGE, LIST]);
    expect(await audit()).toEqual([]);
  });

  it("shows the box ticked in the editor, and unticking it keeps the issue off the website", async () => {
    const created = await createNewsletter();
    if (!created.ok) throw new Error(created.message);
    const user = userEvent.setup();
    render(await NewsletterPage({ params: Promise.resolve({ id: created.id }) }));
    const box = screen.getByRole("checkbox", { name: "Also publish on the website" });
    expect(box).toBeChecked();
    expect(screen.getByText(/It goes up under \/newsletter once it has been sent/)).toBeInTheDocument();
    await user.click(box);
    await waitFor(() => expect(screen.getByText(/Untick this for an issue about events or deadlines/)).toBeInTheDocument());
    expect((await row(created.id)).webPublished).toBe(false);
  });
});

describe("ticking an issue for the website", () => {
  it("is refused to anyone signed out or not an admin, and for a bad argument or unknown issue", async () => {
    const { id } = await draft();
    expect(await setNewsletterOnWebsite(id, "yes")).toMatchObject({ ok: false, reason: "invalid" });
    expect(await setNewsletterOnWebsite("nope", true)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await setNewsletterOnWebsite("00000000-0000-4000-8000-000000000000", true)).toMatchObject({ ok: false, reason: "not_found" });
    cookieJar.reset();
    expect(await setNewsletterOnWebsite(id, true)).toMatchObject({ ok: false, reason: "signed_out" });
    vi.stubEnv("ADMIN_EMAILS", "someone-else@example.com");
    await startAdminSession({ email: ADMIN, name: "Admin" });
    expect(await setNewsletterOnWebsite(id, true)).toMatchObject({ ok: false, reason: "signed_out" });
    expect((await row(id)).webPublished).toBe(false);
  });

  it("on a draft puts nothing up until it is sent, then puts it up at once on a send now", async () => {
    const { id, version } = await draft();
    expect(await setNewsletterOnWebsite(id, true)).toEqual({ ok: true, onWebsite: false, path: null });
    expect(await row(id)).toMatchObject({ webPublished: true, webSlug: null });
    expect(await isUp()).toBe(false);
    expect(await audit()).toEqual([{ action: "newsletter_web_publish", detail: { newsletter: id, subject: "November update", slug: null, live: false } }]);

    await send(id, version);
    expect((await row(id)).webSlug).toBe("november-update");
    expect(await isUp()).toBe(true);
    expect(indexNow.urls()).toEqual([PAGE, LIST]);
    expect(await sitemapUrls()).toEqual([PAGE]);
  });

  it("on a scheduled issue puts it up once Brevo has sent it, found by the sweep", async () => {
    const { id, version } = await draft();
    await setNewsletterOnWebsite(id, true);
    await send(id, version, IN_A_WEEK);
    expect((await row(id)).webSlug).toBe("november-update");
    expect(await isUp()).toBe(false);

    // Its send time passing is not enough: Brevo may not have sent it.
    vi.setSystemTime(new Date(IN_A_WEEK));
    expect(await sweepOnce()).toMatchObject({ newsletterIssuesUp: 0 });
    expect(await isUp()).toBe(false);
    expect(await sitemapUrls()).toEqual([]);

    sentByBrevo(brevo.campaigns[0].id, "2026-11-22T09:03:00.000Z");
    expect(await sweepOnce()).toMatchObject({ newsletterIssuesUp: 1 });
    expect(await isUp()).toBe(true);
    expect((await row(id)).sentAt).toEqual(new Date("2026-11-22T09:03:00Z"));
    expect(await sitemapUrls()).toEqual([PAGE]);
    expect(indexNow.urls()).toEqual([PAGE, LIST]);
    // Already up, so the next sweep leaves it be.
    expect(await sweepOnce()).toMatchObject({ newsletterIssuesUp: 0 });
  });

  it("on a scheduled issue puts it up when the newsletter page learns from Brevo it was sent", async () => {
    const { id, version } = await draft();
    await setNewsletterOnWebsite(id, true);
    await send(id, version, IN_A_WEEK);
    vi.setSystemTime(new Date(IN_A_WEEK));
    sentByBrevo(brevo.campaigns[0].id, IN_A_WEEK);
    // A week on, the session has lapsed.
    await startAdminSession({ email: ADMIN, name: "Admin" });
    render(await NewslettersPage());
    expect(screen.getByRole("link", { name: "/newsletter/november-update" })).toBeInTheDocument();
    expect(await isUp()).toBe(true);
    expect(indexNow.urls()).toEqual([PAGE, LIST]);
  });

  it("stays down while Brevo can't be asked, and is tried again", async () => {
    const { id, version } = await draft();
    await setNewsletterOnWebsite(id, true);
    await send(id, version, IN_A_WEEK);
    vi.setSystemTime(new Date(IN_A_WEEK));
    sentByBrevo(brevo.campaigns[0].id, IN_A_WEEK);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    brevo.failNext("GET /v3/emailCampaigns");
    expect(await sweepOnce()).toMatchObject({ newsletterIssuesUp: 0 });
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/Could not check with Brevo/), expect.anything());
    expect(await isUp()).toBe(false);
    expect(await sweepOnce()).toMatchObject({ newsletterIssuesUp: 1 });
  });

  it("after sending puts it up at once, and leaves the email alone", async () => {
    const { id, version } = await draft();
    await send(id, version);
    expect(await isUp()).toBe(false);
    const callsBefore = brevo.calls.length;

    expect(await setNewsletterOnWebsite(id, true)).toEqual({ ok: true, onWebsite: true, path: "/newsletter/november-update" });
    expect(await isUp()).toBe(true);
    expect(indexNow.urls()).toEqual([PAGE, LIST]);
    // Brevo is only asked whether it was sent; nothing about the campaign changes.
    expect(brevo.calls.slice(callsBefore)).toEqual([`GET /v3/emailCampaigns/${brevo.campaigns[0].id}`]);
    expect(await audit()).toEqual([{ action: "newsletter_web_publish", detail: { newsletter: id, subject: "November update", slug: "november-update", live: true } }]);
  });

  it("never gives an issue the address of a sign-up page", async () => {
    const { id, version } = await draft({ ...FIELDS, subject: "Confirmed" });
    await setNewsletterOnWebsite(id, true);
    await send(id, version);
    expect((await row(id)).webSlug).toBe("confirmed-2");
    expect(await isUp("confirmed-2")).toBe(true);
  });

  it("gives a second issue with the same subject its own address", async () => {
    const first = await draft();
    await send(first.id, first.version);
    await setNewsletterOnWebsite(first.id, true);
    const second = await draft();
    await send(second.id, second.version);
    expect(await setNewsletterOnWebsite(second.id, true)).toMatchObject({ path: "/newsletter/november-update-2" });
    expect(await isUp("november-update")).toBe(true);
    expect(await isUp("november-update-2")).toBe(true);
  });
});

describe("taking an issue off the website", () => {
  it("makes its page a 404 and drops it from the list and the sitemap, leaving the email alone", async () => {
    const { id, version } = await draft();
    await setNewsletterOnWebsite(id, true);
    await send(id, version);
    expect(await isUp()).toBe(true);
    render(await NewsletterSignupPage());
    expect(screen.getByRole("link", { name: "November update" })).toBeInTheDocument();
    const callsBefore = brevo.calls.length;
    indexNow.reset();

    cleanup();
    expect(await setNewsletterOnWebsite(id, false)).toEqual({ ok: true, onWebsite: false, path: "/newsletter/november-update" });
    expect(await isUp()).toBe(false);
    expect(await sitemapUrls()).toEqual([]);
    render(await NewsletterSignupPage());
    expect(screen.queryByRole("region", { name: "Past issues" })).toBeNull();
    expect(brevo.calls.length).toBe(callsBefore);
    expect(brevo.campaigns[0].status).toBe("sent");
    expect(indexNow.urls()).toEqual([PAGE, LIST]);
    expect((await audit()).at(-1)).toEqual({
      action: "newsletter_web_unpublish",
      detail: { newsletter: id, subject: "November update", slug: "november-update", live: true },
    });
  });

  it("keeps its address for when it is put back, and records only real changes", async () => {
    const { id, version } = await draft();
    await send(id, version);
    await setNewsletterOnWebsite(id, true);
    await setNewsletterOnWebsite(id, false);
    await setNewsletterOnWebsite(id, false);
    expect(await setNewsletterOnWebsite(id, true)).toMatchObject({ onWebsite: true, path: "/newsletter/november-update" });
    expect((await audit()).map((a) => a.action)).toEqual(["newsletter_web_publish", "newsletter_web_unpublish", "newsletter_web_publish"]);
  });

  it("happens when a scheduled issue is cancelled, which also frees its address", async () => {
    const { id, version } = await draft();
    await setNewsletterOnWebsite(id, true);
    await send(id, version, IN_A_WEEK);
    expect(await cancelNewsletter(id)).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ state: "draft", webPublished: true, webSlug: null });
    vi.setSystemTime(new Date(IN_A_WEEK));
    expect(await isUp()).toBe(false);
  });

  it("happens when a campaign Brevo stopped is made a draft again", async () => {
    const { id, version } = await draft();
    await setNewsletterOnWebsite(id, true);
    await send(id, version);
    expect(await isUp()).toBe(true);
    brevo.campaigns.length = 0;
    indexNow.reset();
    expect(await reopenNewsletter(id)).toEqual({ ok: true });
    expect(await isUp()).toBe(false);
    expect(indexNow.urls()).toEqual([PAGE, LIST]);
    // It went out, so it keeps its address: another issue with the same subject can't take it.
    expect(await row(id)).toMatchObject({ state: "draft", webSlug: "november-update", sentAt: null });
    const other = await draft();
    await send(other.id, other.version);
    expect(await setNewsletterOnWebsite(other.id, true)).toMatchObject({ path: "/newsletter/november-update-2" });
  });
});

describe("an interrupted hand-over", () => {
  const STUCK = new Date(NOW.getTime() + 10 * 60_000);

  it("puts a ticked issue up once Brevo turns out to have sent it", async () => {
    const { id, version } = await draft();
    await setNewsletterOnWebsite(id, true);
    brevo.failNext("POST /v3/emailCampaigns/1/sendNow", "network");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await scheduleNewsletter(id, version, null, 120)).toMatchObject({ ok: false, reason: "brevo" });
    expect(await row(id)).toMatchObject({ state: "submitting", webSlug: null });
    brevo.campaigns[0].status = "sent";
    brevo.campaigns[0].sentDate = NOW.toISOString();

    vi.setSystemTime(STUCK);
    expect(await recoverNewsletter(id)).toEqual({ ok: true });
    expect((await row(id)).webSlug).toBe("november-update");
    expect(await isUp()).toBe(true);
  });

  it("keeps a ticked issue down when Brevo turns out to have stopped it", async () => {
    const { id, version } = await draft();
    await setNewsletterOnWebsite(id, true);
    brevo.failNext("POST /v3/emailCampaigns/1/sendNow", "network");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await scheduleNewsletter(id, version, null, 120);
    brevo.campaigns[0].status = "suspended";

    vi.setSystemTime(STUCK);
    expect(await recoverNewsletter(id)).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ state: "draft", webSlug: null });
    expect(await isUp()).toBe(false);
  });

  it("says so when ticking can't give the issue its website address, and records the tick", async () => {
    const { id, version } = await draft();
    await send(id, version);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await refuseSlugs(async () => {
      expect(await setNewsletterOnWebsite(id, true)).toMatchObject({ ok: false, message: expect.stringMatching(/couldn't be given its website address/) });
    });
    expect(await row(id)).toMatchObject({ webPublished: true, webSlug: null });
    expect((await audit()).map((a) => a.action)).toEqual(["newsletter_web_publish"]);
    expect(await setNewsletterOnWebsite(id, true)).toMatchObject({ ok: true, onWebsite: true });
  });

  it("still reports the send when the website address can't be given", async () => {
    const { id, version } = await draft();
    await setNewsletterOnWebsite(id, true);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await refuseSlugs(async () => {
      expect(await scheduleNewsletter(id, version, null, 120)).toEqual({ ok: true });
    });
    expect(await row(id)).toMatchObject({ state: "submitted", webSlug: null });
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/website address/), expect.anything());
    // Ticking it again gives it one.
    expect(await setNewsletterOnWebsite(id, true)).toMatchObject({ onWebsite: true, path: "/newsletter/november-update" });
  });
});

describe("the admin pages", () => {
  it("offer the choice on a draft, saved as soon as it is ticked", async () => {
    const { id } = await draft();
    const user = userEvent.setup();
    render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    expect(screen.getByText(/Only subscribers get it/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Also publish on the website" }));
    await waitFor(() => expect(screen.getByText(/It goes up under \/newsletter once it has been sent/)).toBeInTheDocument());
    expect(navigation.refresh).toHaveBeenCalled();
    expect((await row(id)).webPublished).toBe(true);
  });

  it("link a sent issue's page, and take it down from there", async () => {
    const { id, version } = await draft();
    await setNewsletterOnWebsite(id, true);
    await send(id, version);
    const user = userEvent.setup();
    render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    expect(screen.getByRole("link", { name: "/newsletter/november-update" })).toHaveAttribute("href", "/newsletter/november-update");
    await user.click(screen.getByRole("checkbox", { name: "Also publish on the website" }));
    await waitFor(() => expect(screen.getByText(/Only subscribers get it/)).toBeInTheDocument());
    expect(await isUp()).toBe(false);
  });

  it("show a refusal", async () => {
    const { id } = await draft();
    const user = userEvent.setup();
    render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    cookieJar.reset();
    await user.click(screen.getByRole("checkbox", { name: "Also publish on the website" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You are signed out");
    expect(screen.getByRole("checkbox", { name: "Also publish on the website" })).not.toBeChecked();
  });

  it("say in the list which issues are, or will be, on the website", async () => {
    const live = await draft();
    await setNewsletterOnWebsite(live.id, true);
    await send(live.id, live.version);
    const later = await draft({ ...FIELDS, subject: "December update" });
    await setNewsletterOnWebsite(later.id, true);
    await draft({ ...FIELDS, subject: "Event next week" });
    render(await NewslettersPage());
    expect(screen.getByRole("link", { name: "/newsletter/november-update" })).toBeInTheDocument();
    expect(screen.getByText("Goes on the website once sent")).toBeInTheDocument();
  });
});
