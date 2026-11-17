import { withAdminShell } from "../AdminShell";

/** The website editor's frame. Each page checks the visitor's permission itself. */
export default function CmsLayout({ children }: { children: React.ReactNode }) {
  // On wide screens the page fills the space beside the sidebar and scrolls inside it, so the
  // editor's fields and preview can scroll on their own.
  return withAdminShell(<div className="relative flex flex-1 flex-col lg:min-h-0 lg:overflow-y-auto">{children}</div>);
}
