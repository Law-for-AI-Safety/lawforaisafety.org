import type { Metadata } from "next";
import { Suspense } from "react";
import Nav from "../Nav";
import Footer from "../Footer";
import ApplyForm from "../apply/ApplyForm";
import ApplyToast from "../ApplyToast";
import ContactErrorBanner from "../ContactErrorBanner";
import RingBullet from "../RingBullet";
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
  title: "Council of Europe Engagement | Law for AI Safety",
  description:
    "Building a strategy for AI safety training for judges and a conference at the Council of Europe, with Dr. Anca Radu.",
};

const ambitions = [
  "Provide AI safety training for judges from the European Court of Human Rights.",
  "Organise a conference at the Council of Europe that results in a concrete output.",
];

// Signup forms are toggled at runtime from the admin panel, so this page has
// to render per request rather than being prerendered at build time.
export const dynamic = "force-dynamic";

export default async function CouncilOfEuropePage() {
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
            Council of Europe Engagement
          </h1>
          <Rule />
          <p className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            Building a strategy for{" "}
            <WavyUnderline>AI safety training for judges</WavyUnderline>, and
            a conference at the Council of Europe that results in a concrete
            output.
          </p>
        </div>
      </section>

      {/* The central question */}
      <section className="bg-brand-navy px-8 md:px-16 py-24 md:py-32">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <h2
            className="text-3xl md:text-5xl font-light text-brand-white leading-tight max-w-2xl"
            style={{ textWrap: "balance" }}
          >
            How can Europe&rsquo;s judicial institutions prepare for AI risk,
            not just AI cases?
          </h2>
        </div>
      </section>

      {/* About */}
      <section className="bg-brand-white px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          <p className="text-lg md:text-xl font-light text-brand-black/85 leading-relaxed max-w-2xl">
            We are working with Dr.{" "}
            <a
              href="https://www.linkedin.com/in/raduanca/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-brand-black"
            >
              Anca Radu
            </a>
            , an expert in the fields of AI &times; judicial systems,
            cyberjustice, and the Council of Europe, to produce a strategy
            for engagement with the Council of Europe.
          </p>

          <div className="flex flex-col gap-4 bg-brand-navy/[0.04] rounded-sm border border-brand-black/10 px-6 py-6 md:px-8 md:py-8">
            <p className="text-base font-medium text-brand-black">
              Our ambition:
            </p>
            <ul className="flex flex-col gap-3">
              {ambitions.map((item) => (
                <li
                  key={item}
                  className="text-lg font-light text-brand-navy/85 leading-relaxed flex gap-3"
                >
                  <span className="flex-shrink-0 pt-1.5">
                    <RingBullet size={16} />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
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
            Help us make this happen
          </h2>
          <p className="text-lg md:text-xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            These opportunities for AI risk reduction carry substantial
            costs. That is why we are seeking funding and partners who want
            to collaborate with us on this workstream.
          </p>

          <Suspense fallback={null}>
            <ContactErrorBanner />
          </Suspense>

          {signupEnabled ? (
            <div className="max-w-2xl">
              <ApplyForm source="council_of_europe" variant="institutional" />
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
