import { branchName as sharedBranchName, codeSpan, deleteOrKeep, githubFailure } from "../cms/branch-publish";
import { GitHubError, type GitHubClient } from "../cms/github";
import { MAIN_BRANCH } from "../cms/github-config";
import { opportunityFilePath, printOpportunity } from "./files";
import { opportunitySchema, stubSchema } from "./schema";
import type { Opportunity } from "./types";

/**
 * Publishing an opportunity: turning an admin's create/edit/delete/import action into a pull
 * request against `main`, that changes only `content/opportunities/<slug>.json`. Mirrors
 * `src/cms/publish.ts`'s shape (commit on top of main, then a branch with a retry-on-collision
 * name, then the pull request), sharing its small generic pieces (`src/cms/branch-publish.ts`),
 * but simpler: no draft/lock/submission database state, since every action here is a single
 * submit, not a collaboratively-edited draft. Merging stays a manual, human decision in GitHub -
 * this never auto-merges.
 */

export const MAX_BRANCH_ATTEMPTS = 10;

export function branchName(slug: string, at: Date, attempt = 1): string {
  return sharedBranchName("opportunities", slug, at, attempt);
}

export type FieldChange = { label: string; before: string; after: string };

const NONE = "(none)";
const EMPTY = "(empty)";

// Not shared with `src/cms/field-diff.ts`'s own `show()`: that one always JSON.stringifies an
// array (it never diffs a plain string list like `tags`), so unifying them would change one
// side's rendering for no shared benefit.
function show(value: unknown): string {
  if (value === undefined || value === null) return NONE;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : EMPTY;
  if (typeof value === "string") return value === "" ? EMPTY : value;
  return JSON.stringify(value);
}

/** A field's label, in the order they read naturally on the admin form. */
const FIELD_LABELS: Record<keyof Opportunity, string> = {
  slug: "Slug",
  type: "Type",
  title: "Title",
  org: "Organisation",
  orgUrl: "Organisation URL",
  summary: "Summary",
  description: "Description",
  location: "Location",
  remote: "Remote",
  commitment: "Commitment",
  compensation: "Compensation",
  deadline: "Deadline",
  startDate: "Start date",
  endDate: "End date",
  tags: "Tags",
  applyUrl: "Apply URL",
  applyLabel: "Apply label",
  sourceUrl: "Source URL",
  publishedAt: "Published date",
};

/** Which fields differ between two versions of an opportunity, with the text before and after. */
export function changedFields(before: Opportunity, after: Opportunity): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of Object.keys(FIELD_LABELS) as (keyof Opportunity)[]) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    changes.push({ label: FIELD_LABELS[key], before: show(b), after: show(a) });
  }
  return changes;
}

const FOOTER = "Merging this makes the listing live. Close this pull request with a comment to decline it.";

function summaryLines(opportunity: Opportunity): string[] {
  return [
    `- **Type:** ${codeSpan(opportunity.type)}`,
    `- **Organisation:** ${codeSpan(opportunity.org)}`,
    `- **Apply link:** ${codeSpan(opportunity.applyUrl)}`,
  ];
}

export function createPullRequestTitle(title: string): string {
  return `Add opportunity: ${title.replace(/\s+/g, " ").trim()}`;
}

export function createPullRequestBody(opportunity: Opportunity, editorName: string): string {
  const path = opportunityFilePath(opportunity.slug);
  return [
    `A new opportunity listing, opened from the admin opportunities page by ${codeSpan(editorName)}. This pull request adds only ${codeSpan(path)}.`,
    "",
    ...summaryLines(opportunity),
    "",
    "---",
    "",
    FOOTER,
  ].join("\n") + "\n";
}

export function updatePullRequestTitle(title: string): string {
  return `Update opportunity: ${title.replace(/\s+/g, " ").trim()}`;
}

export function updatePullRequestBody(slug: string, changes: FieldChange[], editorName: string): string {
  const path = opportunityFilePath(slug);
  const lines = [
    `An edit sent from the admin opportunities page by ${codeSpan(editorName)}. This pull request changes only ${codeSpan(path)}.`,
    "",
    `## Changes (${changes.length})`,
    "",
  ];
  for (const change of changes) {
    lines.push(`### ${change.label}`, "", `Before: ${codeSpan(change.before)}`, `After: ${codeSpan(change.after)}`, "");
  }
  lines.push("---", "", FOOTER);
  return lines.join("\n") + "\n";
}

export function deletePullRequestTitle(title: string): string {
  return `Remove opportunity: ${title.replace(/\s+/g, " ").trim()}`;
}

export function deletePullRequestBody(opportunity: Opportunity, editorName: string): string {
  const path = opportunityFilePath(opportunity.slug);
  return [
    `A removal sent from the admin opportunities page by ${codeSpan(editorName)}. This pull request deletes only ${codeSpan(path)}.`,
    "",
    ...summaryLines(opportunity),
    "",
    "---",
    "",
    "Merging this takes the listing off the site. Close this pull request with a comment to decline it.",
  ].join("\n") + "\n";
}

export function importPullRequestTitle(url: string): string {
  return `Import opportunity from ${url}`;
}

export function importPullRequestBody(url: string, editorName: string, path: string): string {
  return [
    `Opened from the admin opportunities page by ${codeSpan(editorName)}, to import a listing from ${codeSpan(url)}. This pull request adds only ${codeSpan(path)}, for now containing just the source URL.`,
    "",
    "Once the listing is populated, review the diff here before merging - merging makes it live.",
  ].join("\n") + "\n";
}

type Step = "read_main" | "commit" | "branch" | "open";

export type PublishResult =
  | { ok: true; number: number; url: string; branch: string }
  | { ok: false; reason: "invalid"; problems: string[] }
  | { ok: false; reason: "exists" }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "nothing" }
  | { ok: false; reason: "github"; step: Step; message: string; leftBranch: string | null };

function failure(step: Step, e: unknown, leftBranch: string | null = null): PublishResult {
  return githubFailure(step, e, leftBranch);
}

/** Reads main's current head, for both the caller's own check and the commit this makes on top of it. */
async function readMainHead(
  github: GitHubClient,
): Promise<{ ok: true; head: { commit: string; tree: string } } | Extract<PublishResult, { reason: "github" }>> {
  try {
    const found = await github.branchHead(MAIN_BRANCH);
    if (!found) throw new GitHubError(404, `The ${MAIN_BRANCH} branch was not found`);
    return { ok: true, head: found };
  } catch (e) {
    return githubFailure("read_main", e);
  }
}

/** Commits one file change on top of `head`, then a branch pointing at it, retrying the name on collision. */
async function commitAndBranch(
  github: GitHubClient,
  { slug, path, text, message, now, head }: { slug: string; path: string; text: string | null; message: string; now: Date; head: { commit: string; tree: string } },
): Promise<{ ok: true; branch: string } | PublishResult> {
  let commit: string;
  try {
    commit = await github.createCommit({ parent: head.commit, baseTree: head.tree, path, text, message });
  } catch (e) {
    return failure("commit", e);
  }

  let branch: string | null = null;
  try {
    for (let attempt = 1; attempt <= MAX_BRANCH_ATTEMPTS && branch === null; attempt++) {
      const name = branchName(slug, now, attempt);
      if (await github.createBranch(name, commit)) branch = name;
    }
    if (branch === null) throw new GitHubError(422, `Every branch name up to ${branchName(slug, now, MAX_BRANCH_ATTEMPTS)} is taken`);
  } catch (e) {
    return failure("branch", e);
  }
  return { ok: true, branch };
}

async function openPR(
  github: GitHubClient,
  { branch, title, body }: { branch: string; title: string; body: string },
): Promise<PublishResult> {
  try {
    const opened = await github.openPullRequest({ head: branch, base: MAIN_BRANCH, title, body });
    return { ok: true, number: opened.number, url: opened.url, branch };
  } catch (e) {
    return failure("open", e, await deleteOrKeep(github, branch));
  }
}

export type CreateInput = { opportunity: Opportunity; editorName: string; now: Date };

/** Opens a pull request adding a brand-new opportunity. Fails if the slug's file already exists on main. */
export async function createOpportunity(github: GitHubClient, input: CreateInput): Promise<PublishResult> {
  const { opportunity, editorName, now } = input;
  const parsed = opportunitySchema.safeParse(opportunity);
  if (!parsed.success) return { ok: false, reason: "invalid", problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const path = opportunityFilePath(parsed.data.slug);

  const main = await readMainHead(github);
  if (!main.ok) return main;
  try {
    const existing = await github.readFile(path, main.head.commit);
    if (existing) return { ok: false, reason: "exists" };
  } catch (e) {
    return failure("read_main", e);
  }

  const text = printOpportunity(parsed.data);
  const step = await commitAndBranch(github, {
    slug: parsed.data.slug,
    path,
    text,
    message: `${createPullRequestTitle(parsed.data.title)}\n\nSent from the admin opportunities page by ${editorName}.`,
    now,
    head: main.head,
  });
  if (!step.ok) return step;
  return openPR(github, { branch: step.branch, title: createPullRequestTitle(parsed.data.title), body: createPullRequestBody(parsed.data, editorName) });
}

export type UpdateInput = { slug: string; opportunity: Opportunity; editorName: string; now: Date };

/** Opens a pull request editing an existing opportunity. The slug (and so the file path) never changes. */
export async function updateOpportunity(github: GitHubClient, input: UpdateInput): Promise<PublishResult> {
  const { slug, editorName, now } = input;
  const opportunity = { ...input.opportunity, slug };
  const parsed = opportunitySchema.safeParse(opportunity);
  if (!parsed.success) return { ok: false, reason: "invalid", problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const path = opportunityFilePath(slug);

  const main = await readMainHead(github);
  if (!main.ok) return main;
  let before: Opportunity;
  try {
    const existing = await github.readFile(path, main.head.commit);
    if (!existing) return { ok: false, reason: "missing" };
    before = opportunitySchema.parse(JSON.parse(existing.text));
  } catch (e) {
    return failure("read_main", e);
  }

  const changes = changedFields(before, parsed.data);
  if (changes.length === 0) return { ok: false, reason: "nothing" };

  const text = printOpportunity(parsed.data);
  const step = await commitAndBranch(github, {
    slug,
    path,
    text,
    message: `${updatePullRequestTitle(parsed.data.title)}\n\nSent from the admin opportunities page by ${editorName}.`,
    now,
    head: main.head,
  });
  if (!step.ok) return step;
  return openPR(github, { branch: step.branch, title: updatePullRequestTitle(parsed.data.title), body: updatePullRequestBody(slug, changes, editorName) });
}

export type DeleteInput = { slug: string; editorName: string; now: Date };

/** Opens a pull request removing an opportunity's file. */
export async function deleteOpportunity(github: GitHubClient, input: DeleteInput): Promise<PublishResult> {
  const { slug, editorName, now } = input;
  const path = opportunityFilePath(slug);

  const main = await readMainHead(github);
  if (!main.ok) return main;
  let opportunity: Opportunity;
  try {
    const existing = await github.readFile(path, main.head.commit);
    if (!existing) return { ok: false, reason: "missing" };
    opportunity = opportunitySchema.parse(JSON.parse(existing.text));
  } catch (e) {
    return failure("read_main", e);
  }

  const step = await commitAndBranch(github, {
    slug,
    path,
    text: null,
    message: `${deletePullRequestTitle(opportunity.title)}\n\nSent from the admin opportunities page by ${editorName}.`,
    now,
    head: main.head,
  });
  if (!step.ok) return step;
  return openPR(github, { branch: step.branch, title: deletePullRequestTitle(opportunity.title), body: deletePullRequestBody(opportunity, editorName) });
}

export type ImportInput = { url: string; editorName: string; now: Date };

/**
 * Opens a pull request adding a stub file - just the source URL - at a provisional filename
 * derived from the URL and a short random suffix so two imports started in the same second
 * can't collide. Whatever fills the stub in later (the import script, or an admin by hand)
 * renames it to the listing's real slug.
 */
export async function importOpportunity(github: GitHubClient, input: ImportInput): Promise<PublishResult> {
  const { url, editorName, now } = input;
  const stub = stubSchema.safeParse({ url });
  if (!stub.success) return { ok: false, reason: "invalid", problems: stub.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const host = new URL(stub.data.url).hostname.replace(/^www\./, "");

  const main = await readMainHead(github);
  if (!main.ok) return main;

  const suffix = Math.random().toString(16).slice(2, 10);
  const provisionalSlug = `pending-${host.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${suffix}`;
  const path = opportunityFilePath(provisionalSlug);
  const text = `${JSON.stringify({ url }, null, 2)}\n`;

  const step = await commitAndBranch(github, {
    slug: provisionalSlug,
    path,
    text,
    message: `${importPullRequestTitle(url)}\n\nSent from the admin opportunities page by ${editorName}.`,
    now,
    head: main.head,
  });
  if (!step.ok) return step;
  return openPR(github, { branch: step.branch, title: importPullRequestTitle(url), body: importPullRequestBody(url, editorName, path) });
}
