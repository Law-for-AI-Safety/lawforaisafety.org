import { NextResponse } from "next/server";
import { requireOpportunitiesOrApiKey } from "@/lib/admin-guard";
import {
  AlreadyPublishedError,
  deleteOpportunity,
  NotFoundError,
  publishOpportunity,
  updateOpportunity,
  ValidationError,
} from "@/lib/opportunities-flow";
import {
  bodyOverExisting,
  hasOpportunityFields,
  opportunityFieldsFromBody,
  type ParsedOpportunityBody,
  readJsonObject,
  statusFromBody,
} from "@/opportunities/form-fields";
import { getOpportunityBySlug } from "@/opportunities/data";

type Params = { params: Promise<{ slug: string }> };

const NOT_FOUND = { error: "There is no such listing." };
const NOT_AN_OBJECT = "The body must be a JSON object.";

/** A single listing, by slug, draft or published — lets an ingestion script check for an existing match before upserting. */
export async function GET(request: Request, { params }: Params) {
  const session = await requireOpportunitiesOrApiKey(request);
  if (session instanceof NextResponse) return session;
  const { slug } = await params;

  const opportunity = await getOpportunityBySlug(slug);
  if (!opportunity) return NextResponse.json(NOT_FOUND, { status: 404 });
  return NextResponse.json(opportunity);
}

/**
 * Edits an existing opportunity; an edit to a published one is live immediately. Fields left out
 * keep their values and null or blank clears one (see `bodyOverExisting`), so a script can send
 * only what changes; the admin form sends every field. The slug never changes. `"status": "published"` publishes a draft, dated
 * today: with no fields it publishes without editing, alongside them it saves and publishes
 * in one write.
 * A published listing can't go back to being a draft.
 */
export async function PATCH(request: Request, { params }: Params) {
  const session = await requireOpportunitiesOrApiKey(request);
  if (session instanceof NextResponse) return session;
  const { slug } = await params;

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: NOT_AN_OBJECT }, { status: 400 });
  const status = statusFromBody(body);
  if (!status.ok) return NextResponse.json({ error: status.error }, { status: 400 });
  const publish = status.status === "published";
  // With no editable fields (say `{"status": "published", "slug": ...}`), it only publishes.
  let parsed: ParsedOpportunityBody | null = null;
  if (!publish || hasOpportunityFields(body)) {
    const existing = await getOpportunityBySlug(slug);
    if (!existing) return NextResponse.json(NOT_FOUND, { status: 404 });
    parsed = opportunityFieldsFromBody(bodyOverExisting(existing, body));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const opportunity = parsed
      ? await updateOpportunity(slug, parsed.fields, session.email, status.status)
      : await publishOpportunity(slug, session.email);
    return NextResponse.json(opportunity);
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json(NOT_FOUND, { status: 404 });
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    // Resending a draft's own `"status": "draft"` (say, from a GET) is fine; unpublishing isn't.
    if (err instanceof AlreadyPublishedError) {
      return NextResponse.json({ error: "A published listing can't be made a draft again." }, { status: 400 });
    }
    throw err;
  }
}

/** Removes the listing. */
export async function DELETE(request: Request, { params }: Params) {
  const session = await requireOpportunitiesOrApiKey(request);
  if (session instanceof NextResponse) return session;
  const { slug } = await params;

  try {
    const opportunity = await deleteOpportunity(slug, session.email);
    return NextResponse.json(opportunity);
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json(NOT_FOUND, { status: 404 });
    throw err;
  }
}
