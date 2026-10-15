import { createAdminSessionCookie, devSeedAdminEmail } from "@/lib/session";
import { seeOther } from "@/lib/redirect";

/**
 * Skips LinkedIn OAuth entirely: signs a real admin_session cookie for the
 * seeded dev admin (see devSeedAdminEmail). Only reachable under `next dev` —
 * NODE_ENV is "production" for every built/started app and "test" under
 * Vitest, so this 404s everywhere else regardless of other configuration.
 */
export async function GET(): Promise<Response> {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  const email = devSeedAdminEmail();
  if (!email) {
    return new Response(
      "Set ADMIN_EMAILS (and ideally TECH_ADMIN_EMAILS) in .env.local to use the dev login shortcut.",
      { status: 400 },
    );
  }

  await createAdminSessionCookie({ email, name: "Dev Admin" });
  return seeOther("/admin");
}
