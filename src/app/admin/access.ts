import { cmsCan } from "@/cms/access";
import { getCmsActor } from "@/lib/cms-access";
import { isOpportunitiesTeamEmail, isTaskTrackerTeamEmail, isTechAdminEmail } from "@/lib/session";
import type { AdminAccess } from "./nav";

/**
 * What `email` may open in the admin, by the same checks each area makes on its own pages.
 * Only decides which links and cards to show: a failure to read CMS access (say, cms_roles not
 * migrated yet) hides the Website pages link and leaves the rest of the admin working.
 */
export async function getAdminAccess(email: string): Promise<AdminAccess> {
  const cms = await getCmsActor().catch((err) => {
    console.error("[admin] Could not read CMS access for the nav", err);
    return null;
  });
  return {
    tech: isTechAdminEmail(email),
    tracker: isTaskTrackerTeamEmail(email),
    opportunities: isOpportunitiesTeamEmail(email),
    cmsEdit: cms !== null && cmsCan(cms.access, "edit"),
  };
}
