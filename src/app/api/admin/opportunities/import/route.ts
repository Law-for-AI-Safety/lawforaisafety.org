import { NextResponse } from "next/server";
import { requireOpportunities } from "@/lib/admin-guard";
import { opportunitiesGitHub, publishResponse, PUBLISHING_NOT_SET_UP } from "@/lib/opportunities-github";
import { importOpportunity } from "@/opportunities/github-publish";

/** Opens a pull request adding a stub file with just a source URL, for the import workflow (or an admin) to fill in. */
export async function POST(request: Request) {
  const session = await requireOpportunities(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "A URL is required" }, { status: 400 });
  }

  const github = opportunitiesGitHub();
  if (!github) return NextResponse.json({ error: PUBLISHING_NOT_SET_UP }, { status: 503 });

  const result = await importOpportunity(github, { url, editorName: session.name, now: new Date() });
  return publishResponse(result);
}
