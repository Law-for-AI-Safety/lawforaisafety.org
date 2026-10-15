import Image from "next/image";
import { DARK_BAND, type DarkTone } from "../bands";
import LinkedInLogo from "./LinkedInLogo";
import Rule from "./Rule";
import type { BlockOf } from "./types";

/** The homepage team grid: names, optional photos from the repo, roles, bios and LinkedIn links. */
export default function TeamGrid({ block, tone }: { block: BlockOf<"teamGrid">; tone: DarkTone }) {
  return (
    <section id="team" className={`${DARK_BAND[tone]} px-8 md:px-16 py-28 md:py-40`}>
      <div className="max-w-4xl mx-auto flex flex-col gap-12">
        <div className="flex flex-col gap-4">
          <Rule />
          <h2 className="text-4xl md:text-5xl font-light text-brand-white leading-tight">{block.heading}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {block.members.map((person, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {person.photo && (
                    <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                      <Image src={person.photo} alt={person.photoAlt ?? ""} fill className="object-cover" sizes="96px" />
                    </div>
                  )}
                  <p className="text-2xl font-light text-brand-white">{person.name}</p>
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
              <p className="text-lg font-light text-brand-white/90">{person.role}</p>
              <p className="text-lg font-light text-brand-white/85 leading-relaxed mt-1">{person.bio}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
