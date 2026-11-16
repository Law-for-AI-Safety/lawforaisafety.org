import NewsletterForm from "@/app/apply/NewsletterForm";

/** The sign-up at the foot of the archive and of every issue, with the site's usual newsletter form. */
export default function NewsletterSignup() {
  return (
    <section aria-labelledby="newsletter-signup-heading" className="flex flex-col gap-4 pt-12 mt-6 border-t border-brand-black/10">
      <h2 id="newsletter-signup-heading" className="text-2xl md:text-3xl font-light text-brand-black">
        Get the next issue by email
      </h2>
      <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
        News from Law for AI Safety, straight to your inbox. Unsubscribe at any time.
      </p>
      <div className="max-w-2xl">
        <NewsletterForm />
      </div>
    </section>
  );
}
