import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar } from "../../../../test/next-headers";
import { github, githubEnv } from "../../../../test/fakes/github";
import { adminAuditLog, adminSessions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { startAdminSession } from "@/lib/session";
import AdminSettingsPage from "./page";
import { checkPublishingConnection } from "./publishing-actions";

vi.mock("next/headers", () => import("../../../../test/next-headers"));

/**
 * The Publishing section of Settings: whether the GitHub App's settings are present and its key
 * can be read, the last publish that failed, and a read-only connection check against the fake
 * GitHub. None of it may show any part of the key.
 */

const TECH = "tech@example.com";
const KIM = "kim@example.com";

async function signIn(email: string) {
  cookieJar.reset();
  await startAdminSession({ email, name: email.split("@")[0] });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  await db.delete(adminSessions);
  await db.delete(adminAuditLog);
  vi.stubEnv("ADMIN_EMAILS", `${TECH},${KIM}`);
  vi.stubEnv("TECH_ADMIN_EMAILS", TECH);
  for (const [name, value] of Object.entries(githubEnv())) vi.stubEnv(name, value);
  github.fileOnMain("content/home.json", "{}");
});

async function publishingSection() {
  await signIn(TECH);
  render(await AdminSettingsPage({ searchParams: Promise.resolve({}) }));
  return screen.getByRole("heading", { name: "Publishing" }).closest("section")!;
}

/** An audit log entry of a publish, at the fake clock's time (the column's default is the database's clock). */
async function logged(detail: Record<string, unknown>) {
  await db.insert(adminAuditLog).values({ actorEmail: KIM, action: "cms_publish", at: new Date(), detail });
}

const keyBody = () => githubEnv().GITHUB_APP_PRIVATE_KEY.split("\n").slice(1, -2).join("");

describe("the Publishing section", () => {
  it("says the settings are present and what the key reads as, with no failures yet", async () => {
    const section = await publishingSection();
    expect(section).toHaveTextContent("Settings: present. Key reads as a PKCS#1 RSA key, 2048 bits; repo Law-for-AI-Safety/lawforaisafety.org.");
    expect(section).toHaveTextContent("No failed publishes recorded.");
  });

  it("names the missing settings", async () => {
    vi.stubEnv("GITHUB_APP_ID", "");
    vi.stubEnv("GITHUB_REPO_NAME", "");
    expect(await publishingSection()).toHaveTextContent("Settings: problem. Missing GITHUB_APP_ID, GITHUB_REPO_NAME");
  });

  it("says what is wrong with the key without showing any of it", async () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", keyBody());
    const section = await publishingSection();
    expect(section).toHaveTextContent("Settings: problem. GITHUB_APP_PRIVATE_KEY has no -----BEGIN line.");
    expect(section.textContent).not.toContain(keyBody().slice(0, 16));
  });

  it("shows the last failure, when, where and why, and whether it was a setup problem", async () => {
    await logged({ page: "about", version: 1, outcome: "failed", step: "commit", error: "GitHub refused POST /git/trees: Server Error" });
    vi.setSystemTime(new Date("2026-10-16T09:30:00Z"));
    await logged({ page: "home", version: 3, outcome: "failed", step: "read_main", setup: true, error: "GITHUB_APP_PRIVATE_KEY has no -----BEGIN line." });
    await logged({ page: "home", version: 3, outcome: "checks_failed" });
    const section = await publishingSection();
    expect(section).toHaveTextContent("Last failure: 16/10/2026, 09:30:00 UTC, page home, at step read_main (setup problem)");
    expect(within(section).getByText("GITHUB_APP_PRIVATE_KEY has no -----BEGIN line.")).toBeInTheDocument();
    expect(section).not.toHaveTextContent("Last sent for publishing");
  });

  it("counts failures logged before setup problems were marked by their key error", async () => {
    await logged({ page: "home", version: 3, outcome: "failed", step: "read_main", error: "GITHUB_APP_PRIVATE_KEY is not a valid PEM private key" });
    expect(await publishingSection()).toHaveTextContent("at step read_main (setup problem)");
  });

  it("shows a passing failure, and says a page was sent since", async () => {
    await logged({ page: "about", version: 1, outcome: "failed", step: "commit", error: "GitHub refused POST /git/trees: Server Error" });
    vi.setSystemTime(new Date("2026-10-15T13:00:00Z"));
    await logged({ page: "about", version: 1, outcome: "sent", number: 4 });
    const section = await publishingSection();
    expect(section).toHaveTextContent("page about, at step commit (may pass on a retry)");
    expect(section).toHaveTextContent("A page has been sent for publishing successfully since then.");
    expect(section).toHaveTextContent("Last sent for publishing 15/10/2026, 13:00:00 UTC.");
  });

  it("shows a publish refused because it was not set up", async () => {
    await logged({ page: "home", version: 1, outcome: "not_set_up" });
    let section = await publishingSection();
    expect(section).toHaveTextContent("page home (setup problem)Publishing is not set up");

    vi.setSystemTime(new Date("2026-10-15T12:01:00Z"));
    await logged({ page: "home", version: 1, outcome: "not_set_up", error: "Missing GITHUB_APP_ID" });
    document.body.innerHTML = "";
    section = await publishingSection();
    expect(section).toHaveTextContent("page home (setup problem)Missing GITHUB_APP_ID");
  });

  it("checks the connection from the button", async () => {
    const section = await publishingSection();
    fireEvent.click(within(section).getByRole("button", { name: "Check connection" }));
    expect(await within(section).findByRole("status")).toHaveTextContent(/^Connected to Law-for-AI-Safety\/lawforaisafety.org: main is at [0-9a-f]{7}\.$/);
  });

  it("shows a failed check as a setup problem from the button", async () => {
    github.failNext("POST /app/installations/777/access_tokens", { status: 404 });
    const section = await publishingSection();
    fireEvent.click(within(section).getByRole("button", { name: "Check connection" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent("Setup problem: GitHub refused POST /app/installations/777/access_tokens: Server Error");
  });
});

describe("checking the connection", () => {
  it("reads only the head of main, signing in afresh each time", async () => {
    await signIn(TECH);
    expect(await checkPublishingConnection()).toMatchObject({ ok: true });
    expect(await checkPublishingConnection()).toMatchObject({ ok: true });
    expect(github.tokensIssued).toBe(2);
    expect(github.requests.every((r) => r.method === "GET" || r.path.endsWith("/access_tokens"))).toBe(true);
  });

  it("says when a key cannot be read, without calling GitHub", async () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "0123456789abcdef0123456789abcdef01234567");
    await signIn(TECH);
    expect(await checkPublishingConnection()).toEqual({
      ok: false,
      setup: true,
      message: expect.stringMatching(/^GITHUB_APP_PRIVATE_KEY is too short to be a private key.*client secret/),
    });
    expect(github.requests).toEqual([]);
  });

  it("says when the settings are missing", async () => {
    vi.stubEnv("GITHUB_REPO_OWNER", "");
    await signIn(TECH);
    expect(await checkPublishingConnection()).toEqual({ ok: false, setup: true, message: "Missing GITHUB_REPO_OWNER" });
  });

  it("says when the App cannot see main", async () => {
    github.failNext("GET /git/ref/heads/main", { status: 404 });
    await signIn(TECH);
    expect(await checkPublishingConnection()).toEqual({
      ok: false,
      setup: true,
      message: "The App can't see the main branch of Law-for-AI-Safety/lawforaisafety.org. Check that it is installed on that repo.",
    });
  });

  it("says when GitHub cannot be reached, as a passing problem", async () => {
    github.failNext(null, { kind: "network" });
    await signIn(TECH);
    expect(await checkPublishingConnection()).toMatchObject({ ok: false, setup: false, message: expect.stringMatching(/^Could not reach GitHub/) });
  });

  it("is for technical admins only", async () => {
    cookieJar.reset();
    expect(await checkPublishingConnection()).toMatchObject({ ok: false, message: expect.stringMatching(/signed out/) });
    await signIn(KIM);
    expect(await checkPublishingConnection()).toEqual({ ok: false, message: "Only technical admins can check the publishing connection." });
    expect(github.requests).toEqual([]);
  });
});
