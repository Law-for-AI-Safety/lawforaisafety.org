import { NextResponse } from "next/server";
import {
  getAdminSession,
  isTechAdminEmail,
  type AdminSessionPayload,
} from "@/lib/session";

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

  const allowed = new Set([new URL(request.url).origin]);
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
