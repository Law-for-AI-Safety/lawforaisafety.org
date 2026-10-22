import { NextResponse } from "next/server";
import { requireOpportunities } from "@/lib/admin-guard";
import { opportunitiesGitHub, publishResponse, PUBLISHING_NOT_SET_UP } from "@/lib/opportunities-github";
import { getOpportunities } from "@/opportunities/data";
import { opportunityFieldsFromBody } from "@/opportunities/form-fields";
import { createOpportunity } from "@/opportunities/github-publish";
import { slugify, uniqueSlug } from "@/opportunities/slug";
import type { Opportunity } from "@/opportunities/types";

/** Creates a brand-new opportunity, with its slug computed server-side from org and title. */
export async function POST(request: Request) {
  const session = await requireOpportunities(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => ({}));
  const parsed = opportunityFieldsFromBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const github = opportunitiesGitHub();
  if (!github) return NextResponse.json({ error: PUBLISHING_NOT_SET_UP }, { status: 503 });

  const existingSlugs = new Set(getOpportunities().map((o) => o.slug));
  const slug = uniqueSlug(slugify(`${parsed.fields.org} ${parsed.fields.title}`), existingSlugs);

  const opportunity: Opportunity = { slug, ...parsed.fields, publishedAt: new Date().toISOString().slice(0, 10) };

  const result = await createOpportunity(github, { opportunity, editorName: session.name, now: new Date() });
  return publishResponse(result);
}
