import ContentPage from "../../ContentPage";

export default function NewsletterConfirmedPage() {
  return (
    <ContentPage center>
      <h1 className="font-sans text-4xl text-brand-black">
        Subscription confirmed
      </h1>
      <p className="text-brand-black/80">
        You&apos;re on the list. We&apos;ll be in touch when there&apos;s
        news to share.
      </p>
    </ContentPage>
  );
}
