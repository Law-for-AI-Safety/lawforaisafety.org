import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getAdminSession } from "@/lib/session";
import { db } from "@/lib/db";
import { applications } from "@/drizzle/schema";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await db
    .select()
    .from(applications)
    .where(eq(applications.status, "pending"))
    .orderBy(asc(applications.createdAt));

  return NextResponse.json(pending);
}
