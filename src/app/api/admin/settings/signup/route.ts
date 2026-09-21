import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/session";
import { setSignupEnabled } from "@/lib/feature-flags";

/**
 * Turns public signup (newsletter + apply) on or off, behind the admin session.
 *
 * `enabled` must be exactly "true" or "false". Anything else is rejected
 * rather than defaulted, so a malformed request can't flip the flag.
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const enabled = formData.get("enabled");
  if (enabled !== "true" && enabled !== "false") {
    return NextResponse.json({ error: "Invalid value" }, { status: 400 });
  }

  await setSignupEnabled(enabled === "true", session.email);
  console.log(
    `[feature-flag] ${session.email} turned signup ${enabled === "true" ? "on" : "off"}`,
  );

  revalidatePath("/");
  return NextResponse.redirect(new URL("/admin/settings", request.url), 303);
}
