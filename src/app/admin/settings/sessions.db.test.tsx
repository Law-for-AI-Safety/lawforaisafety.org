import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar } from "../../../../test/next-headers";
import { navigation } from "../../../../test/next-navigation";
import { adminAuditLog, adminSessions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { getAdminSession, startAdminSession } from "@/lib/session";
import AdminSettingsPage from "./page";
import { endSessions } from "./session-actions";

vi.mock("next/headers", () => import("../../../../test/next-headers"));

const TECH = "tech@example.com";
const KIM = "kim@example.com";

/** Signs in as `email` in a fresh browser, and returns that browser's cookie. */
async function signIn(email: string, name: string) {
  cookieJar.reset();
  await startAdminSession({ email, name });
  return cookieJar.get("admin_session")!.value;
}

beforeEach(async () => {
  await db.delete(adminSessions);
  await db.delete(adminAuditLog);
  vi.stubEnv("ADMIN_EMAILS", `${TECH},${KIM}`);
  vi.stubEnv("TECH_ADMIN_EMAILS", TECH);
});

describe("ending someone's sessions", () => {
  it("logs them out on every device, and is in the audit log", async () => {
    const kimsLaptop = await signIn(KIM, "Kim");
    await signIn(KIM, "Kim");
    await signIn(TECH, "Tess");

    expect(await endSessions("Kim@example.com")).toEqual({ ok: true, ended: 2 });
    expect(await db.select().from(adminAuditLog)).toEqual([
      expect.objectContaining({ actorEmail: TECH, action: "sessions_end", detail: { email: KIM, ended: 2 } }),
    ]);
    cookieJar.set("admin_session", kimsLaptop);
    expect(await getAdminSession()).toBeNull();
  });

  it("is only for technical admins", async () => {
    const kim = await signIn(KIM, "Kim");
    await signIn(TECH, "Tess");
    cookieJar.set("admin_session", kim);
    expect(await endSessions(TECH)).toEqual({ ok: false, message: "Only technical admins can end sessions." });
    cookieJar.reset();
    expect(await endSessions(TECH)).toEqual({ ok: false, message: "You are signed out. Sign in again in a new tab, then retry." });
    expect(await db.select().from(adminAuditLog)).toEqual([]);
  });

  it("refuses a request it does not understand", async () => {
    await signIn(TECH, "Tess");
    expect(await endSessions({ email: KIM })).toEqual({ ok: false, message: "The request was not understood." });
    expect(await endSessions("")).toEqual({ ok: false, message: "The request was not understood." });
  });
});

describe("the settings page", () => {
  it("lists who is signed in, and ends their sessions from there", async () => {
    await signIn(KIM, "Kim");
    await signIn(TECH, "Tess");
    render(await AdminSettingsPage({ searchParams: Promise.resolve({}) }));
    const section = screen.getByRole("heading", { name: "Signed in now" }).closest("section")!;
    const [first, second] = within(section).getAllByRole("listitem");
    expect(first).toHaveTextContent(/Tess.*tech@example\.com.*1 session · last active/);
    expect(within(first).getByRole("button", { name: "End my sessions" })).toBeInTheDocument();
    expect(second).toHaveTextContent("Kim");

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(within(second).getByRole("button", { name: "End sessions" }));
    expect(window.confirm).toHaveBeenCalledWith("Log Kim out on every device? They can sign in again unless they are also removed from ADMIN_EMAILS.");
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalled());
    expect((await db.select().from(adminSessions)).filter((s) => s.endedAt !== null).map((s) => s.email)).toEqual([KIM]);
  });
});
