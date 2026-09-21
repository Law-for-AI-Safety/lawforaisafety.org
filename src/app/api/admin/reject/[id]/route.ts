import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  AlreadyReviewedError,
  NotFoundError,
  NotificationFailedError,
  rejectApplication,
} from "@/lib/admin-flow";

const MAX_REVIEWER_NOTES_LENGTH = 2000;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    reviewerNotes?: string;
  };
  const reviewerNotes =
    typeof body.reviewerNotes === "string"
      ? body.reviewerNotes.trim().slice(0, MAX_REVIEWER_NOTES_LENGTH) || null
      : null;

  try {
    await rejectApplication(id, session.email, reviewerNotes);
    return NextResponse.json({ ok: true });
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
