import { withAdminShell } from "../AdminShell";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return withAdminShell(children);
}
