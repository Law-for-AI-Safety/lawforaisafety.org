/**
 * How the radar asks outside services for anything: a User-Agent naming the site (never a
 * person), the run's abort signal, and an error that says which service answered what.
 */
export const USER_AGENT = "LawForAISafety-NewsRadar/1.0 (+https://lawforaisafety.org)";

/** Most text kept from a summary or abstract: enough for the keywords, small enough to store. */
export const SNIPPET_MAX = 400;

export const snippet = (text: string) => (text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX - 1).trimEnd()}…` : text);

export async function getText(url: string, signal: AbortSignal, accept: string): Promise<{ status: number; text: string }> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: accept }, signal });
  return { status: response.status, text: await response.text() };
}

export function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** A source's own words for what went wrong, kept short for the admin page. */
export function failure(service: string, status: number, body: string): Error {
  const detail = body.replace(/\s+/g, " ").trim().slice(0, 160);
  return new Error(`${service} answered HTTP ${status}${detail ? `: ${detail}` : ""}`);
}
