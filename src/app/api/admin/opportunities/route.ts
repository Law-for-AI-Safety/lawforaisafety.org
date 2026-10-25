import { NextResponse } from "next/server";
import { requireOpportunitiesOrApiKey } from "@/lib/admin-guard";
import { createOpportunity, ValidationError } from "@/lib/opportunities-flow";
import {
  markSubmissionPublished,
  requirePendingSubmission,
  SubmissionNotFoundError,
} from "@/lib/opportunity-submission-flow";
import { opportunityFieldsFromBody } from "@/opportunities/form-fields";
import { getOpportunities } from "@/opportunities/data";

/** Every listing, for the admin UI and for an ingestion script to check what's already there before creating more. */
export async function GET(request: Request) {
  const session = await requireOpportunitiesOrApiKey(request);
  if (session instanceof NextResponse) return session;

  return NextResponse.json(await getOpportunities());
}

/**
 * Creates a brand-new opportunity, live immediately, with its slug computed server-side from org
 * and title. With a `submissionId`, the listing is published from that submission: it must still
 * be pending, and its submitter is emailed the link.
 */
export async function POST(request: Request) {
  const session = await requireOpportunitiesOrApiKey(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => ({}));
  const parsed = opportunityFieldsFromBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const submissionId = typeof body.submissionId === "string" ? body.submissionId : null;
  if (submissionId) {
    try {
      await requirePendingSubmission(submissionId);
    } catch (err) {
      if (err instanceof SubmissionNotFoundError) {
        return NextResponse.json({ error: "That submission has already been dealt with, or doesn't exist." }, { status: 409 });
      }
      throw err;
    }
  }

  try {
    const opportunity = await createOpportunity(parsed.fields, session.email);
    if (submissionId) await markSubmissionPublished(submissionId, opportunity, session.email);
    return NextResponse.json(opportunity);
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
