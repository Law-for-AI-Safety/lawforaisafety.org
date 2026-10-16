import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar } from "../../test/next-headers";
import { POST as logout } from "@/app/api/admin/logout/route";
import { adminSessions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { endAdminSession, endSessionsOf, getAdminSession, listSignedInAdmins, startAdminSession } from "./session";
import { hashSessionToken } from "./session-token";

vi.mock("next/headers", () => import("../../test/next-headers"));

const HOUR = 60 * 60 * 1000;
const token = () => cookieJar.get("admin_session")?.value;
const rows = () => db.select().from(adminSessions);

/** Signs in as `email` in a fresh browser, and returns that browser's cookie. */
async function signIn(email: string, name = "Sam") {
  cookieJar.reset();
  await startAdminSession({ email, name });
  return token()!;
}

beforeEach(async () => {
  await db.delete(adminSessions);
  cookieJar.reset();
  vi.stubEnv("ADMIN_EMAILS", "sam@example.com,kim@example.com");
});

describe("signing in", () => {
  it("gives the browser a random token, and stores only its hash", async () => {
    await startAdminSession({ email: "Sam@Example.com", name: "Sam" });
    const cookie = cookieJar.get("admin_session")!;
    expect(cookie.options).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 });
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const [row] = await rows();
    expect(row).toMatchObject({ tokenHash: hashSessionToken(cookie.value), email: "sam@example.com", name: "Sam", endedAt: null });
    expect(JSON.stringify(row)).not.toContain(cookie.value);
    expect(await getAdminSession()).toEqual({ email: "sam@example.com", name: "Sam" });
  });

  it("clears out sessions that ended more than 30 days ago", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T09:00:00Z"));
    await signIn("sam@example.com");
    vi.setSystemTime(new Date("2026-01-20T09:00:00Z"));
    await signIn("kim@example.com");
    vi.setSystemTime(new Date("2026-02-01T09:00:00Z"));
    await signIn("kim@example.com");
    expect((await rows()).map((r) => r.email).sort()).toEqual(["kim@example.com", "kim@example.com"]);
  });
});

describe("a session", () => {
  it("is nobody without a cookie, or with a token that was never issued", async () => {
    expect(await getAdminSession()).toBeNull();
    cookieJar.set("admin_session", "made-up");
    expect(await getAdminSession()).toBeNull();
  });

  it("lasts 12 hours", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await signIn("sam@example.com");
    vi.setSystemTime(Date.now() + 11 * HOUR);
    expect(await getAdminSession()).not.toBeNull();
    vi.setSystemTime(Date.now() + 2 * HOUR);
    expect(await getAdminSession()).toBeNull();
  });

  it("stops working once its email leaves ADMIN_EMAILS", async () => {
    await signIn("sam@example.com");
    vi.stubEnv("ADMIN_EMAILS", "kim@example.com");
    expect(await getAdminSession()).toBeNull();
  });

  it("notes when it was last used, at most every five minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T09:00:00Z"));
    await signIn("sam@example.com");
    vi.setSystemTime(new Date("2026-03-01T09:04:00Z"));
    await getAdminSession();
    expect((await rows())[0].lastSeenAt).toEqual(new Date("2026-03-01T09:00:00Z"));
    vi.setSystemTime(new Date("2026-03-01T09:06:00Z"));
    await getAdminSession();
    expect((await rows())[0].lastSeenAt).toEqual(new Date("2026-03-01T09:06:00Z"));
  });
});

describe("logging out", () => {
  it("ends the session, so a copy of the cookie stops working too", async () => {
    const stolen = await signIn("sam@example.com");
    await endAdminSession();
    expect(token()).toBeUndefined();
    expect((await rows())[0]).toMatchObject({ endedBy: "sam@example.com", endedAt: expect.any(Date) });

    cookieJar.set("admin_session", stolen);
    expect(await getAdminSession()).toBeNull();
  });

  it("only clears the cookie when there is no session", async () => {
    await endAdminSession();
    expect(await rows()).toEqual([]);
  });

  it("is a same-origin POST to /api/admin/logout", async () => {
    await signIn("sam@example.com");
    const elsewhere = await logout(new Request("https://lawforaisafety.test/api/admin/logout", { method: "POST", headers: { origin: "https://evil.example", host: "lawforaisafety.test" } }));
    expect(elsewhere.status).toBe(403);
    expect(await getAdminSession()).not.toBeNull();

    const response = await logout(new Request("https://lawforaisafety.test/api/admin/logout", { method: "POST", headers: { origin: "https://lawforaisafety.test", host: "lawforaisafety.test" } }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/login");
    expect((await rows())[0].endedAt).not.toBeNull();
  });
});

describe("ending someone's sessions", () => {
  it("ends every live session of theirs, on every device, and no one else's", async () => {
    const laptop = await signIn("sam@example.com");
    const phone = await signIn("SAM@example.com");
    const kim = await signIn("kim@example.com");
    expect(await endSessionsOf("Sam@example.com", "tech@example.com")).toBe(2);

    for (const sams of [laptop, phone]) {
      cookieJar.set("admin_session", sams);
      expect(await getAdminSession()).toBeNull();
    }
    cookieJar.set("admin_session", kim);
    expect(await getAdminSession()).toEqual({ email: "kim@example.com", name: "Sam" });
    const ended = await db.select().from(adminSessions).where(eq(adminSessions.email, "sam@example.com"));
    expect(ended.map((r) => r.endedBy)).toEqual(["tech@example.com", "tech@example.com"]);
    expect(await endSessionsOf("sam@example.com", "tech@example.com")).toBe(0);
  });
});

describe("the list of who is signed in", () => {
  it("counts each person's live sessions, most recently active first", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T09:00:00Z"));
    await signIn("sam@example.com", "Sam");
    await signIn("sam@example.com", "Sam");
    vi.setSystemTime(new Date("2026-03-01T10:00:00Z"));
    await signIn("kim@example.com", "Kim");
    await endAdminSession();
    await signIn("kim@example.com", "Kim");

    expect(await listSignedInAdmins()).toEqual([
      { email: "kim@example.com", name: "Kim", sessions: 1, lastSeenAt: new Date("2026-03-01T10:00:00Z") },
      { email: "sam@example.com", name: "Sam", sessions: 2, lastSeenAt: new Date("2026-03-01T09:00:00Z") },
    ]);
    vi.setSystemTime(new Date("2026-03-01T21:30:00Z"));
    expect(await listSignedInAdmins()).toEqual([{ email: "kim@example.com", name: "Kim", sessions: 1, lastSeenAt: new Date("2026-03-01T10:00:00Z") }]);
  });
});
