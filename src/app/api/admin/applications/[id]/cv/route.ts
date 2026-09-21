import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { applications } from "@/drizzle/schema";
import { getCv } from "@/lib/cv-storage";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

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

  // The bytes are attacker-supplied. The admin page draws them to a canvas
  // with pdf.js and never navigates here, so everything below is for the
  // case where someone opens this URL directly: download rather than render,
  // no sniffing to another type, no scripting or same-origin access if it is
  // rendered anyway, and no copy left in a shared cache.
  return new Response(blob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="cv.pdf"',
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
    },
  });
}
