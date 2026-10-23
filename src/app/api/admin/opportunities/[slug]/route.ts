import { NextResponse } from "next/server";
import { requireOpportunities } from "@/lib/admin-guard";
import { opportunitiesGitHub, publishResponse, PUBLISHING_NOT_SET_UP } from "@/lib/opportunities-github";
import { opportunityFieldsFromBody } from "@/opportunities/form-fields";
import { deleteOpportunity, updateOpportunity } from "@/opportunities/github-publish";

type Params = { params: Promise<{ slug: string }> };

/**
 * Edits an existing opportunity. The form resends every field; the slug (and file path) never
 * changes. Whether the listing still exists is checked against GitHub `main` itself, inside
 * `updateOpportunity` - never against this server's own possibly-stale local read of
 * `content/opportunities/`, which can lag a few minutes behind a just-merged pull request.
 */
export async function PATCH(request: Request, { params }: Params) {
  const session = await requireOpportunities(request);
  if (session instanceof NextResponse) return session;
  const { slug } = await params;

  const body = await request.json().catch(() => ({}));
  const parsed = opportunityFieldsFromBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const github = opportunitiesGitHub();
  if (!github) return NextResponse.json({ error: PUBLISHING_NOT_SET_UP }, { status: 503 });

  const result = await updateOpportunity(github, { slug, opportunity: parsed.fields, editorName: session.name, now: new Date() });
  return publishResponse(result);
}

/** Opens a pull request that removes the listing's file. */
export async function DELETE(request: Request, { params }: Params) {
  const session = await requireOpportunities(request);
  if (session instanceof NextResponse) return session;
  const { slug } = await params;

  const github = opportunitiesGitHub();
  if (!github) return NextResponse.json({ error: PUBLISHING_NOT_SET_UP }, { status: 503 });

  const result = await deleteOpportunity(github, { slug, editorName: session.name, now: new Date() });
  return publishResponse(result);
}
