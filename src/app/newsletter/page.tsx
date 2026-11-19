import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import ContentPage from "@/app/ContentPage";
import Rule from "@/cms/blocks/Rule";
import { issuesOnWebsite } from "@/lib/newsletter-website";
import { formatIssueDate } from "@/newsletter/dates";
import { issuePath, NEWSLETTER_LABEL, NEWSLETTER_PATH } from "@/newsletter/website";
import NewsletterSignup from "@/app/NewsletterSignup";

const DESCRIPTION = "Sign up to the Law for AI Safety newsletter, and read past issues.";

export const metadata: Metadata = {
  title: `${NEWSLETTER_LABEL} | Law for AI Safety`,
  description: DESCRIPTION,
  alternates: { canonical: NEWSLETTER_PATH },
};

/** The newsletter: the sign-up, and the issues put on the website, newest first. */
export default async function NewsletterPage() {
  // Rendered per request, never prerendered: Netlify builds have no database, and issues go up
  // and come down at any time. `connection()` makes the page dynamic while leaving on the data
  // cache the issues are read through.
  await connection();
  const issues = await issuesOnWebsite();

  return (
    <ContentPage gap={6} footerSignup={false}>
      <h1 className="text-[2.625rem] md:text-[4.125rem] font-light text-brand-black leading-[1.1] tracking-tight">{NEWSLETTER_LABEL}</h1>
      <Rule />
      <p className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
        News from Law for AI Safety: our work, the legal debate on AI risk, and ways to get involved.
      </p>
      <NewsletterSignup heading="Sign up" id="newsletter-signup" />
      {issues.length > 0 && (
        <section aria-labelledby="past-issues" className="flex flex-col gap-4 pt-8">
          <h2 id="past-issues" className="text-2xl md:text-3xl font-light text-brand-black">
            Past issues
          </h2>
          <ul className="flex flex-col divide-y divide-brand-black/10 border-y border-brand-black/10">
            {issues.map((issue) => (
              <li key={issue.slug} className="flex flex-col gap-1 py-5">
                <time dateTime={issue.sentAt} className="text-sm font-light text-brand-navy/60">
                  {formatIssueDate(issue.sentAt)}
                </time>
                <h3 className="text-2xl font-light text-brand-black leading-snug">
                  <Link href={issuePath(issue.slug)} className="hover:underline">
                    {issue.subject}
                  </Link>
                </h3>
                {issue.summary && <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">{issue.summary}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </ContentPage>
  );
}
