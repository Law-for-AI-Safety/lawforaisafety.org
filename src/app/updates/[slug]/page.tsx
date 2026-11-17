import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import ContentPage from "@/app/ContentPage";
import { size } from "@/app/og-image";
import Rule from "@/cms/blocks/Rule";
import { issueOnWebsite } from "@/lib/newsletter-website";
import { formatIssueDate } from "@/newsletter/dates";
import { issuePath, UPDATES_PATH } from "@/newsletter/website";
import IssueBody from "../IssueBody";
import NewsletterSignup from "../NewsletterSignup";

type Props = { params: Promise<{ slug: string }> };

/**
 * The issue, if it is on the website now. Read once per request, so the metadata and the page
 * can't fall either side of an issue going up or coming down. Anything else is a 404.
 */
const load = cache(async (slug: string) => {
  // Rendered per request: Netlify builds have no database, and an issue can be taken down at
  // any time. `connection()` makes the page dynamic while leaving on the data cache.
  await connection();
  const issue = await issueOnWebsite(slug);
  if (!issue) notFound();
  return issue;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const issue = await load(slug);
  const path = issuePath(issue.slug);
  const image = { url: `${path}/share-image`, width: size.width, height: size.height, alt: issue.subject };
  return {
    title: `${issue.subject} | Updates | Law for AI Safety`,
    description: issue.summary || undefined,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      title: issue.subject,
      ...(issue.summary && { description: issue.summary }),
      publishedTime: issue.sentAt,
      siteName: "Law for AI Safety",
      images: [image],
    },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default async function IssuePage({ params }: Props) {
  const { slug } = await params;
  const issue = await load(slug);
  return (
    <ContentPage gap={6}>
      <Link href={UPDATES_PATH} className="text-base font-light text-brand-navy underline hover:text-brand-black w-fit">
        All updates
      </Link>
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-[2.25rem] md:text-[3.25rem] font-light text-brand-black leading-[1.1] tracking-tight" style={{ textWrap: "balance" }}>
            {issue.subject}
          </h1>
          <time dateTime={issue.sentAt} className="text-base font-light text-brand-navy/60">
            {formatIssueDate(issue.sentAt)}
          </time>
        </header>
        <Rule />
        <IssueBody body={issue.body} />
      </article>
      <Rule />
      <NewsletterSignup heading="Get the next one by email" />
    </ContentPage>
  );
}
