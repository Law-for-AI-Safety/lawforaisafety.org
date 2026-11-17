import { and, desc, eq, isNotNull, isNull, like, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletters } from "@/drizzle/schema";
import type { NewsletterFields } from "@/newsletter/template";
import { issueSlug } from "@/newsletter/website";

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
export async function writeNewsletter(id: string, fields: NewsletterFields, version: number, email: string): Promise<number | null> {
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

export async function setCampaignId(id: string, campaignId: number | null): Promise<void> {
  await db.update(newsletters).set({ brevoCampaignId: campaignId }).where(eq(newsletters.id, id));
}

/** Records that Brevo has it, scheduled or sent, after a hand-over that this request claimed. */
export async function markSubmitted(id: string, scheduledAt: Date, email: string): Promise<void> {
  await db
    .update(newsletters)
    .set({ state: "submitted", scheduledAt, submittedBy: email, submittedAt: new Date() })
    .where(and(eq(newsletters.id, id), eq(newsletters.state, "submitting")));
}

/**
 * Back to an editable draft after a hand-over Brevo definitely refused. A campaign Brevo created
 * as a draft keeps its id for the retry, unless `clearCampaign` (Brevo no longer has it).
 */
export async function releaseClaim(id: string, { clearCampaign = false } = {}): Promise<void> {
  await db
    .update(newsletters)
    .set({ state: "draft", submittedBy: null, submittedAt: null, ...(clearCampaign ? { brevoCampaignId: null } : {}) })
    .where(and(eq(newsletters.id, id), eq(newsletters.state, "submitting")));
}

/**
 * Claims a newsletter Brevo has, for one change to its campaign (reschedule or cancel). Only one
 * caller can win, so a cancel and a reschedule at once cannot both reach Brevo.
 */
export async function claimSubmitted(id: string): Promise<NewsletterRow | null> {
  const [row] = await db
    .update(newsletters)
    .set({ state: "submitting", submittedAt: new Date() })
    .where(and(eq(newsletters.id, id), eq(newsletters.state, "submitted")))
    .returning();
  return row ?? null;
}

/** Ends a claim from `claimSubmitted`, still handed over, at `scheduledAt` (unchanged when omitted). */
export async function unclaimSubmitted(id: string, scheduledAt?: Date): Promise<void> {
  await db
    .update(newsletters)
    .set({ state: "submitted", ...(scheduledAt ? { scheduledAt } : {}) })
    .where(and(eq(newsletters.id, id), eq(newsletters.state, "submitting")));
}

/** Records Brevo's word that it has gone out, so the list stops asking Brevo about it. */
export async function markSent(id: string, sentAt: Date): Promise<void> {
  await db.update(newsletters).set({ sentAt }).where(eq(newsletters.id, id));
}

/**
 * Back to an editable draft once its campaign is stopped. A test of the same version still counts.
 * One that went out keeps its website address, so the address never passes to another issue;
 * one that never went out frees it, for a later send to take one from its subject.
 */
export async function returnToDraft(id: string, email: string): Promise<void> {
  await db
    .update(newsletters)
    .set({
      state: "draft",
      brevoCampaignId: null,
      scheduledAt: null,
      submittedBy: null,
      submittedAt: null,
      webSlug: sql`CASE WHEN ${newsletters.sentAt} IS NULL THEN NULL ELSE ${newsletters.webSlug} END`,
      sentAt: null,
      updatedBy: email,
      updatedAt: new Date(),
    })
    .where(eq(newsletters.id, id));
}

/** Ticks or unticks the issue for the website. Returns the row as it now is, or null when there is none. */
export async function setWebPublished(id: string, on: boolean): Promise<NewsletterRow | null> {
  const [row] = await db.update(newsletters).set({ webPublished: on }).where(eq(newsletters.id, id)).returning();
  return row ?? null;
}

const isUniqueViolation = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "cause" in e
    ? isUniqueViolation((e as { cause: unknown }).cause)
    : typeof e === "object" && e !== null && (e as { code?: unknown }).code === "23505";

/**
 * Gives a ticked issue that Brevo has its website address, from its subject, if it has none yet.
 * Returns the row as it now is. Two issues racing for one address: the loser tries the next.
 */
export async function ensureWebSlug(id: string): Promise<NewsletterRow | null> {
  for (let attempt = 0; ; attempt++) {
    const current = await getNewsletter(id);
    if (!current || current.webSlug !== null || !current.webPublished || current.state !== "submitted") return current;
    const base = issueSlug(current.subject, new Set());
    const taken = await db.select({ slug: newsletters.webSlug }).from(newsletters).where(like(newsletters.webSlug, `${base}%`));
    const slug = issueSlug(current.subject, new Set(taken.map((t) => t.slug).filter((s) => s !== null)));
    try {
      const [row] = await db
        .update(newsletters)
        .set({ webSlug: slug })
        .where(and(eq(newsletters.id, id), isNull(newsletters.webSlug)))
        .returning();
      return row ?? getNewsletter(id);
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= 4) throw err;
    }
  }
}

/** What the public pages show of an issue on the website, its body aside. */
export type WebsiteIssueRow = { slug: string; subject: string; previewText: string; body: string; sentAt: Date };

const onWebsite = and(
  eq(newsletters.webPublished, true),
  ne(newsletters.state, "draft"),
  isNotNull(newsletters.webSlug),
  isNotNull(newsletters.sentAt),
);

/** The issues on the website (`isOnWebsite` in src/newsletter/website.ts), newest first. */
export async function listWebsiteIssues(): Promise<WebsiteIssueRow[]> {
  // Both are set on every row `onWebsite` matches.
  return db
    .select({
      slug: sql<string>`${newsletters.webSlug}`,
      subject: newsletters.subject,
      previewText: newsletters.previewText,
      body: newsletters.body,
      sentAt: sql<Date>`${newsletters.sentAt}`.mapWith(newsletters.sentAt),
    })
    .from(newsletters)
    .where(onWebsite)
    .orderBy(desc(newsletters.sentAt));
}

/**
 * Ticked issues Brevo was given to send by `now` that it hasn't yet been heard to have sent: the
 * ones to ask Brevo about, so they go up once it has.
 */
export async function listUnconfirmedWebsiteIssues(now: Date): Promise<NewsletterRow[]> {
  return db
    .select()
    .from(newsletters)
    .where(
      and(
        eq(newsletters.webPublished, true),
        eq(newsletters.state, "submitted"),
        isNull(newsletters.sentAt),
        isNotNull(newsletters.brevoCampaignId),
        lte(newsletters.scheduledAt, now),
      ),
    );
}
