import { confirmManualRedLinesApplication } from "@/lib/red-lines-flow";
import { redLinesApplicationsClosedRedirect } from "@/lib/feature-flags";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { seeOther } from "@/lib/redirect";

/**
 * Second half of the email-only Red Lines Dialogues apply path: the
 * applicant has opened the emailed link and pressed the button on
 * /red-lines-dialogue/confirm. POST only, see /api/auth/email/confirm's
 * identical note on mail security scanners.
 */
export async function POST(request: Request) {
  const closed = await redLinesApplicationsClosedRedirect();
  if (closed) return closed;

  const { allowed } = await checkRateLimit("red-lines-confirm", getClientIp(request), {
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) {
    return seeOther("/red-lines-dialogue?error=ratelimit#apply");
  }

  const formData = await request.formData();
  const token = formData.get("token");
  if (typeof token !== "string" || token === "") {
    return seeOther("/red-lines-dialogue?error=invalid#apply");
  }

  const redirectTo = await confirmManualRedLinesApplication(token);
  return seeOther(redirectTo);
}
