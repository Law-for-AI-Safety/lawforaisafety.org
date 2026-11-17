"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NEWSLETTER_PATH } from "@/newsletter/website";
import { setNewsletterOnWebsite } from "./actions";

export type WebsiteStanding = {
  on: boolean;
  /** Whether it is on the website now: ticked and sent. */
  live: boolean;
  /** Its address once it has one, given when Brevo takes it. */
  path: string | null;
};

/**
 * The "Also publish on the website" choice, saved as soon as it is ticked or unticked, apart
 * from the draft. It can be changed at any stage; taking an issue off the website never
 * touches the email.
 */
export default function WebsiteOption({ id, initial }: { id: string; initial: WebsiteStanding }) {
  const router = useRouter();
  const inputId = useId();
  const [standing, setStanding] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (on: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await setNewsletterOnWebsite(id, on);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setStanding({ on, live: result.onWebsite, path: result.path });
      router.refresh();
    });

  return (
    <section className="flex flex-col gap-2 border-t border-brand-black/10 pt-4">
      <h2 className="font-sans text-xl text-brand-black">On the website</h2>
      <label htmlFor={inputId} className="flex items-center gap-2">
        <input id={inputId} type="checkbox" checked={standing.on} disabled={pending} onChange={(e) => change(e.target.checked)} />
        Also publish on the website
      </label>
      <p role="status" className="text-sm text-brand-black/70">
        {!standing.on ? (
          <>
            Only subscribers get it. Leave this off for an issue about events or deadlines that won&apos;t stay true; it can be
            ticked later.
          </>
        ) : standing.live && standing.path ? (
          <>
            On the website at{" "}
            <Link href={standing.path} target="_blank" className="underline">
              {standing.path}
            </Link>
            , and listed under <Link href={NEWSLETTER_PATH} target="_blank" className="underline">{NEWSLETTER_PATH}</Link>. Untick to take it
            down; the email is not affected.
          </>
        ) : (
          <>It goes up under {NEWSLETTER_PATH} once it has been sent, and stays until this is unticked.</>
        )}
      </p>
      {error && (
        <p role="alert" className="text-sm text-brand-red">
          {error}
        </p>
      )}
    </section>
  );
}
