import type { Metadata } from "next";
import { Suspense } from "react";
import Nav from "../Nav";
import Footer from "../Footer";
import { isRedLinesApplicationsEnabled } from "@/lib/feature-flags";
import RedLinesApplyForm from "./ApplyForm";
import RedLinesApplyToast from "./ApplyToast";
import RedLinesErrorBanner from "./ErrorBanner";
import LetterViewer from "./LetterViewer";
import Timeline from "./Timeline";
import RingBullet from "../RingBullet";
import WavyUnderline from "../WavyUnderline";

function Rule() {
  return (
    <svg viewBox="0 0 52 12" width="56" height="13" aria-hidden fill="none">
      <path d="M0 5 C14 2 38 8 52 5 C38 10 14 7 0 5Z" fill="#9b1c1f" />
    </svg>
  );
}

export const metadata: Metadata = {
  title: "Red Lines Dialogues | Law for AI Safety",
  description:
    "A joint US, Chinese and EU expert dialogue on catastrophic risk from advanced AI, to be presented at the European Parliament.",
};

const focusAreas = [
  {
    title: "Risk of human extinction due to loss of control",
    body: "Understanding the specific pathways through which sufficiently advanced AI systems could create catastrophic or potentially existential risks, with a focus on loss of human control.",
  },
  {
    title: "Legal vehicles for enforceable mitigation",
    body: "Exploring how international cooperation could translate technical and policy safeguards into legal or institutional mechanisms capable of implementation and enforcement across jurisdictions.",
  },
  {
    title: "Technical verification of safety",
    body: "Examining how claims about the safety of advanced AI systems could be technically evaluated and verified, including what forms of evidence or assurance could support international cooperation.",
  },
];

const principles = [
  "Participants contribute in their personal and academic capacities.",
  "The dialogue does not represent any government and does not replace official diplomatic or governmental channels.",
  "Meetings are conducted under a no-attribution convention to allow participants to discuss difficult questions openly.",
  "The aim is to build shared understanding, practical options and trust between experts from the three regions, that we hope would spill over into broader cooperation.",
];

const timeline = [
  {
    date: "5 October 2026",
    detail: "Working Group prepares scope and format",
  },
  {
    date: "12 October 2026",
    time: "09:00 CEST",
    utc: "2026-10-12T07:00:00Z",
    detail: "Online consolidation meeting: scope and content",
  },
  {
    date: "9 November 2026",
    time: "09:00 CET",
    utc: "2026-11-09T08:00:00Z",
    detail: "Online consolidation meeting: refinement of the report",
  },
  {
    date: "7 December 2026",
    time: "09:00 CET",
    utc: "2026-12-07T08:00:00Z",
    detail: "Online consolidation meeting: finalisation of the report",
  },
  {
    date: "January 2027",
    time: "tentative",
    detail:
      "Presentation at the European Parliament with US, Chinese and European delegations",
  },
];

const partners = [
  "AI Governance Working Group, Asia-Europe 4 Artificial Intelligence Network (AE4AI)",
  "Asia-Europe Foundation (ASEF)",
  "Law for AI Safety Institute (LASI)",
];

// Applications are toggled at runtime from the admin panel, so this page has
// to render per request rather than being prerendered at build time.
export const dynamic = "force-dynamic";

export default async function RedLinesDialoguePage() {
  const applicationsEnabled = await isRedLinesApplicationsEnabled();

  return (
    <main className="flex flex-col font-sans">
      <Nav />

      <Suspense fallback={null}>
        <RedLinesApplyToast />
      </Suspense>

      {/* Hero */}
      <section className="bg-brand-white flex flex-col justify-center px-8 md:px-16 pt-44 pb-20 md:pt-52 md:pb-24">
        <div className="max-w-4xl mx-auto w-full flex flex-col gap-8 max-w-3xl">
          <h1
            className="text-4xl md:text-6xl font-light text-brand-black leading-[1.1] tracking-tight"
            style={{ textWrap: "balance" }}
          >
            Red Lines Dialogues
          </h1>
          <Rule />
          <p className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            A joint initiative by the AE4AI Network AI Governance Working Group
            and Law for AI Safety, bringing together US, Chinese and EU experts
            to produce a white paper operationalising{" "}
            <WavyUnderline>AI red lines</WavyUnderline> in legal and technical
            terms, to be presented at the European Parliament.
          </p>
        </div>
      </section>

      {/* About */}
      <section className="bg-brand-navy/[0.04] px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <p className="text-lg md:text-xl font-light text-brand-black/85 leading-relaxed max-w-2xl">
            Red Lines Dialogues is a track-two international expert initiative
            bringing together researchers and institutions from the United
            States, China and Europe to explore how AI behavioural red lines; a
            specific and unacceptable behaviour that an AI system must not
            exhibit, with the onus on the developer to demonstrate with high
            confidence that its system will not cross it, can be
            operationalised, monitored, mitigated and, where possible,
            prevented.
          </p>
          <p className="text-lg md:text-xl font-light text-brand-black/85 leading-relaxed max-w-2xl">
            The initiative is being developed at the written request of Wouter
            Beke, Member of the European Parliament who serves on the Committee
            on Foreign Affairs and the Committee on Security and Defence and
            also chairs the European Parliament&apos;s delegation for relations with
            the countries of Southeast Asia and ASEAN. The aim of the report is
            producing a joint expert report for presentation at the European
            Parliament in early 2027, together with representatives from the
            three regions.
          </p>
          <div className="flex flex-col gap-3 max-w-xl">
            <LetterViewer
              src="/documents/red-lines-dialogue-mep-beke-letter-2026-09-01.pdf"
              title="Letter from MEP Wouter Beke, 1 September 2026"
            />
            <a
              href="/documents/red-lines-dialogue-mep-beke-letter-2026-09-01.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-light text-brand-navy underline hover:text-brand-black w-fit"
            >
              Open Mr Beke&rsquo;s letter in a new tab
            </a>
          </div>
        </div>
      </section>

      {/* The central question */}
      <section className="bg-brand-navy px-8 md:px-16 py-28 md:py-40">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <h2
            className="text-4xl md:text-5xl font-light text-brand-white leading-tight max-w-2xl"
            style={{ textWrap: "balance" }}
          >
            How can the US, China, and the EU develop shared approaches to
            preventing catastrophic outcomes from advanced AI, including the
            risk of losing control over highly capable AI systems?
          </h2>
        </div>
      </section>

      {/* Scope */}
      <section className="bg-brand-white px-8 md:px-16 py-20 md:py-28">
        <div className="max-w-4xl mx-auto flex flex-col gap-12">
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            The dialogue is deliberately narrow in scope. Rather than attempting
            to address every risk associated with advanced AI, the project
            focuses on three connected areas.
          </p>

          <div className="flex flex-col gap-10">
            {focusAreas.map((area, i) => (
              <div
                key={area.title}
                className="flex gap-6 pt-8 border-t border-brand-black/10 first:pt-0 first:border-t-0"
              >
                <span className="text-6xl md:text-8xl font-light leading-[0.8] [font-variant-numeric:lining-nums] text-brand-red/30 flex-shrink-0 w-12 md:w-24 pt-1">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="text-xl md:text-2xl font-light text-brand-black">
                    {area.title}
                  </h3>
                  <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
                    {area.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl border-t border-brand-black/10 pt-8">
            The three sections are being developed sequentially so that the risk
            analysis informs the legal discussion, and the legal discussion
            informs the technical verification question.
          </p>

          <div className="flex flex-col gap-4 bg-brand-navy/[0.04] rounded-sm border border-brand-black/10 px-6 py-6 md:px-8 md:py-8">
            <p className="text-base font-medium text-brand-black">
              The Red Lines Dialogues therefore operates as a track-two process:
            </p>
            <ul className="flex flex-col gap-3">
              {principles.map((item) => (
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

      {/* Who is working on it */}
      <section className="bg-brand-navy/[0.04] px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <Rule />
          <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">
            Who is working on it?
          </h2>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            This is a joint initiative by the AI Governance Working Group of the
            Asia-Europe 4 Artificial Intelligence Network (AE4AI), which
            operates under the umbrella of the Asia-Europe Foundation (ASEF),
            and the Law for AI Safety Institute (LASI), coordinated by
            Rapha&euml;l Weuts, who is both AI Governance Working Group
            Coordinator at AE4AI and Partnerships Lead at LASI.
          </p>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            Both organisations extended invitations to experts from the EU,
            United States and China, with the goal of building a genuinely
            three-region expert process.
          </p>
        </div>
      </section>

      {/* What is happening now */}
      <section className="bg-brand-white px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <Rule />
          <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">
            What is happening now?
          </h2>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            The project is currently in its expert-development phase.
          </p>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            The Working Group is preparing the scope and format of the report
            and inviting a limited number of researchers whose expertise is
            considered particularly relevant to one or more of the three
            sections.
          </p>
        </div>
      </section>

      {/* Timeline */}
      <section className="bg-brand-navy/[0.04] px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          <div className="flex flex-col gap-4">
            <Rule />
            <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">
              Current timeline
            </h2>
          </div>

          <Timeline items={timeline} />
        </div>
      </section>

      {/* How can experts contribute */}
      <section
        id="apply"
        className="bg-brand-white px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10"
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">
            How can experts contribute?
          </h2>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            Are you a PhD expert or equivalent in AI safety, technology law or
            AI governance interested in being part of the project? Please fill
            in this application as soon as possible.
          </p>

          {applicationsEnabled ? (
            <>
              <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
                Applying takes about five minutes. Everything is kept in your
                browser until you submit.
              </p>
              <Suspense fallback={null}>
                <RedLinesErrorBanner />
              </Suspense>
              <div className="max-w-2xl">
                <RedLinesApplyForm />
              </div>
            </>
          ) : (
            <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
              Applications aren&apos;t open right now. Email{" "}
              <a
                href="mailto:redlines@lawforaisafety.org"
                className="underline hover:text-brand-black"
              >
                redlines@lawforaisafety.org
              </a>{" "}
              to register your interest and we&apos;ll let you know when they
              open.
            </p>
          )}
        </div>
      </section>

      {/* Get in touch */}
      <section
        id="contact"
        className="bg-brand-navy/[0.04] px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10"
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight max-w-xl">
            Get in touch
          </h2>
          <p className="text-lg md:text-xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            Have a question, or want to discuss institutional cooperation or
            supporting the project? To contribute to the report or join the
            expert dialogue, use the application form above instead.
          </p>

          <div className="flex flex-col gap-4 bg-brand-white rounded-sm border border-brand-black/10 px-6 py-6 md:px-8 md:py-8 mt-4">
            <div className="flex flex-col gap-1">
              <span className="text-base font-medium text-brand-black">
                Media enquiries
              </span>
              <span className="text-base font-light text-brand-navy/70">
                Journalists looking for background information, expert
                perspectives or clarification about the project are welcome
                to contact the team at{" "}
                <a
                  href="mailto:media@lawforaisafety.org"
                  className="text-brand-navy underline hover:text-brand-black"
                >
                  media@lawforaisafety.org
                </a>
                .
              </span>
              <span className="text-base font-light text-brand-navy/70">
                Please use &ldquo;Media enquiry - Red Lines Dialogues&rdquo; in
                the subject line.
              </span>
            </div>

            <div className="flex flex-col gap-1 pt-4 border-t border-brand-black/10">
              <span className="text-base font-medium text-brand-black">
                Sponsorship and institutional support
              </span>
              <span className="text-base font-light text-brand-navy/70">
                For sponsorship and institutional support enquiries, please
                contact the project team at{" "}
                <a
                  href="mailto:redlines@lawforaisafety.org"
                  className="text-brand-navy underline hover:text-brand-black"
                >
                  redlines@lawforaisafety.org
                </a>
                .
              </span>
              <span className="text-base font-light text-brand-navy/70">
                Please use &ldquo;Partnership / Support - Red Lines
                Dialogues&rdquo; in the subject line.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Project partners */}
      <section className="bg-brand-white px-8 md:px-16 py-14 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-baseline gap-3 md:gap-8">
          <span className="text-base font-medium text-brand-black flex-shrink-0">
            Project partners
          </span>
          <ul className="flex flex-col gap-1">
            {partners.map((partner) => (
              <li
                key={partner}
                className="text-base font-light text-brand-navy/80"
              >
                {partner}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Footer />
    </main>
  );
}
