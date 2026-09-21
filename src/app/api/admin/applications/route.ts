import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { applications } from "@/drizzle/schema";

export async function GET(request: Request) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;

  const pending = await db
    .select()
    .from(applications)
    .where(eq(applications.status, "pending"))
    .orderBy(asc(applications.createdAt));

  return NextResponse.json(pending);
}
