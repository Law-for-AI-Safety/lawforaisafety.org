import { NextResponse } from "next/server";
import { requireLegalTeam } from "@/lib/admin-guard";
import { createProject } from "@/lib/legal-flow";

export async function POST(request: Request) {
  const session = await requireLegalTeam(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const project = await createProject({
    name,
    description: typeof body.description === "string" ? body.description : null,
    ownerEmail: typeof body.ownerEmail === "string" ? body.ownerEmail : null,
    plannedStart: typeof body.plannedStart === "string" ? body.plannedStart : null,
    plannedEnd: typeof body.plannedEnd === "string" ? body.plannedEnd : null,
    createdBy: session.email,
  });

  return NextResponse.json(project);
}
