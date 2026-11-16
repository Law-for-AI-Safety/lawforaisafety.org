"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setNewsletterOnWeb } from "../actions";

/**
 * Whether a newsletter Brevo has is on the website, and (for those who may send) the switch to
 * put it up or take it down. Its page is public only once Brevo has sent it.
 */
export default function WebControls({
  id,
  page,
  onWeb,
  sent,
  canSend,
}: {
  id: string;
  page: string;
  onWeb: boolean;
  sent: boolean;
  canSend: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      setError(null);
      const result = await setNewsletterOnWeb(id, !onWeb);
      if (result.ok) router.refresh();
      else setError(result.message);
    });

  const where = !onWeb
    ? sent
      ? "Not on the website."
      : "It won't go on the website."
    : sent
      ? null
      : "It goes on the website once Brevo has sent it.";

  return (
    <section aria-labelledby="web-heading" className="flex flex-col gap-2 border-t border-brand-black/10 pt-4">
      <h2 id="web-heading" className="font-sans text-xl text-brand-black">
        On the website
      </h2>
      {where === null ? (
        <p className="text-brand-black">
          Published at{" "}
          <Link href={page} className="underline">
            {page}
          </Link>
          .
        </p>
      ) : (
        <p className="text-brand-black">{where}</p>
      )}
      {canSend ? (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={toggle}
            className="self-start rounded-sm border border-brand-navy px-4 py-2 text-brand-navy disabled:opacity-40"
          >
            {onWeb ? (sent ? "Take it off the website" : "Don't put it on the website") : sent ? "Put it back on the website" : "Put it on the website"}
          </button>
          {!sent && (
            <p className="text-sm text-brand-black/60">
              While it is still scheduled, this also adds or removes the email&apos;s &quot;View in browser&quot; link.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-brand-black/60">Someone with permission to publish website pages can change this.</p>
      )}
      {error && (
        <p role="alert" className="text-brand-red">
          {error}
        </p>
      )}
    </section>
  );
}
