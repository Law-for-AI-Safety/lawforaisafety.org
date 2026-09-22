import { NextResponse } from "next/server";
import { requireLegalTeam } from "@/lib/admin-guard";
import { NotFoundError, ValidationError, updateTask } from "@/lib/legal-flow";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireLegalTeam(request);
  if (session instanceof NextResponse) return session;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  const patch: Parameters<typeof updateTask>[1] = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.description === "string" || body.description === null)
    patch.description = body.description;
  if (Array.isArray(body.resourceLinks)) {
    patch.resourceLinks = body.resourceLinks.filter(
      (link: unknown): link is string => typeof link === "string",
    );
  }
  if (typeof body.assigneeEmail === "string" || body.assigneeEmail === null)
    patch.assigneeEmail = body.assigneeEmail;
  if (typeof body.status === "string") patch.status = body.status;
  if (typeof body.blockedReason === "string" || body.blockedReason === null)
    patch.blockedReason = body.blockedReason;
  if (typeof body.plannedStart === "string" || body.plannedStart === null)
    patch.plannedStart = body.plannedStart;
  if (typeof body.plannedEnd === "string" || body.plannedEnd === null)
    patch.plannedEnd = body.plannedEnd;
  if (typeof body.actualStart === "string" || body.actualStart === null)
    patch.actualStart = body.actualStart;
  if (typeof body.actualEnd === "string" || body.actualEnd === null)
    patch.actualEnd = body.actualEnd;
  if (typeof body.notes === "string" || body.notes === null)
    patch.notes = body.notes;
  if (Array.isArray(body.dependsOnTaskIds)) {
    patch.dependsOnTaskIds = body.dependsOnTaskIds.filter(
      (dependsOnId: unknown): dependsOnId is string => typeof dependsOnId === "string",
    );
  }

  try {
    const task = await updateTask(id, patch, session.email);
    return NextResponse.json(task);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
