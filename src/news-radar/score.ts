import { hostOf, normaliseText } from "./normalise";
import type { Candidate, Topic } from "./types";

/**
 * Which topics a candidate is about, and how strongly. The run keeps only candidates with at
 * least one topic, ranks by `score`, and stores the topics best first. Any function of this
 * shape can replace the keyword scorer (say, one asking a language model), with no other change.
 */
export type Score = { topics: string[]; score: number };
export type Scorer = (candidate: Candidate, topics: Topic[], trustedOutlets: string[]) => Score | null;

/** Added to the score of an article from a trusted outlet. */
export const TRUSTED_OUTLET_BONUS = 3;

/** Whether normalised `text` holds `term` as whole words. */
function holds(text: string, term: string): boolean {
  const needle = normaliseText(term);
  return needle !== "" && ` ${text} `.includes(` ${needle} `);
}

export function isTrustedOutlet(candidate: Pick<Candidate, "outlet" | "url">, trustedOutlets: string[]): boolean {
  const outlet = normaliseText(candidate.outlet);
  const host = hostOf(candidate.url);
  return trustedOutlets.some((entry) => {
    const term = entry.trim().toLowerCase();
    if (term === "") return false;
    if (term.includes(".")) return host === term || host.endsWith(`.${term}`);
    return outlet === normaliseText(term);
  });
}

/** A topic a candidate matched, the include keywords that made it match, and the points they scored. */
export type TopicMatch = { id: string; keywords: string[]; points: number };

/**
 * The topics a candidate matches, best first, each with the include keywords found in it. A topic
 * matches when the title or summary holds one of its include keywords, one of its required words if
 * it has any, and none of its exclude keywords. Each include keyword found scores a point, double in
 * the title. Pure, so a proposed set of topics can be tried on stored items without saving it.
 */
export function matchTopics(candidate: Pick<Candidate, "title" | "snippet">, topics: Topic[]): TopicMatch[] {
  const title = normaliseText(candidate.title);
  const body = `${title} ${normaliseText(candidate.snippet)}`;
  const matched: TopicMatch[] = [];
  for (const topic of topics) {
    if (topic.exclude.some((term) => holds(body, term))) continue;
    if (topic.require.length > 0 && !topic.require.some((term) => holds(body, term))) continue;
    const keywords: string[] = [];
    let points = 0;
    for (const term of topic.include) {
      const found = holds(title, term) ? 2 : holds(body, term) ? 1 : 0;
      if (found > 0) keywords.push(term);
      points += found;
    }
    if (points > 0) matched.push({ id: topic.id, keywords, points });
  }
  return matched.sort((a, b) => b.points - a.points);
}

/**
 * Version one: no model, only words (see matchTopics), plus a bonus for a trusted outlet.
 */
export const keywordScorer: Scorer = (candidate, topics, trustedOutlets) => {
  const matched = matchTopics(candidate, topics);
  if (matched.length === 0) return null;
  const total = matched.reduce((sum, m) => sum + m.points, 0);
  return {
    topics: matched.map((m) => m.id),
    score: total + (isTrustedOutlet(candidate, trustedOutlets) ? TRUSTED_OUTLET_BONUS : 0),
  };
};
