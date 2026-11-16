import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import ContentPage from "@/app/ContentPage";
import Rule from "@/cms/blocks/Rule";
import { publicIssues } from "@/newsletter/archive";
import { formatIssueDate } from "@/newsletter/dates";
import { ARCHIVE_PATH, issuePath } from "@/newsletter/slug";
import NewsletterSignup from "./NewsletterSignup";

const DESCRIPTION = "Past issues of the Law for AI Safety newsletter.";

export const metadata: Metadata = {
  title: "Newsletter | Law for AI Safety",
  description: DESCRIPTION,
  alternates: { canonical: ARCHIVE_PATH },
};

/** Every issue sent with its web page on, newest first, and the sign-up. */
export default async function NewsletterArchivePage() {
  // Rendered per request, never prerendered: Netlify builds have no database, and an issue
  // appears once Brevo has sent it. `connection()` makes the page dynamic while leaving on the
  // data cache the issues are read through.
  await connection();
  const issues = await publicIssues();

  return (
    <ContentPage gap={6}>
      <h1 className="text-[2.625rem] md:text-[4.125rem] font-light text-brand-black leading-[1.1] tracking-tight">
        Newsletter
      </h1>
      <Rule />
      <p className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">{DESCRIPTION}</p>
      {issues.length === 0 ? (
        <p className="text-lg font-light text-brand-navy/85">No issues yet. Sign up below to get the first one.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-brand-black/10 border-t border-brand-black/10">
          {issues.map((issue) => (
            <li key={issue.slug} className="flex flex-col gap-2 py-6">
              <time dateTime={issue.sentAt.toISOString()} className="text-sm font-light text-brand-navy/70">
                {formatIssueDate(issue.sentAt)}
              </time>
              <h2 className="text-2xl font-light text-brand-black">
                <Link href={issuePath(issue.slug)} className="underline decoration-brand-black/30 hover:decoration-brand-black">
                  {issue.subject}
                </Link>
              </h2>
              {issue.previewText && <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">{issue.previewText}</p>}
            </li>
          ))}
        </ol>
      )}
      <NewsletterSignup />
    </ContentPage>
  );
}
