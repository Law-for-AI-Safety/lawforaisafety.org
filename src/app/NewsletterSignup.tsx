import Link from "next/link";
import NewsletterForm from "@/app/apply/NewsletterForm";
import { isPolicyServed } from "@/app/privacy-policy/visibility";

const TONES = {
  light: { heading: "text-2xl md:text-3xl font-light text-brand-black", note: "text-brand-navy/70", link: "hover:text-brand-black" },
  dark: { heading: "text-2xl font-light text-brand-white", note: "text-brand-white/70", link: "hover:text-brand-white" },
};

/**
 * The newsletter sign-up, inline: the homepage's form, so the same route, checks and double
 * opt-in (a confirmation link by email) apply. On the newsletter's pages, and in the footer of every
 * page that has no sign-up of its own. `id` names the heading, unique on the page.
 */
export default function NewsletterSignup({
  heading,
  id,
  tone = "light",
}: {
  heading: string;
  id: string;
  tone?: keyof typeof TONES;
}) {
  const colours = TONES[tone];
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 max-w-2xl">
      <h2 id={id} className={colours.heading}>
        {heading}
      </h2>
      {/* In the footer, on every page, Cloudflare's check waits until a visitor starts on the form. */}
      <NewsletterForm tone={tone} deferVerification={tone === "dark"} />
      <p className={`text-base font-light leading-relaxed ${colours.note}`}>
        We&apos;ll email you a link to confirm. You can unsubscribe at any time using the link in any newsletter email.
        {isPolicyServed() && (
          <>
            {" "}
            See our{" "}
            <Link href="/privacy-policy" className={`underline ${colours.link}`}>
              Privacy Policy
            </Link>
            .
          </>
        )}
      </p>
    </section>
  );
}
