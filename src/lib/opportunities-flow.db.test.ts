import { beforeEach, describe, expect, it, vi } from "vitest";
import { opportunities, opportunitiesAuditLog } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { indexNow, INDEXNOW_KEY } from "../../test/fakes/indexnow";
import { GOOGLE_INDEXING_SERVICE_ACCOUNT, googleIndexing } from "../../test/fakes/google-indexing";
import { afterTasks } from "../../test/next-after";
import {
  announceRecentlyClosed,
  createOpportunity,
  deleteOpportunity,
  NotFoundError,
  publishOpportunity,
  updateOpportunity,
  ValidationError,
} from "./opportunities-flow";

const FIELDS = {
  type: "job" as const,
  title: "Senior Engineer",
  org: "Acme",
  summary: "A short summary.",
  description: "A longer description.",
  locationCountry: "GLOBAL",
  remote: true,
  applyUrl: "https://example.com/apply",
};

beforeEach(async () => {
  await db.delete(opportunitiesAuditLog);
  await db.delete(opportunities);
});

describe("createOpportunity", () => {
  it("computes a slug, publishes immediately and records who created it", async () => {
    const opportunity = await createOpportunity(FIELDS, "admin@example.com");
    expect(opportunity.slug).toBe("acme-senior-engineer");
    expect(opportunity.publishedAt).toBe(new Date().toISOString().slice(0, 10));

    const [log] = await db.select().from(opportunitiesAuditLog);
    expect(log).toMatchObject({ actorEmail: "admin@example.com", action: "create", entityId: opportunity.id });
  });

  it("dedupes the slug against what's already published", async () => {
    await createOpportunity(FIELDS, "admin@example.com");
    const second = await createOpportunity(FIELDS, "admin@example.com");
    expect(second.slug).toBe("acme-senior-engineer-2");
  });

  it("refuses fields that fail the schema", async () => {
    await expect(createOpportunity({ ...FIELDS, applyUrl: "not a url" }, "admin@example.com")).rejects.toThrow(ValidationError);
    expect(await db.select().from(opportunities)).toEqual([]);
  });
});

describe("updateOpportunity", () => {
  it("saves the edited fields, keeping the slug and published date, and logs what changed", async () => {
    const created = await createOpportunity(FIELDS, "admin@example.com");
    const updated = await updateOpportunity(
      created.slug,
      { ...FIELDS, title: "Staff Engineer", compMin: 200_000, compCurrency: "USD", compPeriod: "year" },
      "jane@example.com",
    );

    expect(updated.slug).toBe(created.slug);
    expect(updated.publishedAt).toBe(created.publishedAt);
    expect(updated.title).toBe("Staff Engineer");

    const [, log] = await db.select().from(opportunitiesAuditLog);
    expect(log).toMatchObject({ actorEmail: "jane@example.com", action: "update", entityId: created.id });
    expect(log.detail).toMatchObject({ title: { before: "Senior Engineer", after: "Staff Engineer" } });
  });

  it("refuses an unknown slug", async () => {
    await expect(updateOpportunity("no-such-slug", FIELDS, "admin@example.com")).rejects.toThrow(NotFoundError);
  });

  it("refuses fields that fail the schema", async () => {
    const created = await createOpportunity(FIELDS, "admin@example.com");
    await expect(updateOpportunity(created.slug, { ...FIELDS, title: "" }, "admin@example.com")).rejects.toThrow(ValidationError);
  });
});

describe("deleteOpportunity", () => {
  it("removes the row and keeps a snapshot of it in the audit log", async () => {
    const created = await createOpportunity(FIELDS, "admin@example.com");
    const deleted = await deleteOpportunity(created.slug, "admin@example.com");
    expect(deleted.slug).toBe(created.slug);
    expect(await db.select().from(opportunities)).toEqual([]);

    const [, log] = await db.select().from(opportunitiesAuditLog);
    expect(log).toMatchObject({ actorEmail: "admin@example.com", action: "delete", entityId: created.id });
    expect(log.detail).toMatchObject({ slug: created.slug, title: created.title });
  });

  it("refuses an unknown slug", async () => {
    await expect(deleteOpportunity("no-such-slug", "admin@example.com")).rejects.toThrow(NotFoundError);
  });
});

describe("telling the search engines (IndexNow)", () => {
  const SITE = "https://lawforaisafety.org";
  const listingUrls = (slug: string) => [`${SITE}/opportunities/${slug}`, `${SITE}/opportunities`];

  beforeEach(() => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    vi.stubEnv("INDEXNOW_KEY", INDEXNOW_KEY);
  });

  it("announces a listing created public, and the board", async () => {
    const created = await createOpportunity(FIELDS, "admin@example.com");
    await afterTasks.settled();
    expect(indexNow.urls()).toEqual(listingUrls(created.slug));
  });

  it("announces nothing about a draft until it is published", async () => {
    const draft = await createOpportunity(FIELDS, "admin@example.com", "draft");
    await updateOpportunity(draft.slug, { ...FIELDS, title: "Staff Engineer" }, "admin@example.com", "draft");
    await afterTasks.settled();
    expect(indexNow.urls()).toEqual([]);

    await publishOpportunity(draft.slug, "admin@example.com");
    await afterTasks.settled();
    expect(indexNow.urls()).toEqual(listingUrls(draft.slug));
    // Publishing again changes nothing, so it says nothing.
    await publishOpportunity(draft.slug, "admin@example.com");
    await afterTasks.settled();
    expect(indexNow.pings).toHaveLength(1);
  });

  it("announces nothing for a save that changed nothing", async () => {
    const created = await createOpportunity(FIELDS, "admin@example.com");
    await updateOpportunity(created.slug, FIELDS, "admin@example.com");
    await updateOpportunity(created.slug, FIELDS, "admin@example.com", "published");
    await afterTasks.settled();
    expect(indexNow.pings).toHaveLength(1);
  });

  it("announces an edit to a public listing, and a draft published by its edit", async () => {
    const created = await createOpportunity(FIELDS, "admin@example.com");
    await updateOpportunity(created.slug, { ...FIELDS, title: "Staff Engineer" }, "admin@example.com");
    const draft = await createOpportunity({ ...FIELDS, org: "Other" }, "admin@example.com", "draft");
    await updateOpportunity(draft.slug, { ...FIELDS, org: "Other" }, "admin@example.com", "published");
    await afterTasks.settled();
    expect(indexNow.pings.map((ping) => ping.urlList)).toEqual([listingUrls(created.slug), listingUrls(created.slug), listingUrls(draft.slug)]);
  });

  it("announces a public listing's removal, but not a draft's", async () => {
    const created = await createOpportunity(FIELDS, "admin@example.com");
    const draft = await createOpportunity(FIELDS, "admin@example.com", "draft");
    await deleteOpportunity(draft.slug, "admin@example.com");
    await deleteOpportunity(created.slug, "admin@example.com");
    await afterTasks.settled();
    expect(indexNow.pings.map((ping) => ping.urlList)).toEqual([listingUrls(created.slug), listingUrls(created.slug)]);
  });

  it("still saves the change when the ping fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    indexNow.failNext("network");
    const created = await createOpportunity(FIELDS, "admin@example.com");
    expect(await db.select().from(opportunities)).toHaveLength(1);
    expect(created.slug).toBe("acme-senior-engineer");
    await afterTasks.settled();
    expect(indexNow.pings).toHaveLength(1);
  });

  it("announces the public listings that closed within the window, once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T00:00:00Z"));
    const closing = await createOpportunity({ ...FIELDS, deadline: "2026-11-10" }, "admin@example.com");
    await createOpportunity({ ...FIELDS, org: "Long closed", deadline: "2026-11-01" }, "admin@example.com");
    await createOpportunity({ ...FIELDS, org: "Still open", deadline: "2026-12-01" }, "admin@example.com");
    await createOpportunity({ ...FIELDS, org: "Draft", deadline: "2026-11-10" }, "admin@example.com", "draft");
    await afterTasks.settled();
    indexNow.reset();

    // The closing day ends Anywhere on Earth (UTC-12) at noon UTC the next day.
    const sixHours = 6 * 60 * 60 * 1000;
    expect(await announceRecentlyClosed(new Date("2026-11-11T11:00:00Z"), sixHours)).toBe(0);
    expect(await announceRecentlyClosed(new Date("2026-11-11T13:00:00Z"), sixHours)).toBe(1);
    expect(await announceRecentlyClosed(new Date("2026-11-11T19:00:00Z"), sixHours)).toBe(0);
    await afterTasks.settled();
    expect(indexNow.pings.map((ping) => ping.urlList)).toEqual([listingUrls(closing.slug)]);
  });
});

describe("telling Google (Indexing API)", () => {
  /** A job its page marks up as a JobPosting: it has a base country. */
  const JOB = { ...FIELDS, locationCountry: "BE", remote: false };
  const url = (slug: string) => `https://lawforaisafety.org/opportunities/${slug}`;
  const sent = async () => {
    await afterTasks.settled();
    return googleIndexing.notifications.map(({ url, type }) => `${type} ${url}`);
  };

  beforeEach(() => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    vi.stubEnv("GOOGLE_INDEXING_SERVICE_ACCOUNT", GOOGLE_INDEXING_SERVICE_ACCOUNT);
  });

  it("announces a job posting when it goes public, and each change to it", async () => {
    const created = await createOpportunity(JOB, "admin@example.com");
    await updateOpportunity(created.slug, { ...JOB, title: "Staff Engineer" }, "admin@example.com");
    // A save that changed nothing says nothing.
    await updateOpportunity(created.slug, { ...JOB, title: "Staff Engineer" }, "admin@example.com");
    const draft = await createOpportunity({ ...JOB, type: "fellowship", org: "Other" }, "admin@example.com", "draft");
    await updateOpportunity(draft.slug, { ...JOB, type: "fellowship", org: "Other", title: "Fellow" }, "admin@example.com", "draft");
    await publishOpportunity(draft.slug, "admin@example.com");
    const editedLive = await createOpportunity({ ...JOB, org: "Third" }, "admin@example.com", "draft");
    await updateOpportunity(editedLive.slug, { ...JOB, org: "Third" }, "admin@example.com", "published");

    expect(await sent()).toEqual([
      `URL_UPDATED ${url(created.slug)}`,
      `URL_UPDATED ${url(created.slug)}`,
      `URL_UPDATED ${url(draft.slug)}`,
      `URL_UPDATED ${url(editedLive.slug)}`,
    ]);
  });

  it("never announces a listing whose page carries no job posting", async () => {
    const global = await createOpportunity(FIELDS, "admin@example.com");
    await updateOpportunity(global.slug, { ...FIELDS, title: "Staff Engineer" }, "admin@example.com");
    await deleteOpportunity(global.slug, "admin@example.com");
    const course = await createOpportunity({ ...JOB, type: "course", org: "School" }, "admin@example.com");
    await deleteOpportunity(course.slug, "admin@example.com");
    const draft = await createOpportunity(JOB, "admin@example.com", "draft");
    await deleteOpportunity(draft.slug, "admin@example.com");
    const closed = await createOpportunity({ ...JOB, org: "Closed", deadline: "2020-01-01" }, "admin@example.com");
    await updateOpportunity(closed.slug, { ...JOB, org: "Closed", deadline: "2020-01-01", title: "Typo fixed" }, "admin@example.com");
    expect(await sent()).toEqual([]);
  });

  it("announces a job posting's removal when it is deleted, closed by an edit or stops being one", async () => {
    const deleted = await createOpportunity(JOB, "admin@example.com");
    await deleteOpportunity(deleted.slug, "admin@example.com");
    const closed = await createOpportunity({ ...JOB, org: "Closes" }, "admin@example.com");
    await updateOpportunity(closed.slug, { ...JOB, org: "Closes", deadline: "2020-01-01" }, "admin@example.com");
    const moved = await createOpportunity({ ...JOB, org: "Moves" }, "admin@example.com");
    await updateOpportunity(moved.slug, { ...JOB, org: "Moves", locationCountry: "GLOBAL" }, "admin@example.com");
    // Reopened by a later deadline, it is a job posting again.
    await updateOpportunity(closed.slug, { ...JOB, org: "Closes", deadline: "2099-01-01" }, "admin@example.com");

    expect(await sent()).toEqual([
      `URL_UPDATED ${url(deleted.slug)}`,
      `URL_DELETED ${url(deleted.slug)}`,
      `URL_UPDATED ${url(closed.slug)}`,
      `URL_DELETED ${url(closed.slug)}`,
      `URL_UPDATED ${url(moved.slug)}`,
      `URL_DELETED ${url(moved.slug)}`,
      `URL_UPDATED ${url(closed.slug)}`,
    ]);
  });

  it("still saves the change when Google can't be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    googleIndexing.failNextToken("network");
    const created = await createOpportunity(JOB, "admin@example.com");
    expect(created.status).toBe("published");
    expect(await db.select().from(opportunities)).toHaveLength(1);
    expect(await sent()).toEqual([]);
  });

  it("announces the removal of job postings that closed within the window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T00:00:00Z"));
    const closing = await createOpportunity({ ...JOB, deadline: "2026-11-10" }, "admin@example.com");
    await createOpportunity({ ...FIELDS, org: "Global", deadline: "2026-11-10" }, "admin@example.com");
    await createOpportunity({ ...JOB, type: "course", org: "Course", deadline: "2026-11-10" }, "admin@example.com");
    await createOpportunity({ ...JOB, org: "Still open", deadline: "2026-12-01" }, "admin@example.com");
    await afterTasks.settled();
    googleIndexing.notifications.length = 0;

    const sixHours = 6 * 60 * 60 * 1000;
    expect(await announceRecentlyClosed(new Date("2026-11-11T13:00:00Z"), sixHours)).toBe(3);
    expect(await announceRecentlyClosed(new Date("2026-11-11T19:00:00Z"), sixHours)).toBe(0);
    expect(await sent()).toEqual([`URL_DELETED ${url(closing.slug)}`]);
  });
});
