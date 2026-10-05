import type { Metadata } from "next";
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
  title: "MEP Outreach on AI Containment Incidents | Law for AI Safety",
  description:
    "Briefing Members of the European Parliament on the Hugging Face incident and subsequent AI containment failures, and pressing for enforcement clarity under the AI Act.",
};

const asks = [
  {
    title: "Does the AI Act already cover this?",
    body: "Whether the activities involved in the OpenAI and Anthropic incidents fall within the scope of the AI Act, including whether Article 2(8) excludes any relevant activities and, if so, on what basis.",
  },
  {
    title: "Has the Commission acted?",
    body: "Whether the Commission considers that the incidents warrant supervisory action and, to the extent it can disclose, what action it has taken or intends to take in response.",
  },
  {
    title: "Is a safety threshold coming?",
    body: "Whether the Commission intends to propose legislation establishing a threshold above which frontier AI development would require prior evidence of safety.",
  },
];

const signatories = [
  "Future of Life Institute",
  "ControlAI",
  "Existential Risk Observatory",
  "London Futurists",
  "Global AI Governance Alliance",
];

// Signup forms are toggled at runtime from the admin panel, so this page has
// to render per request rather than being prerendered at build time.
export const dynamic = "force-dynamic";

export default async function MepOutreachPage() {
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
            MEP Outreach on AI Containment Incidents
          </h1>
          <Rule />
          <p className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            Briefing Members of the European Parliament on the significance
            of the Hugging Face incident and subsequent{" "}
            <WavyUnderline>AI containment failures</WavyUnderline>, and
            pressing the European Commission for clarity on enforcement.
          </p>
        </div>
      </section>

      {/* What we did */}
      <section className="bg-brand-navy/[0.04] px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <Rule />
          <p className="text-lg md:text-xl font-light text-brand-black/85 leading-relaxed max-w-2xl">
            Our team participated in drafting and sending{" "}
            <a
              href="https://drive.google.com/drive/folders/15L9w4uBOOIvWjbZLIej65rCJIyC8cPWo?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-brand-black"
            >
              emails and briefing documents
            </a>{" "}
            to Members of the European Parliament (MEPs) about the
            significance of the Hugging Face incident and subsequent
            containment failures. We asked them to submit formal questions
            to the European Commission.
          </p>
        </div>
      </section>

      {/* The questions, RLD-style numbered sections */}
      <section className="bg-brand-white px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          {asks.map((ask, i) => (
            <div
              key={ask.title}
              className="flex gap-6 pt-8 border-t border-brand-black/10 first:pt-0 first:border-t-0"
            >
              <span className="text-6xl md:text-8xl font-light leading-[0.8] [font-variant-numeric:lining-nums] text-brand-red/30 flex-shrink-0 w-12 md:w-24 pt-1">
                {i + 1}
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl md:text-2xl font-light text-brand-black">
                  {ask.title}
                </h3>
                <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
                  {ask.body}
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
            &ldquo;Legal clarity on this issue, as well as willingness to
            enforce existing AI regulations, is of paramount
            importance.&rdquo;
          </blockquote>
        </div>
      </section>

      {/* Signatories */}
      <section className="bg-brand-white px-8 md:px-16 py-14 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-baseline gap-3 md:gap-8">
          <span className="text-base font-medium text-brand-black flex-shrink-0">
            Supporting signatories
          </span>
          <ul className="flex flex-col gap-1">
            {signatories.map((org) => (
              <li
                key={org}
                className="text-base font-light text-brand-navy/80"
              >
                {org}
              </li>
            ))}
          </ul>
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
            Help us brief Parliament in person
          </h2>
          <p className="text-lg md:text-xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            We are seeking funding to enable more effective in-person
            briefings on this topic, as well as in-person events for Members
            of the European Parliament and Members of the UK Parliament.
          </p>

          <Suspense fallback={null}>
            <ContactErrorBanner />
          </Suspense>

          {signupEnabled ? (
            <div className="max-w-2xl">
              <ApplyForm source="mep_outreach" />
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
