import { NextResponse } from "next/server";
import { requireOpportunities } from "@/lib/admin-guard";
import { deleteOpportunity, NotFoundError, updateOpportunity, ValidationError } from "@/lib/opportunities-flow";
import { opportunityFieldsFromBody } from "@/opportunities/form-fields";

type Params = { params: Promise<{ slug: string }> };

const NOT_FOUND = { error: "There is no such listing on the live site." };

/** Edits an existing opportunity, live immediately. The form resends every field; the slug never changes. */
export async function PATCH(request: Request, { params }: Params) {
  const session = await requireOpportunities(request);
  if (session instanceof NextResponse) return session;
  const { slug } = await params;

  const body = await request.json().catch(() => ({}));
  const parsed = opportunityFieldsFromBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const opportunity = await updateOpportunity(slug, parsed.fields, session.email);
    return NextResponse.json(opportunity);
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json(NOT_FOUND, { status: 404 });
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

/** Removes the listing. */
export async function DELETE(request: Request, { params }: Params) {
  const session = await requireOpportunities(request);
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
