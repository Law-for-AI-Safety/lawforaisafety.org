import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/session";
import {
  AlreadyReviewedError,
  NotFoundError,
  approveApplication,
} from "@/lib/admin-flow";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    throw err;
  }
}
