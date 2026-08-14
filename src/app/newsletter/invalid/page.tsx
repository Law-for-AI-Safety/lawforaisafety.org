import Link from "next/link";
import ContentPage from "../../ContentPage";

export default function NewsletterInvalidPage() {
  return (
    <ContentPage center>
      <h1 className="font-sans text-4xl text-brand-black">
        Link no longer valid
      </h1>
      <p className="text-brand-black/80">
        That confirmation link isn&apos;t valid or has already been used.
      </p>
      <p className="text-lg text-brand-red">
        <Link href="/#contact" className="underline">
          Subscribe again
        </Link>{" "}
        to get a fresh confirmation email.
      </p>
    </ContentPage>
  );
}
