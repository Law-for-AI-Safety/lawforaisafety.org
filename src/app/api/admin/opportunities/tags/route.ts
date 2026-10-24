import { NextResponse } from "next/server";
import { requireOpportunities } from "@/lib/admin-guard";
import { getOpportunityTags } from "@/opportunities/data";

/** Every tag already in use, for the admin form's typeahead. */
export async function GET(request: Request) {
  const session = await requireOpportunities(request);
  if (session instanceof NextResponse) return session;

  return NextResponse.json(await getOpportunityTags());
}
