import { rememberPerson } from "@/lib/admin-people";
import { DEV_ACCOUNTS, devAccountFor } from "@/lib/dev-accounts";
import { seeOther } from "@/lib/redirect";
import { isAdminEmailAllowed, startAdminSession } from "@/lib/session";

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * Signs in one of the made-up dev accounts (src/lib/dev-accounts.ts), named by the subdomain
 * (`http://publish.localhost:3001/api/admin/dev-login`) or `?as=publish`, then goes to
 * `?next=` or the admin. Not found anywhere but `next dev`: a deployed site is built and run
 * in production mode.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return text("Not found", 404);

  const params = new URL(request.url).searchParams;
  const account = devAccountFor(request.headers.get("host"), params.get("as"));
  if (!account) {
    const keys = DEV_ACCOUNTS.map((a) => a.key).join(", ");
    return text(`No dev account here. Open this on one of their subdomains (${keys}), e.g. http://publish.localhost, or add ?as=publish.`, 404);
  }
  if (!isAdminEmailAllowed(account.email)) {
    return text(`${account.email} is not in ADMIN_EMAILS. Run npm run dev:accounts, then restart the dev server.`, 409);
  }

  await startAdminSession({ email: account.email, name: account.name });
  await rememberPerson(account.email, account.name);
  return seeOther(params.get("next") ?? "/admin");
}
