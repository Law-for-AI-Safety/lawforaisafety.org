import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  AlreadyReviewedError,
  NotFoundError,
  approveRedLinesApplication,
} from "@/lib/red-lines-admin-flow";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;

  const { id } = await context.params;

  try {
    const result = await approveRedLinesApplication(id, session.email);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (err instanceof AlreadyReviewedError) {
      return NextResponse.json(
        { error: "This application has already been reviewed" },
        { status: 409 },
      );
    }
    throw err;
  }
}
