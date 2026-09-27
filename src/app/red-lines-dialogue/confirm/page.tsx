import type { Metadata } from "next";
import Link from "next/link";
import ContentPage from "../../ContentPage";
import WipeSubmitButton from "../../WipeSubmitButton";

export const metadata: Metadata = {
  title: "Confirm your Red Lines Dialogues application",
  robots: { index: false, follow: false },
};

/**
 * Landing page for the link in the Red Lines Dialogues confirmation email.
 * Opening it does nothing on its own, so a mail scanner fetching the link
 * can't submit the application. See apply/confirm/page.tsx.
 */
export default async function RedLinesConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <ContentPage gap={6}>
      <h1 className="font-sans text-4xl text-brand-black">
        Confirm your application
      </h1>

      {!token ? (
        <p className="text-lg text-brand-red">
          That confirmation link isn&apos;t valid. Please{" "}
          <Link href="/red-lines-dialogue#apply" className="underline">
            start over
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="text-lg text-brand-black/80">
            Press the button to confirm your email address and send your
            Red Lines Dialogues application to the working group.
          </p>
          <form action="/api/red-lines-dialogue/apply/email/confirm" method="post">
            <input type="hidden" name="token" value={token} />
            <WipeSubmitButton
              type="submit"
              className="bg-brand-navy px-6 py-3 text-lg text-brand-white text-center rounded-sm overflow-hidden"
              hoverBg="rgba(255,255,255,0.15)"
            >
              Confirm and submit
            </WipeSubmitButton>
          </form>
        </>
      )}
    </ContentPage>
  );
}
