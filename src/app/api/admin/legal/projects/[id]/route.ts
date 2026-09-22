import { NextResponse } from "next/server";
import { requireLegalTeam } from "@/lib/admin-guard";
import { NotFoundError, updateProject } from "@/lib/legal-flow";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireLegalTeam(request);
  if (session instanceof NextResponse) return session;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  const patch: Parameters<typeof updateProject>[1] = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.description === "string" || body.description === null)
    patch.description = body.description;
  if (typeof body.ownerEmail === "string" || body.ownerEmail === null)
    patch.ownerEmail = body.ownerEmail;
  if (typeof body.status === "string") patch.status = body.status;
  if (typeof body.plannedStart === "string" || body.plannedStart === null)
    patch.plannedStart = body.plannedStart;
  if (typeof body.plannedEnd === "string" || body.plannedEnd === null)
    patch.plannedEnd = body.plannedEnd;
  if (typeof body.actualStart === "string" || body.actualStart === null)
    patch.actualStart = body.actualStart;
  if (typeof body.actualEnd === "string" || body.actualEnd === null)
    patch.actualEnd = body.actualEnd;

  try {
    const project = await updateProject(id, patch, session.email);
    return NextResponse.json(project);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}
