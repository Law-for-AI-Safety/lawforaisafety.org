import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireNewsletter } from "@/lib/newsletter-access";
import { listNewsletters } from "@/lib/newsletter-store";
import { statusesOf, withSent } from "./load";
import NewNewsletterButton from "./NewNewsletterButton";
import StatusBadge from "./StatusBadge";
import { isOnWebsite, issuePath } from "@/newsletter/website";

export const metadata: Metadata = {
  title: "LAIS - Newsletter",
  robots: { index: false, follow: false },
};

/** Every newsletter written here: drafts, scheduled and sent, most recently changed first. */
export default async function NewslettersPage() {
  const actor = await requireNewsletter();
  if (!actor.ok) redirect("/admin/login");
  const rows = await listNewsletters();
  const statuses = await statusesOf(rows);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-3xl text-brand-black">Newsletter</h1>
        <p className="text-brand-black/70">
          Write the newsletter here, send yourself a test, then schedule it or send it now. Brevo sends it to everyone on
          the newsletter list. An issue can also go on the website, under{" "}
          <Link href="/newsletter" className="underline">
            /newsletter
          </Link>
          , once sent.
        </p>
      </div>
      <NewNewsletterButton />
      {rows.length === 0 ? (
        <p className="text-brand-black/60">No newsletters yet.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row, i) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-black/10 py-4">
              <div className="flex flex-col">
                <Link href={`/admin/newsletters/${row.id}`} className="text-lg text-brand-black underline">
                  {row.subject.trim() || "Untitled newsletter"}
                </Link>
                <span className="text-sm text-brand-black/60">
                  Last edited by {row.updatedBy}
                  {row.submittedBy && row.state === "submitted" && ` · sent to Brevo by ${row.submittedBy}`}
                </span>
                {row.webPublished && (
                  <span className="text-sm text-brand-black/60">
                    {isOnWebsite(withSent(row, statuses[i])) && row.webSlug ? (
                      <>
                        On the website at{" "}
                        <Link href={issuePath(row.webSlug)} className="underline">
                          {issuePath(row.webSlug)}
                        </Link>
                      </>
                    ) : (
                      "Goes on the website once sent"
                    )}
                  </span>
                )}
              </div>
              <StatusBadge status={statuses[i]} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
