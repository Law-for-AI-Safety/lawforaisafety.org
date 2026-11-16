import { and, desc, eq, isNotNull, isNull, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletters } from "@/drizzle/schema";
import type { DraftFields } from "@/newsletter/template";
import { issueSlugBase } from "@/newsletter/slug";
import { uniqueSlug } from "@/opportunities/slug";

/**
 * Database reads and writes for newsletters. Callers check permissions first
 * (`requireNewsletter` in src/lib/newsletter-access.ts); nothing here does.
 */

export type NewsletterRow = typeof newsletters.$inferSelect;


export async function getNewsletter(id: string): Promise<NewsletterRow | null> {
  const [row] = await db.select().from(newsletters).where(eq(newsletters.id, id));
  return row ?? null;
}

export async function listNewsletters(): Promise<NewsletterRow[]> {
  return db.select().from(newsletters).orderBy(desc(newsletters.updatedAt));
}

export async function insertNewsletter(email: string): Promise<string> {
  const [row] = await db
    .insert(newsletters)
    .values({ createdBy: email, updatedBy: email })
    .returning({ id: newsletters.id });
  return row.id;
}

const isDraftAt = (id: string, version: number) =>
  and(eq(newsletters.id, id), eq(newsletters.version, version), eq(newsletters.state, "draft"));

/** Saves a draft still at `version`. Returns the new version, or null when it has moved on or is no longer a draft. */
export async function writeNewsletter(id: string, fields: DraftFields, version: number, email: string): Promise<number | null> {
  const [row] = await db
    .update(newsletters)
    .set({ ...fields, version: version + 1, updatedBy: email, updatedAt: new Date() })
    .where(isDraftAt(id, version))
    .returning({ version: newsletters.version });
  return row?.version ?? null;
}

/** Records that `version` was test-sent, if the draft is still at it. */
export async function markTested(id: string, version: number): Promise<boolean> {
  const rows = await db
    .update(newsletters)
    .set({ testedVersion: version })
    .where(isDraftAt(id, version))
    .returning({ id: newsletters.id });
  return rows.length > 0;
}

/** Deletes a draft still at `version`. Returns the deleted row, or null. */
export async function removeNewsletter(id: string, version: number): Promise<NewsletterRow | null> {
  const [row] = await db.delete(newsletters).where(isDraftAt(id, version)).returning();
  return row ?? null;
}

/**
 * Claims a draft still at `version` for handing to Brevo. Only one caller can win, so a double
 * click or two admins at once cannot create two campaigns.
 */
export async function claimForSubmit(id: string, version: number, email: string): Promise<NewsletterRow | null> {
  const [row] = await db
    .update(newsletters)
    .set({ state: "submitting", submittedBy: email, submittedAt: new Date() })
    .where(isDraftAt(id, version))
    .returning();
  return row ?? null;
}

export async function setCampaignId(id: string, campaignId: number): Promise<void> {
  await db.update(newsletters).set({ brevoCampaignId: campaignId }).where(eq(newsletters.id, id));
}

export async function markSubmitted(id: string, scheduledAt: Date, email: string): Promise<void> {
  await db
    .update(newsletters)
    .set({ state: "submitted", scheduledAt, submittedBy: email, submittedAt: new Date() })
    .where(eq(newsletters.id, id));
}

/**
 * Back to an editable draft after a failed hand-over; a campaign Brevo created as a draft keeps
 * its id for the retry. The slug goes, since nothing was sent with it.
 */
export async function releaseClaim(id: string): Promise<void> {
  await db
    .update(newsletters)
    .set({ state: "draft", submittedBy: null, submittedAt: null, slug: null })
    .where(eq(newsletters.id, id));
}

const MAX_SLUG_ATTEMPTS = 5;

/** Postgres refusing a duplicate. Drizzle wraps the driver's error, so its code is on the cause. */
function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && (e.cause as { code?: unknown } | undefined)?.code === "23505";
}

/**
 * Gives a claimed newsletter its web address, from its subject and the day it is to go out
 * (`november-update-2026-11-20`), unless it has one. Unique: a clash takes `-2`, `-3`, ...
 */
export async function assignSlug(id: string, subject: string, sendAt: Date): Promise<string> {
  const [current] = await db.select({ slug: newsletters.slug }).from(newsletters).where(eq(newsletters.id, id));
  if (current?.slug) return current.slug;
  const base = issueSlugBase(subject, sendAt);
  for (let attempt = 1; ; attempt++) {
    const taken = await db.select({ slug: newsletters.slug }).from(newsletters).where(like(newsletters.slug, `${base}%`));
    const slug = uniqueSlug(base, new Set(taken.map((r) => r.slug!)));
    try {
      await db.update(newsletters).set({ slug }).where(eq(newsletters.id, id));
      return slug;
    } catch (e) {
      // Another hand-over took the same slug between the read and the write.
      if (!isUniqueViolation(e) || attempt >= MAX_SLUG_ATTEMPTS) throw e;
    }
  }
}

export async function setScheduledAt(id: string, scheduledAt: Date): Promise<void> {
  await db.update(newsletters).set({ scheduledAt }).where(eq(newsletters.id, id));
}

/** Back to an editable draft once its campaign is stopped. A test of the same version still counts. */
export async function returnToDraft(id: string, email: string): Promise<void> {
  await db
    .update(newsletters)
    .set({
      state: "draft",
      brevoCampaignId: null,
      scheduledAt: null,
      submittedBy: null,
      submittedAt: null,
      slug: null,
      updatedBy: email,
      updatedAt: new Date(),
    })
    .where(eq(newsletters.id, id));
}

/** Turns the issue's web page on or off. Returns the row as it now is, or null when there is no such newsletter. */
export async function setPublishOnWeb(id: string, publishOnWeb: boolean): Promise<NewsletterRow | null> {
  const [row] = await db.update(newsletters).set({ publishOnWeb }).where(eq(newsletters.id, id)).returning();
  return row ?? null;
}

/**
 * Records when Brevo sent the newsletter, the first time anyone sees it sent. Returns true only
 * for the caller that recorded it, so the issue going public is announced once.
 */
export async function recordSent(id: string, sentAt: Date): Promise<boolean> {
  const rows = await db
    .update(newsletters)
    .set({ sentAt })
    .where(and(eq(newsletters.id, id), eq(newsletters.state, "submitted"), isNull(newsletters.sentAt)))
    .returning({ id: newsletters.id });
  return rows.length > 0;
}

/** An issue that has, or is about to have, a public page: handed to Brevo, with the web page on. */
export type WebIssueRow = Pick<NewsletterRow, "id" | "slug" | "subject" | "previewText" | "brevoCampaignId" | "scheduledAt" | "sentAt">;

/** Every issue handed to Brevo with its web page on, sent or not yet; the caller decides which are public. */
export async function listWebIssues(): Promise<WebIssueRow[]> {
  return db
    .select({
      id: newsletters.id,
      slug: newsletters.slug,
      subject: newsletters.subject,
      previewText: newsletters.previewText,
      brevoCampaignId: newsletters.brevoCampaignId,
      scheduledAt: newsletters.scheduledAt,
      sentAt: newsletters.sentAt,
    })
    .from(newsletters)
    .where(and(eq(newsletters.state, "submitted"), eq(newsletters.publishOnWeb, true), isNotNull(newsletters.slug)))
    .orderBy(desc(newsletters.scheduledAt));
}

/** The body of the issue at `slug`, if it has its web page on. */
export async function getWebIssueBody(slug: string): Promise<string | null> {
  const [row] = await db
    .select({ body: newsletters.body })
    .from(newsletters)
    .where(and(eq(newsletters.slug, slug), eq(newsletters.state, "submitted"), eq(newsletters.publishOnWeb, true)));
  return row?.body ?? null;
}
