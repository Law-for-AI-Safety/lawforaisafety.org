import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireTechAdmin } from "@/lib/admin-guard";
import { setRedLinesApplicationsEnabled } from "@/lib/feature-flags";
import { recordAdminAction } from "@/lib/audit-log";
import { seeOther } from "@/lib/redirect";

/**
 * Turns the Red Lines Dialogues application form on or off, behind the admin
 * session. Mirrors /api/admin/settings/signup for the volunteer flow.
 */
export async function POST(request: Request) {
  const session = await requireTechAdmin(request);
  if (session instanceof NextResponse) return session;

  const formData = await request.formData();
  const enabled = formData.get("enabled");
  if (enabled !== "true" && enabled !== "false") {
    return NextResponse.json({ error: "Invalid value" }, { status: 400 });
  }

  await setRedLinesApplicationsEnabled(enabled === "true", session.email);
  await recordAdminAction({
    actorEmail: session.email,
    action: "red_lines_toggle",
    detail: { enabled: enabled === "true" },
  });
  console.log(
    `[feature-flag] ${session.email} turned Red Lines Dialogues applications ${enabled === "true" ? "on" : "off"}`,
  );

  revalidatePath("/red-lines-dialogue");
  return seeOther(`/admin/settings?redLines=${enabled === "true" ? "on" : "off"}`);
}
