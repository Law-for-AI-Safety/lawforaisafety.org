export type Person = { email: string; name: string };

/**
 * The name to show for an assignee/owner email: their display name if they
 * have signed in, otherwise the raw address. Plain module, not part of the
 * client picker, so server components can call it too.
 */
export function personLabel(email: string | null, people: Person[]): string | null {
  if (!email) return null;
  const match = people.find((person) => person.email.toLowerCase() === email.toLowerCase());
  return match ? match.name : email;
}
