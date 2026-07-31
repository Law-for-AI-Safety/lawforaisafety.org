"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useTina, tinaField } from "tinacms/dist/react";
import { TinaMarkdown } from "tinacms/dist/rich-text";
import Nav from "./Nav";
import WipeButton from "./WipeButton";
import WavyUnderline from "./WavyUnderline";
import type { ContentQuery, ContentQueryVariables } from "../../tina/__generated__/types";

function Rule() {
  return (
    <svg viewBox="0 0 52 12" width="56" height="13" aria-hidden fill="none">
      <path d="M0 5 C14 2 38 8 52 5 C38 10 14 7 0 5Z" fill="#9b1c1f" />
    </svg>
  );
}

function RingBullet() {
  return (
    <svg viewBox="45 109 89 87" width="20" height="20" aria-hidden>
      <path
        d="M45.6629916,146.6460098c3.5526943-28.793663,34.7318051-45.5313207,60.938416-33.2273621,17.5648766,6.945953,31.2843179,25.8792484,28.2118701,45.2992075-5.0611924,32.8726725-42.4664306,48.4200161-69.7619503,30.3102238-14.4563741-8.9429336-21.5606104-25.7715137-19.3883358-42.3820692h0ZM48.6323061,147.0480178c-2.3358111,14.7979655,6.33256,30.1021311,19.3616305,36.9334113,5.2684926,2.6834331,11.3687187,3.7770075,17.2398469,3.4211509,16.5341546-.9545063,30.2459719-15.119223,31.7322923-31.1019064.7488099-8.2632583.6151666-16.9454437-3.6304527-24.5473369-2.9942574-4.8242696-6.7727129-9.5147835-11.8893077-12.2090796-22.3253568-11.5449574-49.096426,2.6685267-52.8140094,27.5037609h0Z"
        fill="#9b1c1f"
      />
    </svg>
  );
}

function LinkedInLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

const focalPositionClasses: Record<string, string> = {
  center: "object-center",
  top: "object-top",
  bottom: "object-bottom",
};

export default function HomeClient(props: {
  data: ContentQuery;
  query: string;
  variables: ContentQueryVariables;
}) {
  const { data } = useTina(props);
  const content = data.content;
  const { hero, mission, work, quote, story, team, contact } = content;

  const sections = [
    { id: "mission", navLabel: mission?.navLabel },
    { id: "work", navLabel: work?.navLabel },
    { id: "our-story", navLabel: story?.navLabel },
    { id: "team", navLabel: team?.navLabel },
    { id: "contact", navLabel: contact?.navLabel },
  ];

  const navLinks = sections
    .filter((s): s is { id: string; navLabel: string } => Boolean(s.navLabel))
    .map((s) => ({ href: `#${s.id}`, label: s.navLabel }));

  return (
    <main className="flex flex-col font-sans">
      <Nav links={navLinks} />

      {/* Hero */}
      <section className="bg-brand-white flex flex-col justify-center px-8 md:px-16 py-60 pb-30">
        <div className="max-w-4xl mx-auto w-full">
          <div className="flex flex-col gap-8 max-w-3xl">
            <h1
              data-tina-field={tinaField(hero, "heading")}
              className="text-5xl md:text-7xl font-light text-brand-black leading-[1.05] tracking-tight"
              style={{ textWrap: "balance" }}
            >
              {hero?.heading}
            </h1>
            <div className="flex flex-col w-fit">
              <Rule />
            </div>
            <div
              data-tina-field={tinaField(hero, "body")}
              className="text-2xl md:text-3xl font-light text-brand-navy/85 leading-relaxed max-w-xl"
            >
              <TinaMarkdown
                content={hero?.body}
                components={{
                  bold: (p?: { children: ReactNode }) => (
                    <WavyUnderline>{p?.children}</WavyUnderline>
                  ),
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section
        id="mission"
        className="bg-brand-navy px-8 md:px-16 py-28 md:py-40"
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-12">
          <div className="flex flex-col gap-8">
            <Rule />
            <h2
              data-tina-field={tinaField(mission, "heading")}
              className="text-4xl md:text-5xl font-light text-brand-white leading-tight max-w-2xl"
              style={{ textWrap: "balance" }}
            >
              {mission?.heading}
            </h2>
            {mission?.body?.map((paragraph, i) => (
              <p
                key={i}
                data-tina-field={tinaField(mission, "body")}
                className="text-xl md:text-2xl font-light text-brand-white/90 leading-relaxed max-w-2xl"
              >
                {paragraph}
              </p>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div
              data-tina-field={tinaField(mission, "photoSrc")}
              className="relative w-full aspect-[4/3] md:aspect-[16/9] rounded-sm overflow-hidden"
            >
              {mission?.photoSrc && (
                <Image
                  src={mission.photoSrc}
                  alt={mission.photoAlt ?? ""}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 896px"
                />
              )}
            </div>
            <p
              data-tina-field={tinaField(mission, "photoCaption")}
              className="text-lg font-light text-brand-white/85"
            >
              {mission?.photoCaption}
            </p>
          </div>
        </div>
      </section>

      {/* How We Work */}
      <section
        id="work"
        className="bg-brand-white px-8 md:px-16 py-28 md:py-40"
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-16">
          <div className="flex flex-col gap-4">
            <Rule />
            <h2
              data-tina-field={tinaField(work, "heading")}
              className="text-4xl md:text-5xl font-light text-brand-black leading-tight"
            >
              {work?.heading}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {work?.mechanisms?.map((m, i) => (
              <div key={i} className="flex flex-col gap-5">
                <Rule />
                <h3
                  data-tina-field={m && tinaField(m, "title")}
                  className="text-3xl font-light text-brand-black"
                >
                  {m?.title}
                </h3>
                <p
                  data-tina-field={m && tinaField(m, "body")}
                  className="text-lg font-light text-brand-navy/85 leading-relaxed"
                >
                  {m?.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brussels Effect */}
      <section className="bg-brand-black px-8 md:px-16 py-28 md:py-40">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <blockquote
            data-tina-field={tinaField(quote, "text")}
            className="text-4xl md:text-6xl font-light text-brand-white leading-tight max-w-3xl"
            style={{ textWrap: "balance" }}
          >
            &ldquo;{quote?.text}&rdquo;
          </blockquote>
          <p
            data-tina-field={tinaField(quote, "body")}
            className="text-xl md:text-2xl font-light text-brand-white/85 leading-relaxed max-w-2xl"
          >
            {quote?.body}
          </p>
        </div>
      </section>

      {/* Events */}
      <section
        id="our-story"
        className="bg-brand-white px-8 md:px-16 py-28 md:py-40"
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-16">
          <div className="flex flex-col gap-4">
            <Rule />
            <h2
              data-tina-field={tinaField(story, "heading")}
              className="text-4xl md:text-5xl font-light text-brand-black leading-tight"
            >
              {story?.heading}
            </h2>
          </div>

          {/* Timeline: gap-14=56px; line h=calc(100%+44px) bridges gap to next dot */}
          <div className="flex flex-col gap-14">
            {story?.events?.map((event, i) => {
              const events = story.events ?? [];
              const isLast = i === events.length - 1;
              if (!event) return null;
              return (
                <div key={i} className="flex gap-8">
                  <div
                    className={
                      isLast
                        ? "relative flex-shrink-0 w-5 h-9 bg-brand-white flex items-center justify-center"
                        : "relative flex-shrink-0 w-5"
                    }
                  >
                    {!isLast && (
                      <div
                        className="absolute top-0 left-[8px] w-1 bg-brand-red/20 h-[calc(100%+80px)]"
                        aria-hidden
                      />
                    )}
                    <div
                      className={
                        isLast
                          ? "contents"
                          : "relative w-5 h-9 bg-brand-white flex items-center justify-center"
                      }
                    >
                      <RingBullet />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 min-w-0">
                    <h3
                      data-tina-field={tinaField(event, "heading")}
                      className="text-3xl font-light text-brand-black leading-snug max-w-xl"
                    >
                      {event.heading}
                    </h3>
                    <div
                      data-tina-field={tinaField(event, "body")}
                      className="flex flex-col gap-4 [&_p]:text-lg [&_p]:font-light [&_p]:text-brand-navy/85 [&_p]:leading-relaxed [&_p]:max-w-2xl [&_a]:underline [&_a:hover]:text-brand-black"
                    >
                      <TinaMarkdown content={event.body} />
                    </div>
                    {event.ctaLabel && event.ctaHref && (
                      <div className="pt-4">
                        <WipeButton
                          href={event.ctaHref}
                          className="inline-flex items-center gap-3 px-8 py-4 bg-brand-red text-brand-white text-lg font-light rounded-sm overflow-hidden"
                          hoverBg="rgba(255,255,255,0.15)"
                        >
                          <LinkedInLogo />{" "}
                          <span data-tina-field={tinaField(event, "ctaLabel")}>
                            {event.ctaLabel}
                          </span>
                        </WipeButton>
                      </div>
                    )}
                    {event.images && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {event.images.map((img, imgI) => {
                          if (!img?.src) return null;
                          return (
                            <div
                              key={imgI}
                              data-tina-field={tinaField(img, "src")}
                              className="relative w-full aspect-[4/3] rounded-sm overflow-hidden"
                            >
                              <Image
                                src={img.src}
                                alt={img.alt ?? ""}
                                fill
                                className={`object-cover ${focalPositionClasses[img.position ?? "center"]}`}
                                sizes="(max-width: 768px) 100vw, 298px"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team */}
      <section id="team" className="bg-brand-navy px-8 md:px-16 py-28 md:py-40">
        <div className="max-w-4xl mx-auto flex flex-col gap-12">
          <div className="flex flex-col gap-4">
            <Rule />
            <h2
              data-tina-field={tinaField(team, "heading")}
              className="text-4xl md:text-5xl font-light text-brand-white leading-tight"
            >
              {team?.heading}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {team?.members?.map((person, i) => {
              if (!person) return null;
              return (
                <div key={i} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div
                        data-tina-field={tinaField(person, "photo")}
                        className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0"
                      >
                        {person.photo && (
                          <Image
                            src={person.photo}
                            alt={`Portrait of ${person.name}`}
                            fill
                            className="object-cover"
                            sizes="96px"
                          />
                        )}
                      </div>
                      <p
                        data-tina-field={tinaField(person, "name")}
                        className="text-2xl font-light text-brand-white"
                      >
                        {person.name}
                      </p>
                    </div>
                    {person.linkedin && (
                      <a
                        href={person.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${person.name} on LinkedIn`}
                        className="flex-shrink-0 text-brand-white/50 hover:text-brand-white transition-colors duration-200"
                      >
                        <LinkedInLogo />{" "}
                      </a>
                    )}
                  </div>
                  <p
                    data-tina-field={tinaField(person, "role")}
                    className="text-lg font-light text-brand-white/90"
                  >
                    {person.role}
                  </p>
                  <p
                    data-tina-field={tinaField(person, "bio")}
                    className="text-lg font-light text-brand-white/85 leading-relaxed mt-1"
                  >
                    {person.bio}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section
        id="contact"
        className="bg-brand-white px-8 md:px-16 py-28 md:py-40 border-t border-brand-black/10"
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <h2
            data-tina-field={tinaField(contact, "heading")}
            className="text-4xl md:text-5xl font-light text-brand-black leading-tight max-w-xl"
            style={{ textWrap: "balance" }}
          >
            {contact?.heading}
          </h2>
          <p
            data-tina-field={tinaField(contact, "body")}
            className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl"
          >
            {contact?.body}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <WipeButton
              href={`mailto:${contact?.email}`}
              className="px-8 py-4 border border-brand-black/30 text-brand-black text-lg font-light rounded-sm overflow-hidden"
              hoverBg="rgba(27,51,76,0.07)"
            >
              Contact us
            </WipeButton>
            <WipeButton
              href={contact?.linkedin ?? ""}
              className="inline-flex items-center gap-3 px-8 py-4 bg-brand-red text-brand-white text-lg font-light rounded-sm overflow-hidden"
              hoverBg="rgba(255,255,255,0.15)"
            >
              <LinkedInLogo />
              Follow our work on Linkedin
            </WipeButton>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-black px-8 md:px-16 py-12">
        <div className="max-w-4xl mx-auto flex flex-row justify-between items-center gap-6">
          <Image
            src="/logo.svg"
            alt="Law for AI Safety"
            width={160}
            height={48}
            className="w-36 brightness-0 invert opacity-40"
          />
          <p className="text-lg font-light text-brand-white/85">
            © {new Date().getFullYear()} Law for AI Safety. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
