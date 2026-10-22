import { NextResponse } from "next/server";
import { gitHubClientFor, type GitHubClient } from "@/cms/github";
import { gitHubSetup } from "@/cms/github-config";
import type { PublishResult } from "@/opportunities/github-publish";

/** The GitHub client for the opportunities board, or null when publishing is not set up. Shares the CMS's GitHub App. */
export function opportunitiesGitHub(): GitHubClient | null {
  const setup = gitHubSetup();
  return setup.ok ? gitHubClientFor(setup.config) : null;
}

export const PUBLISHING_NOT_SET_UP = "GitHub publishing is not set up on this site yet.";

/** Turns a `github-publish.ts` result into the admin routes' JSON response. */
export function publishResponse(result: PublishResult): NextResponse {
  if (result.ok) return NextResponse.json({ number: result.number, url: result.url, branch: result.branch });
  switch (result.reason) {
    case "invalid":
      return NextResponse.json({ error: "The listing is not valid.", problems: result.problems }, { status: 400 });
    case "exists":
      return NextResponse.json({ error: "A listing with that slug already exists." }, { status: 409 });
    case "missing":
      return NextResponse.json({ error: "There is no such listing on the live site." }, { status: 404 });
    case "corrupt":
      console.error(`[opportunities] ${result.path} on main is not a valid listing: ${result.message}`);
      return NextResponse.json({ error: "This listing's file on the live site isn't valid - it can't be edited automatically. Fix it by hand in a pull request." }, { status: 500 });
    case "nothing":
      return NextResponse.json({ error: "Nothing has changed." }, { status: 400 });
    case "github":
      console.error(`[opportunities] GitHub refused at step "${result.step}": ${result.message}`, result.leftBranch ? `(left branch ${result.leftBranch})` : "");
      return NextResponse.json({ error: "GitHub did not accept this change. Try again in a few minutes." }, { status: 502 });
  }
}
