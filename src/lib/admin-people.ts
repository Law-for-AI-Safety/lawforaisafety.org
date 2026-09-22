import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminPeople } from "@/drizzle/schema";

export type Person = { email: string; name: string };

/**
 * Remembers the display name from the OAuth profile so other people can pick
 * this person by name later. Emails are stored lower-cased — they're the key
 * assignments are matched on, and providers aren't consistent about case.
 *
 * Never blocks a login: a failure here costs a name in a dropdown, and
 * throwing would lock someone out of the whole admin panel.
 */
export async function rememberPerson(email: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    await db
      .insert(adminPeople)
      .values({ email: email.toLowerCase(), name: trimmed })
      .onConflictDoUpdate({
        target: adminPeople.email,
        set: { name: trimmed, lastSeenAt: sql`now()` },
      });
  } catch (err) {
    console.warn("[admin-people] Could not record display name", err);
  }
}

export async function listPeople(): Promise<Person[]> {
  return db
    .select({ email: adminPeople.email, name: adminPeople.name })
    .from(adminPeople)
    .orderBy(asc(adminPeople.name));
}

export async function getPersonName(email: string): Promise<string | null> {
  const [row] = await db
    .select({ name: adminPeople.name })
    .from(adminPeople)
    .where(eq(adminPeople.email, email.toLowerCase()));
  return row?.name ?? null;
}
