import Link from "next/link";
import Nav from "../../Nav";
import WipeSubmitButton from "../../WipeSubmitButton";

export default async function ApplyRetryPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-24">
        <h1 className="font-sans text-4xl text-brand-black">
          Error verifying identity
        </h1>
        <p className="text-lg text-brand-black/80">
          Something went wrong verifying your identity. Please try again.
          Your form details are saved, so you don&apos;t need to retype
          anything.
        </p>

        {!token ? (
          <p className="text-lg text-brand-red">
            That retry link isn&apos;t valid. Please{" "}
            <Link href="/#contact" className="underline">
              start over
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <form action="/api/auth/retry" method="post" className="flex-1">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="provider" value="linkedin" />
              <WipeSubmitButton
                type="submit"
                className="w-full bg-brand-navy px-5 py-3 text-lg text-brand-white text-center rounded-sm overflow-hidden"
                hoverBg="rgba(255,255,255,0.15)"
              >
                Retry with LinkedIn
              </WipeSubmitButton>
            </form>
            <form action="/api/auth/retry" method="post" className="flex-1">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="provider" value="google" />
              <WipeSubmitButton
                type="submit"
                className="w-full border border-brand-navy text-brand-navy px-5 py-3 text-lg text-center rounded-sm overflow-hidden"
                hoverBg="rgba(27,51,76,0.07)"
              >
                Retry with Google
              </WipeSubmitButton>
            </form>
          </div>
        )}
      </main>
    </>
  );
}
