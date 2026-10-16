import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cmsRoles } from "@/drizzle/schema";
import { getAdminSession } from "@/lib/session";
import { cmsCan, resolveCmsAccess, type CmsAbility, type CmsAccess, type CmsPermission } from "@/cms/access";

/**
 * The one permission check for the CMS: every CMS server action, page and route calls
 * `requireCms`. It reads the session and the person's stored permission from the database on
 * each call, with no cache, so a removed permission stops working on the next request.
 */

export type CmsActor = { email: string; name: string; access: CmsAccess };

export type CmsDenied = {
  ok: false;
  reason: "signed_out" | "forbidden";
  message: string;
};

export async function getStoredCmsPermission(email: string): Promise<CmsPermission | null> {
  const [row] = await db
    .select({ permission: cmsRoles.permission })
    .from(cmsRoles)
    .where(eq(cmsRoles.email, email.toLowerCase()));
  return row?.permission ?? null;
}

/** The signed-in person and their CMS access, or null when nobody is signed in. */
export async function getCmsActor(): Promise<CmsActor | null> {
  const session = await getAdminSession();
  if (!session) return null;
  const access = resolveCmsAccess(session.email, await getStoredCmsPermission(session.email));
  return { email: session.email, name: session.name, access };
}

export async function requireCms(ability: CmsAbility): Promise<({ ok: true } & CmsActor) | CmsDenied> {
  const actor = await getCmsActor();
  if (!actor) {
    return { ok: false, reason: "signed_out", message: "You are signed out. Sign in again in a new tab, then retry." };
  }
  if (!cmsCan(actor.access, ability)) {
    return { ok: false, reason: "forbidden", message: "You do not have permission to do this." };
  }
  return { ok: true, ...actor };
}
