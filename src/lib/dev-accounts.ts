/**
 * Made-up admin accounts for the local dev server, one per kind of access, so a change can be
 * checked in a browser as each kind of person without LinkedIn. `npm run dev:accounts` lets
 * them in (ADMIN_EMAILS and TECH_ADMIN_EMAILS in .env.local, CMS roles in the local
 * database), and `/api/admin/dev-login`, which exists only under `next dev`, signs one in.
 * Each signs in on its own localhost subdomain (`publish.localhost`), so its cookie is kept
 * apart from the others' and several can be open side by side.
 *
 * Their addresses are on example.com, which no real person has, so even listed in a real
 * ADMIN_EMAILS they could never sign in through LinkedIn.
 */
export type DevAccount = {
  /** The subdomain it signs in on. */
  key: string;
  email: string;
  name: string;
  /** What it can do, for the list the script prints. */
  access: string;
  tech: boolean;
  cms: "draft" | "publish" | null;
};

export const DEV_ACCOUNTS: readonly DevAccount[] = [
  { key: "tech", email: "tech@example.com", name: "Tess Tech (dev)", access: "technical admin: everything", tech: true, cms: null },
  { key: "publish", email: "publish@example.com", name: "Pat Publisher (dev)", access: "reviews, edits and publishes pages", tech: false, cms: "publish" },
  { key: "draft", email: "draft@example.com", name: "Drew Drafter (dev)", access: "reviews, edits page drafts", tech: false, cms: "draft" },
  { key: "reviewer", email: "reviewer@example.com", name: "Robin Reviewer (dev)", access: "reviews applications only", tech: false, cms: null },
];

/** The account named by `?as=`, or else by the request's subdomain (`publish.localhost:3001`). */
export function devAccountFor(host: string | null, as: string | null): DevAccount | null {
  const key = as ?? host?.match(/^([a-z]+)\.localhost(:\d+)?$/)?.[1] ?? null;
  return DEV_ACCOUNTS.find((account) => account.key === key) ?? null;
}

/** Whether a database URL points at this machine, where the dev accounts may be seeded. */
export function isLocalDatabase(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return ["localhost", "127.0.0.1", "[::1]"].includes(host);
}

function addTo(list: string, emails: string[]): string {
  const entries = list.split(",").map((entry) => entry.trim()).filter(Boolean);
  const lower = new Set(entries.map((entry) => entry.toLowerCase()));
  return [...entries, ...emails.filter((email) => !lower.has(email))].join(",");
}

/**
 * The text of an env file with the dev accounts added to ADMIN_EMAILS and the technical one to
 * TECH_ADMIN_EMAILS. Addresses already listed stay, every other line is left as it is, and a
 * variable the file lacks is added at the end.
 */
export function withDevAccounts(envText: string): string {
  const wanted: Record<string, string[]> = {
    ADMIN_EMAILS: DEV_ACCOUNTS.map((account) => account.email),
    TECH_ADMIN_EMAILS: DEV_ACCOUNTS.filter((account) => account.tech).map((account) => account.email),
  };
  const seen = new Set<string>();
  const lines = envText.split("\n").map((line) => {
    const match = line.match(/^(ADMIN_EMAILS|TECH_ADMIN_EMAILS)=(.*)$/);
    if (!match) return line;
    const [, key, value] = match;
    seen.add(key);
    return `${key}=${addTo(value.replace(/^"(.*)"$/, "$1"), wanted[key])}`;
  });
  const missing = Object.keys(wanted)
    .filter((key) => !seen.has(key))
    .map((key) => `${key}=${wanted[key].join(",")}`);
  if (missing.length === 0) return lines.join("\n");
  const text = lines.join("\n");
  return `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}${missing.join("\n")}\n`;
}
