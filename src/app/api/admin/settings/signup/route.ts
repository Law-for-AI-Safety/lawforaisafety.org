import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireTechAdmin } from "@/lib/admin-guard";
import { setSignupEnabled } from "@/lib/feature-flags";
import { recordAdminAction } from "@/lib/audit-log";

/**
 * Turns public signup (newsletter + apply) on or off, behind the admin session.
 *
 * `enabled` must be exactly "true" or "false". Anything else is rejected
 * rather than defaulted, so a malformed request can't flip the flag.
 */
export async function POST(request: Request) {
  const session = await requireTechAdmin(request);
  if (session instanceof NextResponse) return session;

  const formData = await request.formData();
  const enabled = formData.get("enabled");
  if (enabled !== "true" && enabled !== "false") {
    return NextResponse.json({ error: "Invalid value" }, { status: 400 });
  }

  await setSignupEnabled(enabled === "true", session.email);
  await recordAdminAction({
    actorEmail: session.email,
    action: "signup_toggle",
    detail: { enabled: enabled === "true" },
  });
  console.log(
    `[feature-flag] ${session.email} turned signup ${enabled === "true" ? "on" : "off"}`,
  );

  revalidatePath("/");
  return NextResponse.redirect(new URL("/admin/settings", request.url), 303);
}
