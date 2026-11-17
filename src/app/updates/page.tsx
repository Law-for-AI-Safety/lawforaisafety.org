import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import ContentPage from "@/app/ContentPage";
import Rule from "@/cms/blocks/Rule";
import { issuesOnWebsite } from "@/lib/newsletter-website";
import { formatIssueDate } from "@/newsletter/dates";
import { issuePath, UPDATES_PATH } from "@/newsletter/website";
import NewsletterSignup from "./NewsletterSignup";

const DESCRIPTION = "News from Law for AI Safety, from our newsletter.";

export const metadata: Metadata = {
  title: "Updates | Law for AI Safety",
  description: DESCRIPTION,
  alternates: { canonical: UPDATES_PATH },
};

/** The newsletter issues put on the website, newest first. */
export default async function UpdatesPage() {
  // Rendered per request, never prerendered: Netlify builds have no database, and issues go up
  // and come down at any time. `connection()` makes the page dynamic while leaving on the data
  // cache the issues are read through.
  await connection();
  const issues = await issuesOnWebsite();

  return (
    <ContentPage gap={6}>
      <h1 className="text-[2.625rem] md:text-[4.125rem] font-light text-brand-black leading-[1.1] tracking-tight">Updates</h1>
      <Rule />
      <p className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">{DESCRIPTION}</p>
      {issues.length === 0 ? (
        <p className="text-lg font-light text-brand-navy/85">No updates yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-black/10 border-y border-brand-black/10">
          {issues.map((issue) => (
            <li key={issue.slug} className="flex flex-col gap-1 py-5">
              <time dateTime={issue.sentAt} className="text-sm font-light text-brand-navy/60">
                {formatIssueDate(issue.sentAt)}
              </time>
              <h2 className="text-2xl font-light text-brand-black leading-snug">
                <Link href={issuePath(issue.slug)} className="hover:underline">
                  {issue.subject}
                </Link>
              </h2>
              {issue.summary && <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">{issue.summary}</p>}
            </li>
          ))}
        </ul>
      )}
      <NewsletterSignup heading="Get these by email" />
    </ContentPage>
  );
}
