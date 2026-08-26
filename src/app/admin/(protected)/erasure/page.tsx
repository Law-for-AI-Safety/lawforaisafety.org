import ErasureTool from "./ErasureTool";

/**
 * Handles erasure requests (GDPR Article 17). Reachable only inside the
 * protected admin layout, which redirects to login without a session.
 *
 * This exists because the privacy policy promises something the rest of the
 * app has no path for: after a decision, the only record left is an HMAC of
 * the email, so there is no application to open and delete. Doing it by hand
 * means computing the hash with the live EMAIL_HASH_SECRET, under a one-month
 * Article 12(3) clock, which is not a thing to improvise.
 */
export default function AdminErasurePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-3xl text-brand-black">
          Erasure requests
        </h1>
        <p className="text-brand-black/70">
          Deletes everything held for one email address: any application in
          progress and its uploaded CV, any newsletter signup, and the decision
          record kept after review. Article 12(3) gives you one month to
          respond.
        </p>
      </div>
      <ErasureTool />
    </main>
  );
}
