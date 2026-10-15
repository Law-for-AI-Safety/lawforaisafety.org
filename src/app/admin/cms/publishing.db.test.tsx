import fs from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { adminAuditLog, cmsDrafts, cmsRoles, cmsSubmissions } from "@/drizzle/schema";
import { contentHash, printContent } from "@/cms/content-files";
import { STALE_LOCK_MS } from "@/cms/publish-status";
import { rememberPerson } from "@/lib/admin-people";
import { setStoredCmsPermission } from "@/lib/cms-store";
import { createAdminSessionCookie } from "@/lib/session";
import { BOT_LOGIN, github, githubEnv } from "../../../../test/fakes/github";
import { cookieJar } from "../../../../test/next-headers";
import { discardDraft, publishDraft, saveDraft, withdrawPublish } from "./actions";
import CmsPagesPage from "./page";
import CmsEditPage from "./[slug]/page";
import { setCmsRole } from "../settings/cms-actions";

vi.mock("next/headers", () => import("../../../../test/next-headers"));

/**
 * Publishing end to end on the server: the actions and the editor page against a real
 * database and the fake GitHub. Covers the lock, withdrawing, what the page shows for each
 * outcome, and that a failure leaves the draft unlocked and no branch behind.
 */

const SLUG = "field-building";
const PATH = "content/field-building.json";
const FILE = fs.readFileSync(PATH, "utf8");
const file = JSON.parse(FILE);
const NOW = new Date("2026-10-15T12:00:00Z");

type Who = "draft" | "publish" | "superadmin";
const EMAIL: Record<Who, string> = { draft: "draft@example.com", publish: "publish@example.com", superadmin: "tech@example.com" };

async function signInAs(who: Who) {
  cookieJar.reset();
  await createAdminSessionCookie({ email: EMAIL[who], name: `${who} person` });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("ADMIN_EMAILS", Object.values(EMAIL).join(","));
  vi.stubEnv("TECH_ADMIN_EMAILS", EMAIL.superadmin);
  for (const [name, value] of Object.entries(githubEnv())) vi.stubEnv(name, value);
  await db.delete(cmsDrafts);
  await db.delete(cmsSubmissions);
  await db.delete(cmsRoles);
  await db.delete(adminAuditLog);
  await setStoredCmsPermission(EMAIL.draft, "draft", "seed");
  await setStoredCmsPermission(EMAIL.publish, "publish", "seed");
  for (const email of Object.values(EMAIL)) await rememberPerson(email, email.split("@")[0]);
  // main holds the same file this deployment serves.
  github.fileOnMain(PATH, FILE);
});

const edited = (title = "Field-building") => ({ ...structuredClone(file), title });
const draftRow = async () => (await db.select().from(cmsDrafts).where(eq(cmsDrafts.page, SLUG)))[0];
const submissions = () => db.select().from(cmsSubmissions);
const audit = async () =>
  (await db.select().from(adminAuditLog)).filter((r) => r.action !== "cms_draft_save").map((r) => ({ action: r.action, actor: r.actorEmail, detail: r.detail }));

async function seedDraft(content: unknown = edited()): Promise<number> {
  await signInAs("draft");
  const result = await saveDraft(SLUG, content, (await draftRow())?.version ?? 0);
  if (!result.ok) throw new Error(result.message);
  return result.version;
}

/** Sends the page for publishing as a publisher. */
async function sent() {
  const version = await seedDraft();
  await signInAs("publish");
  const result = await publishDraft(SLUG, version);
  if (!result.ok) throw new Error(result.message);
  await db.delete(adminAuditLog);
  return version;
}

async function openEditor(who: Who = "publish") {
  await signInAs(who);
  return render(await CmsEditPage({ params: Promise.resolve({ slug: SLUG }) }));
}

describe("publishing", () => {
  it("opens the pull request, records it, locks the page and logs it", async () => {
    const version = await seedDraft();
    await signInAs("publish");
    expect(await publishDraft(SLUG, version)).toEqual({ ok: true, message: "Sent for publishing. The page goes live once it is approved." });

    const [pr] = github.openedPRs;
    expect(github.openedPRs).toHaveLength(1);
    expect(pr.head).toBe("cms/field-building-2026-10-15");
    expect(pr.files).toEqual({ [PATH]: printContent({ ...edited(), updatedAt: "2026-10-15" }) });
    expect(pr.commits).toEqual([{ message: "Website edit: update the Field-building page\n\nSent from the website editor by publish person.", author: BOT_LOGIN }]);
    expect(pr.body).toContain("- **Sent by:** `publish person`");
    expect(pr.body).toContain("- **Deploy preview:** https://deploy-preview-1--law-for-ai-safety-org.netlify.app/field-building");

    expect(await submissions()).toMatchObject([
      { page: SLUG, prNumber: 1, branch: "cms/field-building-2026-10-15", submittedBy: EMAIL.publish, state: "open", baseHash: contentHash(FILE), draftVersion: version },
    ]);
    expect((await draftRow()).lockedAt).toEqual(NOW);
    expect(await audit()).toEqual([
      { action: "cms_publish", actor: EMAIL.publish, detail: { page: SLUG, version, outcome: "sent", number: 1, branch: "cms/field-building-2026-10-15" } },
    ]);
  });

  it("shows the page as Publishing, locked, with Withdraw, and never says how", async () => {
    await sent();
    await openEditor();
    expect(screen.getByText("Publishing")).toBeInTheDocument();
    expect(screen.getByText(/^Sent for publishing on 15 Oct 2026, 12:00 UTC by publish@example\.com\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw from publishing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard draft" })).toBeNull();
    expect(screen.queryByLabelText("Page title")).toBeNull();
    expect(document.body.textContent).not.toMatch(/github|pull request/i);
  });

  it("does not offer Withdraw to someone who may only edit", async () => {
    await sent();
    await openEditor("draft");
    expect(screen.getByText("Publishing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw from publishing" })).toBeNull();
  });

  it("lists the page as Publishing", async () => {
    await sent();
    await signInAs("draft");
    render(await CmsPagesPage());
    const item = screen.getByRole("link", { name: file.title }).closest("li") as HTMLElement;
    expect(within(item).getByText("Publishing")).toBeInTheDocument();
  });
});

describe("while a page is Publishing, the server refuses", () => {
  it("saves, discards and another publish", async () => {
    const version = await sent();
    for (const who of ["draft", "publish", "superadmin"] as const) {
      await signInAs(who);
      expect(await saveDraft(SLUG, edited("Sneaky"), version)).toMatchObject({ ok: false, reason: "locked" });
      expect(await discardDraft(SLUG, version)).toMatchObject({ ok: false, reason: "locked" });
    }
    await signInAs("publish");
    expect(await publishDraft(SLUG, version)).toMatchObject({ ok: false, reason: "locked" });
    expect((await draftRow()).content).toMatchObject({ title: "Field-building" });
    expect(github.openedPRs).toHaveLength(1);
  });
});

describe("permission", () => {
  it("is checked again on the server for publishing and withdrawing", async () => {
    const version = await seedDraft();
    await signInAs("draft");
    expect(await publishDraft(SLUG, version)).toMatchObject({ ok: false, reason: "forbidden" });
    expect(github.openedPRs).toEqual([]);

    await sent();
    await signInAs("draft");
    expect(await withdrawPublish(SLUG)).toMatchObject({ ok: false, reason: "forbidden" });
    expect(github.openedPRs[0].state).toBe("open");
  });

  it("stops a publisher whose permission was just lowered", async () => {
    const version = await seedDraft();
    await signInAs("superadmin");
    await setCmsRole(EMAIL.publish, "draft");
    await signInAs("publish");
    expect(await publishDraft(SLUG, version)).toMatchObject({ ok: false, reason: "forbidden" });
    expect(github.openedPRs).toEqual([]);
  });
});

describe("withdrawing", () => {
  it("closes the pull request, deletes its branch, unlocks the draft and logs it", async () => {
    const version = await sent();
    await signInAs("publish");
    expect(await withdrawPublish(SLUG)).toEqual({ ok: true });
    expect(github.openedPRs[0].state).toBe("closed");
    expect(github.branches).toEqual(["main"]);
    expect(await draftRow()).toMatchObject({ lockedAt: null, version });
    expect(await submissions()).toMatchObject([{ state: "withdrawn", resolvedAt: NOW }]);
    expect(await audit()).toEqual([{ action: "cms_withdraw", actor: EMAIL.publish, detail: { page: SLUG, number: 1, outcome: "withdrawn" } }]);

    expect(await saveDraft(SLUG, edited("Again"), version)).toMatchObject({ ok: true });
    await openEditor();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("records a branch that could not be deleted", async () => {
    await sent();
    github.failNext("DELETE /git/refs/heads/cms/field-building-2026-10-15");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await signInAs("publish");
    expect(await withdrawPublish(SLUG)).toEqual({ ok: true });
    expect(await audit()).toEqual([
      { action: "cms_withdraw", actor: EMAIL.publish, detail: { page: SLUG, number: 1, outcome: "withdrawn", cleanup: "failed", leftBranch: "cms/field-building-2026-10-15" } },
    ]);
  });

  it("keeps the page locked when closing fails", async () => {
    await sent();
    github.failNext("PATCH /pulls/1");
    await signInAs("publish");
    expect(await withdrawPublish(SLUG)).toMatchObject({ ok: false, reason: "failed" });
    expect((await draftRow()).lockedAt).not.toBeNull();
    expect(await submissions()).toMatchObject([{ state: "open" }]);
  });

  it("cannot withdraw what was just merged", async () => {
    await sent();
    github.merge(1);
    await signInAs("publish");
    expect(await withdrawPublish(SLUG)).toMatchObject({ ok: false, reason: "not_publishing" });
    expect((await draftRow()).lockedAt).not.toBeNull();
  });

  it("has nothing to withdraw on a page that was not sent", async () => {
    await signInAs("publish");
    expect(await withdrawPublish(SLUG)).toMatchObject({ ok: false, reason: "not_publishing" });
    expect(await withdrawPublish(42)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("says when publishing is not set up", async () => {
    await sent();
    vi.stubEnv("GITHUB_APP_ID", "");
    await signInAs("publish");
    expect(await withdrawPublish(SLUG)).toMatchObject({ ok: false, reason: "unavailable" });
  });
});

describe("what the editor page shows after review", () => {
  it("Publishing, approved, until this deployment serves the merged file; then Live, with the draft gone", async () => {
    await sent();
    github.merge(1, new Date("2026-10-16T09:00:00Z"));
    const first = await openEditor();
    expect(screen.getByText("Publishing")).toBeInTheDocument();
    expect(screen.getByText(/^Approved\. The website is being updated/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw from publishing" })).toBeNull();
    first.unmount();
    expect(await submissions()).toMatchObject([{ state: "merged", resolvedAt: new Date("2026-10-16T09:00:00Z"), mergedHash: contentHash(printContent({ ...edited(), updatedAt: "2026-10-15" })) }]);
    expect((await draftRow()).lockedAt).not.toBeNull();
    expect(await audit()).toEqual([{ action: "cms_publish_outcome", actor: EMAIL.publish, detail: { page: SLUG, number: 1, outcome: "merged" } }]);

    // A deployment whose file is no longer the one the draft started from has the merge.
    await db.update(cmsSubmissions).set({ baseHash: "an-older-file" });
    await openEditor();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(await draftRow()).toBeUndefined();
    expect(github.requests.filter((r) => r.path.endsWith("/pulls/1") && r.method === "GET")).toHaveLength(1);
  });

  it("Not published, with the reviewer's last comment, and the draft open again", async () => {
    const version = await sent();
    github.comment(1, "Earlier note", { at: new Date("2026-10-15T13:00:00Z") });
    github.close(1, { comment: "Please shorten the title.\nThanks!", by: "owner", at: new Date("2026-10-15T14:00:00Z") });
    await openEditor();
    expect(screen.getByText("Not published")).toBeInTheDocument();
    expect(screen.getByText("The last changes sent were not published. The draft is open for editing again.")).toBeInTheDocument();
    expect(screen.getByText(/Please shorten the title\./).textContent).toBe("owner: Please shorten the title.\nThanks!");
    expect(screen.getByLabelText("Page title")).toHaveValue("Field-building");
    expect(document.body.textContent).not.toMatch(/github|pull request/i);
    expect(await draftRow()).toMatchObject({ lockedAt: null, version });
    expect(await submissions()).toMatchObject([{ state: "closed", closingNote: "Please shorten the title.\nThanks!", closingNoteBy: "owner" }]);

    // Saving again makes it a Draft.
    await signInAs("publish");
    const saved = await saveDraft(SLUG, edited("Shorter"), version);
    expect(saved).toMatchObject({ ok: true });
    await openEditor();
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
  });

  it("Not published without a comment when the reviewer left none", async () => {
    await sent();
    github.close(1);
    await openEditor();
    expect(screen.getByText("Not published")).toBeInTheDocument();
    expect(document.querySelector("blockquote")).toBeNull();
  });

  it("Publishing, with a note, when the status cannot be read", async () => {
    await sent();
    github.failNext("GET /pulls/1");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await openEditor();
    expect(screen.getByText("Publishing")).toBeInTheDocument();
    expect(screen.getByText("Could not check whether this page has been approved yet. Reload the page to try again.")).toBeInTheDocument();
  });

  it("releases a lock a stopped publish left behind, once it is old", async () => {
    const version = await seedDraft();
    await db.update(cmsDrafts).set({ lockedAt: new Date(NOW.getTime() - STALE_LOCK_MS - 1000) });
    await openEditor();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(await draftRow()).toMatchObject({ lockedAt: null, version });
    expect(await audit()).toEqual([{ action: "cms_publish_outcome", actor: EMAIL.publish, detail: { page: SLUG, outcome: "stale_lock_released" } }]);
  });

  it("keeps a recent lock with no submission yet: a publish may be under way", async () => {
    await seedDraft();
    await db.update(cmsDrafts).set({ lockedAt: new Date(NOW.getTime() - 1000) });
    await openEditor();
    expect(screen.getByText("Publishing")).toBeInTheDocument();
    expect((await draftRow()).lockedAt).not.toBeNull();
  });
});

describe("a publish that cannot go ahead", () => {
  it("is refused when the live page changed, listing the fields, with the draft unlocked", async () => {
    const version = await seedDraft();
    github.fileOnMain(PATH, printContent({ ...file, description: "Changed by a developer." }));
    await signInAs("publish");
    const result = await publishDraft(SLUG, version);
    expect(result).toMatchObject({
      ok: false,
      reason: "stale",
      changes: [{ label: "Description", before: file.description, after: "Changed by a developer." }],
    });
    expect((await draftRow()).lockedAt).toBeNull();
    expect(github.branches).toEqual(["main"]);
    expect(await submissions()).toEqual([]);
    expect(await audit()).toEqual([{ action: "cms_publish", actor: EMAIL.publish, detail: { page: SLUG, version, outcome: "stale", fields: ["Description"] } }]);
  });

  it.each([
    ["POST /git/trees", "commit"],
    ["POST /git/refs", "branch"],
    ["POST /pulls", "open"],
  ])("leaves no branch and the draft unlocked when %s fails", async (call, step) => {
    const version = await seedDraft();
    github.failNext(call);
    await signInAs("publish");
    expect(await publishDraft(SLUG, version)).toEqual({
      ok: false,
      reason: "failed",
      message: "Publishing did not work this time, and nothing was sent. Your draft is saved; try again in a few minutes.",
    });
    expect(github.branches).toEqual(["main"]);
    expect(github.openedPRs).toEqual([]);
    expect((await draftRow()).lockedAt).toBeNull();
    expect(await submissions()).toEqual([]);
    expect(await audit()).toEqual([
      { action: "cms_publish", actor: EMAIL.publish, detail: expect.objectContaining({ page: SLUG, version, outcome: "failed", step }) },
    ]);
  });

  it("records a branch it could not clean up", async () => {
    const version = await seedDraft();
    github.failNext("POST /pulls");
    github.failNext("DELETE /git/refs/heads/cms/field-building-2026-10-15");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await signInAs("publish");
    expect(await publishDraft(SLUG, version)).toMatchObject({ ok: false, reason: "failed" });
    expect((await draftRow()).lockedAt).toBeNull();
    expect(await audit()).toEqual([
      {
        action: "cms_publish",
        actor: EMAIL.publish,
        detail: expect.objectContaining({ outcome: "failed", step: "open", cleanup: "failed", leftBranch: "cms/field-building-2026-10-15" }),
      },
    ]);
  });

  it("withdraws the pull request again when it cannot be recorded", async () => {
    const version = await seedDraft();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await db.execute(sql`ALTER TABLE cms_submissions RENAME TO cms_submissions_unavailable`);
    try {
      await signInAs("publish");
      expect(await publishDraft(SLUG, version)).toMatchObject({ ok: false, reason: "failed" });
    } finally {
      await db.execute(sql`ALTER TABLE cms_submissions_unavailable RENAME TO cms_submissions`);
    }
    expect(github.openedPRs[0].state).toBe("closed");
    expect(github.branches).toEqual(["main"]);
    expect((await draftRow()).lockedAt).toBeNull();
    expect(await audit()).toEqual([
      { action: "cms_publish", actor: EMAIL.publish, detail: { page: SLUG, version, outcome: "failed", step: "record", number: 1, cleanup: "done" } },
    ]);
  });

  it("unlocks the draft when GitHub cannot be reached", async () => {
    const version = await seedDraft();
    github.failNext(null, { kind: "network" });
    await signInAs("publish");
    expect(await publishDraft(SLUG, version)).toMatchObject({ ok: false, reason: "failed" });
    expect((await draftRow()).lockedAt).toBeNull();
  });

  it("says when the page is no longer on main", async () => {
    const version = await seedDraft();
    github.reset();
    await signInAs("publish");
    expect(await publishDraft(SLUG, version)).toMatchObject({ ok: false, reason: "failed", message: expect.stringMatching(/not on the live site/) });
    expect((await draftRow()).lockedAt).toBeNull();
  });

  it("reports the checks run on the committed text", async () => {
    const version = await seedDraft({ ...edited(), blocks: [{ ...file.blocks[0], lede: "A [link](/admin)" }, ...file.blocks.slice(1)] });
    await signInAs("publish");
    const result = await publishDraft(SLUG, version);
    expect(result).toMatchObject({ ok: false, reason: "checks" });
    expect((await draftRow()).lockedAt).toBeNull();
  });

  it("has nothing to send when main already has the draft", async () => {
    const version = await seedDraft();
    github.fileOnMain(PATH, printContent({ ...edited(), updatedAt: file.updatedAt }));
    // The draft started from the file main had before; refresh its base so only the content matters.
    await db.update(cmsDrafts).set({ baseHash: contentHash(printContent({ ...edited(), updatedAt: file.updatedAt })) });
    await signInAs("publish");
    expect(await publishDraft(SLUG, version)).toMatchObject({ ok: false, reason: "nothing" });
    expect((await draftRow()).lockedAt).toBeNull();
  });

  it("is refused when another publish holds the lock", async () => {
    const version = await seedDraft();
    await signInAs("publish");
    const [a, b] = await Promise.all([publishDraft(SLUG, version), publishDraft(SLUG, version)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(github.openedPRs).toHaveLength(1);
  });

  it("says publishing is not set up, and the editor shows it", async () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "");
    const version = await seedDraft();
    await signInAs("publish");
    expect(await publishDraft(SLUG, version)).toEqual({ ok: false, reason: "unavailable", message: "Publishing is not set up on this site yet. Your draft is saved." });
    expect((await draftRow()).lockedAt).toBeNull();
    await openEditor();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText("Publishing is not set up on this site yet. Drafts are saved as usual.")).toBeInTheDocument();
  });
});
