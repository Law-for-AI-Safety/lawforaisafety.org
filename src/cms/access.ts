import { isAdminEmailAllowed, isTechAdminEmail } from "../lib/session";

/**
 * Who may do what in the CMS. Superadmins are the technical admins (`TECH_ADMIN_EMAILS`) and
 * may do everything. Anyone else needs a permission stored in `cms_roles`: `draft` (edit and
 * preview) or `publish` (that, plus publishing). Nobody has either by default, and everyone
 * must also be in `ADMIN_EMAILS`.
 *
 * This decides from a stored permission; `src/lib/cms-access.ts` reads it from the database
 * on every request, so a removed permission stops working on the next one.
 */

export const CMS_PERMISSIONS = ["draft", "publish"] as const;
export type CmsPermission = (typeof CMS_PERMISSIONS)[number];

export type CmsAccess = "none" | CmsPermission | "superadmin";
export type CmsAbility = "edit" | "publish" | "manageRoles";

const ALLOWED: Record<CmsAbility, readonly CmsAccess[]> = {
  edit: ["draft", "publish", "superadmin"],
  publish: ["publish", "superadmin"],
  manageRoles: ["superadmin"],
};

export function resolveCmsAccess(email: string, stored: CmsPermission | null): CmsAccess {
  if (!isAdminEmailAllowed(email)) return "none";
  if (isTechAdminEmail(email)) return "superadmin";
  return stored ?? "none";
}

export function cmsCan(access: CmsAccess, ability: CmsAbility): boolean {
  return ALLOWED[ability].includes(access);
}

export function isCmsPermission(value: unknown): value is CmsPermission {
  return CMS_PERMISSIONS.includes(value as CmsPermission);
}
