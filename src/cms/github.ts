import { createPrivateKey, type KeyObject } from "node:crypto";
import { SignJWT } from "jose";

/**
 * The CMS's one way to reach GitHub. Publishing, withdrawing and reading a page's status all
 * go through a `GitHubClient`; production uses `GitHubAppClient`, which signs in as the
 * site's GitHub App and calls the REST API with plain `fetch`. Tests reach the same client
 * through the fake GitHub in `test/fakes/github.ts`, which stands in at `fetch`.
 *
 * Nothing here logs or returns the private key, the app's JWT or an installation token.
 */

export type GitHubConfig = {
  appId: string;
  installationId: string;
  /** The app's private key, PEM (PKCS#1 as GitHub issues it, or PKCS#8). */
  privateKey: string;
  owner: string;
  repo: string;
  /** The REST API's base URL, without a trailing slash. */
  apiUrl: string;
};

export type RepoFile = { sha: string; text: string };

export type PullRequest = {
  number: number;
  url: string;
  state: "open" | "closed";
  merged: boolean;
  mergedAt: Date | null;
  closedAt: Date | null;
  mergeCommitSha: string | null;
  head: string;
};

export type PullRequestComment = { author: string; body: string; at: Date };

export interface GitHubClient {
  /** The commit a branch points at, and that commit's tree; null when there is no such branch. */
  branchHead(branch: string): Promise<{ commit: string; tree: string } | null>;
  /** A file's text and blob id at a ref (branch or commit); null when it does not exist there. */
  readFile(path: string, ref: string): Promise<RepoFile | null>;
  /** A blob's text by its id; null when the repo has no such blob. */
  readBlob(sha: string): Promise<string | null>;
  /**
   * Makes a commit that changes one file on top of `parent`, without moving any branch.
   * `text: null` removes the file instead of writing it. Returns the commit's id.
   */
  createCommit(input: { parent: string; baseTree: string; path: string; text: string | null; message: string }): Promise<string>;
  /** Creates a branch at `commit`. False when a branch of that name already exists. */
  createBranch(name: string, commit: string): Promise<boolean>;
  /** Deletes a branch; a branch that is already gone counts as deleted. */
  deleteBranch(name: string): Promise<void>;
  openPullRequest(input: { head: string; base: string; title: string; body: string }): Promise<{ number: number; url: string }>;
  updatePullRequestBody(number: number, body: string): Promise<void>;
  getPullRequest(number: number): Promise<PullRequest>;
  closePullRequest(number: number): Promise<void>;
  /**
   * The most recent comment, review or review comment on a pull request by someone with a
   * say over the repo (owner, member or collaborator) or by whoever closed it. The repo is
   * public, so anyone else's comments are left out.
   */
  lastComment(number: number): Promise<PullRequestComment | null>;
  /** The number of the pull request opened from `branch`, open or not; null when there is none. */
  findPullRequest(branch: string): Promise<number | null>;
}

/** A GitHub request that failed. `status` is 0 when GitHub could not be reached at all. */
export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

/** Each request to GitHub is given up after this long. */
export const REQUEST_TIMEOUT_MS = 10_000;
/**
 * The most requests one client call can send: an installation token and the request, then,
 * if GitHub refuses the token, a new token and the request again.
 */
export const SENDS_PER_CALL = 4;
/** List endpoints are followed for at most this many pages. */
const MAX_PAGES = 20;
/** Whose comments the editor is shown, besides the person who closed the pull request. */
const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/** An installation token is renewed this long before GitHub says it expires. */
export const TOKEN_RENEW_MARGIN_MS = 5 * 60 * 1000;
/** GitHub accepts app JWTs that live at most ten minutes; this stays inside that. */
const JWT_LIFETIME_S = 9 * 60;
/** Allows for the runner's clock being slightly ahead of GitHub's. */
const JWT_BACKDATE_S = 60;

type Json = Record<string, unknown>;

function readKey(pem: string): KeyObject {
  try {
    return createPrivateKey(pem);
  } catch {
    // The parser's message can quote the key, so it is not passed on.
    throw new GitHubError(0, "GITHUB_APP_PRIVATE_KEY is not a valid PEM private key");
  }
}

/**
 * Signs in as a GitHub App installation. One instance keeps one installation token and reuses
 * it until shortly before it expires; get the shared instance with `gitHubClientFor`.
 */
export class GitHubAppClient implements GitHubClient {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly repoPath: string;

  constructor(
    private readonly config: GitHubConfig,
    private readonly timeoutMs = REQUEST_TIMEOUT_MS,
  ) {
    this.repoPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  }

  private async appJwt(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(this.config.appId)
      .setIssuedAt(now - JWT_BACKDATE_S)
      .setExpirationTime(now + JWT_LIFETIME_S)
      .sign(readKey(this.config.privateKey));
  }

  private async installationToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_RENEW_MARGIN_MS > Date.now()) return this.token.value;
    this.token = null;
    const jwt = await this.appJwt();
    const body = await this.send(`/app/installations/${encodeURIComponent(this.config.installationId)}/access_tokens`, {
      method: "POST",
      auth: jwt,
      // The token is narrowed to this one repo and to what publishing needs.
      body: { repositories: [this.config.repo], permissions: { contents: "write", pull_requests: "write" } },
    });
    const token = body.token;
    const expiresAt = Date.parse(String(body.expires_at));
    if (typeof token !== "string" || !Number.isFinite(expiresAt)) {
      throw new GitHubError(0, "GitHub sent an installation token response this client does not understand");
    }
    this.token = { value: token, expiresAt };
    return token;
  }

  /** Sends one request. Returns the JSON body (empty for 204), or throws a GitHubError. */
  private async send(path: string, options: { method?: string; auth: string; body?: unknown }): Promise<Json> {
    return (await this.sendPage(path, options)).json;
  }

  /** Sends one request, returning the body and the next page's path, if the answer has one. */
  private async sendPage(path: string, options: { method?: string; auth: string; body?: unknown }): Promise<{ json: Json; next: string | null }> {
    const method = options.method ?? "GET";
    let response: Response;
    let text: string;
    try {
      response = await fetch(`${this.config.apiUrl}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${options.auth}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "lawforaisafety-cms",
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status === 204) return { json: {}, next: null };
      text = await response.text();
    } catch (e) {
      throw new GitHubError(0, `Could not reach GitHub (${method} ${path}): ${(e as Error).message}`);
    }
    let json: Json = {};
    try {
      json = text ? (JSON.parse(text) as Json) : {};
    } catch {
      json = {};
    }
    if (!response.ok) {
      const detail = typeof json.message === "string" ? json.message : `HTTP ${response.status}`;
      throw new GitHubError(response.status, `GitHub refused ${method} ${path}: ${detail}`);
    }
    return { json, next: this.nextPage(response.headers.get("link")) };
  }

  /** The path of the `rel="next"` page in a Link header, if it is on this API. */
  private nextPage(link: string | null): string | null {
    const url = link?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    return url?.startsWith(`${this.config.apiUrl}/`) ? url.slice(this.config.apiUrl.length) : null;
  }

  /** A request to the repo as the installation. A refused token is renewed once. */
  private async repo(path: string, options: { method?: string; body?: unknown } = {}): Promise<Json> {
    try {
      return await this.send(`${this.repoPath}${path}`, { ...options, auth: await this.installationToken() });
    } catch (e) {
      if (!(e instanceof GitHubError) || e.status !== 401) throw e;
      this.token = null;
      return this.send(`${this.repoPath}${path}`, { ...options, auth: await this.installationToken() });
    }
  }

  /** Every item of a list endpoint, following its pages. */
  private async list(path: string): Promise<Json[]> {
    const items: Json[] = [];
    let next: string | null = `${this.repoPath}${path}`;
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const auth = await this.installationToken();
      let answer;
      try {
        answer = await this.sendPage(next, { auth });
      } catch (e) {
        if (!(e instanceof GitHubError) || e.status !== 401) throw e;
        this.token = null;
        answer = await this.sendPage(next, { auth: await this.installationToken() });
      }
      if (Array.isArray(answer.json)) items.push(...(answer.json as Json[]));
      next = answer.next;
    }
    return items;
  }

  /** Like `repo`, but null for a 404. */
  private async maybe(path: string): Promise<Json | null> {
    try {
      return await this.repo(path);
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return null;
      throw e;
    }
  }

  async branchHead(branch: string) {
    const ref = await this.maybe(`/git/ref/heads/${refPath(branch)}`);
    if (!ref) return null;
    const commit = String((ref.object as Json).sha);
    const body = await this.repo(`/git/commits/${commit}`);
    return { commit, tree: String((body.tree as Json).sha) };
  }

  async readFile(path: string, ref: string) {
    const body = await this.maybe(`/contents/${refPath(path)}?ref=${encodeURIComponent(ref)}`);
    if (!body) return null;
    if (body.type !== "file" || body.encoding !== "base64") {
      throw new GitHubError(0, `GitHub did not send ${path} as a file's contents`);
    }
    return { sha: String(body.sha), text: fromBase64(String(body.content)) };
  }

  async readBlob(sha: string) {
    const body = await this.maybe(`/git/blobs/${encodeURIComponent(sha)}`);
    return body ? fromBase64(String(body.content)) : null;
  }

  async createCommit({ parent, baseTree, path, text, message }: { parent: string; baseTree: string; path: string; text: string | null; message: string }) {
    const entry = text === null ? { path, mode: "100644", type: "blob", sha: null } : { path, mode: "100644", type: "blob", content: text };
    const tree = await this.repo("/git/trees", {
      method: "POST",
      body: { base_tree: baseTree, tree: [entry] },
    });
    const commit = await this.repo("/git/commits", {
      method: "POST",
      body: { message, tree: tree.sha, parents: [parent] },
    });
    return String(commit.sha);
  }

  async createBranch(name: string, commit: string) {
    try {
      await this.repo("/git/refs", { method: "POST", body: { ref: `refs/heads/${name}`, sha: commit } });
      return true;
    } catch (e) {
      if (e instanceof GitHubError && e.status === 422 && /already exists/i.test(e.message)) return false;
      throw e;
    }
  }

  async deleteBranch(name: string) {
    try {
      await this.repo(`/git/refs/heads/${refPath(name)}`, { method: "DELETE" });
    } catch (e) {
      if (e instanceof GitHubError && (e.status === 404 || (e.status === 422 && /does not exist/i.test(e.message)))) return;
      throw e;
    }
  }

  async openPullRequest({ head, base, title, body }: { head: string; base: string; title: string; body: string }) {
    const pr = await this.repo("/pulls", { method: "POST", body: { head, base, title, body } });
    return { number: Number(pr.number), url: String(pr.html_url) };
  }

  async updatePullRequestBody(number: number, body: string) {
    await this.repo(`/pulls/${number}`, { method: "PATCH", body: { body } });
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    const pr = await this.repo(`/pulls/${number}`);
    return {
      number: Number(pr.number),
      url: String(pr.html_url),
      state: pr.state === "open" ? "open" : "closed",
      merged: pr.merged === true,
      mergedAt: date(pr.merged_at),
      closedAt: date(pr.closed_at),
      mergeCommitSha: typeof pr.merge_commit_sha === "string" ? pr.merge_commit_sha : null,
      head: String((pr.head as Json).ref),
    };
  }

  async closePullRequest(number: number) {
    await this.repo(`/pulls/${number}`, { method: "PATCH", body: { state: "closed" } });
  }

  async lastComment(number: number) {
    const [issue, comments, reviews, reviewComments] = await Promise.all([
      this.repo(`/issues/${number}`),
      this.list(`/issues/${number}/comments?per_page=100`),
      this.list(`/pulls/${number}/reviews?per_page=100`),
      this.list(`/pulls/${number}/comments?per_page=100`),
    ]);
    const closer = (issue.closed_by as Json | null)?.login;
    const found = [...comments, ...reviews, ...reviewComments].flatMap((item) => {
      const user = item.user as Json | null;
      const at = date(item.submitted_at ?? item.created_at);
      const body = typeof item.body === "string" ? item.body.trim() : "";
      if (!user || !body || !at) return [];
      const trusted = TRUSTED_ASSOCIATIONS.has(String(item.author_association)) || (typeof closer === "string" && user.login === closer);
      return trusted ? [{ author: String(user.login), body, at }] : [];
    });
    found.sort((a, b) => a.at.getTime() - b.at.getTime());
    return found.at(-1) ?? null;
  }

  async findPullRequest(branch: string) {
    const head = `${this.config.owner}:${branch}`;
    const pulls = await this.list(`/pulls?state=all&head=${encodeURIComponent(head)}&per_page=100`);
    const pr = pulls.find((p) => (p.head as Json | undefined)?.ref === branch);
    return pr ? Number(pr.number) : null;
  }
}

/** A branch name or file path inside a URL: each segment encoded, slashes kept. */
function refPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function fromBase64(content: string): string {
  return Buffer.from(content, "base64").toString("utf8");
}

function date(value: unknown): Date | null {
  return typeof value === "string" ? new Date(value) : null;
}

const clients = new Map<string, GitHubAppClient>();

/**
 * The shared client for a configuration, so the installation token is reused across requests
 * served by the same server instance.
 */
export function gitHubClientFor(config: GitHubConfig): GitHubAppClient {
  const key = JSON.stringify(config);
  let client = clients.get(key);
  if (!client) {
    client = new GitHubAppClient(config);
    clients.set(key, client);
  }
  return client;
}
