import { requireCms, type CmsActor, type CmsDenied } from "@/lib/cms-access";
import { cmsCan, type CmsAccess } from "@/cms/access";

/**
 * Who may do what with the newsletter. It reuses the website editor's permissions rather than
 * adding a role: anyone who may edit page drafts may write, preview and test-send a newsletter;
 * only those who may publish pages (and technical admins) may send it to the list, schedule it,
 * reschedule it or cancel it. Sending to every subscriber is public and cannot be undone, the
 * same kind of act as publishing a page.
 */
export type NewsletterAbility = "write" | "send";

const CMS_ABILITY = { write: "edit", send: "publish" } as const;

export function newsletterCan(access: CmsAccess, ability: NewsletterAbility): boolean {
  return cmsCan(access, CMS_ABILITY[ability]);
}

export async function requireNewsletter(ability: NewsletterAbility): Promise<({ ok: true } & CmsActor) | CmsDenied> {
  return requireCms(CMS_ABILITY[ability]);
}
