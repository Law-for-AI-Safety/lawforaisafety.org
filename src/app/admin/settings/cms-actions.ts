"use server";

import { z } from "zod";
import { recordAdminAction } from "@/lib/audit-log";
import { getPersonName } from "@/lib/admin-people";
import { getStoredCmsPermission, requireCms } from "@/lib/cms-access";
import { setStoredCmsPermission } from "@/lib/cms-store";

export type SetCmsRoleResult = { ok: true } | { ok: false; message: string };

/**
 * Gives a known admin (one in `admin_people`) no CMS access, draft or publish. Superadmins
 * only; checked here on every call.
 */
export async function setCmsRole(email: unknown, permission: unknown): Promise<SetCmsRoleResult> {
  const actor = await requireCms("manageRoles");
  if (!actor.ok) return { ok: false, message: actor.message };
  const args = z
    .tuple([z.string().max(320), z.enum(["none", "draft", "publish"])])
    .safeParse([email, permission]);
  if (!args.success) return { ok: false, message: "The request was not understood." };
  const [target, chosen] = args.data;

  if ((await getPersonName(target)) === null) {
    return { ok: false, message: "Only people who have signed in to the admin can be given access." };
  }
  const previous = (await getStoredCmsPermission(target)) ?? "none";
  await setStoredCmsPermission(target, chosen === "none" ? null : chosen, actor.email);
  await recordAdminAction({
    actorEmail: actor.email,
    action: "cms_role_change",
    detail: { email: target.toLowerCase(), from: previous, to: chosen },
  });
  return { ok: true };
}
