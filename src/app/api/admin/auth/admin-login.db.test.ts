import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  adminAuditLog,
  adminLinkedinRetired,
  adminPeople,
  adminSessions,
  cmsRoles,
  taskTrackerProjects,
  taskTrackerTasks,
} from "@/drizzle/schema";
import { retireLinkedin } from "@/lib/admin-workspace";
import { getAdminSession, startAdminSession } from "@/lib/session";
import { APP_ORIGIN } from "../../../../../test/app-fetch";
import { cookieJar } from "../../../../../test/next-headers";
import { oauthProviders, type ProviderUser } from "../../../../../test/fakes/oauth";
import * as login from "./google/route";
import * as loginCallback from "./google/callback/route";
import * as linkedinLogin from "./linkedin/route";
import * as linkedinCallback from "./linkedin/callback/route";

// `cookies()` needs Next's request context; the browser's cookies are `cookieJar`.
vi.mock("next/headers", () => import("../../../../../test/next-headers"));

// A made-up Workspace domain: the real one lives only in ADMIN_GOOGLE_DOMAIN.
const DOMAIN = "lais.example";
const ADMIN: ProviderUser = { sub: "google-sub-1", name: "Sam Admin", email: `sam@${DOMAIN}`, hostedDomain: DOMAIN };
const CALLBACK = "https://lawforaisafety.test/api/admin/auth/google/callback";
// The same admin's LinkedIn account, on a personal address.
const SAM_LINKEDIN: ProviderUser = { sub: "linkedin-sub-1", name: "Sam Admin", email: "sam@personal.example" };

function location(response: Response) {
  expect(response.status).toBe(303);
  return response.headers.get("Location");
}

/** Opens the login route in a fresh browser, and returns the state Google would hand back. */
async function startLogin(): Promise<string> {
  cookieJar.reset();
  const response = await googleLogin();
  return new URL(location(response)!).searchParams.get("state")!;
}

function callback(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return loginCallback.GET(new Request(`${APP_ORIGIN}/api/admin/auth/google/callback?${query}`));
}

/**
 * Goes through the whole Google login as `user`, and returns where the browser lands. The
 * browser keeps its cookies, as a real one would; `startLogin` starts a fresh one.
 */
async function signInAs(user: ProviderUser) {
  const state = await startLogin();
  return location(await callback({ code: oauthProviders.signIn("google", user), state }));
}

/** The same through LinkedIn, in the browser as it stands (`fresh` clears it first). */
async function linkedinSignIn(user: ProviderUser, { fresh = true } = {}) {
  if (fresh) cookieJar.reset();
  const state = new URL(location(await linkedinLogin.GET())!).searchParams.get("state")!;
  const query = new URLSearchParams({ code: oauthProviders.signIn("linkedin", user), state });
  return location(await linkedinCallback.GET(new Request(`${APP_ORIGIN}/api/admin/auth/linkedin/callback?${query}`)));
}

// The site's own address (NEXT_PUBLIC_SITE_URL in test/setup-env.ts), which its pages send as Origin.
const SITE = "https://lawforaisafety.test";

/** The "Switch to Google" button's POST, as this site's own page sends it. */
const switchPost = (headers: Record<string, string> = { origin: SITE, "sec-fetch-site": "same-origin" }) =>
  login.POST(new Request(`${APP_ORIGIN}/api/admin/auth/google`, { method: "POST", headers }));

/** The "Switch to Google" button, clicked in a browser still signed in with LinkedIn. */
async function switchToGoogle(user: ProviderUser) {
  const state = new URL(location(await switchPost())!).searchParams.get("state")!;
  return location(await callback({ code: oauthProviders.signIn("google", user), state }));
}

const googleLogin = () => login.GET();

const liveSessions = async () =>
  (await db.select().from(adminSessions)).filter((row) => row.endedAt === null).map((row) => row.email);

beforeEach(async () => {
  cookieJar.reset();
  await db.delete(adminSessions);
  await db.delete(adminAuditLog);
  await db.delete(adminPeople);
  await db.delete(adminLinkedinRetired);
  await db.delete(cmsRoles);
  await db.delete(taskTrackerTasks);
  await db.delete(taskTrackerProjects);
  vi.stubEnv("LINKEDIN_CLIENT_ID", "test-linkedin-client");
  vi.stubEnv("LINKEDIN_CLIENT_SECRET", "test-linkedin-secret");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-secret");
  vi.stubEnv("ADMIN_GOOGLE_DOMAIN", DOMAIN);
  vi.stubEnv("ADMIN_EMAILS", `sam@${DOMAIN},sam@personal.example`);
});

describe("starting an admin login", () => {
  it("sends the browser to Google, offering only the Workspace's accounts", async () => {
    const response = await googleLogin();
    const url = new URL(location(response)!);
    expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-google-client");
    expect(url.searchParams.get("redirect_uri")).toBe(CALLBACK);
    expect(url.searchParams.get("hd")).toBe(DOMAIN);
    // The plain login lets Google use the account the browser is signed in to.
    expect(url.searchParams.get("prompt")).toBeNull();
    expect(cookieJar.get("admin_oauth_state")?.value).toBe(url.searchParams.get("state"));
  });

  it("sends a Google login back to the login page while Google login isn't set up", async () => {
    vi.stubEnv("ADMIN_GOOGLE_DOMAIN", " ");
    expect(location(await googleLogin())).toBe("/admin/login?error=unavailable");
    expect(cookieJar.get("admin_oauth_state")).toBeUndefined();
    await linkedinSignIn(SAM_LINKEDIN);
    expect(location(await switchPost())).toBe("/admin/login?error=unavailable");
    expect(cookieJar.get("admin_switch_from")).toBeUndefined();
  });

  it("refuses to start without the site's address", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    await expect(googleLogin()).rejects.toThrow("Missing required env var: NEXT_PUBLIC_SITE_URL");
  });
});

describe("coming back from Google", () => {
  it("signs in a Workspace account that is on ADMIN_EMAILS, and records the login", async () => {
    expect(await signInAs(ADMIN)).toBe("/admin");
    expect(oauthProviders.exchanges).toEqual([{ provider: "google", code: expect.any(String), redirectUri: CALLBACK }]);
    expect(await getAdminSession()).toEqual({ email: `sam@${DOMAIN}`, name: "Sam Admin" });
    expect(cookieJar.get("admin_oauth_state")).toBeUndefined();

    const [entry] = await db.select().from(adminAuditLog);
    expect(entry).toMatchObject({ actorEmail: `sam@${DOMAIN}`, action: "login", detail: { provider: "google" } });
    expect(await db.select().from(adminPeople)).toMatchObject([{ email: `sam@${DOMAIN}`, name: "Sam Admin" }]);
  });

  it("reads a domain written with a leading @ or a trailing dot", async () => {
    vi.stubEnv("ADMIN_GOOGLE_DOMAIN", ` @${DOMAIN}. `);
    expect(await signInAs(ADMIN)).toBe("/admin");
  });

  it("matches the domain and the address whatever their case", async () => {
    vi.stubEnv("ADMIN_GOOGLE_DOMAIN", "LAIS.Example");
    expect(await signInAs({ ...ADMIN, email: `Sam@LAIS.example`, hostedDomain: "Lais.Example" })).toBe("/admin");
    expect(await getAdminSession()).toMatchObject({ email: `sam@${DOMAIN}` });
  });

  it.each([
    ["a personal Google account, even one on an address listed in ADMIN_EMAILS", { email: "sam@personal.example", hostedDomain: undefined }],
    // Anyone can make a personal Google account on an address they receive mail at.
    ["a personal Google account on a Workspace address", { hostedDomain: undefined }],
    ["another organisation's Workspace account", { email: "sam@other.example", hostedDomain: "other.example" }],
    ["a Workspace account whose address is off the domain", { email: "sam@personal.example" }],
    ["a domain that only ends with the Workspace's", { email: `sam@evil${DOMAIN}`, hostedDomain: `evil${DOMAIN}` }],
  ])("turns away %s", async (_, override) => {
    expect(await signInAs({ ...ADMIN, ...override })).toBe("/admin/login?error=workspace");
    expect(await db.select().from(adminSessions)).toEqual([]);
    expect(await db.select().from(adminAuditLog)).toEqual([]);
  });

  it("turns away a Workspace account that isn't on ADMIN_EMAILS", async () => {
    expect(await signInAs({ ...ADMIN, email: `kim@${DOMAIN}` })).toBe("/admin/login?error=forbidden");
    expect(await db.select().from(adminSessions)).toEqual([]);
  });

  it("turns away an account whose email Google doesn't vouch for", async () => {
    expect(await signInAs({ ...ADMIN, emailVerified: false })).toBe("/admin/login?error=forbidden");
    expect(await db.select().from(adminSessions)).toEqual([]);
  });

  it("refuses a state this browser wasn't given", async () => {
    const state = await startLogin();
    cookieJar.reset();
    const response = await callback({ code: oauthProviders.signIn("google", ADMIN), state });
    expect(location(response)).toBe("/admin/login?error=invalid");
    expect(oauthProviders.exchanges).toEqual([]);
  });

  it("refuses a callback with no state at all", async () => {
    expect(location(await callback({ code: oauthProviders.signIn("google", ADMIN) }))).toBe("/admin/login?error=invalid");
  });

  it("says the login was cancelled when Google sends no code", async () => {
    const state = await startLogin();
    expect(location(await callback({ error: "access_denied", state }))).toBe("/admin/login?error=denied");
  });

  it("fails loudly when Google refuses the code", async () => {
    const state = await startLogin();
    await expect(callback({ code: "made-up", state })).rejects.toThrow("google token exchange failed: 400");
  });

  it("sends the browser back to the login page if Google login is switched off mid-login", async () => {
    const state = await startLogin();
    vi.stubEnv("ADMIN_GOOGLE_DOMAIN", "");
    expect(location(await callback({ code: oauthProviders.signIn("google", ADMIN), state }))).toBe(
      "/admin/login?error=unavailable",
    );
    expect(oauthProviders.exchanges).toEqual([]);
    expect(await liveSessions()).toEqual([]);
  });

  it("fails loudly without the site's address", async () => {
    const state = await startLogin();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    await expect(callback({ code: oauthProviders.signIn("google", ADMIN), state })).rejects.toThrow(
      "Missing required env var: NEXT_PUBLIC_SITE_URL",
    );
  });
});

describe("logging in with LinkedIn, while admins move to Google", () => {
  it("still works for an admin who hasn't switched, and keeps their LinkedIn id for pinning", async () => {
    expect(await linkedinSignIn(SAM_LINKEDIN)).toBe("/admin");
    expect(await getAdminSession()).toEqual({ email: "sam@personal.example", name: "Sam Admin" });
    const [entry] = await db.select().from(adminAuditLog);
    expect(entry).toMatchObject({ action: "login", detail: { provider: "linkedin", linkedinSub: "linkedin-sub-1" } });
  });

  it("doesn't need Google login to be configured", async () => {
    vi.stubEnv("ADMIN_GOOGLE_DOMAIN", "");
    expect(await linkedinSignIn(SAM_LINKEDIN)).toBe("/admin");
  });

  it("refuses a LinkedIn account that isn't pinned, once pinning is on", async () => {
    vi.stubEnv("ADMIN_LINKEDIN_SUBS", "linkedin-sub-2");
    expect(await linkedinSignIn(SAM_LINKEDIN)).toBe("/admin/login?error=forbidden");
    vi.stubEnv("ADMIN_LINKEDIN_SUBS", "linkedin-sub-1");
    expect(await linkedinSignIn(SAM_LINKEDIN)).toBe("/admin");
  });

  it("refuses an address that isn't on ADMIN_EMAILS, or that LinkedIn doesn't vouch for", async () => {
    expect(await linkedinSignIn({ ...SAM_LINKEDIN, email: "kim@personal.example" })).toBe("/admin/login?error=forbidden");
    expect(await linkedinSignIn({ ...SAM_LINKEDIN, emailVerified: false })).toBe("/admin/login?error=forbidden");
    expect(await liveSessions()).toEqual([]);
  });

  it("refuses a state this browser wasn't given, and a cancelled login", async () => {
    cookieJar.reset();
    const state = new URL(location(await linkedinLogin.GET())!).searchParams.get("state")!;
    const request = (query: Record<string, string>) =>
      linkedinCallback.GET(new Request(`${APP_ORIGIN}/api/admin/auth/linkedin/callback?${new URLSearchParams(query)}`));
    expect(location(await request({ error: "user_cancelled_login", state }))).toBe("/admin/login?error=denied");
    expect(location(await request({ code: oauthProviders.signIn("linkedin", SAM_LINKEDIN), state }))).toBe(
      "/admin/login?error=invalid",
    );
  });
});

describe("switching from LinkedIn to Google", () => {
  it("closes LinkedIn for both of the admin's addresses, and ends their LinkedIn sessions", async () => {
    await linkedinSignIn(SAM_LINKEDIN);
    const otherDevice = cookieJar.get("admin_session")!.value;
    await linkedinSignIn(SAM_LINKEDIN);

    expect(await switchToGoogle(ADMIN)).toBe("/admin");
    expect(await getAdminSession()).toEqual({ email: `sam@${DOMAIN}`, name: "Sam Admin" });
    expect(await liveSessions()).toEqual([`sam@${DOMAIN}`]);
    cookieJar.set("admin_session", otherDevice);
    expect(await getAdminSession()).toBeNull();

    expect(await db.select().from(adminLinkedinRetired)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: "sam@personal.example", googleEmail: `sam@${DOMAIN}` }),
        expect.objectContaining({ email: `sam@${DOMAIN}`, googleEmail: `sam@${DOMAIN}` }),
      ]),
    );
    const entries = await db.select().from(adminAuditLog);
    expect(entries.at(-1)).toMatchObject({
      actorEmail: `sam@${DOMAIN}`,
      detail: { provider: "google", linkedinClosedFor: "sam@personal.example" },
    });

    expect(await linkedinSignIn(SAM_LINKEDIN)).toBe("/admin/login?error=moved");
    expect(await linkedinSignIn({ ...SAM_LINKEDIN, email: "SAM@personal.example" })).toBe("/admin/login?error=moved");
    // Google goes on working.
    expect(await signInAs(ADMIN)).toBe("/admin");
  });

  it("refuses a LinkedIn account that reports a Workspace address, once Google login is set up", async () => {
    vi.stubEnv("ADMIN_EMAILS", `sam@${DOMAIN}`);
    const onWorkspace = { ...SAM_LINKEDIN, email: `Sam@${DOMAIN}` };
    expect(await linkedinSignIn(onWorkspace)).toBe("/admin/login?error=use_google");
    expect(await liveSessions()).toEqual([]);
    vi.stubEnv("ADMIN_LINKEDIN_KEEP_EMAILS", `sam@${DOMAIN}`);
    expect(await linkedinSignIn(onWorkspace)).toBe("/admin");
    vi.stubEnv("ADMIN_LINKEDIN_KEEP_EMAILS", "");
    vi.stubEnv("ADMIN_GOOGLE_DOMAIN", "");
    expect(await linkedinSignIn(onWorkspace)).toBe("/admin");
  });

  it("links nothing when Google login is started from the login page, even over a LinkedIn session", async () => {
    vi.stubEnv("ADMIN_EMAILS", `sam@${DOMAIN},kim@personal.example`);
    const kim = { ...SAM_LINKEDIN, sub: "linkedin-sub-2", name: "Kim", email: "kim@personal.example" };
    await linkedinSignIn(kim);
    const kimsLaptop = cookieJar.get("admin_session")!.value;
    await linkedinSignIn(kim);
    // Sam signs in with Google on the browser Kim left signed in.
    const state = new URL(location(await googleLogin())!).searchParams.get("state")!;
    expect(location(await callback({ code: oauthProviders.signIn("google", ADMIN), state }))).toBe("/admin");

    expect((await db.select().from(adminLinkedinRetired)).map((row) => row.email)).toEqual([`sam@${DOMAIN}`]);
    // Kim's session in this browser is replaced and ends; the one on Kim's laptop is untouched.
    expect((await liveSessions()).sort()).toEqual(["kim@personal.example", `sam@${DOMAIN}`]);
    cookieJar.set("admin_session", kimsLaptop);
    expect(await getAdminSession()).toMatchObject({ email: "kim@personal.example" });
    expect(await linkedinSignIn(kim)).toBe("/admin");
  });

  it("links nothing when the session returning isn't the one that asked to switch, even with the same address", async () => {
    await linkedinSignIn(SAM_LINKEDIN);
    const otherSession = cookieJar.get("admin_session")!.value;
    await linkedinSignIn(SAM_LINKEDIN);
    const state = new URL(location(await switchPost())!).searchParams.get("state")!;
    // The browser comes back holding a different session of the same address.
    cookieJar.set("admin_session", otherSession);
    expect(location(await callback({ code: oauthProviders.signIn("google", ADMIN), state }))).toBe("/admin");
    expect(cookieJar.get("admin_switch_from")).toBeUndefined();
    expect((await db.select().from(adminLinkedinRetired)).map((row) => row.email)).toEqual([`sam@${DOMAIN}`]);
    expect(await linkedinSignIn(SAM_LINKEDIN)).toBe("/admin");
  });

  it("asks the admin to pick their Google account when switching", async () => {
    await linkedinSignIn(SAM_LINKEDIN);
    const url = new URL(location(await switchPost())!);
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("hd")).toBe(DOMAIN);
  });

  it.each([
    ["another site's page", { origin: "https://evil.example" }],
    ["a cross-site request without an Origin header", { "sec-fetch-site": "cross-site" }],
    ["a same-site but cross-origin request", { origin: SITE, "sec-fetch-site": "same-site" }],
  ])("refuses a switch started from %s", async (_, headers) => {
    await linkedinSignIn(SAM_LINKEDIN);
    const response = await switchPost(headers);
    expect(response.status).toBe(403);
    expect(cookieJar.get("admin_switch_from")).toBeUndefined();
  });

  it("sends a signed-out switch to the login page", async () => {
    cookieJar.reset();
    expect(location(await switchPost())).toBe("/admin/login");
    expect(cookieJar.get("admin_switch_from")).toBeUndefined();
    expect(cookieJar.get("admin_oauth_state")).toBeUndefined();
  });

  it("forgets a switch request when Google login comes back with a bad state", async () => {
    await linkedinSignIn(SAM_LINKEDIN);
    await switchPost();
    expect(cookieJar.get("admin_switch_from")?.value).toMatch(/^[0-9a-f]{64}$/);
    expect(location(await callback({ code: oauthProviders.signIn("google", ADMIN), state: "forged" }))).toBe(
      "/admin/login?error=invalid",
    );
    expect(cookieJar.get("admin_switch_from")).toBeUndefined();
  });

  it("leaves a personal address open when Google is used without a LinkedIn session to match it to", async () => {
    expect(await signInAs(ADMIN)).toBe("/admin");
    expect(await linkedinSignIn(SAM_LINKEDIN)).toBe("/admin");
  });

  it("doesn't close another admin's Workspace address when that is the browser's session", async () => {
    vi.stubEnv("ADMIN_EMAILS", `sam@${DOMAIN},kim@${DOMAIN}`);
    await signInAs({ ...ADMIN, sub: "google-sub-2", email: `kim@${DOMAIN}` });
    expect(await switchToGoogle(ADMIN)).toBe("/admin");
    const rows = await db.select().from(adminLinkedinRetired);
    expect(rows.map(({ email, googleEmail }) => [email, googleEmail]).sort()).toEqual([
      [`kim@${DOMAIN}`, `kim@${DOMAIN}`],
      [`sam@${DOMAIN}`, `sam@${DOMAIN}`],
    ]);
  });

  it("keeps LinkedIn open for an admin on ADMIN_LINKEDIN_KEEP_EMAILS", async () => {
    vi.stubEnv("ADMIN_LINKEDIN_KEEP_EMAILS", " Sam@Personal.example ");
    await linkedinSignIn(SAM_LINKEDIN);
    const otherDevice = cookieJar.get("admin_session")!.value;
    await linkedinSignIn(SAM_LINKEDIN);
    expect(await switchToGoogle(ADMIN)).toBe("/admin");
    cookieJar.set("admin_session", otherDevice);
    expect(await getAdminSession()).toEqual({ email: "sam@personal.example", name: "Sam Admin" });
    expect(await linkedinSignIn(SAM_LINKEDIN)).toBe("/admin");
  });

  it("keeps the first Workspace address an address moved to", async () => {
    vi.stubEnv("ADMIN_EMAILS", `sam@${DOMAIN},sam2@${DOMAIN},sam@personal.example`);
    await linkedinSignIn(SAM_LINKEDIN);
    await switchToGoogle(ADMIN);
    vi.stubEnv("ADMIN_LINKEDIN_KEEP_EMAILS", "sam@personal.example");
    await linkedinSignIn(SAM_LINKEDIN);
    await switchToGoogle({ ...ADMIN, sub: "google-sub-3", email: `sam2@${DOMAIN}` });
    const [row] = await db.select().from(adminLinkedinRetired).where(eq(adminLinkedinRetired.email, "sam@personal.example"));
    expect(row.googleEmail).toBe(`sam@${DOMAIN}`);
  });
});

describe("what moves to the Workspace address on a switch", () => {
  async function seedWork(email: string) {
    const [project] = await db.insert(taskTrackerProjects).values({ name: "Launch", ownerEmail: email, createdBy: "tech@example.com" }).returning();
    await db.insert(taskTrackerTasks).values([
      { projectId: project.id, name: "Draft", assigneeEmail: email, createdBy: "tech@example.com" },
      { projectId: project.id, name: "Review", assigneeEmail: "kim@personal.example", createdBy: email },
    ]);
  }
  const tasksOf = async () =>
    Object.fromEntries((await db.select().from(taskTrackerTasks)).map((task) => [task.name, task.assigneeEmail]));

  it("moves the admin's CMS role, assigned tasks and owned projects, and audits it", async () => {
    await db.insert(cmsRoles).values({ email: "sam@personal.example", permission: "publish", grantedBy: "tech@example.com" });
    await seedWork("Sam@Personal.example");
    await linkedinSignIn(SAM_LINKEDIN);
    expect(await switchToGoogle(ADMIN)).toBe("/admin");

    expect(await db.select({ email: cmsRoles.email, permission: cmsRoles.permission }).from(cmsRoles)).toEqual([
      { email: `sam@${DOMAIN}`, permission: "publish" },
    ]);
    // Only Sam's assignment moves; who created a task is a record, and stays.
    expect(await tasksOf()).toEqual({ Draft: `sam@${DOMAIN}`, Review: "kim@personal.example" });
    const [project] = await db.select().from(taskTrackerProjects);
    expect(project.ownerEmail).toBe(`sam@${DOMAIN}`);
    const [created] = await db.select().from(taskTrackerTasks).where(eq(taskTrackerTasks.name, "Review"));
    expect(created.createdBy).toBe("Sam@Personal.example");

    const entries = await db.select().from(adminAuditLog).where(eq(adminAuditLog.actorEmail, `sam@${DOMAIN}`));
    expect(entries).toEqual([
      expect.objectContaining({
        action: "login",
        detail: {
          provider: "google",
          linkedinClosedFor: "sam@personal.example",
          moved: { cmsRole: "publish", tasks: 1, projects: 1 },
        },
      }),
    ]);
  });

  it("keeps the stronger role when the Workspace address already has one", async () => {
    await db.insert(cmsRoles).values([
      { email: "sam@personal.example", permission: "draft", grantedBy: "tech@example.com" },
      { email: `sam@${DOMAIN}`, permission: "publish", grantedBy: "tech@example.com" },
    ]);
    await linkedinSignIn(SAM_LINKEDIN);
    await switchToGoogle(ADMIN);
    expect(await db.select({ email: cmsRoles.email, permission: cmsRoles.permission }).from(cmsRoles)).toEqual([
      { email: `sam@${DOMAIN}`, permission: "publish" },
    ]);
  });

  it("copies the role and leaves the work in place for an admin who keeps LinkedIn", async () => {
    vi.stubEnv("ADMIN_LINKEDIN_KEEP_EMAILS", "sam@personal.example");
    await db.insert(cmsRoles).values({ email: "sam@personal.example", permission: "draft", grantedBy: "tech@example.com" });
    await seedWork("sam@personal.example");
    await linkedinSignIn(SAM_LINKEDIN);
    await switchToGoogle(ADMIN);
    expect(
      (await db.select({ email: cmsRoles.email, permission: cmsRoles.permission }).from(cmsRoles)).sort((a, b) =>
        a.email.localeCompare(b.email),
      ),
    ).toEqual([
      { email: `sam@${DOMAIN}`, permission: "draft" },
      { email: "sam@personal.example", permission: "draft" },
    ]);
    expect(await tasksOf()).toEqual({ Draft: "sam@personal.example", Review: "kim@personal.example" });
  });

  it("moves nothing on a Google login that isn't a switch", async () => {
    await db.insert(cmsRoles).values({ email: "sam@personal.example", permission: "publish", grantedBy: "tech@example.com" });
    await seedWork("sam@personal.example");
    await linkedinSignIn(SAM_LINKEDIN);
    const state = new URL(location(await googleLogin())!).searchParams.get("state")!;
    await callback({ code: oauthProviders.signIn("google", ADMIN), state });
    expect((await db.select().from(cmsRoles)).map((role) => role.email)).toEqual(["sam@personal.example"]);
    expect((await tasksOf()).Draft).toBe("sam@personal.example");
  });
});

describe("LinkedIn sessions once LinkedIn is closed for their address", () => {
  it("end when the owner of a Workspace address signs in with Google, leaving their Google sessions", async () => {
    vi.stubEnv("ADMIN_EMAILS", `sam@${DOMAIN}`);
    vi.stubEnv("ADMIN_GOOGLE_DOMAIN", "");
    await linkedinSignIn({ ...SAM_LINKEDIN, email: `sam@${DOMAIN}` });
    const linkedinSession = cookieJar.get("admin_session")!.value;

    vi.stubEnv("ADMIN_GOOGLE_DOMAIN", DOMAIN);
    await signInAs(ADMIN);
    const phone = cookieJar.get("admin_session")!.value;
    await signInAs(ADMIN);

    cookieJar.set("admin_session", linkedinSession);
    expect(await getAdminSession()).toBeNull();
    cookieJar.set("admin_session", phone);
    expect(await getAdminSession()).toEqual({ email: `sam@${DOMAIN}`, name: "Sam Admin" });
    const [ended] = (await db.select().from(adminSessions)).filter((row) => row.provider === "linkedin");
    expect(ended).toMatchObject({ endedBy: `sam@${DOMAIN}` });
  });

  it("stop working on their next request, unless the address keeps LinkedIn", async () => {
    await startAdminSession({ email: "sam@personal.example", name: "Sam", provider: "linkedin" });
    const linkedinSession = cookieJar.get("admin_session")!.value;
    cookieJar.reset();
    // A session from before the provider was recorded counts as LinkedIn.
    await startAdminSession({ email: "sam@personal.example", name: "Sam" });
    const legacySession = cookieJar.get("admin_session")!.value;
    await retireLinkedin(["sam@personal.example"], `sam@${DOMAIN}`);

    for (const token of [linkedinSession, legacySession]) {
      cookieJar.set("admin_session", token);
      expect(await getAdminSession()).toBeNull();
    }
    vi.stubEnv("ADMIN_LINKEDIN_KEEP_EMAILS", "sam@personal.example");
    cookieJar.set("admin_session", linkedinSession);
    expect(await getAdminSession()).toMatchObject({ email: "sam@personal.example" });
  });

  it("leave Google and dev sessions of the same address alone", async () => {
    vi.stubEnv("ADMIN_EMAILS", `sam@${DOMAIN}`);
    await retireLinkedin([`sam@${DOMAIN}`], `sam@${DOMAIN}`);
    for (const provider of ["google", "dev"] as const) {
      cookieJar.reset();
      await startAdminSession({ email: `sam@${DOMAIN}`, name: "Sam", provider });
      expect(await getAdminSession()).toMatchObject({ email: `sam@${DOMAIN}` });
    }
  });
});
