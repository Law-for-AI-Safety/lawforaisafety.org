import { NextResponse } from "next/server";
import { requireTaskTracker } from "@/lib/admin-guard";
import { NotFoundError, ValidationError, rescheduleDependents } from "@/lib/task-tracker-flow";

type Change = { id: string; plannedStart: string; plannedEnd: string | null };

function isChange(value: unknown): value is Change {
  if (!value || typeof value !== "object") return false;
  const change = value as Record<string, unknown>;
  return (
    typeof change.id === "string" &&
    typeof change.plannedStart === "string" &&
    (typeof change.plannedEnd === "string" || change.plannedEnd === null)
  );
}

/** Applies a confirmed "reschedule the tasks waiting on this one" proposal. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireTaskTracker(request);
  if (session instanceof NextResponse) return session;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.changes) || !body.changes.every(isChange)) {
    return NextResponse.json({ error: "Nothing to reschedule" }, { status: 400 });
  }

  try {
    const count = await rescheduleDependents(id, body.changes, session.email);
    return NextResponse.json({ count });
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
