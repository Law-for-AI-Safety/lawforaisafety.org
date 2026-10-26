import { confirmManualSubmission } from "@/lib/opportunity-submission-flow";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { seeOther } from "@/lib/redirect";
import { SUBMIT_PATH } from "../../handlers";

/**
 * Second half of the email path: the submitter opened the emailed link and pressed the button
 * on /opportunities/submit/confirm. POST only, so a mail scanner fetching the link can't
 * confirm it (see /api/auth/email/confirm).
 */
export async function POST(request: Request) {
  const { allowed } = await checkRateLimit("opportunity-submit-confirm", getClientIp(request), {
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) return seeOther(`${SUBMIT_PATH}?error=ratelimit`);

  const token = (await request.formData()).get("token");
  if (typeof token !== "string" || token === "") return seeOther(`${SUBMIT_PATH}?error=invalid`);

  return seeOther(await confirmManualSubmission(token));
}
