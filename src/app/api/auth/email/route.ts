import { looksLikeBot } from "@/lib/abuse-protection";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { submitManualApplication, ValidationError } from "@/lib/applicant-flow";
import { verifyTurnstile } from "@/lib/turnstile";
import { signupClosedRedirect } from "@/lib/feature-flags";
import { seeOther } from "@/lib/redirect";

export async function POST(request: Request) {
  const closed = await signupClosedRedirect();
  if (closed) return closed;

  const ip = getClientIp(request);
  const { allowed } = await checkRateLimit("auth-draft", ip, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!allowed) {
    // This route is reached by a browser form post, so a JSON body would be
    // shown to the visitor as a raw page. Send them back with a message instead.
    return seeOther("/?error=ratelimit#contact");
  }

  const formData = await request.formData();

  if (!(await verifyTurnstile(formData, ip))) {
    return seeOther("/?error=verification#contact");
  }

  if (looksLikeBot(formData)) {
    return seeOther("/?applied=1#contact");
  }

  try {
    const redirectTo = await submitManualApplication(formData);
    return seeOther(redirectTo);
  } catch (err) {
    if (err instanceof ValidationError) {
      return seeOther(`/?error=${err.code}#contact`);
    }
    throw err;
  }
}
