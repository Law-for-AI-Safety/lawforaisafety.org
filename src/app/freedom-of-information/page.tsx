import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import Nav from "../Nav";
import Footer from "../Footer";
import ApplyForm from "../apply/ApplyForm";
import ApplyToast from "../ApplyToast";
import ContactErrorBanner from "../ContactErrorBanner";
import WavyUnderline from "../WavyUnderline";
import { isSignupEnabled } from "@/lib/feature-flags";

function Rule() {
  return (
    <svg viewBox="0 0 52 12" width="56" height="13" aria-hidden fill="none">
      <path d="M0 5 C14 2 38 8 52 5 C38 10 14 7 0 5Z" fill="#9b1c1f" />
    </svg>
  );
}

export const metadata: Metadata = {
  title: "Freedom of Information Requests | Law for AI Safety",
  description:
    "Our Freedom of Information request on catastrophic and existential AI risks, aimed at EU Member States, and how to help translate, submit, or co-sign it.",
};

const photos = [
  {
    src: "/images/raluca-spataru-conference.webp",
    alt: "Raluca Spataru speaking with a microphone to a small group seated around a round table",
    position: "object-top",
  },
  {
    src: "/images/foi-workshop-audience.webp",
    alt: "Workshop participants seated in a meeting space, listening to Raluca Spataru presenting",
    position: "object-center",
  },
];

const steps = [
  {
    title: "Drafted and reviewed",
    body: "We have drafted a Freedom of Information request on catastrophic and existential risks from AI, aimed at EU Member States. The Future of Life Institute has reviewed it.",
  },
  {
    title: "Being translated",
    body: "We are translating the request into the languages of EU Member States, with translation coordinated by our Legal Advisor, Raluca Spataru.",
  },
  {
    title: "Submitted country by country",
    body: "Each request needs someone who can read the local language and submit it. Organisations in Member States can also co-sign.",
  },
];

// Signup forms are toggled at runtime from the admin panel, so this page has
// to render per request rather than being prerendered at build time.
export const dynamic = "force-dynamic";

export default async function FreedomOfInformationPage() {
  const signupEnabled = await isSignupEnabled();

  return (
    <main className="flex flex-col font-sans">
      <Nav />

      <Suspense fallback={null}>
        <ApplyToast />
      </Suspense>

      {/* Hero */}
      <section className="bg-brand-white flex flex-col justify-center px-8 md:px-16 pt-44 pb-20 md:pt-52 md:pb-24">
        <div className="max-w-4xl mx-auto w-full flex flex-col gap-8 max-w-3xl">
          <h1
            className="text-4xl md:text-6xl font-light text-brand-black leading-[1.1] tracking-tight"
            style={{ textWrap: "balance" }}
          >
            Freedom of Information requests on AI risk
          </h1>
          <Rule />
          <p className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            Effective AI governance depends on transparency, robust oversight,
            and meaningful accountability. We are filing <WavyUnderline>Freedom of Information</WavyUnderline> requests with EU
            Member States about catastrophic and existential risks from AI.
          </p>
        </div>
      </section>

      {/* Steps, RLD-style numbered sections */}
      <section className="bg-brand-navy/[0.04] px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="flex gap-6 pt-8 border-t border-brand-black/10 first:pt-0 first:border-t-0"
            >
              <span className="text-6xl md:text-8xl font-light leading-[0.8] [font-variant-numeric:lining-nums] text-brand-red/30 flex-shrink-0 w-12 md:w-24 pt-1">
                {i + 1}
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl md:text-2xl font-light text-brand-black">
                  {step.title}
                </h3>
                <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why it matters */}
      <section className="bg-brand-navy px-8 md:px-16 py-24 md:py-32">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <blockquote
            className="text-3xl md:text-5xl font-light text-brand-white leading-tight max-w-2xl"
            style={{ textWrap: "balance" }}
          >
            We believe this could increase cohesion on AI governance in the EU,
            support better-targeted advocacy, and potentially provide evidence
            in future legal actions.
          </blockquote>
        </div>
      </section>

      {/* Workshops */}
      <section className="bg-brand-white px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          <p className="text-lg md:text-xl font-light text-brand-black/85 leading-relaxed max-w-2xl">
            Our Legal Advisor, Raluca Spataru, has also facilitated workshops
            on the FOI initiative, which has sparked interest in starting
            similar initiatives in the US and Canada.
          </p>
          <div className="max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
            {photos.map((photo) => (
              <div
                key={photo.src}
                className="relative w-full aspect-[4/3] rounded-sm overflow-hidden"
              >
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  className={`object-cover ${photo.position}`}
                  sizes="(max-width: 768px) 100vw, 326px"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Get involved */}
      <section
        id="contact"
        className="bg-brand-navy/[0.04] px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10"
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight max-w-xl">
            Help us file in every Member State
          </h2>
          <p className="text-lg md:text-xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            We are already funded to get this started. To take it to every
            Member State, we need translators and legal volunteers who can
            help with translation and submission in their country,
            organisations in EU Member States willing to co-sign, and funders
            to extend the work.
          </p>

          <Suspense fallback={null}>
            <ContactErrorBanner />
          </Suspense>

          {signupEnabled ? (
            <div className="max-w-2xl">
              <ApplyForm source="foi" />
            </div>
          ) : (
            <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
              Applications aren&apos;t open right now. Email{" "}
              <a
                href="mailto:info@lawforaisafety.org"
                className="underline hover:text-brand-black"
              >
                info@lawforaisafety.org
              </a>{" "}
              to register your interest.
            </p>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
