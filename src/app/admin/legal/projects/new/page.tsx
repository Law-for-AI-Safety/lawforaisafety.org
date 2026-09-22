import NewProjectForm from "./NewProjectForm";

export default function NewProjectPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="font-sans text-3xl text-brand-black">New project</h1>
      <NewProjectForm />
    </main>
  );
}
