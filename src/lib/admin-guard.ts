import { NextResponse } from "next/server";
import {
  getAdminSession,
  isTechAdminEmail,
  isTaskTrackerTeamEmail,
  isOpportunitiesTeamEmail,
  type AdminSessionPayload,
} from "@/lib/session";
import { hasBearerSecret } from "@/lib/timing-safe-equal";

/**
 * A browser attaches `Origin` to every cross-origin POST, and to same-origin
 * ones too. If it's there and it isn't us, the request was started by another
 * site. The session cookie's SameSite=Lax already blocks that, but Lax trusts
 * the whole registrable domain, so this is the check that doesn't depend on
 * every future subdomain being trustworthy. Absent header = non-browser
 * client, which has no ambient cookie to abuse.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  // Not `request.url`: on Netlify that is the deploy's internal address, not
  // the one the browser used. The Host header is — and a cross-site attacker
  // can't choose it, the victim's browser sets it to wherever the request goes.
  const allowed = new Set<string>();
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`); // local dev
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) allowed.add(new URL(siteUrl).origin);
  return allowed.has(origin);
}

/** Session + origin check for admin API routes. Returns the session, or the response to send back. */
export async function requireAdmin(
  request: Request,
): Promise<AdminSessionPayload | NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

/** As requireAdmin, but for routes only a technical admin may use (erasure, settings). */
export async function requireTechAdmin(
  request: Request,
): Promise<AdminSessionPayload | NextResponse> {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;
  if (!isTechAdminEmail(session.email)) {
    return NextResponse.json(
      { error: "This action is restricted to technical admins" },
      { status: 403 },
    );
  }
  return session;
}

/** As requireAdmin, but only when `allowed` passes; `deniedMessage` is sent back with it otherwise. */
async function requireTeam(
  request: Request,
  allowed: (email: string) => boolean,
  deniedMessage: string,
): Promise<AdminSessionPayload | NextResponse> {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;
  if (!allowed(session.email)) {
    return NextResponse.json({ error: deniedMessage }, { status: 403 });
  }
  return session;
}

/** As requireAdmin, but for the task tracker team. */
export async function requireTaskTracker(
  request: Request,
): Promise<AdminSessionPayload | NextResponse> {
  return requireTeam(request, isTaskTrackerTeamEmail, "This action is restricted to the task tracker team");
}

/** As requireAdmin, but for the opportunities board team. */
export async function requireOpportunities(
  request: Request,
): Promise<AdminSessionPayload | NextResponse> {
  return requireTeam(request, isOpportunitiesTeamEmail, "This action is restricted to the opportunities board team");
}

const OPPORTUNITIES_API_ACTOR: AdminSessionPayload = { email: "ingestion@api", name: "Automated ingestion" };

/**
 * As requireOpportunities, but also accepts a bearer OPPORTUNITIES_API_KEY (same shared-secret
 * shape as `/api/cron/sweep`), so a non-browser client with no session cookie can authenticate.
 */
export async function requireOpportunitiesOrApiKey(
  request: Request,
): Promise<AdminSessionPayload | NextResponse> {
  if (hasBearerSecret(request, process.env.OPPORTUNITIES_API_KEY)) return OPPORTUNITIES_API_ACTOR;
  return requireOpportunities(request);
}
