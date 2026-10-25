import { looksLikeBot } from "@/lib/abuse-protection";
import { submitManualSubmission, SubmissionValidationError } from "@/lib/opportunity-submission-flow";
import { seeOther } from "@/lib/redirect";
import { screenSubmission, SUBMIT_PATH } from "../handlers";

/** The name-and-email path: parks the submission as a draft and emails a confirmation link. */
export async function POST(request: Request) {
  const screened = await screenSubmission(request);
  if ("response" in screened) return screened.response;
  if (looksLikeBot(screened.formData)) return seeOther(`${SUBMIT_PATH}?submitted=confirm`);

  try {
    return seeOther(await submitManualSubmission(screened.formData));
  } catch (err) {
    if (err instanceof SubmissionValidationError) return seeOther(`${SUBMIT_PATH}?error=${err.code}`);
    throw err;
  }
}
