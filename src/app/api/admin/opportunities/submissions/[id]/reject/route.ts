import { NextResponse } from "next/server";
import { requireOpportunities } from "@/lib/admin-guard";
import {
  rejectSubmission,
  SubmissionNotFoundError,
  SubmissionValidationError,
} from "@/lib/opportunity-submission-flow";

type Params = { params: Promise<{ id: string }> };

/** Rejects a pending submission; `notify` emails the submitter, with `reason` if one is given. */
export async function POST(request: Request, { params }: Params) {
  const session = await requireOpportunities(request);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const notify = body.notify === true;
  const reason = typeof body.reason === "string" ? body.reason : null;

  try {
    return NextResponse.json({ id, ...(await rejectSubmission(id, session.email, { notify, reason })) });
  } catch (err) {
    if (err instanceof SubmissionNotFoundError) {
      return NextResponse.json({ error: "That submission has already been dealt with, or doesn't exist." }, { status: 409 });
    }
    if (err instanceof SubmissionValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
