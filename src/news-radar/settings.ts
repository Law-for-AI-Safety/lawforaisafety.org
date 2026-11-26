import { z } from "zod";
import type { NewsRadarSettings, Topic } from "./types";

/**
 * Checks on the settings form (/admin/news-radar/settings), run by the server action whatever
 * the browser sent. Lists arrive one entry per line; blank lines and spaces around entries go.
 */

export const LIMITS = { topics: 20, terms: 40, termLength: 120, nameLength: 120, outlets: 100 };

const term = z.string().trim().max(LIMITS.termLength, `Keep each entry under ${LIMITS.termLength} characters.`);
const list = (max: number) =>
  z
    .array(term)
    .transform((entries) => [...new Set(entries.filter((t) => t !== ""))])
    .refine((entries) => entries.length <= max, `Keep each list to ${max} entries.`);
const terms = list(LIMITS.terms);

const topic = z.object({
  id: z.string().trim().max(80).regex(/^[a-z0-9-]*$/),
  name: z.string().trim().min(1, "Give each topic a name.").max(LIMITS.nameLength, `Keep topic names under ${LIMITS.nameLength} characters.`),
  queries: terms.refine((list) => list.length > 0, "Give each topic at least one search term."),
  include: terms.refine((list) => list.length > 0, "Give each topic at least one include keyword."),
  require: terms,
  exclude: terms,
});

const recipient = z
  .string()
  .nullable()
  .transform((v) => (v?.trim() ? v.trim().toLowerCase() : null))
  .refine((v) => v === null || z.email().safeParse(v).success, "The recipient must be an email address.");

const schema = z.object({
  topics: z.array(topic).min(1, "Keep at least one topic.").max(LIMITS.topics, `Keep to ${LIMITS.topics} topics.`),
  trustedOutlets: list(LIMITS.outlets),
  recipient,
});

export type SettingsInput = z.input<typeof schema>;

/** A topic's id from its name, for a topic added on the form. */
export function topicId(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "topic";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** The settings to save, or what is wrong with them. Topics without an id get one. */
export function parseSettings(input: unknown): { ok: true; settings: NewsRadarSettings } | { ok: false; problem: string } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, problem: parsed.error.issues[0].message };
  const taken = new Set(parsed.data.topics.map((t) => t.id).filter(Boolean));
  if (taken.size !== parsed.data.topics.filter((t) => t.id).length) return { ok: false, problem: "Two topics have the same id." };
  const topics: Topic[] = parsed.data.topics.map((t) => {
    if (t.id) return t;
    const id = topicId(t.name, taken);
    taken.add(id);
    return { ...t, id };
  });
  return { ok: true, settings: { topics, trustedOutlets: parsed.data.trustedOutlets, recipient: parsed.data.recipient } };
}
