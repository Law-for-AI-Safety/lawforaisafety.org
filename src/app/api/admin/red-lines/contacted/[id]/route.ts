import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  NotFoundError,
  markRedLinesApplicationContacted,
} from "@/lib/red-lines-admin-flow";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;

  const { id } = await context.params;

  try {
    const result = await markRedLinesApplicationContacted(id, session.email);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json(
        { error: "Not found, or not yet approved/rejected" },
        { status: 404 },
      );
    }
    throw err;
  }
}
