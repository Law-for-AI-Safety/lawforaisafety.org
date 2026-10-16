import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/admin-guard";
import { endAdminSession } from "@/lib/session";
import { seeOther } from "@/lib/redirect";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await endAdminSession();
  return seeOther("/admin/login");
}
