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
  title: "Field-building and Coordination | Law for AI Safety",
  description:
    "Building, coordinating, and mobilising a European legal field dedicated to reducing large-scale risks from AI.",
};

const initiatives = [
  {
    title: "Meet-ups",
    body: "We want to organise meet-ups for European lawyers interested in AI safety, to brainstorm the best ways to use our expertise to reduce AI risks and mobilise to enact different initiatives and develop the field. We're also organising an online meeting with existing organisations and individuals already active in the field, to increase awareness of each other's work, reduce the risk of duplication, and explore possibilities for collaboration.",
  },
  {
    title: "Field directory",
    body: "We want to create an overview of the field, including useful training, courses, events, organisations, networks, and seminal literature. Our new volunteer begins working on this in mid-October.",
  },
  {
    title: "Research",
    body: "We aim to identify the most promising ways European law and legal institutions can contribute to AI risk reduction, including legal and administrative avenues for strengthening accountability and transparency, barriers to effective enforcement and access to justice, and how to turn these into concrete projects legal professionals can contribute to. Once we secure substantial funding, we want to organise research fellowships on applied legal research mapping litigation pathways, favourable jurisdictions, and barriers to asserting rights.",
  },
  {
    title: "Webinars",
    body: (
      <>
        We plan to launch online webinars exploring legal pathways that
        European individuals, civil society, and institutions can use for
        AI risk reduction. We&apos;ve secured our first speaker, and plan our
        first webinar in December 2026. Subscribe to our{" "}
        <a
          href="http://www.youtube.com/@LawforAISafety"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-brand-black"
        >
          YouTube channel
        </a>{" "}
        to see the recordings.
      </>
    ),
  },
  {
    title: "Franchise",
    body: "We've seen interest in starting similar organisations in jurisdictions outside Europe. We're eager to advise on this, and if more law x AI risk reduction organisations emerge globally, we'd like to organise a yearly assembly of organisations working in this field worldwide.",
  },
];

const researchAreas = [
  {
    title: "Emergency powers for catastrophic AI incidents",
    body: "To what extent do European and EU Member State legal frameworks provide public authorities with sufficiently rapid and effective powers to prevent, contain and coordinate responses to catastrophic AI incidents, and what legal gaps, if any, require reform?",
  },
  {
    title: "Access to justice for large-scale societal harms",
    body: "Ordinary standing doctrine is often built around individualised, concrete injury. AI existential and catastrophic risks, like environmental harms, often don't fit this — they are diffuse, collective, irreversible, and future-facing. Europe broadened access to justice in environmental matters via the Aarhus Convention to account for this; researching a similar broadening for AI would be a potentially impactful stream of research.",
  },
];

// Signup forms are toggled at runtime from the admin panel, so this page has
// to render per request rather than being prerendered at build time.
export const dynamic = "force-dynamic";

export default async function FieldBuildingPage() {
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
            Field-building and Coordination
          </h1>
          <Rule />
          <p className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            Lawyers are a talent gap in the AI safety ecosystem. Many are
            committed to reducing AI risk, but struggle to find initiatives
            that use their specific skills —{" "}
            <WavyUnderline>there&apos;s no overview of the field</WavyUnderline>{" "}
            to help them find one.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="bg-brand-navy px-8 md:px-16 py-24 md:py-32">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <blockquote
            className="text-3xl md:text-5xl font-light text-brand-white leading-tight max-w-2xl"
            style={{ textWrap: "balance" }}
          >
            Our mission is to build, coordinate and mobilise a European
            legal field dedicated to reducing large-scale risks from AI.
          </blockquote>
        </div>
      </section>

      {/* Initiatives, RLD-style numbered sections */}
      <section className="bg-brand-white px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          {initiatives.map((item, i) => (
            <div
              key={item.title}
              className="flex gap-6 pt-8 border-t border-brand-black/10 first:pt-0 first:border-t-0"
            >
              <span className="text-6xl md:text-8xl font-light leading-[0.8] [font-variant-numeric:lining-nums] text-brand-red/30 flex-shrink-0 w-12 md:w-24 pt-1">
                {i + 1}
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl md:text-2xl font-light text-brand-black">
                  {item.title}
                </h3>
                <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
                  {item.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Preliminary research areas */}
      <section className="bg-brand-navy/[0.04] px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <Rule />
          <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">
            Two research areas we&apos;re eager to explore
          </h2>
          <ul className="flex flex-col gap-6 mt-2">
            {researchAreas.map((area) => (
              <li key={area.title} className="flex gap-3">
                <span className="flex-shrink-0 pt-1.5">
                  <RingBullet size={16} />
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-medium text-brand-black">
                    {area.title}
                  </span>
                  <span className="text-lg font-light text-brand-navy/85 leading-relaxed">
                    {area.body}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Get involved */}
      <section
        id="contact"
        className="bg-brand-white px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10"
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight max-w-xl">
            Get involved
          </h2>
          <p className="text-lg md:text-xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            Whether you want to join a meet-up, help build the field
            directory, contribute to research, speak at a webinar, start a
            sibling organisation elsewhere, or fund any of this work, apply
            below and let us know what you&apos;re interested in.
          </p>

          <Suspense fallback={null}>
            <ContactErrorBanner />
          </Suspense>

          {signupEnabled ? (
            <div className="max-w-2xl">
              <ApplyForm source="field_building" />
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
