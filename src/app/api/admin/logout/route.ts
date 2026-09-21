import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/admin-guard";
import { clearAdminSessionCookie } from "@/lib/session";
import { seeOther } from "@/lib/redirect";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await clearAdminSessionCookie();
  return seeOther("/admin/login");
}
