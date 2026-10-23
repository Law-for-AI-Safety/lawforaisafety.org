import { NextResponse } from "next/server";
import { requireOpportunities } from "@/lib/admin-guard";
import { createOpportunity, ValidationError } from "@/lib/opportunities-flow";
import { opportunityFieldsFromBody } from "@/opportunities/form-fields";

/** Creates a brand-new opportunity, live immediately, with its slug computed server-side from org and title. */
export async function POST(request: Request) {
  const session = await requireOpportunities(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => ({}));
  const parsed = opportunityFieldsFromBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const opportunity = await createOpportunity(parsed.fields, session.email);
    return NextResponse.json(opportunity);
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
