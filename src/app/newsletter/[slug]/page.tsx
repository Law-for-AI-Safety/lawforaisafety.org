import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import ContentPage from "@/app/ContentPage";
import Rule from "@/cms/blocks/Rule";
import { RichTextBlocks } from "@/cms/render";
import { publicIssue } from "@/newsletter/archive";
import { formatIssueDate } from "@/newsletter/dates";
import { ARCHIVE_PATH, issuePath } from "@/newsletter/slug";
import NewsletterSignup from "../NewsletterSignup";

type Props = { params: Promise<{ slug: string }> };

/** The issue, read once per request for both the metadata and the page. */
const load = cache(async (slug: string) => {
  // Rendered per request, never prerendered: Netlify builds have no database, and an issue
  // appears once Brevo has sent it. `connection()` makes the page dynamic while leaving on the
  // data cache the issue is read through.
  await connection();
  const issue = await publicIssue(slug);
  if (!issue) notFound();
  return issue;
});

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const issue = await load((await params).slug);
  // Setting Open Graph here replaces the site's, so its share image is carried over.
  const images = (await parent).openGraph?.images;
  const title = `${issue.subject} | Newsletter | Law for AI Safety`;
  const description = issue.previewText || `The Law for AI Safety newsletter of ${formatIssueDate(issue.sentAt)}.`;
  return {
    title,
    description,
    alternates: { canonical: issuePath(issue.slug) },
    openGraph: {
      type: "article",
      title: issue.subject,
      description,
      url: issuePath(issue.slug),
      publishedTime: issue.sentAt.toISOString(),
      ...(images && { images }),
    },
  };
}

const TEXT = "text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl";
const LIST_ITEM = "text-lg font-light text-brand-navy/85 leading-relaxed flex gap-3 max-w-2xl";

/** One issue of the newsletter, in the site's own layout rather than the email's. */
export default async function NewsletterIssuePage({ params }: Props) {
  const issue = await load((await params).slug);
  return (
    <ContentPage gap={6}>
      <Link href={ARCHIVE_PATH} className="text-lg font-light text-brand-navy/85 underline self-start">
        All issues
      </Link>
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <time dateTime={issue.sentAt.toISOString()} className="text-lg font-light text-brand-navy/70">
            {formatIssueDate(issue.sentAt)}
          </time>
          <h1 className="text-[2.25rem] md:text-[3.25rem] font-light text-brand-black leading-[1.1] tracking-tight" style={{ textWrap: "balance" }}>
            {issue.subject}
          </h1>
        </header>
        <Rule />
        <RichTextBlocks value={issue.body} paragraphClassName={TEXT} listItemClassName={LIST_ITEM} />
      </article>
      <NewsletterSignup />
    </ContentPage>
  );
}
