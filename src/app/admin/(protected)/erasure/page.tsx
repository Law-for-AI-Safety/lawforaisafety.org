import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getAdminSession,
  isTechAdminConfigured,
  isTechAdminEmail,
} from "@/lib/session";
import TechAdminOnly from "../../TechAdminOnly";
import ErasureTool from "./ErasureTool";

export const metadata: Metadata = {
  title: "LAIS - Erasure requests",
  robots: { index: false, follow: false },
};

/**
 * Handles erasure requests (GDPR Article 17). Inside the protected admin
 * layout, and further limited to technical admins: deleting someone's data
 * (or wiping a rejection record) isn't part of reviewing applications.
 *
 * This exists because the privacy policy promises something the rest of the
 * app has no path for: after a decision, the only record left is an HMAC of
 * the email, so there is no application to open and delete. Doing it by hand
 * means computing the hash with the live EMAIL_HASH_SECRET, under a one-month
 * Article 12(3) clock, which is not a thing to improvise.
 */
export default async function AdminErasurePage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!isTechAdminEmail(session.email)) {
    return <TechAdminOnly configured={isTechAdminConfigured()} />;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-3xl text-brand-black">
          Erasure requests
        </h1>
        <p className="text-brand-black/70">
          Deletes everything held for one email address: any application in
          progress and its uploaded CV, any newsletter signup, the decision
          record kept after review, and any Red Lines Dialogues application
          (at any status — those aren&apos;t purged automatically, see the
          schema). Article 12(3) gives you one month to respond.
        </p>
      </div>

      <section className="flex flex-col gap-3 border border-brand-red bg-brand-red/10 px-4 py-4">
        <h2 className="font-sans text-xl text-brand-black">
          Before you erase anything
        </h2>
        <p className="text-brand-black/80">
          The sender line of an email is easy to forge. A request that only
          looks like it came from an address proves nothing, and a forged one
          could be used to delete someone else&apos;s application, or to wipe
          a rejection so the person can re-apply unflagged.
        </p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-brand-black/80">
          <li>
            Don&apos;t act on the request itself. Write a new email to the
            address (type it, don&apos;t hit reply on anything suspicious)
            asking them to confirm they want their data erased, and which
            parts.
          </li>
          <li>
            Wait for their reply to that message. Only a reply in that thread
            shows they can read mail at the address.
          </li>
          <li>
            Look the address up below, erase what they asked for, and reply to
            confirm it&apos;s done. If the newsletter signup was erased,
            remove the contact in Brevo too.
          </li>
          <li>
            Keep the email thread for your records of the request. The panel
            logs that an erasure happened and who did it, but not for whom.
          </li>
        </ol>
      </section>

      <ErasureTool />
    </main>
  );
}
