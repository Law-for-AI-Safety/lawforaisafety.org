import { NextResponse } from "next/server";
import { requireOpportunities } from "@/lib/admin-guard";
import { opportunitiesGitHub, publishResponse, PUBLISHING_NOT_SET_UP } from "@/lib/opportunities-github";
import { getOpportunityBySlug } from "@/opportunities/data";
import { deleteOpportunity, updateOpportunity } from "@/opportunities/github-publish";
import type { Opportunity } from "@/opportunities/types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strOrUndefined = (v: unknown) => str(v) || undefined;

type Params = { params: Promise<{ slug: string }> };

/** Edits an existing opportunity. The form resends every field; the slug (and file path) never changes. */
export async function PATCH(request: Request, { params }: Params) {
  const session = await requireOpportunities(request);
  if (session instanceof NextResponse) return session;
  const { slug } = await params;

  const body = await request.json().catch(() => ({}));
  const title = str(body.title);
  const org = str(body.org);
  const applyUrl = str(body.applyUrl);
  if (!title || !org || !applyUrl) {
    return NextResponse.json({ error: "Title, organisation and apply URL are required" }, { status: 400 });
  }

  const current = getOpportunityBySlug(slug);
  if (!current) return NextResponse.json({ error: "There is no such listing on the live site." }, { status: 404 });

  const github = opportunitiesGitHub();
  if (!github) return NextResponse.json({ error: PUBLISHING_NOT_SET_UP }, { status: 503 });

  const opportunity: Opportunity = {
    slug,
    type: body.type === "course" ? "course" : "job",
    title,
    org,
    orgUrl: strOrUndefined(body.orgUrl),
    summary: str(body.summary),
    description: str(body.description),
    location: str(body.location),
    remote: Boolean(body.remote),
    commitment: strOrUndefined(body.commitment),
    compensation: strOrUndefined(body.compensation),
    deadline: strOrUndefined(body.deadline),
    startDate: strOrUndefined(body.startDate),
    endDate: strOrUndefined(body.endDate),
    tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown): t is string => typeof t === "string" && t.trim() !== "") : undefined,
    applyUrl,
    applyLabel: strOrUndefined(body.applyLabel),
    sourceUrl: strOrUndefined(body.sourceUrl),
    publishedAt: current.publishedAt,
  };

  const result = await updateOpportunity(github, { slug, opportunity, editorName: session.name, now: new Date() });
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
