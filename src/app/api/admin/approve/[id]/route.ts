import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  AlreadyReviewedError,
  NotFoundError,
  NotificationFailedError,
  approveApplication,
} from "@/lib/admin-flow";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;

  const { id } = await context.params;

  try {
    const result = await approveApplication(id, session.email);
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
    if (err instanceof NotificationFailedError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}
