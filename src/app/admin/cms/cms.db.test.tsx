import fs from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { adminAuditLog, cmsDrafts, cmsRoles } from "@/drizzle/schema";
import { rememberPerson } from "@/lib/admin-people";
import { setStoredCmsPermission } from "@/lib/cms-store";
import { startAdminSession } from "@/lib/session";
import { cookieJar } from "../../../../test/next-headers";
import { discardDraft, publishDraft, saveDraft } from "./actions";
import CmsPagesPage from "./page";
import CmsEditPage from "./[slug]/page";
import CmsPreviewPage from "../preview/[slug]/page";
import AdminSettingsPage from "../settings/page";
import { setCmsRole } from "../settings/cms-actions";
import ProtectedAdminLayout from "../(protected)/layout";

vi.mock("next/headers", () => import("../../../../test/next-headers"));

/**
 * Every CMS server action and page, against a real database, for each kind of visitor. The
 * permission is read from the database on every call, so these also show that a changed
 * permission applies to the very next request.
 */

const file = JSON.parse(fs.readFileSync("content/field-building.json", "utf8"));
const SLUG = "field-building";

type Who = "signed out" | "not in ADMIN_EMAILS" | "no role" | "draft" | "publish" | "superadmin";
const EMAIL: Record<Exclude<Who, "signed out">, string> = {
  "not in ADMIN_EMAILS": "stranger@example.com",
  "no role": "none@example.com",
  draft: "draft@example.com",
  publish: "publish@example.com",
  superadmin: "tech@example.com",
};

async function signInAs(who: Who) {
  cookieJar.reset();
  if (who === "signed out") return;
  await startAdminSession({ email: EMAIL[who], name: who });
}

beforeEach(async () => {
  vi.stubEnv("ADMIN_EMAILS", "none@example.com,draft@example.com,publish@example.com,tech@example.com");
  vi.stubEnv("TECH_ADMIN_EMAILS", "tech@example.com");
  await db.delete(cmsDrafts);
  await db.delete(cmsRoles);
  await db.delete(adminAuditLog);
  // A stored permission the env lists do not back up must not count either.
  await setStoredCmsPermission(EMAIL["not in ADMIN_EMAILS"], "publish", "seed");
  await setStoredCmsPermission(EMAIL.draft, "draft", "seed");
  await setStoredCmsPermission(EMAIL.publish, "publish", "seed");
  for (const email of Object.values(EMAIL)) await rememberPerson(email, email.split("@")[0]);
});

const edited = (title = "Edited title") => ({ ...structuredClone(file), title });
const draftRow = async () => (await db.select().from(cmsDrafts).where(eq(cmsDrafts.page, SLUG)))[0];
const auditActions = async () => (await db.select().from(adminAuditLog)).map((r) => r.action).filter((a) => a !== "login");

/** Puts a draft in place, as an editor with permission would, and returns its version. */
async function seedDraft(content: unknown = edited()): Promise<number> {
  await signInAs("superadmin");
  const result = await saveDraft(SLUG, content, (await draftRow())?.version ?? 0);
  if (!result.ok) throw new Error(result.message);
  await db.delete(adminAuditLog);
  return result.version;
}

const ALL: Who[] = ["signed out", "not in ADMIN_EMAILS", "no role", "draft", "publish", "superadmin"];
const refusal = (who: Who) => (who === "signed out" || who === "not in ADMIN_EMAILS" ? "signed_out" : "forbidden");

describe("permission matrix", () => {
  describe.each(ALL)("%s", (who) => {
    const canEdit = who === "draft" || who === "publish" || who === "superadmin";
    const canPublish = who === "publish" || who === "superadmin";
    const canManage = who === "superadmin";

    it(`${canEdit ? "can" : "cannot"} save a draft`, async () => {
      await signInAs(who);
      const result = await saveDraft(SLUG, edited(), 0);
      if (canEdit) {
        expect(result).toMatchObject({ ok: true, version: 1, valid: true, state: "draft", problems: [] });
        expect(await draftRow()).toMatchObject({ authorEmail: EMAIL[who as "draft"], version: 1, valid: true });
        expect(await auditActions()).toEqual(["cms_draft_save"]);
      } else {
        expect(result).toMatchObject({ ok: false, reason: refusal(who) });
        expect(await draftRow()).toBeUndefined();
        expect(await auditActions()).toEqual([]);
      }
    });

    it(`${canEdit ? "can" : "cannot"} discard a draft`, async () => {
      const version = await seedDraft();
      await signInAs(who);
      const result = await discardDraft(SLUG, version);
      if (canEdit) {
        expect(result).toEqual({ ok: true });
        expect(await draftRow()).toBeUndefined();
        expect(await auditActions()).toEqual(["cms_draft_discard"]);
      } else {
        expect(result).toMatchObject({ ok: false, reason: refusal(who) });
        expect(await draftRow()).toBeDefined();
        expect(await auditActions()).toEqual([]);
      }
    });

    it(`${canPublish ? "can" : "cannot"} publish`, async () => {
      const version = await seedDraft();
      await signInAs(who);
      const result = await publishDraft(SLUG, version);
      if (canPublish) {
        // Publishing is not set up in this file (no GitHub settings); publishing.db.test.tsx sets it up.
        expect(result).toEqual({ ok: false, reason: "unavailable", message: "Publishing is not set up on this site yet. Your draft is saved." });
        expect(await auditActions()).toEqual(["cms_publish"]);
      } else {
        expect(result).toMatchObject({ ok: false, reason: refusal(who) });
        expect(await auditActions()).toEqual([]);
      }
    });

    it(`${canManage ? "can" : "cannot"} change who may edit`, async () => {
      await signInAs(who);
      const result = await setCmsRole(EMAIL["no role"], "publish");
      const stored = await db.select().from(cmsRoles).where(eq(cmsRoles.email, EMAIL["no role"]));
      if (canManage) {
        expect(result).toEqual({ ok: true });
        expect(stored).toMatchObject([{ permission: "publish", grantedBy: EMAIL.superadmin }]);
        expect(await auditActions()).toEqual(["cms_role_change"]);
      } else {
        expect(result).toMatchObject({ ok: false });
        expect(stored).toEqual([]);
        expect(await auditActions()).toEqual([]);
      }
    });

    it(`${canEdit ? "can" : "cannot"} open the page list, the editor and the preview`, async () => {
      await signInAs(who);
      const pages = [
        () => CmsPagesPage(),
        () => CmsEditPage({ params: Promise.resolve({ slug: SLUG }) }),
        () => CmsPreviewPage({ params: Promise.resolve({ slug: SLUG }) }),
      ];
      for (const page of pages) {
        if (who === "signed out" || who === "not in ADMIN_EMAILS") {
          await expect(page()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
          continue;
        }
        const { unmount } = render(await page());
        if (canEdit) expect(screen.queryByText("No access to website pages")).toBeNull();
        else expect(screen.getByRole("heading", { name: "No access to website pages" })).toBeInTheDocument();
        unmount();
      }
    });

    it(`${canPublish ? "sees" : "does not see"} the Publish button`, async () => {
      if (!canEdit) return;
      await signInAs(who);
      render(await CmsEditPage({ params: Promise.resolve({ slug: SLUG }) }));
      if (canPublish) expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
      else expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    });
  });
});

describe("a changed permission applies to the next request", () => {
  it("stops a removed draft permission", async () => {
    await signInAs("draft");
    const first = await saveDraft(SLUG, edited("One"), 0);
    expect(first.ok).toBe(true);

    await signInAs("superadmin");
    expect(await setCmsRole(EMAIL.draft, "none")).toEqual({ ok: true });

    await signInAs("draft");
    expect(await saveDraft(SLUG, edited("Two"), 1)).toMatchObject({ ok: false, reason: "forbidden" });
    expect((await draftRow()).content).toMatchObject({ title: "One" });
    render(await CmsPagesPage());
    expect(screen.getByRole("heading", { name: "No access to website pages" })).toBeInTheDocument();
  });

  it("stops publishing when publish is lowered to draft, but keeps editing", async () => {
    const version = await seedDraft();
    await signInAs("superadmin");
    await setCmsRole(EMAIL.publish, "draft");
    await signInAs("publish");
    expect(await publishDraft(SLUG, version)).toMatchObject({ ok: false, reason: "forbidden" });
    expect(await saveDraft(SLUG, edited("Still editing"), version)).toMatchObject({ ok: true });
  });

  it("stops everything when someone leaves ADMIN_EMAILS", async () => {
    await signInAs("publish");
    vi.stubEnv("ADMIN_EMAILS", "tech@example.com");
    expect(await saveDraft(SLUG, edited(), 0)).toMatchObject({ ok: false, reason: "signed_out" });
  });

  it("gives a new permission straight away", async () => {
    await signInAs("superadmin");
    await setCmsRole(EMAIL["no role"], "draft");
    await signInAs("no role");
    expect(await saveDraft(SLUG, edited(), 0)).toMatchObject({ ok: true });
  });
});

describe("one shared draft per page, saved with optimistic concurrency", () => {
  it("refuses a save made from a version that is no longer current", async () => {
    await signInAs("draft");
    expect(await saveDraft(SLUG, edited("Mine"), 0)).toMatchObject({ ok: true, version: 1 });
    await signInAs("publish");
    expect(await saveDraft(SLUG, edited("Theirs"), 1)).toMatchObject({ ok: true, version: 2 });

    await signInAs("draft");
    const stale = await saveDraft(SLUG, edited("Mine again"), 1);
    expect(stale).toMatchObject({ ok: false, reason: "conflict" });
    expect(!stale.ok && stale.message).toMatch(/^Someone else changed this page since you opened it\./);
    expect(await draftRow()).toMatchObject({ version: 2, authorEmail: EMAIL.publish, content: expect.objectContaining({ title: "Theirs" }) });
  });

  it("refuses a second new draft for a page that already has one", async () => {
    await signInAs("draft");
    await saveDraft(SLUG, edited("First"), 0);
    expect(await saveDraft(SLUG, edited("Second"), 0)).toMatchObject({ ok: false, reason: "conflict" });
  });

  it("refuses to discard or publish a draft that has moved on", async () => {
    const version = await seedDraft();
    await seedDraft(edited("Newer"));
    await signInAs("superadmin");
    expect(await discardDraft(SLUG, version)).toMatchObject({ ok: false, reason: "conflict" });
    expect(await publishDraft(SLUG, version)).toMatchObject({ ok: false, reason: "conflict" });
    expect(await draftRow()).toBeDefined();
  });

  it("refuses to save over a discarded draft", async () => {
    const version = await seedDraft();
    await signInAs("draft");
    await discardDraft(SLUG, version);
    expect(await saveDraft(SLUG, edited(), version)).toMatchObject({ ok: false, reason: "conflict" });
  });

  it("records the file the draft started from, and keeps it on later saves", async () => {
    const { contentHash } = await import("@/cms/content-files");
    const hash = contentHash(fs.readFileSync("content/field-building.json", "utf8"));
    const version = await seedDraft();
    expect((await draftRow()).baseHash).toBe(hash);
    await db.update(cmsDrafts).set({ baseHash: "older" });
    await seedDraft(edited("Again"));
    expect((await draftRow())).toMatchObject({ baseHash: "older", version: version + 1 });
  });
});

describe("saving", () => {
  it("saves an unfinished draft, marked invalid, with what still needs fixing", async () => {
    await signInAs("draft");
    const result = await saveDraft(SLUG, { ...edited(), title: "", blocks: [{ ...file.blocks[0], lede: "[x](/no-such-page)" }] }, 0);
    expect(result).toMatchObject({
      ok: true,
      valid: false,
      state: "draft",
      problems: [
        { path: ["title"], message: "Required" },
        { path: ["blocks", 0, "lede"], message: "The link /no-such-page does not lead to a page on this site" },
      ],
    });
    expect(await draftRow()).toMatchObject({ valid: false });
  });

  it("refuses a value that is not in the shape of a page", async () => {
    await signInAs("draft");
    expect(await saveDraft(SLUG, { ...edited(), blocks: [{ type: "html", html: "<script>" }] }, 0)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await draftRow()).toBeUndefined();
  });

  it("refuses unknown pages and malformed arguments", async () => {
    await signInAs("draft");
    expect(await saveDraft("../package", edited(), 0)).toMatchObject({ ok: false, reason: "not_found" });
    expect(await saveDraft(SLUG, edited(), -1)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await saveDraft(SLUG, edited(), 1.5)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await saveDraft(5, edited(), 0)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await discardDraft(SLUG, "1")).toMatchObject({ ok: false, reason: "invalid" });
    await signInAs("publish");
    expect(await publishDraft(SLUG, null)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await publishDraft("no-such-page", 0)).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("shows a draft identical to the file as Live", async () => {
    await signInAs("draft");
    expect(await saveDraft(SLUG, structuredClone(file), 0)).toMatchObject({ ok: true, state: "live" });
  });
});

describe("publishing", () => {
  it("has nothing to publish on a live page", async () => {
    await signInAs("publish");
    expect(await publishDraft(SLUG, 0)).toMatchObject({ ok: false, reason: "nothing" });
  });

  it("runs the publish checks again on the server", async () => {
    const version = await seedDraft({ ...edited(), description: "" });
    await signInAs("publish");
    const result = await publishDraft(SLUG, version);
    expect(result).toMatchObject({ ok: false, reason: "checks", problems: [{ path: ["description"], message: "Required" }] });
    const [entry] = await db.select().from(adminAuditLog);
    expect(entry).toMatchObject({ actorEmail: EMAIL.publish, action: "cms_publish", detail: { page: SLUG, version, outcome: "checks_failed" } });
  });
});

describe("the preview", () => {
  it("renders the draft with the page's own components", async () => {
    await seedDraft({ ...edited(), blocks: [{ ...file.blocks[0], heading: "Draft heading" }, ...file.blocks.slice(1)] });
    await signInAs("draft");
    render(await CmsPreviewPage({ params: Promise.resolve({ slug: SLUG }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Draft heading");
    expect(screen.getByRole("note")).toHaveTextContent("Preview of the draft.");
  });

  it("shows the page's form, but disabled, so nothing can be submitted from a preview", async () => {
    await signInAs("draft");
    render(await CmsPreviewPage({ params: Promise.resolve({ slug: SLUG }) }));
    expect(screen.getByText("Preview: form disabled")).toBeInTheDocument();
    const controls = [...document.querySelectorAll<HTMLButtonElement>('form button[type="submit"]')];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) expect(control).toBeDisabled();
  });

  it("renders the live page when there is no draft", async () => {
    await signInAs("draft");
    render(await CmsPreviewPage({ params: Promise.resolve({ slug: SLUG }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(file.blocks[0].heading);
    expect(screen.getByRole("note")).toHaveTextContent("Preview of the live page.");
  });

  it("renders the finished blocks of a draft, and a gap for one that is not finished", async () => {
    await seedDraft({ ...edited(), blocks: [{ ...file.blocks[0], heading: "" }, ...file.blocks.slice(1)] });
    await signInAs("draft");
    render(await CmsPreviewPage({ params: Promise.resolve({ slug: SLUG }) }));
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByText("Block 1 (Page heading) is not finished, so it is not shown yet.")).toBeInTheDocument();
    expect(document.querySelector('[data-block="1"] blockquote')).toHaveTextContent(/^Our mission/);
  });

  it("says what to do instead of rendering a draft with no finished block", async () => {
    await seedDraft({ ...edited(), blocks: [{ ...file.blocks[0], heading: "" }] });
    await signInAs("draft");
    render(await CmsPreviewPage({ params: Promise.resolve({ slug: SLUG }) }));
    expect(screen.getByRole("heading", { name: "This draft is not finished" })).toBeInTheDocument();
  });

  it("is not found for a page with no content file", async () => {
    await signInAs("draft");
    await expect(CmsPreviewPage({ params: Promise.resolve({ slug: "no-such-page" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(CmsEditPage({ params: Promise.resolve({ slug: "no-such-page" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("the audit log", () => {
  const draftEdits = () => db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "cms_draft_save"));

  it("keeps one row per person and page for autosaves within 30 minutes, with a count", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await signInAs("draft");
    let version = 0;
    for (const title of ["A", "AB", "ABC"]) {
      const result = await saveDraft(SLUG, edited(title), version);
      if (!result.ok) throw new Error(result.message);
      version = result.version;
      vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    }
    let rows = await draftEdits();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorEmail: EMAIL.draft, detail: { page: SLUG, version: 3, valid: true, count: 3 } });
    const lastAt = rows[0].at.getTime();
    expect(lastAt).toBe(Date.now() - 10 * 60 * 1000);

    // Another person on the same page gets their own row.
    await signInAs("publish");
    const theirs = await saveDraft(SLUG, edited("Theirs"), version);
    if (!theirs.ok) throw new Error(theirs.message);
    version = theirs.version;
    expect(await draftEdits()).toHaveLength(2);

    // After a 30-minute pause, a new row starts.
    vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    await signInAs("draft");
    await saveDraft(SLUG, edited("Later"), version);
    rows = await draftEdits();
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.actorEmail === EMAIL.draft).map((r) => (r.detail as { count: number }).count).sort()).toEqual([1, 3]);
  });

  it("gives discards, publishes and role changes a row each", async () => {
    await signInAs("superadmin");
    const saved = await saveDraft(SLUG, edited(), 0);
    const version = saved.ok ? saved.version : 0;
    await publishDraft(SLUG, version);
    await publishDraft(SLUG, version);
    await discardDraft(SLUG, version);
    await setCmsRole(EMAIL["no role"], "draft");
    await setCmsRole(EMAIL["no role"], "none");
    const actions = (await db.select().from(adminAuditLog)).map((r) => r.action).sort();
    expect(actions).toEqual(["cms_draft_discard", "cms_draft_save", "cms_publish", "cms_publish", "cms_role_change", "cms_role_change"]);
  });
});

describe("a draft holding an unsafe link", () => {
  const unsafe = () => ({ ...edited(), blocks: [{ ...file.blocks[0], lede: "Click [here](javascript:alert)" }, ...file.blocks.slice(1)] });

  it("is saved but marked invalid, with the link reported", async () => {
    await signInAs("draft");
    const result = await saveDraft(SLUG, unsafe(), 0);
    expect(result).toMatchObject({ ok: true, valid: false });
    expect(result.ok && result.problems).toContainEqual({ path: ["blocks", 0, "lede"], message: expect.stringMatching(/^Only https:, mailto: and site links/) });
    expect(await draftRow()).toMatchObject({ valid: false });
  });

  it("is read strictly by the editor, the preview and publishing", async () => {
    const version = await seedDraft(unsafe());

    await signInAs("publish");
    const { unmount } = render(await CmsEditPage({ params: Promise.resolve({ slug: SLUG }) }));
    expect(screen.getByDisplayValue("Click [here](javascript:alert)").tagName).toBe("TEXTAREA");
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
    unmount();

    const preview = render(await CmsPreviewPage({ params: Promise.resolve({ slug: SLUG }) }));
    expect(screen.getByText("Block 1 (Page heading) is not finished, so it is not shown yet.")).toBeInTheDocument();
    expect(screen.getByText(/^Introduction: Only https:, mailto: and site links/)).toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
    preview.unmount();

    expect(await publishDraft(SLUG, version)).toMatchObject({ ok: false, reason: "checks" });
  });
});

describe("the admin header", () => {
  it("links to the website pages for editors only", async () => {
    await signInAs("draft");
    const { unmount } = render(await ProtectedAdminLayout({ children: <p>body</p> }));
    expect(screen.getByRole("link", { name: "Website pages" })).toHaveAttribute("href", "/admin/cms");
    unmount();
    await signInAs("no role");
    render(await ProtectedAdminLayout({ children: <p>body</p> }));
    expect(screen.queryByRole("link", { name: "Website pages" })).toBeNull();
  });

  it("still works, without the link, when CMS access cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await signInAs("superadmin");
    await db.execute(sql`ALTER TABLE cms_roles RENAME TO cms_roles_unavailable`);
    try {
      render(await ProtectedAdminLayout({ children: <p>body</p> }));
    } finally {
      await db.execute(sql`ALTER TABLE cms_roles_unavailable RENAME TO cms_roles`);
    }
    expect(screen.getByText("body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Website pages" })).toBeNull();
    expect(console.error).toHaveBeenCalledWith("[admin] Could not read CMS access for the nav", expect.any(Error));
  });
});

describe("the page list", () => {
  it("shows each page as Draft or Live, with who last edited a draft", async () => {
    await signInAs("draft");
    const { unmount } = render(await CmsPagesPage());
    const item = screen.getByRole("link", { name: file.title }).closest("li")!;
    expect(within(item as HTMLElement).getByText("Live")).toBeInTheDocument();
    unmount();

    await saveDraft(SLUG, { ...edited(), title: "" }, 0);
    render(await CmsPagesPage());
    const draftItem = screen.getByRole("link", { name: file.title }).closest("li") as HTMLElement;
    expect(within(draftItem).getByText("Draft")).toBeInTheDocument();
    expect(draftItem).toHaveTextContent(`Last edited by ${EMAIL.draft}`);
    expect(draftItem).toHaveTextContent("not finished");
  });
});

describe("managing who may edit", () => {
  it("records the change in the audit log", async () => {
    await signInAs("superadmin");
    await setCmsRole(EMAIL.draft, "publish");
    await setCmsRole(EMAIL.draft, "none");
    const entries = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "cms_role_change"));
    expect(entries.map((e) => e.detail)).toEqual(
      expect.arrayContaining([
        { email: EMAIL.draft, from: "draft", to: "publish" },
        { email: EMAIL.draft, from: "publish", to: "none" },
      ]),
    );
    expect(await db.select().from(cmsRoles).where(eq(cmsRoles.email, EMAIL.draft))).toEqual([]);
  });

  it("only for people who have signed in to the admin, and only to a known permission", async () => {
    await signInAs("superadmin");
    expect(await setCmsRole("nobody@example.com", "draft")).toEqual({
      ok: false,
      message: "Only people who have signed in to the admin can be given access.",
    });
    expect(await setCmsRole(EMAIL["no role"], "superadmin")).toEqual({ ok: false, message: "The request was not understood." });
    expect(await auditActions()).toEqual([]);
  });

  it("is shown to superadmins in Settings, with each person's permission", async () => {
    await signInAs("superadmin");
    render(await AdminSettingsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Website editors" })).toBeInTheDocument();
    expect(screen.getByLabelText("Website editing for draft")).toHaveValue("draft");
    expect(screen.getByLabelText("Website editing for none")).toHaveValue("none");
    expect(screen.queryByLabelText("Website editing for tech")).toBeNull();
    expect(screen.getByText("Technical admin: full access")).toBeInTheDocument();
  });

  it("shows a role held by someone no longer an admin as inactive, so it can be removed", async () => {
    // stranger@ is in admin_people with a stored publish role, but not in ADMIN_EMAILS.
    await setStoredCmsPermission("gone@example.com", "draft", "seed");
    await signInAs("superadmin");
    render(await AdminSettingsPage({ searchParams: Promise.resolve({}) }));
    const inactive = screen.getAllByText(/^Inactive \(not an admin\)/);
    expect(inactive).toHaveLength(2);
    expect(screen.getByLabelText("Website editing for stranger")).toHaveValue("publish");
    expect(screen.getByLabelText("Website editing for gone@example.com")).toHaveValue("draft");

    // The access check already refuses them.
    await signInAs("not in ADMIN_EMAILS");
    expect(await saveDraft(SLUG, edited(), 0)).toMatchObject({ ok: false, reason: "signed_out" });

    await signInAs("superadmin");
    expect(await setCmsRole("gone@example.com", "none")).toEqual({ ok: true });
    expect(await setCmsRole("gone@example.com", "draft")).toMatchObject({ ok: false });
    expect(await db.select().from(cmsRoles).where(eq(cmsRoles.email, "gone@example.com"))).toEqual([]);
  });

  it("notes someone who logged in once but is no longer an admin and holds no role", async () => {
    await setStoredCmsPermission(EMAIL["not in ADMIN_EMAILS"], null, "seed");
    await signInAs("superadmin");
    render(await AdminSettingsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Not in ADMIN_EMAILS, so cannot log in.")).toBeInTheDocument();
  });
});
