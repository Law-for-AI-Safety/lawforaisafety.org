import NewTaskForm from "./NewTaskForm";

export default async function NewTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="font-sans text-3xl text-brand-black">New task</h1>
      <NewTaskForm projectId={id} />
    </main>
  );
}
