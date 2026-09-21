import type { Metadata } from "next";
import Link from "next/link";
import ContentPage from "../../ContentPage";
import WipeSubmitButton from "../../WipeSubmitButton";

export const metadata: Metadata = {
  title: "Confirm your subscription",
  robots: { index: false, follow: false },
};

/**
 * Landing page for the link in the newsletter confirmation email. Opening it
 * subscribes nobody — that happens when the button is pressed. Mail security
 * scanners follow links, and a scanner's fetch isn't the subscriber's consent.
 */
export default async function NewsletterConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <ContentPage center>
      <h1 className="font-sans text-4xl text-brand-black">
        Confirm your subscription
      </h1>

      {!token ? (
        <p className="text-lg text-brand-red">
          That confirmation link isn&apos;t valid.{" "}
          <Link href="/#contact" className="underline">
            Subscribe again
          </Link>{" "}
          to get a fresh one.
        </p>
      ) : (
        <>
          <p className="text-lg text-brand-black/80">
            Press the button to confirm you&apos;d like to receive the Law for
            AI Safety newsletter.
          </p>
          <form action="/api/newsletter/confirm" method="post">
            <input type="hidden" name="token" value={token} />
            <WipeSubmitButton
              type="submit"
              className="bg-brand-navy px-6 py-3 text-lg text-brand-white text-center rounded-sm overflow-hidden"
              hoverBg="rgba(255,255,255,0.15)"
            >
              Confirm subscription
            </WipeSubmitButton>
          </form>
        </>
      )}
    </ContentPage>
  );
}
