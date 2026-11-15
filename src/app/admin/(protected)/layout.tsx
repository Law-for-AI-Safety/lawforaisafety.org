import { withAdminShell } from "../AdminShell";

/** Collaboration and Red Lines review, the dashboard and the technical admins' tools. */
export default function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  return withAdminShell(children);
}
