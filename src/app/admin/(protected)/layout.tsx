import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return (
    <>
      <header className="flex items-center justify-between border-b border-brand-black/10 px-4 py-4">
        <span className="text-brand-black/70">Signed in as {session.email}</span>
        <form action="/api/admin/logout" method="post">
          <button type="submit" className="underline">
            Log out
          </button>
        </form>
      </header>
      {children}
    </>
  );
}
