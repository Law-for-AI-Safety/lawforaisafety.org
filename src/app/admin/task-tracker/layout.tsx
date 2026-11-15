import { redirect } from "next/navigation";
import { getAdminSession, isTaskTrackerTeamEmail } from "@/lib/session";
import { withAdminShell } from "../AdminShell";
import AdminTabs from "../AdminTabs";

export default async function TaskTrackerLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  if (!isTaskTrackerTeamEmail(session.email)) {
    redirect("/admin");
  }

  return withAdminShell(
    <>
      <AdminTabs
        label="Projects"
        tabs={[
          { href: "/admin/task-tracker", label: "Your work" },
          { href: "/admin/task-tracker/projects", label: "All projects" },
        ]}
      />
      <div className="flex-1">{children}</div>
    </>,
  );
}
