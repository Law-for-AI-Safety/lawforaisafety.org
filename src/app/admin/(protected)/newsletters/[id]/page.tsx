import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { newsletterCan, requireNewsletter } from "@/lib/newsletter-access";
import { getNewsletter } from "@/lib/newsletter-store";
import { emailSender } from "@/lib/email";
import { renderNewsletterHtml } from "@/newsletter/template";
import { siteUrl, TEST_UNSUBSCRIBE_HREF } from "@/newsletter/site";
import { statusOf } from "../load";
import NoNewsletterAccess from "../NoNewsletterAccess";
import StatusBadge from "../StatusBadge";
import Composer from "./Composer";
import SubmittedControls from "./SubmittedControls";

export const metadata: Metadata = {
  title: "LAIS - Newsletter",
  robots: { index: false, follow: false },
};

/** Who the email comes from, as an inbox shows it. Missing settings show as such rather than breaking the editor. */
function senderLabel(): string {
  try {
    const sender = emailSender();
    return `${sender.name} <${sender.email}>`;
  } catch {
    return "(no sender set: BREVO_FROM_EMAIL is missing)";
  }
}

/** One newsletter: the editor while it is a draft, or where it stands once Brevo has it. */
export default async function NewsletterPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireNewsletter("write");
  if (!actor.ok) {
    if (actor.reason === "signed_out") redirect("/admin/login");
    return <NoNewsletterAccess />;
  }
  const { id } = await params;
  const row = /^[0-9a-f-]{36}$/i.test(id) ? await getNewsletter(id) : null;
  if (!row) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
        <h1 className="font-sans text-3xl text-brand-black">No such newsletter</h1>
        <Link href="/admin/newsletters" className="underline">
          Back to the newsletter
        </Link>
      </main>
    );
  }
  const canSend = newsletterCan(actor.access, "send");
  const sender = senderLabel();
  const fields = { subject: row.subject, previewText: row.previewText, body: row.body };

  if (row.state === "draft") {
    return (
      <Composer
        id={row.id}
        initial={fields}
        initialVersion={row.version}
        initialTestedVersion={row.testedVersion}
        canSend={canSend}
        me={actor.email}
        sender={sender}
      />
    );
  }

  const status = await statusOf(row);
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <Link href="/admin/newsletters" className="text-sm underline">
        All newsletters
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-3xl text-brand-black">{row.subject}</h1>
        <div>
          <StatusBadge status={status} />
        </div>
        {row.submittedBy && <p className="text-sm text-brand-black/70">Handed to Brevo by {row.submittedBy}.</p>}
      </div>
      <SubmittedControls id={row.id} subject={row.subject} status={status.kind} stuck={status.kind === "submitting" && status.stuck} canSend={canSend} scheduledAt={status.kind === "scheduled" ? status.at.toISOString() : null} />
      <iframe
        title="The newsletter as sent"
        srcDoc={renderNewsletterHtml(fields, { siteUrl: siteUrl(), unsubscribeHref: TEST_UNSUBSCRIBE_HREF })}
        className="h-[70vh] w-full border border-brand-black/10 bg-brand-white"
      />
    </main>
  );
}
