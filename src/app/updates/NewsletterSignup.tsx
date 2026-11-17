import Link from "next/link";
import NewsletterForm from "@/app/apply/NewsletterForm";
import { isPolicyServed } from "@/app/privacy-policy/visibility";

/**
 * The newsletter sign-up, inline: the homepage's form, so the same route, checks and double
 * opt-in (a confirmation link by email) apply.
 */
export default function NewsletterSignup({ heading }: { heading: string }) {
  return (
    <section aria-labelledby="newsletter-signup-heading" className="flex flex-col gap-4 max-w-2xl">
      <h2 id="newsletter-signup-heading" className="text-2xl md:text-3xl font-light text-brand-black">
        {heading}
      </h2>
      <NewsletterForm />
      <p className="text-base font-light text-brand-navy/70 leading-relaxed">
        We&apos;ll email you a link to confirm. You can unsubscribe at any time using the link in any newsletter email.
        {isPolicyServed() && (
          <>
            {" "}
            See our{" "}
            <Link href="/privacy-policy" className="underline hover:text-brand-black">
              Privacy Policy
            </Link>
            .
          </>
        )}
      </p>
    </section>
  );
}
