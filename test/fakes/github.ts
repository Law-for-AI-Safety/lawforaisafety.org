import { createHash, createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto";

/**
 * Stands in for the GitHub REST API, as far as the CMS uses it: a small in-memory repo with a
 * `main` branch, other branches, commits, and pull requests with comments and reviews. It
 * checks what real GitHub checks first: the app's JWT (signed RS256 with the key in
 * `githubEnv()`, issued by the right app, short-lived) and the installation token on every
 * repo call. Blob ids are real git blob ids, so they match `contentHash`.
 *
 * Tests reach it through `fetch` (see `test/fakes/network.ts`); the end-to-end tests serve the
 * same object over HTTP (`e2e/fake-github-server.ts`). Named helpers keep a test's intent
 * visible: `github.fileOnMain(path, text)`, `github.failNext("POST /pulls")`,
 * `github.openedPRs`, `github.merge(n)`, `github.close(n, { comment })`.
 * `test/setup-env.ts` resets it before each test.
 */

export const GITHUB_API = "https://api.github.com";
export const APP_ID = "424242";
export const INSTALLATION_ID = "777";
export const OWNER = "Law-for-AI-Safety";
export const REPO = "lawforaisafety.org";
/** The login GitHub gives the app's bot account. */
export const BOT_LOGIN = "lais-cms-test[bot]";

const TOKEN_LIFETIME_MS = 60 * 60 * 1000;

let keys: { privatePem: string; publicKey: KeyObject } | null = null;

/** The app's key pair, made on first use: PKCS#1 PEM, as GitHub issues app keys. */
export function appKeys() {
  if (!keys) {
    const pair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    keys = { privatePem: pair.privateKey, publicKey: createPublicKey(pair.publicKey) };
  }
  return keys;
}

/** The settings that point the app at this fake. */
export function githubEnv(apiUrl = GITHUB_API): Record<string, string> {
  return {
    GITHUB_APP_ID: APP_ID,
    GITHUB_APP_INSTALLATION_ID: INSTALLATION_ID,
    GITHUB_APP_PRIVATE_KEY: appKeys().privatePem,
    GITHUB_REPO_OWNER: OWNER,
    GITHUB_REPO_NAME: REPO,
    GITHUB_API_URL: apiUrl,
    // A fake on this machine is only accepted with this test-only flag.
    ...(apiUrl === GITHUB_API ? {} : { CMS_TEST_LOCAL_GITHUB: "1" }),
  };
}

function blobId(text: string): string {
  return createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
}

type Tree = Map<string, string>; // path -> blob id
type Commit = { sha: string; tree: string; parents: string[]; message: string; author: string };
/** How GitHub relates a commenter to the repo; only OWNER, MEMBER and COLLABORATOR have a say. */
export type Association = "OWNER" | "MEMBER" | "COLLABORATOR" | "CONTRIBUTOR" | "NONE";
type Note = { user: string; type: "User" | "Bot"; association: Association; body: string; at: string };
type NoteOptions = { by?: string; association?: Association; bot?: boolean; at?: Date };

/** List endpoints answer this many items a page unless asked for another `per_page`. */
const DEFAULT_PER_PAGE = 30;

export type FakePullRequest = {
  number: number;
  title: string;
  body: string;
  head: string;
  base: string;
  /** The commit `base` pointed at when the pull request was opened. */
  baseCommit: string;
  state: "open" | "closed";
  merged: boolean;
  mergedAt: string | null;
  closedAt: string | null;
  mergeCommitSha: string | null;
  closedBy: string | null;
  comments: Note[];
  reviews: Note[];
  reviewComments: Note[];
};

/** What a test sees of a pull request: its fields plus the files its branch changes. */
export type OpenedPR = FakePullRequest & {
  /** Every file the head branch changes against the base it was opened from, with its text. */
  files: Record<string, string>;
  /** The head branch's commits since that base, oldest first. */
  commits: { message: string; author: string }[];
};

type Failure = { match: string | null; status: number; kind: "http" | "network" | "hang" };

class FakeGitHub {
  readonly requests: { method: string; path: string; body: unknown }[] = [];
  /** How many installation tokens were issued. */
  tokensIssued = 0;
  private blobs = new Map<string, string>();
  private trees = new Map<string, Tree>();
  private commits = new Map<string, Commit>();
  private refs = new Map<string, string>();
  private pulls: FakePullRequest[] = [];
  private tokens = new Map<string, number>();
  private failures: Failure[] = [];
  private counter = 0;
  /** Where this fake was reached, for the links it sends. */
  private baseUrl = GITHUB_API;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.requests.length = 0;
    this.tokensIssued = 0;
    this.blobs.clear();
    this.trees.clear();
    this.commits.clear();
    this.refs.clear();
    this.pulls = [];
    this.tokens.clear();
    this.failures = [];
    this.counter = 0;
    const tree = this.storeTree(new Map());
    this.refs.set("main", this.storeCommit({ tree, parents: [], message: "Initial commit", author: "owner" }));
  }

  // ---- helpers for tests ----

  /** Commits `text` at `path` on main, as a maintainer would. Returns the file's blob id. */
  fileOnMain(path: string, text: string): string {
    this.commitTo("main", { [path]: text }, `Update ${path}`, "owner");
    return blobId(text);
  }

  /** A file's text on a branch, or undefined. */
  fileOn(branch: string, path: string): string | undefined {
    const sha = this.refs.get(branch);
    const blob = sha ? this.treeOf(sha).get(path) : undefined;
    return blob === undefined ? undefined : this.blobs.get(blob);
  }

  /** Every branch name, sorted. */
  get branches(): string[] {
    return [...this.refs.keys()].sort();
  }

  /** Every pull request opened, oldest first, with the files and commits on its branch. */
  get openedPRs(): OpenedPR[] {
    return this.pulls.map((pr) => {
      const head = this.refs.get(pr.head) ?? pr.mergeCommitSha ?? pr.baseCommit;
      const base = this.treeOf(pr.baseCommit);
      const files: Record<string, string> = {};
      for (const [path, blob] of this.treeOf(head)) {
        if (base.get(path) !== blob) files[path] = this.blobs.get(blob)!;
      }
      for (const path of base.keys()) {
        if (!this.treeOf(head).has(path)) files[path] = "(deleted)";
      }
      const commits: { message: string; author: string }[] = [];
      for (let sha: string | undefined = this.refs.get(pr.head); sha && sha !== pr.baseCommit; sha = this.commits.get(sha)!.parents[0]) {
        const commit = this.commits.get(sha)!;
        commits.unshift({ message: commit.message, author: commit.author });
      }
      return { ...structuredClone(pr), files, commits };
    });
  }

  /**
   * Makes the next matching request fail: `match` is "METHOD /path" with the path after
   * `/repos/<owner>/<repo>` (or the full path for app endpoints), matched by prefix; no match
   * fails the next request of any kind. `network` fails to connect instead of answering;
   * `hang` never answers, until the request is aborted.
   */
  failNext(match: string | null = null, { status = 500, kind = "http" }: { status?: number; kind?: Failure["kind"] } = {}): void {
    this.failures.push({ match, status, kind });
  }

  /** Merges a pull request into its base, as the reviewer would. Returns the merge commit. */
  merge(number: number, at = new Date()): string {
    const pr = this.pull(number);
    const changed = this.openedPRs.find((p) => p.number === number)!.files;
    const sha = this.commitTo(pr.base, changed, `Merge pull request #${number}`, "owner");
    Object.assign(pr, { state: "closed", merged: true, mergedAt: at.toISOString(), closedAt: at.toISOString(), mergeCommitSha: sha });
    return sha;
  }

  /**
   * Closes a pull request without merging, as `by` (a maintainer unless `association` says
   * otherwise), optionally leaving a comment first.
   */
  close(number: number, { comment, by = "reviewer", association = "MEMBER", at = new Date() }: { comment?: string } & NoteOptions = {}): void {
    const pr = this.pull(number);
    if (comment) pr.comments.push(this.note(comment, { by, association, at }));
    Object.assign(pr, { state: "closed", closedAt: at.toISOString(), closedBy: by });
  }

  /** A conversation comment; by a maintainer ("reviewer", MEMBER) unless the options say otherwise. */
  comment(number: number, body: string, options: NoteOptions = {}): void {
    this.pull(number).comments.push(this.note(body, options));
  }

  review(number: number, body: string, options: NoteOptions = {}): void {
    this.pull(number).reviews.push(this.note(body, options));
  }

  reviewComment(number: number, body: string, options: NoteOptions = {}): void {
    this.pull(number).reviewComments.push(this.note(body, options));
  }

  private note(body: string, { by = "reviewer", association, bot = false, at = new Date() }: NoteOptions): Note {
    return { user: by, type: bot ? "Bot" : "User", association: association ?? (bot ? "NONE" : "MEMBER"), body, at: at.toISOString() };
  }

  /** Pushes a commit to a branch, as a maintainer polishing a pull request would. */
  pushTo(branch: string, files: Record<string, string>, message = "Polish"): string {
    return this.commitTo(branch, files, message, "owner");
  }

  /** Revokes every installation token, as GitHub does when a key is rotated. */
  revokeTokens(): void {
    this.tokens.clear();
  }

  // ---- the model ----

  private next(kind: string): string {
    this.counter++;
    return createHash("sha1").update(`${kind}:${this.counter}`).digest("hex");
  }

  private storeTree(tree: Tree): string {
    const sha = this.next("tree");
    this.trees.set(sha, new Map(tree));
    return sha;
  }

  private storeCommit(commit: Omit<Commit, "sha">): string {
    const sha = this.next("commit");
    this.commits.set(sha, { sha, ...commit });
    return sha;
  }

  private treeOf(commitSha: string): Tree {
    return this.trees.get(this.commits.get(commitSha)!.tree)!;
  }

  private commitTo(branch: string, files: Record<string, string>, message: string, author: string): string {
    const parent = this.refs.get(branch);
    if (!parent) throw new Error(`no branch ${branch}`);
    const tree = new Map(this.treeOf(parent));
    for (const [path, text] of Object.entries(files)) {
      const blob = blobId(text);
      this.blobs.set(blob, text);
      tree.set(path, blob);
    }
    const sha = this.storeCommit({ tree: this.storeTree(tree), parents: [parent], message, author });
    this.refs.set(branch, sha);
    return sha;
  }

  private pull(number: number): FakePullRequest {
    const pr = this.pulls.find((p) => p.number === number);
    if (!pr) throw new Error(`no pull request #${number}`);
    return pr;
  }

  // ---- HTTP ----

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.baseUrl = url.origin + url.pathname.replace(/\/(app|repos)\/.*$/, "");
    const body = request.method === "GET" || request.method === "DELETE" ? undefined : await request.json().catch(() => undefined);
    // The API may sit under a path prefix (as on GitHub Enterprise); routes start at /app or /repos.
    const path = url.pathname.replace(/^.*?(?=\/(app|repos)\/)/, "");
    this.requests.push({ method: request.method, path: path + url.search, body });

    const repoPrefix = `/repos/${OWNER}/${REPO}`;
    const local = path.startsWith(repoPrefix) ? path.slice(repoPrefix.length) : path;
    const failure = this.takeFailure(`${request.method} ${local}`);
    if (failure?.kind === "network") throw new TypeError("fetch failed");
    if (failure?.kind === "hang") {
      return new Promise<Response>((_, reject) => {
        if (request.signal.aborted) reject(request.signal.reason);
        request.signal.addEventListener("abort", () => reject(request.signal.reason));
      });
    }
    if (failure) return error(failure.status, "Server Error");

    if (request.method === "POST" && path === `/app/installations/${INSTALLATION_ID}/access_tokens`) {
      return this.issueToken(request, body as { repositories?: string[] } | undefined);
    }
    if (!path.startsWith(repoPrefix + "/")) return error(404, "Not Found");
    const auth = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const expires = this.tokens.get(auth);
    if (expires === undefined || expires <= Date.now()) return error(401, "Bad credentials");
    return this.repoRoute(request.method, local, url.searchParams, body as Record<string, unknown>);
  }

  private takeFailure(call: string): Failure | undefined {
    const i = this.failures.findIndex((f) => f.match === null || call.startsWith(f.match));
    return i === -1 ? undefined : this.failures.splice(i, 1)[0];
  }

  private async issueToken(request: Request, body: { repositories?: string[] } | undefined): Promise<Response> {
    const jwt = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    try {
      // Loaded on first use: test/setup-env.ts imports this fake before test/setup-dom.ts gives
      // jsdom a TextEncoder jose can use, and jose keeps the one it finds when it loads.
      const { jwtVerify } = await import("jose");
      const { payload } = await jwtVerify(jwt, appKeys().publicKey, {
        algorithms: ["RS256"],
        issuer: APP_ID,
        currentDate: new Date(),
      });
      if (typeof payload.iat !== "number" || typeof payload.exp !== "number" || payload.exp - payload.iat > 600) {
        return error(401, "'Expiration time' claim ('exp') is too far in the future");
      }
    } catch {
      return error(401, "A JSON web token could not be decoded");
    }
    if (body?.repositories && !body.repositories.includes(REPO)) return error(422, "There is at least one repository that does not exist");
    const token = `ghs_fake${++this.tokensIssued}`;
    const expiresAt = Date.now() + TOKEN_LIFETIME_MS;
    this.tokens.set(token, expiresAt);
    return Response.json({ token, expires_at: new Date(expiresAt).toISOString() }, { status: 201 });
  }

  private repoRoute(method: string, path: string, query: URLSearchParams, body: Record<string, unknown>): Response {
    let m: RegExpMatchArray | null;
    if (method === "GET" && (m = path.match(/^\/git\/ref\/heads\/(.+)$/))) {
      const sha = this.refs.get(decodeURIComponent(m[1]));
      return sha ? Response.json({ ref: `refs/heads/${m[1]}`, object: { sha, type: "commit" } }) : error(404, "Not Found");
    }
    if (method === "GET" && (m = path.match(/^\/git\/commits\/([0-9a-f]+)$/))) {
      const commit = this.commits.get(m[1]);
      return commit ? Response.json({ sha: commit.sha, tree: { sha: commit.tree }, message: commit.message }) : error(404, "Not Found");
    }
    if (method === "GET" && (m = path.match(/^\/contents\/(.+)$/))) {
      const ref = query.get("ref") ?? "main";
      const commit = this.refs.get(ref) ?? (this.commits.has(ref) ? ref : undefined);
      const file = decodeURIComponent(m[1]);
      const blob = commit ? this.treeOf(commit).get(file) : undefined;
      if (!blob) return error(404, "Not Found");
      return Response.json({ type: "file", path: file, sha: blob, encoding: "base64", content: Buffer.from(this.blobs.get(blob)!).toString("base64") });
    }
    if (method === "GET" && (m = path.match(/^\/git\/blobs\/([0-9a-f]+)$/))) {
      const text = this.blobs.get(m[1]);
      return text === undefined ? error(404, "Not Found") : Response.json({ sha: m[1], encoding: "base64", content: Buffer.from(text).toString("base64") });
    }
    if (method === "POST" && path === "/git/trees") {
      const base = this.trees.get(String(body.base_tree));
      if (!base) return error(422, "Invalid tree info");
      const tree = new Map(base);
      for (const entry of body.tree as { path: string; mode: string; type: string; content: string }[]) {
        if (entry.mode !== "100644" || entry.type !== "blob") return error(422, "Invalid tree info");
        const blob = blobId(entry.content);
        this.blobs.set(blob, entry.content);
        tree.set(entry.path, blob);
      }
      return Response.json({ sha: this.storeTree(tree) }, { status: 201 });
    }
    if (method === "POST" && path === "/git/commits") {
      const parents = body.parents as string[];
      if (!this.trees.has(String(body.tree)) || !parents.every((p) => this.commits.has(p))) return error(422, "Invalid commit");
      const sha = this.storeCommit({ tree: String(body.tree), parents, message: String(body.message), author: BOT_LOGIN });
      return Response.json({ sha }, { status: 201 });
    }
    if (method === "POST" && path === "/git/refs") {
      const ref = String(body.ref);
      const name = ref.replace(/^refs\/heads\//, "");
      if (!ref.startsWith("refs/heads/") || !this.commits.has(String(body.sha))) return error(422, "Invalid reference");
      if (this.refs.has(name)) return error(422, "Reference already exists");
      this.refs.set(name, String(body.sha));
      return Response.json({ ref, object: { sha: body.sha } }, { status: 201 });
    }
    if (method === "DELETE" && (m = path.match(/^\/git\/refs\/heads\/(.+)$/))) {
      const name = decodeURIComponent(m[1]);
      if (name === "main") return error(422, "Cannot delete this protected branch");
      if (!this.refs.delete(name)) return error(422, "Reference does not exist");
      return new Response(null, { status: 204 });
    }
    if (method === "POST" && path === "/pulls") {
      const head = String(body.head);
      const base = String(body.base);
      if (!this.refs.has(head) || !this.refs.has(base)) return error(422, "Validation Failed");
      const pr: FakePullRequest = {
        number: this.pulls.length + 1,
        title: String(body.title),
        body: String(body.body ?? ""),
        head,
        base,
        baseCommit: this.refs.get(base)!,
        state: "open",
        merged: false,
        mergedAt: null,
        closedAt: null,
        mergeCommitSha: null,
        closedBy: null,
        comments: [],
        reviews: [],
        reviewComments: [],
      };
      this.pulls.push(pr);
      return Response.json(this.pullJson(pr), { status: 201 });
    }
    if ((m = path.match(/^\/pulls\/(\d+)$/))) {
      const pr = this.pulls.find((p) => p.number === Number(m![1]));
      if (!pr) return error(404, "Not Found");
      if (method === "GET") return Response.json(this.pullJson(pr));
      if (method === "PATCH") {
        if (typeof body.body === "string") pr.body = body.body;
        if (body.state === "closed" && pr.state === "open") Object.assign(pr, { state: "closed", closedAt: new Date().toISOString() });
        return Response.json(this.pullJson(pr));
      }
    }
    if (method === "GET" && (m = path.match(/^\/(issues|pulls)\/(\d+)\/(comments|reviews)$/))) {
      const pr = this.pulls.find((p) => p.number === Number(m![2]));
      if (!pr) return error(404, "Not Found");
      const notes = m[3] === "reviews" ? pr.reviews : m[1] === "issues" ? pr.comments : pr.reviewComments;
      const at = m[3] === "reviews" ? "submitted_at" : "created_at";
      return this.paged(path, query, notes.map((n) => ({ user: { login: n.user, type: n.type }, author_association: n.association, body: n.body, [at]: n.at })));
    }
    if (method === "GET" && (m = path.match(/^\/issues\/(\d+)$/))) {
      const pr = this.pulls.find((p) => p.number === Number(m![1]));
      if (!pr) return error(404, "Not Found");
      return Response.json({ number: pr.number, state: pr.state, closed_by: pr.closedBy ? { login: pr.closedBy } : null, pull_request: {} });
    }
    if (method === "GET" && path === "/pulls") {
      const head = query.get("head");
      const owner = `${OWNER}:`;
      const matching = this.pulls.filter((p) => head === null || (head.startsWith(owner) && p.head === head.slice(owner.length)));
      return this.paged(path, query, matching.map((p) => this.pullJson(p)));
    }
    return error(404, `The fake GitHub has no route for ${method} ${path}`);
  }

  /** One page of a list, with a Link header to the next page as GitHub sends it. */
  private paged(path: string, query: URLSearchParams, items: unknown[]): Response {
    const perPage = Number(query.get("per_page") ?? DEFAULT_PER_PAGE);
    const page = Number(query.get("page") ?? 1);
    const headers = new Headers();
    if (page * perPage < items.length) {
      const next = new URLSearchParams(query);
      next.set("page", String(page + 1));
      headers.set("link", `<${this.baseUrl}/repos/${OWNER}/${REPO}${path}?${next}>; rel="next", <${this.baseUrl}/repos/${OWNER}/${REPO}${path}?page=1>; rel="first"`);
    }
    return Response.json(items.slice((page - 1) * perPage, page * perPage), { headers });
  }

  private pullJson(pr: FakePullRequest) {
    return {
      number: pr.number,
      html_url: `https://github.com/${OWNER}/${REPO}/pull/${pr.number}`,
      state: pr.state,
      merged: pr.merged,
      merged_at: pr.mergedAt,
      closed_at: pr.closedAt,
      merge_commit_sha: pr.mergeCommitSha,
      title: pr.title,
      body: pr.body,
      head: { ref: pr.head },
      base: { ref: pr.base },
    };
  }
}

function error(status: number, message: string): Response {
  return Response.json({ message }, { status });
}

export { FakeGitHub };
export const github = new FakeGitHub();
