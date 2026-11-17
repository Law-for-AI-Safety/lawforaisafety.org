import { redirect } from "next/navigation";
import { countPendingSubmissions } from "@/lib/opportunity-submission-flow";
import { countDraftOpportunities } from "@/opportunities/data";
import { getAdminSession, isOpportunitiesTeamEmail } from "@/lib/session";
import { withAdminShell } from "../AdminShell";
import AdminTabs from "../AdminTabs";

export default async function OpportunitiesLayout({ children }: { children: React.ReactNode }) {
  // The counts are only shown once the session checks pass; fetching all at once saves round trips.
  const [session, pending, drafts] = await Promise.all([getAdminSession(), countPendingSubmissions(), countDraftOpportunities()]);
  if (!session) {
    redirect("/admin/login");
  }
  if (!isOpportunitiesTeamEmail(session.email)) {
    redirect("/admin");
  }

  return withAdminShell(
    <>
      <AdminTabs
        label="Opportunities"
        tabs={[
          { href: "/admin/opportunities", label: "Listings" },
          { href: "/admin/opportunities/new", label: "New opportunity" },
          { href: "/admin/opportunities/submissions", label: "Submissions", count: { value: pending, label: "to review" } },
          ...(drafts > 0 ? [{ href: "/admin/opportunities#drafts", label: "Drafts", count: { value: drafts, label: "to publish" } }] : []),
        ]}
      />
      <div className="flex-1">{children}</div>
    </>,
  );
}
