import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { opportunitySubmissions, rateLimitHits } from "@/drizzle/schema";
import { FORM_RENDERED_AT_FIELD_NAME, HONEYPOT_FIELD_NAME } from "@/lib/abuse-protection";
import { sweepOldSubmissionDrafts } from "@/lib/opportunity-submission-flow";
import { APP_ORIGIN } from "../../../../../test/app-fetch";
import { cookieJar } from "../../../../../test/next-headers";
import { emails, linkParam } from "../../../../../test/fakes/email";
import { oauthProviders } from "../../../../../test/fakes/oauth";
import { SLACK_WEBHOOK_URL, slack } from "../../../../../test/fakes/slack";
import { turnstile } from "../../../../../test/fakes/turnstile";
import * as email from "./email/route";
import * as emailConfirm from "./email/confirm/route";
import * as google from "./google/route";
import * as googleCallback from "./google/callback/route";
import * as linkedin from "./linkedin/route";
import * as linkedinCallback from "./linkedin/callback/route";
import * as retry from "./retry/route";

// `cookies()` needs Next's request context; the browser's cookies are `cookieJar`.
vi.mock("next/headers", () => import("../../../../../test/next-headers"));

type Handler = (request: Request) => Promise<Response>;

const COOKIE = "opportunity_submit_oauth_state";
const SUBMITTER = { sub: "linkedin-sub-1", name: "Sam Submitter", email: "sam@example.org" };

const LINK = { mode: "link", sourceUrl: "https://example.org/jobs/counsel" };
const LISTING = {
  mode: "listing",
  type: "job",
  title: "AI Policy Counsel",
  org: "Example Org",
  applyUrl: "https://example.org/apply",
  description: "Advise on AI regulation.",
};

function post(handler: Handler, path: string, fields: Record<string, string>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return handler(new Request(`${APP_ORIGIN}${path}`, { method: "POST", body }));
}

/** What the form sends once a person has filled it in and passed the bot checks. */
function human(fields: Record<string, string>) {
  return {
    ...fields,
    "cf-turnstile-response": turnstile.accept(),
    [FORM_RENDERED_AT_FIELD_NAME]: String(Date.now() - 60_000),
  };
}

function location(response: Response) {
  expect(response.status).toBe(303);
  return response.headers.get("Location");
}

async function handoffState(response: Response): Promise<string> {
  expect(response.status).toBe(200);
  const href = (await response.text()).match(/<a href="([^"]+)">Continue to/)?.[1] ?? "";
  return new URL(href.replaceAll("&amp;", "&")).searchParams.get("state") ?? "";
}

function callback(handler: Handler, provider: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return handler(new Request(`${APP_ORIGIN}/api/opportunities/submit/${provider}/callback?${query}`));
}

async function rows() {
  return db.select().from(opportunitySubmissions);
}

beforeEach(async () => {
  cookieJar.reset();
  await db.delete(rateLimitHits);
  await db.delete(opportunitySubmissions);
  vi.stubEnv("LINKEDIN_CLIENT_ID", "test-linkedin-client");
  vi.stubEnv("LINKEDIN_CLIENT_SECRET", "test-linkedin-secret");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-secret");
  vi.stubEnv("SLACK_WEBHOOK_URL", SLACK_WEBHOOK_URL);
  // Production, so mail reaches the submitter and info@ rather than admin addresses only.
  vi.stubEnv("DEPLOY_CONTEXT", "production");
});

describe("submitting by name and email", () => {
  it("emails a confirmation link, and hands the submission to the team only once it's used", async () => {
    const response = await post(email.POST, "/api/opportunities/submit/email", human({ ...LINK, name: "Sam Submitter", email: "Sam@Example.org" }));
    expect(location(response)).toBe("/opportunities/submit?submitted=confirm");

    const [draft] = await rows();
    expect(draft).toMatchObject({ status: "draft", sourceUrl: LINK.sourceUrl, email: "sam@example.org" });
    expect(slack.messages).toEqual([]);

    const [confirmation] = emails.to("sam@example.org");
    expect(confirmation.subject).toBe("Confirm your opportunity for Law for AI Safety");
    const token = linkParam(confirmation, "token");

    const confirmed = await post(emailConfirm.POST, "/api/opportunities/submit/email/confirm", { token });
    expect(location(confirmed)).toBe("/opportunities/submit?submitted=1");

    const [pending] = await rows();
    expect(pending).toMatchObject({ status: "pending", name: "Sam Submitter", providerId: "sam@example.org", stateToken: null });
    expect(slack.messages).toHaveLength(1);
    expect(slack.messages[0]).toContain(`New opportunity submitted by Sam Submitter: ${LINK.sourceUrl}`);
    expect(slack.messages[0]).toContain(`/admin/opportunities/submissions/${pending.id}`);
    expect(emails.to("info@lawforaisafety.org")[0].subject).toBe("New opportunity submitted by Sam Submitter");
  });

  it("can't be confirmed twice", async () => {
    await post(email.POST, "/api/opportunities/submit/email", human({ ...LINK, name: "Sam", email: "sam@example.org" }));
    const token = linkParam(emails.to("sam@example.org")[0], "token");
    await post(emailConfirm.POST, "/api/opportunities/submit/email/confirm", { token });

    const again = await post(emailConfirm.POST, "/api/opportunities/submit/email/confirm", { token });
    expect(location(again)).toBe("/opportunities/submit?error=invalid");
    expect(slack.messages).toHaveLength(1);
  });

  it("stops sending confirmation emails to one address after three a day", async () => {
    for (let i = 0; i < 4; i++) {
      const response = await post(email.POST, "/api/opportunities/submit/email", human({ ...LINK, name: "Sam", email: "sam@example.org" }));
      expect(location(response)).toBe("/opportunities/submit?submitted=confirm");
    }
    expect(emails.to("sam@example.org")).toHaveLength(3);
  });

  it("refuses a name with markup in it", async () => {
    const response = await post(email.POST, "/api/opportunities/submit/email", human({ ...LINK, name: "<b>Sam</b>", email: "sam@example.org" }));
    expect(location(response)).toBe("/opportunities/submit?error=name");
    expect(await rows()).toEqual([]);
  });

  it("saves nothing when the confirmation email can't be sent", async () => {
    emails.failNext();
    const response = await post(email.POST, "/api/opportunities/submit/email", human({ ...LINK, name: "Sam", email: "sam@example.org" }));
    expect(location(response)).toBe("/opportunities/submit?error=sendfailed");
    expect(await rows()).toEqual([]);
  });
});

describe("what a submission must contain", () => {
  const cases: [string, Record<string, string>, string][] = [
    ["a link with no address", { mode: "link" }, "validation"],
    ["a link that isn't a web address", { mode: "link", sourceUrl: "javascript:alert(1)" }, "url"],
    ["a listing with no description", { ...LISTING, description: "" }, "validation"],
    ["a listing of an unknown type", { ...LISTING, type: "workshop" }, "validation"],
    ["an apply link that isn't a web address", { ...LISTING, applyUrl: "ftp://example.org" }, "url"],
    ["an event with no date", { ...LISTING, type: "event" }, "eventdate"],
    ["an end date before the start date", { ...LISTING, startDate: "2026-11-05", endDate: "2026-11-01" }, "date"],
    ["a date that doesn't exist", { ...LISTING, deadline: "2026-02-30" }, "date"],
    ["a title that is too long", { ...LISTING, title: "x".repeat(201) }, "toolong"],
  ];

  it.each(cases)("refuses %s", async (_, fields, code) => {
    const response = await post(email.POST, "/api/opportunities/submit/email", human({ ...fields, name: "Sam", email: "sam@example.org" }));
    expect(location(response)).toBe(`/opportunities/submit?error=${code}`);
    expect(await rows()).toEqual([]);
  });

  it("keeps a full listing's details", async () => {
    await post(
      email.POST,
      "/api/opportunities/submit/email",
      human({
        ...LISTING,
        type: "event",
        startDate: "2026-11-20",
        endDate: "2026-11-21",
        deadline: "2026-11-10",
        location: "Brussels, Belgium",
        remote: "on",
        note: "I'm one of the organisers.",
        name: "Sam",
        email: "sam@example.org",
      }),
    );
    expect((await rows())[0]).toMatchObject({
      type: "event",
      title: LISTING.title,
      org: LISTING.org,
      applyUrl: LISTING.applyUrl,
      startDate: "2026-11-20",
      endDate: "2026-11-21",
      deadline: "2026-11-10",
      location: "Brussels, Belgium",
      remote: true,
      note: "I'm one of the organisers.",
    });
  });
});

describe("the bot checks", () => {
  it("sends the form back when Turnstile fails", async () => {
    const response = await post(email.POST, "/api/opportunities/submit/email", { ...LINK, name: "Sam", email: "sam@example.org" });
    expect(location(response)).toBe("/opportunities/submit?error=verification");
  });

  it("answers a filled honeypot as a success, but saves and sends nothing", async () => {
    const response = await post(
      email.POST,
      "/api/opportunities/submit/email",
      human({ ...LINK, name: "Sam", email: "sam@example.org", [HONEYPOT_FIELD_NAME]: "spam" }),
    );
    expect(location(response)).toBe("/opportunities/submit?submitted=confirm");
    expect(await rows()).toEqual([]);
    expect(emails.sent).toEqual([]);
  });
});

describe.each([
  ["linkedin", linkedin.POST, linkedinCallback.GET],
  ["google", google.POST, googleCallback.GET],
] as const)("submitting with %s", (provider, start, finish) => {
  async function startDraft() {
    return handoffState(await post(start, `/api/opportunities/submit/${provider}`, human(LISTING)));
  }

  it("hands the submission to the team once the submitter signs in", async () => {
    const state = await startDraft();
    expect(cookieJar.get(COOKIE)?.value).toBe(state);
    expect((await rows())[0]).toMatchObject({ status: "draft", authProvider: provider, title: LISTING.title });

    const code = oauthProviders.signIn(provider, SUBMITTER);
    const response = await callback(finish, provider, { code, state });

    expect(location(response)).toBe("/opportunities/submit?submitted=1");
    expect((await rows())[0]).toMatchObject({ status: "pending", name: SUBMITTER.name, email: SUBMITTER.email, providerId: SUBMITTER.sub });
    expect(oauthProviders.exchanges[0].redirectUri).toBe(`https://lawforaisafety.test/api/opportunities/submit/${provider}/callback`);
    expect(slack.messages[0]).toContain("AI Policy Counsel at Example Org");
    expect(cookieJar.get(COOKIE)).toBeUndefined();
  });

  it("won't complete a draft in a browser that didn't start it", async () => {
    const state = await startDraft();
    cookieJar.reset();

    const code = oauthProviders.signIn(provider, SUBMITTER);
    expect(location(await callback(finish, provider, { code, state }))).toBe("/opportunities/submit?error=invalid");
    expect((await rows())[0].status).toBe("draft");
  });

  it("offers a retry when the provider won't vouch for the email address, without retyping", async () => {
    const state = await startDraft();
    const code = oauthProviders.signIn(provider, { ...SUBMITTER, emailVerified: false });

    expect(location(await callback(finish, provider, { code, state }))).toBe(`/opportunities/submit/retry?token=${state}`);
    expect((await rows())[0]).toMatchObject({ status: "draft", authError: "email_unverified" });

    const retried = await post(retry.POST, "/api/opportunities/submit/retry", { token: state, provider: "google" });
    const newState = await handoffState(retried);
    expect(newState).not.toBe(state);
    expect(cookieJar.get(COOKIE)?.value).toBe(newState);
    expect((await rows())[0]).toMatchObject({ authProvider: "google", authError: null, stateToken: newState });
  });

  it("offers a retry when sign-in is cancelled", async () => {
    const state = await startDraft();
    expect(location(await callback(finish, provider, { error: "user_cancelled_login", state }))).toBe(
      `/opportunities/submit/retry?token=${state}`,
    );
  });

  it("sends an expired draft back to the form", async () => {
    const state = await startDraft();
    await db.update(opportunitySubmissions).set({ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });

    const code = oauthProviders.signIn(provider, SUBMITTER);
    expect(location(await callback(finish, provider, { code, state }))).toBe("/opportunities/submit?error=expired");
  });
});

describe("retrying", () => {
  it("refuses a token from another browser", async () => {
    const response = await post(retry.POST, "/api/opportunities/submit/retry", { token: "someone-elses", provider: "linkedin" });
    expect(location(response)).toBe("/opportunities/submit?error=invalid");
  });

  it("refuses an email-path draft's token", async () => {
    await post(email.POST, "/api/opportunities/submit/email", human({ ...LINK, name: "Sam", email: "sam@example.org" }));
    const token = linkParam(emails.to("sam@example.org")[0], "token");
    cookieJar.set(COOKIE, token);

    const response = await post(retry.POST, "/api/opportunities/submit/retry", { token, provider: "linkedin" });
    expect(location(response)).toBe("/opportunities/submit?error=expired");
  });
});

describe("sweeping", () => {
  it("deletes drafts a day old and keeps everything else", async () => {
    await db.insert(opportunitySubmissions).values([
      { authProvider: "email", status: "draft", createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      { authProvider: "email", status: "draft" },
      { authProvider: "email", status: "pending", createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    ]);
    expect(await sweepOldSubmissionDrafts()).toBe(1);
    expect((await rows()).map((row) => row.status).sort()).toEqual(["draft", "pending"]);
    expect(await db.select().from(opportunitySubmissions).where(eq(opportunitySubmissions.status, "pending"))).toHaveLength(1);
  });
});
