import Link from "next/link";
import { getAdminSession } from "@/lib/session";
import { listPeople } from "@/lib/admin-people";
import NewProjectForm from "./NewProjectForm";

export default async function NewProjectPage() {
  const [people, session] = await Promise.all([listPeople(), getAdminSession()]);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <Link href="/admin/task-tracker/projects" className="w-fit underline">
        ← All projects
      </Link>
      <h1 className="font-sans text-3xl text-brand-black">New project</h1>
      <NewProjectForm
        people={people}
        currentUser={{ email: session?.email ?? "", name: session?.name ?? "" }}
      />
    </main>
  );
}
