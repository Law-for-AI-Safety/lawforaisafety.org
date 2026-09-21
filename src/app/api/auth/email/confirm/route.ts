import { confirmManualApplication } from "@/lib/applicant-flow";
import { signupClosedRedirect } from "@/lib/feature-flags";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { seeOther } from "@/lib/redirect";

/**
 * Second half of the email-only apply path: the applicant has opened the
 * emailed link and pressed the button on /apply/confirm. POST only — mail
 * security scanners follow links in messages, and a GET that confirmed would
 * let a scanner submit the application on the applicant's behalf.
 */
export async function POST(request: Request) {
  const closed = await signupClosedRedirect();
  if (closed) return closed;

  const { allowed } = await checkRateLimit("auth-confirm", getClientIp(request), {
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) {
    // This route is reached by a browser form post, so a JSON body would be
    // shown to the visitor as a raw page. Send them back with a message instead.
    return seeOther("/?error=ratelimit#contact");
  }

  const formData = await request.formData();
  const token = formData.get("token");
  if (typeof token !== "string" || token === "") {
    return seeOther("/?error=invalid#contact");
  }

  const redirectTo = await confirmManualApplication(token);
  return seeOther(redirectTo);
}
