import { NextResponse } from "next/server";
import { requireTaskTracker } from "@/lib/admin-guard";
import { createTask } from "@/lib/task-tracker-flow";

export async function POST(request: Request) {
  const session = await requireTaskTracker(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!projectId || !name) {
    return NextResponse.json(
      { error: "projectId and name are required" },
      { status: 400 },
    );
  }

  const resourceLinks = Array.isArray(body.resourceLinks)
    ? body.resourceLinks.filter((link: unknown) => typeof link === "string")
    : [];

  const task = await createTask({
    projectId,
    name,
    description: typeof body.description === "string" ? body.description : null,
    resourceLinks,
    assigneeEmail: typeof body.assigneeEmail === "string" ? body.assigneeEmail : null,
    plannedStart: typeof body.plannedStart === "string" ? body.plannedStart : null,
    plannedEnd: typeof body.plannedEnd === "string" ? body.plannedEnd : null,
    dependsOnTaskIds: Array.isArray(body.dependsOnTaskIds)
      ? body.dependsOnTaskIds.filter(
          (dependsOnId: unknown): dependsOnId is string => typeof dependsOnId === "string",
        )
      : [],
    createdBy: session.email,
  });

  return NextResponse.json(task);
}
