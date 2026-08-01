import Nav from "../../Nav";

export default function ApplySuccessPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-24 text-center">
        <h1 className="font-sans text-4xl text-brand-black">Thank you</h1>
        <p className="text-brand-black/80">
          We&apos;ll review your application and be in touch.
        </p>
      </main>
    </>
  );
}
