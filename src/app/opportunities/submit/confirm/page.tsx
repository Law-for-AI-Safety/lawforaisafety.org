import type { Metadata } from "next";
import Link from "next/link";
import ContentPage from "@/app/ContentPage";
import WipeSubmitButton from "@/app/WipeSubmitButton";

export const metadata: Metadata = {
  title: "Confirm your opportunity",
  robots: { index: false, follow: false },
};

/**
 * Landing page for the link in the confirmation email. Opening it does nothing on its own, so a
 * mail scanner fetching the link can't send the submission. See apply/confirm/page.tsx.
 */
export default async function ConfirmSubmissionPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <ContentPage gap={6}>
      <h1 className="font-sans text-4xl text-brand-black">Confirm your opportunity</h1>

      {!token ? (
        <p className="text-lg text-brand-red">
          That confirmation link isn&apos;t valid. Please{" "}
          <Link href="/opportunities/submit" className="underline">
            start over
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="text-lg text-brand-black/80">
            Press the button to confirm your email address and send us the opportunity.
          </p>
          <form action="/api/opportunities/submit/email/confirm" method="post">
            <input type="hidden" name="token" value={token} />
            <WipeSubmitButton
              type="submit"
              className="bg-brand-navy px-6 py-3 text-lg text-brand-white text-center rounded-sm overflow-hidden"
              hoverBg="rgba(255,255,255,0.15)"
            >
              Confirm and send
            </WipeSubmitButton>
          </form>
        </>
      )}
    </ContentPage>
  );
}
