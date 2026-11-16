import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { adminAuditLog, adminPeople, adminSessions } from "@/drizzle/schema";
import { getAdminSession } from "@/lib/session";
import { APP_ORIGIN } from "../../../../../../test/app-fetch";
import { cookieJar } from "../../../../../../test/next-headers";
import { oauthProviders, type ProviderUser } from "../../../../../../test/fakes/oauth";
import * as login from "./route";
import * as loginCallback from "./callback/route";

// `cookies()` needs Next's request context; the browser's cookies are `cookieJar`.
vi.mock("next/headers", () => import("../../../../../../test/next-headers"));

// A made-up Workspace domain: the real one lives only in ADMIN_GOOGLE_DOMAIN.
const DOMAIN = "lais.example";
const ADMIN: ProviderUser = { sub: "google-sub-1", name: "Sam Admin", email: `sam@${DOMAIN}`, hostedDomain: DOMAIN };
const CALLBACK = "https://lawforaisafety.test/api/admin/auth/google/callback";

function location(response: Response) {
  expect(response.status).toBe(303);
  return response.headers.get("Location");
}

/** Opens the login route in a fresh browser, and returns the state Google would hand back. */
async function startLogin(): Promise<string> {
  cookieJar.reset();
  const response = await login.GET();
  return new URL(location(response)!).searchParams.get("state")!;
}

function callback(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return loginCallback.GET(new Request(`${APP_ORIGIN}/api/admin/auth/google/callback?${query}`));
}

/** Goes through the whole login as `user`, and returns where the browser lands. */
async function signInAs(user: ProviderUser) {
  const state = await startLogin();
  return location(await callback({ code: oauthProviders.signIn("google", user), state }));
}

beforeEach(async () => {
  cookieJar.reset();
  await db.delete(adminSessions);
  await db.delete(adminAuditLog);
  await db.delete(adminPeople);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-secret");
  vi.stubEnv("ADMIN_GOOGLE_DOMAIN", DOMAIN);
  vi.stubEnv("ADMIN_EMAILS", `sam@${DOMAIN},sam@personal.example`);
});

describe("starting an admin login", () => {
  it("sends the browser to Google, offering only the Workspace's accounts", async () => {
    const response = await login.GET();
    const url = new URL(location(response)!);
    expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-google-client");
    expect(url.searchParams.get("redirect_uri")).toBe(CALLBACK);
    expect(url.searchParams.get("hd")).toBe(DOMAIN);
    expect(cookieJar.get("admin_oauth_state")?.value).toBe(url.searchParams.get("state"));
  });

  it("refuses to start without a Workspace domain configured", async () => {
    vi.stubEnv("ADMIN_GOOGLE_DOMAIN", " ");
    await expect(login.GET()).rejects.toThrow("Missing required env var: ADMIN_GOOGLE_DOMAIN");
    expect(cookieJar.get("admin_oauth_state")).toBeUndefined();
  });

  it("refuses to start without the site's address", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    await expect(login.GET()).rejects.toThrow("Missing required env var: NEXT_PUBLIC_SITE_URL");
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

  it("fails loudly without a Workspace domain configured", async () => {
    const state = await startLogin();
    vi.stubEnv("ADMIN_GOOGLE_DOMAIN", "");
    await expect(callback({ code: oauthProviders.signIn("google", ADMIN), state })).rejects.toThrow(
      "Missing required env var: ADMIN_GOOGLE_DOMAIN",
    );
    expect(oauthProviders.exchanges).toEqual([]);
  });

  it("fails loudly without the site's address", async () => {
    const state = await startLogin();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    await expect(callback({ code: oauthProviders.signIn("google", ADMIN), state })).rejects.toThrow(
      "Missing required env var: NEXT_PUBLIC_SITE_URL",
    );
  });
});
