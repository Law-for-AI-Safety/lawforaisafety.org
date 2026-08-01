import { NextResponse } from "next/server";
import { retryApplicationDraft } from "@/lib/applicant-flow";

export async function POST(request: Request) {
  const formData = await request.formData();
  const token = formData.get("token");
  const provider = formData.get("provider");

  if (
    typeof token !== "string" ||
    (provider !== "linkedin" && provider !== "google")
  ) {
    return NextResponse.redirect(new URL("/?error=invalid#contact", request.url), 303);
  }

  const authorizeUrl = await retryApplicationDraft(token, provider);
  if (!authorizeUrl) {
    return NextResponse.redirect(new URL("/?error=expired#contact", request.url), 303);
  }

  return NextResponse.redirect(authorizeUrl, 303);
}
