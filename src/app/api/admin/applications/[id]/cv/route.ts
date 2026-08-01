import { eq } from "drizzle-orm";
import { getAdminSession } from "@/lib/session";
import { db } from "@/lib/db";
import { applications } from "@/drizzle/schema";
import { getCv } from "@/lib/cv-storage";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  const [application] = await db
    .select({ cvBlobKey: applications.cvBlobKey })
    .from(applications)
    .where(eq(applications.id, id));

  if (!application?.cvBlobKey) {
    return new Response("Not found", { status: 404 });
  }

  const blob = await getCv(application.cvBlobKey);
  if (!blob) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(blob, {
    headers: { "Content-Type": "application/pdf" },
  });
}
