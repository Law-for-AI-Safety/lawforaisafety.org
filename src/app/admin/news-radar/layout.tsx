import { withAdminShell } from "../AdminShell";
import AdminTabs from "../AdminTabs";

/** Every admin may use the News radar; Run now and the email recipient check for a technical admin themselves. */
export default function NewsRadarLayout({ children }: { children: React.ReactNode }) {
  return withAdminShell(
    <>
      <AdminTabs
        label="News radar"
        tabs={[
          { href: "/admin/news-radar", label: "Items" },
          { href: "/admin/news-radar/settings", label: "Settings" },
        ]}
      />
      <div className="flex-1">{children}</div>
    </>,
  );
}
