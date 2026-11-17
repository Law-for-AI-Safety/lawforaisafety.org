import { notFound } from "next/navigation";
import { issueOnWebsite } from "@/lib/newsletter-website";
import { renderShareImage } from "../../../og-image";

// The issue's share card, made from its subject, as content pages have theirs
// (src/app/og-assets/[slug]). Made on request, since issues live in the database, and only for
// an issue on the website now. The issue's page points its Open Graph and X images here.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const issue = await issueOnWebsite(slug, new Date());
  if (!issue) notFound();
  return renderShareImage(issue.subject);
}
