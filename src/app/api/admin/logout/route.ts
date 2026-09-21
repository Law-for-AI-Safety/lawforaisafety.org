import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/admin-guard";
import { clearAdminSessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await clearAdminSessionCookie();
  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}
