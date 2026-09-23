import type { Metadata } from "next";
import { Suspense } from "react";
import Nav from "../Nav";
import Footer from "../Footer";
import WipeButton from "../WipeButton";
import { isRedLinesApplicationsEnabled } from "@/lib/feature-flags";
import RedLinesApplyForm from "./ApplyForm";
import RedLinesApplyToast from "./ApplyToast";
import RedLinesErrorBanner from "./ErrorBanner";
import LetterViewer from "./LetterViewer";
import LocalTime from "./LocalTime";
import RingBullet from "../RingBullet";

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
  "The aim is to build shared understanding, practical options and trust between experts from the three regions.",
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

const waysToContribute = [
  {
    title: "Contribute or review one of the three sections of the report",
    body: "Participants may provide written contributions, comments or reviews as the draft develops.",
  },
  {
    title: "Join the expert dialogue",
    body: "Online meetings are held to discuss the scope, substance and refinement of the report. Each meeting lasts approximately two hours.",
  },
  {
    title: "Contribute across drafts",
    body: "Written comments on successive drafts are welcome between meetings.",
  },
  {
    title: "Join the delegation presenting the report",
    body: "A limited number of contributors may be invited to participate in the US, Chinese or European delegation for the presentation at the European Parliament.",
  },
];

const audiences = [
  {
    title: "Researchers and experts",
    body: "We welcome expressions of interest from researchers, academics, technical experts, legal scholars and policy practitioners whose work is relevant to catastrophic AI risk, international AI governance, legal mechanisms or technical AI safety verification.",
  },
  {
    title: "Institutions",
    body: "Universities, research institutes, think tanks and other organisations working on relevant questions may engage with the project through expert participation, research exchange or institutional cooperation.",
  },
  {
    title: "Journalists and media",
    body: "Journalists looking for background information, expert perspectives or clarification about the project are welcome to contact the team. The dialogue's track-two and no-attribution format should be taken into account when reporting on individual discussions.",
  },
  {
    title: "Sponsors and supporters",
    body: "The project is open to conversations with organisations interested in supporting international research and dialogue on catastrophic AI risk. Support may be discussed in relation to areas such as research, expert convening, coordination, communications and the practical organisation of the dialogue and its outputs.",
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
            A joint US, Chinese and EU expert dialogue on catastrophic risk
            from advanced AI, to be presented at the European Parliament.
          </p>
        </div>
      </section>

      {/* About */}
      <section className="bg-brand-navy/[0.04] px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <p className="text-lg md:text-xl font-light text-brand-black/85 leading-relaxed max-w-2xl">
            Red Lines Dialogues is a track-two international expert
            initiative bringing together researchers and institutions from
            the United States, China and Europe to explore how catastrophic
            risks from advanced artificial intelligence can be monitored,
            mitigated and, where possible, prevented.
          </p>
          <p className="text-lg md:text-xl font-light text-brand-black/85 leading-relaxed max-w-2xl">
            The initiative is being developed at the written request of
            Wouter Beke, Member of the European Parliament, with the aim of
            producing a joint expert report for presentation at the European
            Parliament in early 2027, together with representatives from the
            three regions.
          </p>
        </div>
      </section>

      {/* Scope */}
      <section className="bg-brand-white px-8 md:px-16 py-20 md:py-28">
        <div className="max-w-4xl mx-auto flex flex-col gap-12">
          <div className="flex flex-col gap-6">
            <Rule />
            <h2
              className="text-3xl md:text-4xl font-light text-brand-black leading-tight max-w-2xl"
              style={{ textWrap: "balance" }}
            >
              How can the US, China, and the EU develop shared approaches to
              preventing catastrophic outcomes from advanced AI, including
              the risk of losing control over highly capable AI systems?
            </h2>
            <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
              The dialogue is deliberately narrow in scope. Rather than
              attempting to address every risk associated with advanced AI,
              the project focuses on three connected areas.
            </p>
          </div>

          <div className="flex flex-col gap-10">
            {focusAreas.map((area, i) => (
              <div
                key={area.title}
                className="flex gap-6 pt-8 border-t border-brand-black/10 first:pt-0 first:border-t-0"
              >
                <span className="text-2xl font-light text-brand-red flex-shrink-0 w-8">
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
            The three sections are being developed sequentially so that the
            risk analysis informs the legal discussion, and the legal
            discussion informs the technical verification question.
          </p>
        </div>
      </section>

      {/* Why track-two */}
      <section className="bg-brand-navy/[0.04] px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          <div className="flex flex-col gap-6">
            <Rule />
            <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">
              Why a track-two process
            </h2>
            <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
              Advanced AI is being developed in a highly international
              environment, while the consequences of a catastrophic failure
              would not respect national borders.
            </p>
            <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
              The project starts from the premise that meaningful
              international cooperation may require more than formal
              diplomatic channels alone. Researchers and technical experts
              can help establish a shared vocabulary, clarify areas of
              disagreement, identify possible safeguards and develop the
              substance that policymakers may later need.
            </p>
          </div>

          <div className="flex flex-col gap-4 bg-brand-white rounded-sm border border-brand-black/10 px-6 py-6 md:px-8 md:py-8">
            <p className="text-base font-medium text-brand-black">
              The Red Lines Dialogues therefore operates as a track-two
              process:
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

          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            The initiative builds on discussions around international
            convergence on minimum safeguards against catastrophic AI risks,
            including the Geneva launch of{" "}
            <em>The Essential Convergence: Global Compact on Extreme AI
            Risks</em>{" "}
            on 6 July 2026.
          </p>

          <div className="flex flex-col gap-4 border-t border-brand-black/10 pt-8">
            <h3 className="text-xl md:text-2xl font-light text-brand-black">
              The parliamentary foundation
            </h3>
            <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
              The initiative rests on a written request from MEP Wouter Beke
              dated 1 September 2026.
            </p>
            <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
              Mr Beke is a Member of the European Parliament and serves on
              the Committee on Foreign Affairs and the Committee on Security
              and Defence. He also chairs the European Parliament&rsquo;s
              delegation for relations with the countries of Southeast Asia
              and ASEAN.
            </p>
            <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
              In his letter, he asks the AI Governance Working Group of the
              Asia-Europe 4 Artificial Intelligence Network (AE4AI) to
              explore the feasibility of a structured expert dialogue between
              American, Chinese and European institutions on the monitoring
              and prevention of catastrophic risks from advanced AI.
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
            <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
              The Working Group has been asked to present its findings in
              early 2027, with the possibility of sharing them with
              interested Members and relevant delegations in the European
              Parliament.
            </p>
          </div>
        </div>
      </section>

      {/* Who is working on it */}
      <section className="bg-brand-white px-8 md:px-16 py-20 md:py-28">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <Rule />
          <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">
            Who is working on it?
          </h2>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            The initiative is coordinated by the AI Governance Working Group
            of the Asia-Europe 4 Artificial Intelligence Network (AE4AI) and
            supported by the Law for AI Safety Institute (LASI).
          </p>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            AE4AI operates under the umbrella of the Asia-Europe Foundation
            (ASEF), an intergovernmental not-for-profit organisation founded
            in 1997 and headquartered in Singapore. ASEF&rsquo;s members
            include the European Union and the ASEAN Secretariat.
          </p>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            The AE4AI Network brings together more than 240 academics from
            over 40 countries in Asia and Europe, including approximately
            100 members of the AI Governance Working Group.
          </p>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            The Working Group has previously conducted research on
            prescriptive AI regulation and engaged with lawmakers and other
            stakeholders on questions of AI governance.
          </p>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            The Red Lines Dialogues also involves counterparts and experts
            from the United States and China, with the goal of building a
            genuinely three-region expert process.
          </p>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            Discussions are ongoing regarding the practical arrangements for
            the European Parliament presentation, including engagement with
            other Members of the European Parliament and the relevant
            delegations.
          </p>
        </div>
      </section>

      {/* What is happening now */}
      <section className="bg-brand-navy/[0.04] px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <Rule />
          <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">
            What is happening now?
          </h2>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            The project is currently in its expert-development phase.
          </p>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
            The Working Group is preparing the scope and format of the
            report and inviting a limited number of researchers whose
            expertise is considered particularly relevant to one or more of
            the three sections.
          </p>
        </div>
      </section>

      {/* Timeline */}
      <section className="bg-brand-white px-8 md:px-16 py-20 md:py-28">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          <div className="flex flex-col gap-4">
            <Rule />
            <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">
              Current timeline
            </h2>
          </div>

          <div className="flex flex-col">
            {timeline.map((item) => (
              <div
                key={item.date}
                className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2 md:gap-8 py-6 border-t border-brand-black/10 last:border-b"
              >
                <div className="flex flex-col">
                  <span className="text-lg font-medium text-brand-black">
                    {item.date}
                  </span>
                  {item.time && (
                    <span className="text-base font-light text-brand-navy/70">
                      {item.time}
                      {item.utc && <LocalTime utc={item.utc} />}
                    </span>
                  )}
                </div>
                <p className="text-lg font-light text-brand-navy/85 leading-relaxed">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How can experts contribute */}
      <section className="bg-brand-navy/[0.04] px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-12">
          <div className="flex flex-col gap-4">
            <Rule />
            <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">
              How can experts contribute?
            </h2>
            <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
              The project is intentionally small and expert-led. Researchers
              and practitioners may be invited to:
            </p>
          </div>

          <div className="flex flex-col gap-8">
            {waysToContribute.map((item) => (
              <div
                key={item.title}
                className="flex flex-col gap-2 pt-8 border-t border-brand-black/10 first:pt-0 first:border-t-0"
              >
                <h3 className="text-xl font-light text-brand-black">
                  {item.title}
                </h3>
                <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
                  {item.body}
                </p>
              </div>
            ))}
          </div>

          <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl border-t border-brand-black/10 pt-8">
            Contributors to the report are intended to be named as
            co-authors.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-brand-black/10 pt-10">
            {audiences.map((item) => (
              <div key={item.title} className="flex flex-col gap-2">
                <h3 className="text-lg font-medium text-brand-black">
                  {item.title}
                </h3>
                <p className="text-base font-light text-brand-navy/85 leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>

          <WipeButton
            href="#apply"
            className="w-fit px-8 py-4 bg-brand-red text-brand-white text-lg font-light rounded-sm overflow-hidden"
            hoverBg="rgba(255,255,255,0.15)"
          >
            Apply to contribute
          </WipeButton>
        </div>
      </section>

      {/* Apply */}
      <section
        id="apply"
        className="bg-brand-white px-8 md:px-16 py-20 md:py-28"
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight max-w-xl">
            Apply to contribute
          </h2>

          {applicationsEnabled ? (
            <>
              <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
                Applying takes about five minutes. Everything is kept in your browser until you submit.
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
                href="mailto:redlinesdialogue@lawforaisafety.org"
                className="underline hover:text-brand-black"
              >
                redlinesdialogue@lawforaisafety.org
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
        className="bg-brand-white px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10"
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

          <div className="flex flex-col gap-4 pt-4">
            <WipeButton
              href="mailto:redlinesdialogue@lawforaisafety.org"
              className="w-fit px-8 py-4 bg-brand-red text-brand-white text-lg font-light rounded-sm overflow-hidden"
              hoverBg="rgba(255,255,255,0.15)"
            >
              Contact the team
            </WipeButton>
          </div>

          <div className="flex flex-col gap-4 bg-brand-navy/[0.04] rounded-sm border border-brand-black/10 px-6 py-6 md:px-8 md:py-8 mt-4">
            <div className="flex flex-col gap-1">
              <span className="text-base font-medium text-brand-black">
                Media enquiries
              </span>
              <a
                href="mailto:media@lawforaisafety.org"
                className="text-lg font-light text-brand-navy underline hover:text-brand-black w-fit"
              >
                media@lawforaisafety.org
              </a>
              <span className="text-base font-light text-brand-navy/70">
                Please use &ldquo;Media enquiry - Red Lines Dialogues&rdquo;
                in the subject line.
              </span>
            </div>

            <div className="flex flex-col gap-1 pt-4 border-t border-brand-black/10">
              <span className="text-base font-medium text-brand-black">
                Sponsorship and institutional support
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
      <section className="bg-brand-navy/[0.04] px-8 md:px-16 py-14 border-t border-brand-black/10">
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
