import Image from "next/image";
import { DARK_BAND, type DarkTone } from "../bands";
import { RichTextBlocks } from "../render";
import LinkedInLogo from "./LinkedInLogo";
import Rule from "./Rule";
import type { BlockOf } from "./types";

type Person = BlockOf<"teamGrid">["members"][number];

const TEXT = "text-xl font-light text-brand-white/90 leading-relaxed max-w-2xl";
const LIST_ITEM = "text-xl font-light text-brand-white/90 leading-relaxed flex gap-3";

/**
 * The people in their groups: those with no group first, then each group in the order it
 * first appears.
 */
export function groupPeople(members: readonly Person[]): { group?: string; people: Person[] }[] {
  const groups = new Map<string | undefined, Person[]>([[undefined, []]]);
  for (const person of members) {
    const people = groups.get(person.group);
    if (people) people.push(person);
    else groups.set(person.group, [person]);
  }
  return [...groups].filter(([, people]) => people.length > 0).map(([group, people]) => ({ group, people }));
}

/**
 * A grid of people: names, optional photos from the repo, roles, bios and LinkedIn links,
 * with an optional introduction and optional named groups.
 */
export default function TeamGrid({ block, tone, id }: { block: BlockOf<"teamGrid">; tone: DarkTone; id?: string }) {
  return (
    <section id={id} className={`${DARK_BAND[tone]} px-8 md:px-16 py-28 md:py-40`}>
      <div className="max-w-4xl mx-auto flex flex-col gap-12">
        <div className="flex flex-col gap-4">
          <Rule />
          <h2 className="text-4xl md:text-5xl font-light text-brand-white leading-tight">{block.heading}</h2>
        </div>
        {block.intro && <RichTextBlocks value={block.intro} paragraphClassName={TEXT} listItemClassName={LIST_ITEM} />}
        {groupPeople(block.members).map(({ group, people }) => (
          <div key={group ?? ""} className="flex flex-col gap-8">
            {group && (
              <h3 className="text-sm font-medium uppercase tracking-widest text-brand-white/70 border-b border-brand-white/20 pb-3">
                {group}
              </h3>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {people.map((person, i) => (
                <PersonCard key={i} person={person} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PersonCard({ person }: { person: Person }) {
  return (
    <div className="flex flex-col gap-2">
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
  );
}
