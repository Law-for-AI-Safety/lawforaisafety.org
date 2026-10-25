import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions, opportunities, opportunitySubmissions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { eraseDataForEmail, findDataForEmail } from "@/lib/erasure";
import { startAdminSession } from "@/lib/session";
import { emails } from "../../../../../../../../test/fakes/email";
import { POST as create } from "../../../route";
import { POST as reject } from "./route";

vi.mock("next/headers", () => import("../../../../../../../../test/next-headers"));

const SUBMITTER = "sam@example.org";

const LISTING_BODY = {
  type: "job",
  title: "AI Policy Counsel",
  org: "Example Org",
  summary: "Advise on AI regulation.",
  description: "Advise on AI regulation.",
  locationCountry: "GLOBAL",
  remote: true,
  applyUrl: "https://example.org/apply",
};

function json(url: string, body: unknown) {
  return new Request(`http://localhost:3001${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rejectRequest(id: string, body: unknown) {
  return reject(json(`/api/admin/opportunities/submissions/${id}/reject`, body), { params: Promise.resolve({ id }) });
}

async function pendingSubmission(): Promise<string> {
  const [row] = await db
    .insert(opportunitySubmissions)
    .values({
      authProvider: "linkedin",
      status: "pending",
      name: "Sam Submitter",
      email: SUBMITTER,
      providerId: "sub-1",
      type: "job",
      title: "AI Policy Counsel",
      org: "Example Org",
      applyUrl: "https://example.org/apply",
    })
    .returning();
  return row.id;
}

async function submission(id: string) {
  const [row] = await db.select().from(opportunitySubmissions);
  expect(row.id).toBe(id);
  return row;
}

beforeEach(async () => {
  await db.delete(adminSessions);
  await db.delete(opportunitySubmissions);
  await db.delete(opportunities);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("DEPLOY_CONTEXT", "production");
  await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
});

describe("publishing a listing from a submission", () => {
  it("links the listing to the submission and emails the submitter its address", async () => {
    const id = await pendingSubmission();

    const response = await create(json("/api/admin/opportunities", { ...LISTING_BODY, submissionId: id }));
    expect(response.status).toBe(200);
    const listing = await response.json();

    expect(await submission(id)).toMatchObject({ status: "published", opportunityId: listing.id, reviewedBy: "admin@example.com" });
    const [published] = emails.to(SUBMITTER);
    expect(published.subject).toBe("Your opportunity is on the Law for AI Safety board");
    expect(published.html).toContain(`https://lawforaisafety.test/opportunities/${listing.slug}`);
  });

  it("refuses a submission that has already been dealt with, creating nothing", async () => {
    const id = await pendingSubmission();
    await db.update(opportunitySubmissions).set({ status: "rejected" });

    const response = await create(json("/api/admin/opportunities", { ...LISTING_BODY, submissionId: id }));
    expect(response.status).toBe(409);
    expect(await db.select().from(opportunities)).toEqual([]);
  });

  it("keeps the listing live when the submitter's email fails", async () => {
    const id = await pendingSubmission();
    emails.failNext();

    const response = await create(json("/api/admin/opportunities", { ...LISTING_BODY, submissionId: id }));
    expect(response.status).toBe(200);
    expect((await submission(id)).status).toBe("published");
  });
});

describe("rejecting a submission", () => {
  it("emails the submitter the reason when asked to", async () => {
    const id = await pendingSubmission();

    const response = await rejectRequest(id, { notify: true, reason: "Not focused on AI <safety>." });
    expect(await response.json()).toEqual({ id, emailed: true, emailFailed: false });

    expect(await submission(id)).toMatchObject({ status: "rejected", rejectionReason: "Not focused on AI <safety>." });
    const [rejected] = emails.to(SUBMITTER);
    expect(rejected.html).toContain("AI Policy Counsel at Example Org");
    expect(rejected.html).toContain("Not focused on AI &lt;safety&gt;.");
  });

  it("emails nobody when not asked to", async () => {
    const id = await pendingSubmission();

    const response = await rejectRequest(id, { notify: false, reason: "Duplicate" });
    expect(await response.json()).toEqual({ id, emailed: false, emailFailed: false });
    expect(emails.sent).toEqual([]);
  });

  it("stays rejected, and says so, when the email fails", async () => {
    const id = await pendingSubmission();
    emails.failNext();

    const response = await rejectRequest(id, { notify: true, reason: "" });
    expect(await response.json()).toEqual({ id, emailed: false, emailFailed: true });
    expect(await submission(id)).toMatchObject({ status: "rejected", rejectionReason: null });
  });

  it("can't reject a submission twice", async () => {
    const id = await pendingSubmission();
    await rejectRequest(id, { notify: false });

    expect((await rejectRequest(id, { notify: true })).status).toBe(409);
    expect(emails.sent).toEqual([]);
  });

  it("is a 409 for a submission that doesn't exist", async () => {
    expect((await rejectRequest("not-a-uuid", { notify: false })).status).toBe(409);
  });

  it("is only for the opportunities team", async () => {
    const id = await pendingSubmission();
    await db.delete(adminSessions);
    expect((await rejectRequest(id, { notify: false })).status).toBe(401);
  });
});

describe("erasing a submitter's data", () => {
  it("finds and deletes their submissions, leaving the published listing up", async () => {
    const id = await pendingSubmission();
    const listing = await (await create(json("/api/admin/opportunities", { ...LISTING_BODY, submissionId: id }))).json();

    expect((await findDataForEmail("SAM@example.org")).opportunitySubmissions).toEqual([
      expect.objectContaining({ id, status: "published" }),
    ]);

    const result = await eraseDataForEmail(SUBMITTER, {
      applications: false,
      newsletterSignups: false,
      processed: false,
      redLinesApplications: false,
      opportunitySubmissions: true,
    });
    expect(result.opportunitySubmissions).toBe(1);
    expect(await db.select().from(opportunitySubmissions)).toEqual([]);
    expect((await db.select().from(opportunities)).map((row) => row.id)).toEqual([listing.id]);
  });
});
