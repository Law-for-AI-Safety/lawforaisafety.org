import { beforeEach, describe, expect, it } from "vitest";
import { opportunities, opportunitiesAuditLog } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { createOpportunity, deleteOpportunity, NotFoundError, updateOpportunity, ValidationError } from "./opportunities-flow";

const FIELDS = {
  type: "job" as const,
  title: "Senior Engineer",
  org: "Acme",
  summary: "A short summary.",
  description: "A longer description.",
  location: "Remote",
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
    const updated = await updateOpportunity(created.slug, { ...FIELDS, title: "Staff Engineer", compensation: "$200k" }, "jane@example.com");

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
