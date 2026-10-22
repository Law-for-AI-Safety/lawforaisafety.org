import { NextResponse } from "next/server";
import { requireOpportunities } from "@/lib/admin-guard";
import { opportunitiesGitHub, publishResponse, PUBLISHING_NOT_SET_UP } from "@/lib/opportunities-github";
import { getOpportunities } from "@/opportunities/data";
import { createOpportunity } from "@/opportunities/github-publish";
import { slugify, uniqueSlug } from "@/opportunities/slug";
import type { Opportunity } from "@/opportunities/types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strOrUndefined = (v: unknown) => str(v) || undefined;

/** Creates a brand-new opportunity, with its slug computed server-side from org and title. */
export async function POST(request: Request) {
  const session = await requireOpportunities(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => ({}));
  const title = str(body.title);
  const org = str(body.org);
  const applyUrl = str(body.applyUrl);
  if (!title || !org || !applyUrl) {
    return NextResponse.json({ error: "Title, organisation and apply URL are required" }, { status: 400 });
  }

  const github = opportunitiesGitHub();
  if (!github) return NextResponse.json({ error: PUBLISHING_NOT_SET_UP }, { status: 503 });

  const existingSlugs = new Set(getOpportunities().map((o) => o.slug));
  const slug = uniqueSlug(slugify(`${org} ${title}`), existingSlugs);

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
    publishedAt: new Date().toISOString().slice(0, 10),
  };

  const result = await createOpportunity(github, { opportunity, editorName: session.name, now: new Date() });
  return publishResponse(result);
}
