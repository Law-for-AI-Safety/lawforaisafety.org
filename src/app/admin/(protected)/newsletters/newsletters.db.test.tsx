import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { adminAuditLog, cmsRoles, newsletters } from "@/drizzle/schema";
import { setStoredCmsPermission } from "@/lib/cms-store";
import { startAdminSession } from "@/lib/session";
import { brevo, NEWSLETTER_LIST_ID } from "../../../../../test/fakes/brevo";
import { emails } from "../../../../../test/fakes/email";
import { navigation } from "../../../../../test/next-navigation";
import { cookieJar } from "../../../../../test/next-headers";
import {
  cancelNewsletter,
  createNewsletter,
  deleteNewsletter,
  getSendList,
  recoverNewsletter,
  rescheduleNewsletter,
  saveNewsletter,
  scheduleNewsletter,
  sendTestNewsletter,
} from "./actions";
import NewslettersPage from "./page";
import NewsletterPage from "./[id]/page";
import ProtectedAdminLayout from "../layout";

vi.mock("next/headers", () => import("../../../../../test/next-headers"));

/**
 * The newsletter, end to end against a real database and the Brevo fake: who may do what,
 * the checks before anything reaches the list, what Brevo is sent, and the pages.
 */

type Who = "signed out" | "not in ADMIN_EMAILS" | "no role" | "draft" | "publish" | "superadmin";
const EMAIL: Record<Exclude<Who, "signed out">, string> = {
  "not in ADMIN_EMAILS": "stranger@example.com",
  "no role": "reviewer@example.com",
  draft: "draft@example.com",
  publish: "publish@example.com",
  superadmin: "tech@example.com",
};
const ALL: Who[] = ["signed out", "not in ADMIN_EMAILS", "no role", "draft", "publish", "superadmin"];
const refusal = (who: Who) => (who === "signed out" || who === "not in ADMIN_EMAILS" ? "signed_out" : "forbidden");

async function signInAs(who: Who) {
  cookieJar.reset();
  if (who === "signed out") return;
  await startAdminSession({ email: EMAIL[who], name: `${who} person` });
}

const FIELDS = {
  subject: "November update",
  previewText: "What we did this month",
  body: "Hello **everyone**.\n\n- [Apply](/field-building)",
};
const NOW = new Date("2026-11-15T12:00:00Z");
const IN_A_WEEK = "2026-11-22T09:00:00.000Z";

beforeEach(async () => {
  vi.stubEnv("ADMIN_EMAILS", Object.values(EMAIL).filter((e) => e !== EMAIL["not in ADMIN_EMAILS"]).join(","));
  vi.stubEnv("TECH_ADMIN_EMAILS", EMAIL.superadmin);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await db.delete(newsletters);
  await db.delete(cmsRoles);
  await db.delete(adminAuditLog);
  await setStoredCmsPermission(EMAIL["not in ADMIN_EMAILS"], "publish", "seed");
  await setStoredCmsPermission(EMAIL.draft, "draft", "seed");
  await setStoredCmsPermission(EMAIL.publish, "publish", "seed");
});

const row = async (id: string) => (await db.select().from(newsletters).where(eq(newsletters.id, id)))[0];
const audit = async () =>
  (await db.select().from(adminAuditLog)).filter((r) => r.action !== "login").map((r) => ({ action: r.action, actor: r.actorEmail, detail: r.detail }));

/** A saved draft, as a superadmin would leave it: written, and tested when `tested`. */
async function seed({ tested = true, fields = FIELDS } = {}): Promise<{ id: string; version: number }> {
  await signInAs("superadmin");
  const created = await createNewsletter();
  if (!created.ok) throw new Error(created.message);
  const saved = await saveNewsletter(created.id, fields, 1);
  if (!saved.ok) throw new Error(saved.message);
  if (tested) {
    const test = await sendTestNewsletter(created.id, saved.version);
    if (!test.ok) throw new Error(test.message);
  }
  emails.reset();
  return { id: created.id, version: saved.version };
}

/** A newsletter Brevo has scheduled for a week from now. */
async function seedScheduled(): Promise<{ id: string; campaignId: number }> {
  const { id, version } = await seed();
  vi.stubEnv("DEPLOY_CONTEXT", "production");
  const result = await scheduleNewsletter(id, version, IN_A_WEEK, 120);
  if (!result.ok) throw new Error(result.message);
  await db.delete(adminAuditLog);
  return { id, campaignId: (await row(id)).brevoCampaignId! };
}

describe("permission matrix", () => {
  describe.each(ALL)("%s", (who) => {
    const canWrite = who === "draft" || who === "publish" || who === "superadmin";
    const canSend = who === "publish" || who === "superadmin";

    it(`${canWrite ? "can" : "cannot"} write, save, test-send and delete a draft`, async () => {
      const { id, version } = await seed({ tested: false });
      await signInAs(who);
      const created = await createNewsletter();
      const saved = await saveNewsletter(id, { ...FIELDS, subject: "Changed" }, version);
      const tested = await sendTestNewsletter(id, version + 1);
      if (canWrite) {
        expect(created).toMatchObject({ ok: true });
        expect(saved).toEqual({ ok: true, version: version + 1, problems: {} });
        expect(tested).toEqual({ ok: true, to: EMAIL[who as "draft"] });
        expect(emails.to(EMAIL[who as "draft"])).toHaveLength(1);
        expect(await row(id)).toMatchObject({ subject: "Changed", updatedBy: EMAIL[who as "draft"], testedVersion: version + 1 });
        expect(await deleteNewsletter(id, version + 1)).toEqual({ ok: true });
        expect(await row(id)).toBeUndefined();
      } else {
        for (const result of [created, saved, tested, await deleteNewsletter(id, version)]) {
          expect(result).toMatchObject({ ok: false, reason: refusal(who) });
        }
        expect(await row(id)).toMatchObject({ subject: FIELDS.subject, testedVersion: null });
        expect(emails.sent).toEqual([]);
      }
    });

    it(`${canSend ? "can" : "cannot"} schedule, reschedule and cancel`, async () => {
      const { id, version } = await seed();
      vi.stubEnv("DEPLOY_CONTEXT", "production");
      await signInAs(who);
      const scheduled = await scheduleNewsletter(id, version, IN_A_WEEK, 120);
      if (canSend) {
        expect(scheduled).toEqual({ ok: true });
        expect(await getSendList()).toEqual({ ok: true, name: "Newsletter", subscribers: 120, production: true });
        expect(await rescheduleNewsletter(id, "2026-11-23T09:00:00Z", 120)).toEqual({ ok: true });
        expect(await cancelNewsletter(id)).toEqual({ ok: true });
        expect((await audit()).map((a) => a.action)).toEqual(["newsletter_schedule", "newsletter_reschedule", "newsletter_cancel"]);
      } else {
        for (const result of [scheduled, await getSendList(), await rescheduleNewsletter(id, IN_A_WEEK, 120), await cancelNewsletter(id), await recoverNewsletter(id)]) {
          expect(result).toMatchObject({ ok: false, reason: refusal(who) });
        }
        expect(brevo.campaigns).toEqual([]);
        expect(await audit()).toEqual([]);
      }
    });

    it(`${canWrite ? "can" : "cannot"} open the newsletter pages`, async () => {
      const { id } = await seed();
      await signInAs(who);
      for (const page of [() => NewslettersPage(), () => NewsletterPage({ params: Promise.resolve({ id }) })]) {
        if (who === "signed out" || who === "not in ADMIN_EMAILS") {
          await expect(page()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
          continue;
        }
        const { unmount } = render(await page());
        if (canWrite) expect(screen.queryByText("No access to the newsletter")).toBeNull();
        else expect(screen.getByRole("heading", { name: "No access to the newsletter" })).toBeInTheDocument();
        unmount();
      }
    });

    it(`${canWrite ? "sees" : "does not see"} the Newsletter link in the admin nav`, async () => {
      if (who === "signed out" || who === "not in ADMIN_EMAILS") return;
      await signInAs(who);
      render(await ProtectedAdminLayout({ children: null }));
      if (canWrite) expect(screen.getByRole("link", { name: "Newsletter" })).toHaveAttribute("href", "/admin/newsletters");
      else expect(screen.queryByRole("link", { name: "Newsletter" })).toBeNull();
    });
  });
});

describe("drafts", () => {
  it("starts empty, and saves an unfinished draft with what it still needs", async () => {
    await signInAs("draft");
    const created = await createNewsletter();
    if (!created.ok) throw new Error();
    expect(await row(created.id)).toMatchObject({ subject: "", body: "", version: 1, state: "draft", createdBy: EMAIL.draft });
    expect(await saveNewsletter(created.id, { subject: "", previewText: "", body: "**open" }, 1)).toEqual({
      ok: true,
      version: 2,
      problems: { subject: "Add a subject line.", body: expect.stringMatching(/^The text has a formatting problem/) },
    });
  });

  it("refuses a save from a stale copy, and says why for each kind of refusal", async () => {
    const { id, version } = await seed();
    await signInAs("draft");
    expect(await saveNewsletter(id, FIELDS, version - 1)).toMatchObject({ ok: false, reason: "conflict" });
    expect(await saveNewsletter("00000000-0000-4000-8000-000000000000", FIELDS, 1)).toMatchObject({ ok: false, reason: "not_found" });
    expect(await saveNewsletter("not-an-id", FIELDS, 1)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await saveNewsletter(id, { subject: 1 }, version)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await deleteNewsletter(id, version - 1)).toMatchObject({ ok: false, reason: "conflict" });
    expect(await deleteNewsletter(id, "x")).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("can't be changed or deleted once Brevo has it", async () => {
    const { id } = await seedScheduled();
    const { version } = await row(id);
    await signInAs("publish");
    expect(await saveNewsletter(id, FIELDS, version)).toMatchObject({ ok: false, reason: "locked" });
    expect(await deleteNewsletter(id, version)).toMatchObject({ ok: false, reason: "locked" });
    expect(await sendTestNewsletter(id, version)).toMatchObject({ ok: false, reason: "locked" });
  });
});

describe("send me a test", () => {
  it("sends the saved version to the signed-in admin, marked as a test, with a stand-in unsubscribe link", async () => {
    const { id, version } = await seed({ tested: false });
    await signInAs("draft");
    expect(await sendTestNewsletter(id, version)).toEqual({ ok: true, to: EMAIL.draft });
    const [email] = emails.to(EMAIL.draft);
    expect(email.subject).toBe("[TESTING] [Test] November update");
    expect(email.from).toBe("noreply@example.org");
    expect(email.html).toContain("Hello <strong>everyone</strong>.");
    expect(email.html).toContain('href="https://lawforaisafety.test/field-building"');
    expect(email.html).toContain("#test-unsubscribe-link");
    expect(email.html).not.toContain("{{ unsubscribe }}");
    expect((await row(id)).testedVersion).toBe(version);
  });

  it("has no [TESTING] mark on the live site", async () => {
    const { id, version } = await seed({ tested: false });
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    await signInAs("draft");
    await sendTestNewsletter(id, version);
    expect(emails.last.subject).toBe("[Test] November update");
  });

  it("refuses an unfinished or stale draft, and reports a failed send without marking it tested", async () => {
    const { id, version } = await seed({ tested: false, fields: { ...FIELDS, subject: "" } });
    await signInAs("draft");
    expect(await sendTestNewsletter(id, version)).toEqual({ ok: false, reason: "not_ready", message: "Add a subject line." });
    const saved = await saveNewsletter(id, FIELDS, version);
    expect(await sendTestNewsletter(id, version)).toMatchObject({ ok: false, reason: "conflict" });
    expect(await sendTestNewsletter("00000000-0000-4000-8000-000000000000", 1)).toMatchObject({ ok: false, reason: "not_found" });
    expect(await sendTestNewsletter(id, 0)).toMatchObject({ ok: false, reason: "invalid" });

    vi.spyOn(console, "error").mockImplementation(() => {});
    emails.failNext();
    expect(await sendTestNewsletter(id, saved.ok ? saved.version : 0)).toMatchObject({ ok: false, reason: "brevo" });
    expect((await row(id)).testedVersion).toBeNull();
  });
});

describe("scheduling and sending", () => {
  beforeEach(() => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
  });

  it("hands Brevo the whole campaign for the newsletter list, scheduled for the chosen time", async () => {
    const { id, version } = await seed();
    await signInAs("publish");
    expect(await scheduleNewsletter(id, version, "2026-11-22T09:00:00+00:00", 120)).toEqual({ ok: true });

    expect(brevo.campaigns).toHaveLength(1);
    const [campaign] = brevo.campaigns;
    expect(campaign).toMatchObject({
      name: "November update (2026-11-22)",
      subject: "November update",
      previewText: "What we did this month",
      sender: { email: "noreply@example.org", name: "Law for AI Safety" },
      replyTo: "info@lawforaisafety.org",
      listIds: [NEWSLETTER_LIST_ID],
      status: "queued",
      scheduledAt: IN_A_WEEK,
    });
    expect(campaign.htmlContent).toContain('<a href="{{ unsubscribe }}"');
    expect(campaign.htmlContent).toContain("Hello <strong>everyone</strong>.");
    expect(await row(id)).toMatchObject({ state: "submitted", brevoCampaignId: campaign.id, scheduledAt: new Date(IN_A_WEEK), submittedBy: EMAIL.publish });
    expect(await audit()).toEqual([
      {
        action: "newsletter_schedule",
        actor: EMAIL.publish,
        detail: { newsletter: id, campaign: campaign.id, subject: "November update", at: IN_A_WEEK, subscribers: 120 },
      },
    ]);
  });

  it("sends now when no time is given", async () => {
    const { id, version } = await seed();
    await signInAs("superadmin");
    expect(await scheduleNewsletter(id, version, null, 120)).toEqual({ ok: true });
    expect(brevo.campaigns[0]).toMatchObject({ status: "sent", sentDate: NOW.toISOString() });
    expect(brevo.calls).toContain(`POST /v3/emailCampaigns/${brevo.campaigns[0].id}/sendNow`);
    expect(await row(id)).toMatchObject({ state: "submitted", scheduledAt: NOW });
    expect((await audit()).map((a) => a.action)).toEqual(["newsletter_send_now"]);
  });

  it("needs a test of this exact version first", async () => {
    const { id, version } = await seed({ tested: false });
    await signInAs("publish");
    expect(await scheduleNewsletter(id, version, IN_A_WEEK, 120)).toMatchObject({ ok: false, reason: "not_ready", message: expect.stringMatching(/^Send yourself a test/) });

    await sendTestNewsletter(id, version);
    const saved = await saveNewsletter(id, { ...FIELDS, body: "Changed after the test." }, version);
    expect(await scheduleNewsletter(id, saved.ok ? saved.version : 0, IN_A_WEEK, 120)).toMatchObject({ ok: false, reason: "not_ready" });
    expect(brevo.campaigns).toEqual([]);
  });

  it("only sends to the list from the live site", async () => {
    const { id, version } = await seed();
    vi.stubEnv("DEPLOY_CONTEXT", "deploy-preview");
    await signInAs("publish");
    expect(await scheduleNewsletter(id, version, IN_A_WEEK, 120)).toMatchObject({ ok: false, reason: "not_production" });
    expect(await getSendList()).toMatchObject({ ok: true, production: false });
    expect(brevo.campaigns).toEqual([]);
  });

  it("needs the list's current subscriber count typed back", async () => {
    const { id, version } = await seed();
    await signInAs("publish");
    brevo.list.subscribers = 121;
    expect(await scheduleNewsletter(id, version, IN_A_WEEK, 120)).toEqual({
      ok: false,
      reason: "count_mismatch",
      message: "The list has 121 subscribers now. Type that number to confirm.",
    });
    expect(await scheduleNewsletter(id, version, IN_A_WEEK, "121")).toMatchObject({ ok: false, reason: "invalid" });
    expect(brevo.campaigns).toEqual([]);
  });

  it("refuses a time too soon or not a time", async () => {
    const { id, version } = await seed();
    await signInAs("publish");
    expect(await scheduleNewsletter(id, version, "2026-11-15T12:05:00Z", 120)).toMatchObject({ ok: false, reason: "invalid", message: expect.stringMatching(/at least 10 minutes/) });
    expect(await scheduleNewsletter(id, version, "next tuesday", 120)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await scheduleNewsletter(id, version, "2026-11-22T09:00:00", 120)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("creates one campaign however many times it is asked", async () => {
    const { id, version } = await seed();
    await signInAs("publish");
    const results = await Promise.all([1, 2, 3].map(() => scheduleNewsletter(id, version, IN_A_WEEK, 120)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.reason)).toEqual(["locked", "locked"]);
    expect(brevo.campaigns).toHaveLength(1);
  });

  it("goes back to a draft when Brevo fails, and a retry reuses the campaign Brevo made", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { id, version } = await seed();
    await signInAs("publish");

    brevo.failNext("POST /v3/emailCampaigns");
    expect(await scheduleNewsletter(id, version, IN_A_WEEK, 120)).toMatchObject({
      ok: false,
      reason: "brevo",
      message: expect.stringMatching(/^Brevo could not schedule the newsletter\. Nothing was sent\. Brevo said: 500/),
    });
    expect(await row(id)).toMatchObject({ state: "draft", brevoCampaignId: null, submittedBy: null });

    brevo.failNext(`PUT /v3/emailCampaigns/1`);
    expect(await scheduleNewsletter(id, version, IN_A_WEEK, 120)).toMatchObject({ ok: false, reason: "brevo" });
    expect(await row(id)).toMatchObject({ state: "draft", brevoCampaignId: 1 });
    expect(brevo.campaign(1).status).toBe("draft");

    expect(await scheduleNewsletter(id, version, null, 120)).toEqual({ ok: true });
    expect(brevo.campaigns).toHaveLength(1);
    expect(brevo.campaign(1).status).toBe("sent");
  });

  it("says when Brevo can't be asked for the list", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { id, version } = await seed();
    await signInAs("publish");
    brevo.failNext("/contacts/lists");
    expect(await getSendList()).toMatchObject({ ok: false, reason: "brevo", message: expect.stringMatching(/^Brevo could not look up the list/) });
    brevo.failNext("/contacts/lists");
    expect(await scheduleNewsletter(id, version, IN_A_WEEK, 120)).toMatchObject({ ok: false, reason: "brevo" });
  });
});

describe("once scheduled", () => {
  beforeEach(() => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
  });

  it("can be moved to another time, confirmed again", async () => {
    const { id, campaignId } = await seedScheduled();
    await signInAs("publish");
    expect(await rescheduleNewsletter(id, "2026-11-23T09:00:00Z", 119)).toMatchObject({ ok: false, reason: "count_mismatch" });
    expect(await rescheduleNewsletter(id, "2026-11-15T12:01:00Z", 120)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await rescheduleNewsletter(id, "2026-11-23T09:00:00Z", 120)).toEqual({ ok: true });
    expect(brevo.campaign(campaignId)).toMatchObject({ status: "queued", scheduledAt: "2026-11-23T09:00:00.000Z" });
    expect((await row(id)).scheduledAt).toEqual(new Date("2026-11-23T09:00:00Z"));
    expect(await audit()).toEqual([
      { action: "newsletter_reschedule", actor: EMAIL.publish, detail: { newsletter: id, campaign: campaignId, from: IN_A_WEEK, at: "2026-11-23T09:00:00.000Z" } },
    ]);
  });

  it("can be cancelled, which suspends the campaign and makes it an editable, still-tested draft", async () => {
    const { id, campaignId } = await seedScheduled();
    await signInAs("publish");
    expect(await cancelNewsletter(id)).toEqual({ ok: true });
    expect(brevo.campaign(campaignId).status).toBe("suspended");
    const after = await row(id);
    expect(after).toMatchObject({ state: "draft", brevoCampaignId: null, scheduledAt: null, submittedBy: null });
    expect(after.testedVersion).toBe(after.version);
    expect(await audit()).toEqual([{ action: "newsletter_cancel", actor: EMAIL.publish, detail: { newsletter: id, campaign: campaignId, was: IN_A_WEEK } }]);

    // Scheduling it again makes a new campaign; the suspended one can't be changed.
    expect(await scheduleNewsletter(id, after.version, IN_A_WEEK, 120)).toEqual({ ok: true });
    expect(brevo.campaigns.map((c) => c.status)).toEqual(["suspended", "queued"]);
  });

  it("can't be changed once Brevo has started sending it", async () => {
    const { id, campaignId } = await seedScheduled();
    brevo.startSending(campaignId);
    await signInAs("publish");
    expect(await cancelNewsletter(id)).toMatchObject({ ok: false, reason: "locked" });
    expect(await rescheduleNewsletter(id, IN_A_WEEK, 120)).toMatchObject({ ok: false, reason: "locked" });
    expect(brevo.campaign(campaignId).status).toBe("in_process");
  });

  it("refuses for a draft, an unknown newsletter or a bad argument, and reports Brevo failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { id: draftId } = await seed();
    await signInAs("publish");
    expect(await cancelNewsletter(draftId)).toMatchObject({ ok: false, reason: "invalid", message: "This newsletter is not scheduled." });
    expect(await cancelNewsletter("00000000-0000-4000-8000-000000000000")).toMatchObject({ ok: false, reason: "not_found" });
    expect(await cancelNewsletter(5)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await rescheduleNewsletter(draftId, "soon", 1)).toMatchObject({ ok: false, reason: "invalid" });

    const { id, campaignId } = await seedScheduled();
    await signInAs("publish");
    brevo.failNext(`GET /v3/emailCampaigns/${campaignId}`);
    expect(await cancelNewsletter(id)).toMatchObject({ ok: false, reason: "brevo", message: expect.stringMatching(/look up the campaign/) });
    brevo.failNext("/status");
    expect(await cancelNewsletter(id)).toMatchObject({ ok: false, reason: "brevo", message: expect.stringMatching(/cancel the newsletter/) });
    brevo.failNext(`PUT /v3/emailCampaigns/${campaignId}`);
    expect(await rescheduleNewsletter(id, "2026-11-23T09:00:00Z", 120)).toMatchObject({ ok: false, reason: "brevo", message: expect.stringMatching(/reschedule/) });
    expect((await row(id)).state).toBe("submitted");
  });
});

describe("an interrupted hand-over", () => {
  /** A newsletter claimed for sending whose request then died, after Brevo got `campaign` (or nothing). */
  async function seedStuck(campaign: "none" | "draft" | "queued"): Promise<string> {
    const { id, version } = await seed();
    let campaignId: number | null = null;
    if (campaign !== "none") {
      const res = await fetch("https://api.brevo.com/v3/emailCampaigns", {
        method: "POST",
        headers: { "api-key": "k" },
        body: JSON.stringify({ name: "x", subject: "x", htmlContent: "x", recipients: { listIds: [NEWSLETTER_LIST_ID] } }),
      });
      campaignId = (await res.json()).id;
      if (campaign === "queued") brevo.campaign(campaignId!).status = "queued";
      if (campaign === "queued") brevo.campaign(campaignId!).scheduledAt = IN_A_WEEK;
    }
    await db
      .update(newsletters)
      .set({ state: "submitting", brevoCampaignId: campaignId, submittedBy: EMAIL.publish, submittedAt: new Date(NOW.getTime() - 6 * 60_000) })
      .where(eq(newsletters.id, id));
    expect(version).toBeGreaterThan(0);
    return id;
  }

  it("waits a few minutes before it counts as interrupted", async () => {
    const id = await seedStuck("none");
    await db.update(newsletters).set({ submittedAt: NOW }).where(eq(newsletters.id, id));
    await signInAs("publish");
    expect(await recoverNewsletter(id)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await recoverNewsletter("00000000-0000-4000-8000-000000000000")).toMatchObject({ ok: false, reason: "not_found" });
    expect(await recoverNewsletter("x")).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("goes back to a draft when Brevo has no campaign, or only a draft one", async () => {
    await signInAs("publish");
    for (const campaign of ["none", "draft"] as const) {
      const id = await seedStuck(campaign);
      await signInAs("publish");
      expect(await recoverNewsletter(id)).toEqual({ ok: true });
      expect(await row(id)).toMatchObject({ state: "draft", submittedBy: null, submittedAt: null });
    }
  });

  it("counts as handed over when Brevo has it scheduled", async () => {
    const id = await seedStuck("queued");
    await signInAs("superadmin");
    expect(await recoverNewsletter(id)).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ state: "submitted", scheduledAt: new Date(IN_A_WEEK), submittedBy: EMAIL.publish });
  });

  it("reports Brevo failing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await seedStuck("draft");
    await signInAs("publish");
    brevo.failNext("GET /v3/emailCampaigns");
    expect(await recoverNewsletter(id)).toMatchObject({ ok: false, reason: "brevo" });
    expect((await row(id)).state).toBe("submitting");
  });
});

describe("deleting a draft", () => {
  it("also deletes a campaign a failed hand-over left in Brevo, and carries on if Brevo refuses", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const brevoFails of [false, true]) {
      const { id, version } = await seed();
      await signInAs("publish");
      brevo.failNext("PUT /v3/emailCampaigns");
      await scheduleNewsletter(id, version, IN_A_WEEK, 120);
      const campaignId = (await row(id)).brevoCampaignId!;
      if (brevoFails) brevo.failNext("DELETE");
      expect(await deleteNewsletter(id, version)).toEqual({ ok: true });
      expect(await row(id)).toBeUndefined();
      expect(brevo.campaigns.some((c) => c.id === campaignId)).toBe(brevoFails);
    }
  });
});

describe("the pages", () => {
  it("lists every newsletter with where it stands, asking Brevo for those it has", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    const { id: scheduled } = await seedScheduled();
    const { id: sent, version } = await seed({ fields: { ...FIELDS, subject: "October update" } });
    await scheduleNewsletter(sent, version, null, 120);
    await seed({ tested: false, fields: { ...FIELDS, subject: "December update" } });
    await signInAs("draft");
    await createNewsletter();

    vi.stubEnv("TZ", "UTC");
    render(await NewslettersPage());
    const item = (name: string) => within(screen.getByRole("link", { name }).closest("li")!);
    expect(item("November update").getByText(/^Scheduled for/)).toHaveTextContent("Scheduled for Sunday, 22 November 2026, 09:00");
    expect(item("October update").getByText(/^Sent/)).toHaveTextContent("delivered to 120");
    expect(item("December update").getByText("Draft")).toBeInTheDocument();
    expect(item("Untitled newsletter").getByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "November update" })).toHaveAttribute("href", `/admin/newsletters/${scheduled}`);
  });

  it("says when Brevo can't be reached, rather than guessing", async () => {
    const { id } = await seedScheduled();
    vi.spyOn(console, "error").mockImplementation(() => {});
    brevo.failNext("GET /v3/emailCampaigns");
    await signInAs("draft");
    render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    expect(screen.getByText("Could not reach Brevo to check")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel sending" })).toBeNull();
  });

  it("says there is no such newsletter", async () => {
    await signInAs("draft");
    render(await NewsletterPage({ params: Promise.resolve({ id: "nope" }) }));
    expect(screen.getByRole("heading", { name: "No such newsletter" })).toBeInTheDocument();
  });

  it("lets a drafter write and test, but not send", async () => {
    const { id } = await seed({ tested: false });
    await signInAs("draft");
    render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    expect(screen.getByLabelText("Subject")).toHaveValue("November update");
    expect(screen.getByText(/ask someone who has it to schedule it/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schedule…" })).toBeNull();
    const preview = screen.getByTitle("Email preview") as HTMLIFrameElement;
    expect(preview.getAttribute("srcdoc")).toContain("Hello <strong>everyone</strong>.");
  });

  it("walks a sender through test, confirm and send", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    const { id } = await seed({ tested: false });
    await signInAs("publish");
    const user = userEvent.setup();
    render(await NewsletterPage({ params: Promise.resolve({ id }) }));

    const preview = () => (screen.getByTitle("Email preview") as HTMLIFrameElement).getAttribute("srcdoc");
    await user.type(screen.getByLabelText("Preview text"), " and next");
    expect(preview()).toContain("What we did this month and next");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send me a test" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Send now" }));
    expect(screen.getByText("Send yourself a test of this version first, and check it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send now…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Send me a test" }));
    expect(await screen.findByText(`Test sent to ${EMAIL.publish}. Open it and check it before sending.`)).toBeInTheDocument();
    expect(emails.to(EMAIL.publish)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Send now…" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(await dialog.findByText("Newsletter")).toBeInTheDocument();
    expect(dialog.getByText("Straight away")).toBeInTheDocument();
    const send = dialog.getByRole("button", { name: "Send now: 120 subscribers" });
    expect(send).toBeDisabled();
    await user.type(dialog.getByLabelText(/type the number of subscribers/), "12");
    expect(send).toBeDisabled();
    await user.type(dialog.getByLabelText(/type the number of subscribers/), "0");
    await user.click(send);
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalled());
    expect(brevo.campaigns).toMatchObject([{ status: "sent", previewText: "What we did this month and next" }]);
  });

  it("schedules for a time in the sender's timezone, and shows a refusal in the dialog", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    const { id } = await seed();
    await signInAs("publish");
    const user = userEvent.setup();
    render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    expect(screen.getByText(/^Your timezone:/)).toHaveTextContent(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(screen.getByRole("button", { name: "Schedule…" })).toBeDisabled();
    await user.type(screen.getByLabelText("Send at"), "2026-11-22T09:00");
    await user.click(screen.getByRole("button", { name: "Schedule…" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(await dialog.findByText(/22 November 2026, 09:00/)).toBeInTheDocument();
    brevo.list.subscribers = 125;
    await user.type(dialog.getByLabelText(/type the number of subscribers/), "120");
    await user.click(dialog.getByRole("button", { name: "Schedule: 120 subscribers" }));
    expect(await dialog.findByText("The list has 125 subscribers now. Type that number to confirm.")).toBeInTheDocument();
    expect(brevo.campaigns).toEqual([]);
  });

  it("warns in the dialog when this isn't the live site", async () => {
    const { id } = await seed();
    await signInAs("publish");
    const user = userEvent.setup();
    render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    await user.click(screen.getByRole("radio", { name: "Send now" }));
    await user.click(screen.getByRole("button", { name: "Send now…" }));
    expect(await screen.findByText(/This isn't the live site, so the send will be refused/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go back" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lets a sender reschedule or cancel a scheduled newsletter", async () => {
    const { id, campaignId } = await seedScheduled();
    await signInAs("publish");
    const user = userEvent.setup();
    const view = render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    expect(screen.getByText(/^Scheduled for/)).toBeInTheDocument();
    expect(screen.getByText(`Handed to Brevo by ${EMAIL.superadmin}.`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    const input = screen.getByLabelText("New send time");
    expect(input).not.toHaveValue("");
    await user.clear(input);
    await user.type(input, "2026-11-23T10:00");
    await user.click(screen.getByRole("button", { name: "Reschedule…" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(await dialog.findByLabelText(/type the number of subscribers/), "120");
    await user.click(dialog.getByRole("button", { name: "Reschedule: 120 subscribers" }));
    await waitFor(() => expect(brevo.campaign(campaignId).scheduledAt).toBe(new Date("2026-11-23T10:00").toISOString()));
    view.unmount();

    render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    await user.click(screen.getByRole("button", { name: "Cancel sending" }));
    await user.click(screen.getByRole("button", { name: "Keep it scheduled" }));
    await user.click(screen.getByRole("button", { name: "Cancel sending" }));
    await user.click(within(screen.getByRole("dialog", { name: "Cancel sending" })).getByRole("button", { name: "Cancel sending" }));
    await waitFor(() => expect(brevo.campaign(campaignId).status).toBe("suspended"));
  });

  it("offers to check with Brevo after an interrupted hand-over, and tells a drafter who can act", async () => {
    const { id } = await seedScheduled();
    await signInAs("draft");
    const first = render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    expect(screen.getByText(/Someone with permission to publish website pages can reschedule or cancel it/)).toBeInTheDocument();
    first.unmount();

    await db.update(newsletters).set({ state: "submitting", submittedAt: new Date(NOW.getTime() - 60_000) }).where(eq(newsletters.id, id));
    await signInAs("publish");
    const second = render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    expect(screen.getByText(/is being handed to Brevo/)).toBeInTheDocument();
    second.unmount();

    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000));
    const user = userEvent.setup();
    render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    await user.click(screen.getByRole("button", { name: "Check with Brevo" }));
    await waitFor(async () => expect((await row(id)).state).toBe("submitted"));
  });
});

describe("missing settings", () => {
  it("still opens the editor without a sender address, saying it is missing", async () => {
    const { id } = await seed({ tested: false });
    vi.stubEnv("BREVO_FROM_EMAIL", "");
    await signInAs("draft");
    render(await NewsletterPage({ params: Promise.resolve({ id }) }));
    expect(screen.getByText("From: (no sender set: BREVO_FROM_EMAIL is missing)")).toBeInTheDocument();
  });
});
