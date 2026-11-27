import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

/**
 * Project rules for the GitHub Actions workflows, alongside the generic audit zizmor runs in
 * CI. Fork PRs run these workflows with a read-only token and no repository secrets, so the
 * workflows must never need either, and nothing they start may reach past the runner. CI must
 * also run the database tests, which `test:no-db` or a `--project` filter would leave out.
 *
 * One workflow is the exception: cms-auto-merge.yml approves and merges the website editor's
 * pull requests, so it needs `pull_request_target` and a token that can write. Its own rules
 * below keep it from ever running anything but main's code with that token.
 */

const WORKFLOW_DIR = path.resolve(".github/workflows");
const ALLOWED_TRIGGERS = ["push", "pull_request"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];
const CREDENTIAL_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIALS?)$/i;

type Yaml = Record<string, unknown>;

const PRIVILEGED = "cms-auto-merge.yml";

const workflows = fs
  .readdirSync(WORKFLOW_DIR)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => {
    const text = fs.readFileSync(path.join(WORKFLOW_DIR, file), "utf8");
    return { file, text, doc: parse(text) as Yaml };
  });

/** Every string value in the tree, with the key path it was found under. */
function strings(node: unknown, at: string[] = []): { at: string; value: string }[] {
  if (typeof node === "string") return [{ at: at.join("."), value: node }];
  if (Array.isArray(node)) return node.flatMap((n, i) => strings(n, [...at, String(i)]));
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) => strings(v, [...at, k]));
  }
  return [];
}

/** Every `env` map in the tree (workflow, job, step and service level), flattened. */
function envEntries(node: unknown, at: string[] = []): { at: string; name: string; value: string }[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((n, i) => envEntries(n, [...at, String(i)]));
  return Object.entries(node).flatMap(([k, v]) => {
    if (k === "env" && v && typeof v === "object" && !Array.isArray(v)) {
      return Object.entries(v).map(([name, value]) => ({
        at: [...at, k].join("."),
        name,
        value: String(value),
      }));
    }
    return envEntries(v, [...at, k]);
  });
}

function jobs(doc: Yaml): [string, Yaml][] {
  return Object.entries((doc.jobs ?? {}) as Record<string, Yaml>);
}

const unprivileged = workflows.filter((w) => w.file !== PRIVILEGED);

describe.each(workflows)("$file", ({ doc, text }) => {
  it("never references a repository secret", () => {
    for (const { at, value } of strings(doc)) {
      expect(value, `${at} references secrets`).not.toMatch(/secrets\s*\./);
    }
  });

  it("runs only on GitHub-hosted runners", () => {
    for (const [name, job] of jobs(doc)) {
      expect(job["runs-on"], `job ${name}`).toMatch(/^(ubuntu|windows|macos)-/);
    }
  });

  it("pins every action to a full commit SHA with its version in a comment", () => {
    const uses = [...text.matchAll(/^\s*-?\s*uses:\s*(.+)$/gm)].map((m) => m[1].trim());
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/);
    }
  });

  it("points every URL-shaped variable at the runner itself", () => {
    for (const { at, name, value } of envEntries(doc)) {
      if (!/URL$/i.test(name)) continue;
      const host = value.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^:/?#]+)/i)?.[1];
      expect(LOCAL_HOSTS, `${at}.${name} = ${value}`).toContain(host);
    }
  });

  it("pulls service images without registry credentials", () => {
    for (const [name, job] of jobs(doc)) {
      for (const [service, spec] of Object.entries((job.services ?? {}) as Record<string, Yaml>)) {
        expect(spec.credentials, `${name}.services.${service}`).toBeUndefined();
      }
    }
  });

  it("never leaves out the database-backed tests", () => {
    expect(text).not.toContain("test:no-db");
    expect(text).not.toContain("--project");
  });
});

describe.each(unprivileged)("$file", ({ doc }) => {
  it("is started only by pushes and pull requests", () => {
    const on = doc.on;
    const events =
      typeof on === "string" ? [on] : Array.isArray(on) ? on : Object.keys((on ?? {}) as Yaml);
    for (const event of events) expect(ALLOWED_TRIGGERS).toContain(event);
  });

  it("grants only read access to the repository, at the workflow level", () => {
    expect(doc.permissions).toEqual({ contents: "read" });
    for (const [name, job] of jobs(doc)) {
      expect(job.permissions, `job ${name} sets its own permissions`).toBeUndefined();
    }
  });

  it("gives every credential-shaped variable a literal dummy value", () => {
    for (const { at, name, value } of envEntries(doc)) {
      if (!CREDENTIAL_NAME.test(name)) continue;
      expect(value, `${at}.${name}`).not.toMatch(/\$\{\{/);
    }
  });
});

describe("ci.yml", () => {
  const ci = workflows.find((w) => w.file === "ci.yml");

  it("runs check-all on pull requests and pushes to main, against Postgres", () => {
    expect(ci).toBeDefined();
    expect(ci!.doc.on).toEqual({ pull_request: null, push: { branches: ["main"] } });
    const [, job] = jobs(ci!.doc).find(([, j]) => j.services) ?? [];
    expect(Object.keys((job?.services ?? {}) as Yaml)).toContain("postgres");
    expect((job?.env as Yaml | undefined)?.TEST_DATABASE_URL).toMatch(/^postgres:\/\/[^@]+@localhost:/);
    const runs = ((job?.steps ?? []) as Yaml[]).map((step) => step.run);
    expect(runs).toContain("npm run check-all");
  });
});

describe("cms-guard.yml", () => {
  const guard = workflows.find((w) => w.file === "cms-guard.yml");
  const steps = () => ((jobs(guard!.doc)[0]?.[1].steps ?? []) as Yaml[]);

  it("runs on every pull request, with the trigger that gets no secrets and a read-only token", () => {
    expect(guard).toBeDefined();
    expect(guard!.doc.on).toEqual({ pull_request: { types: ["opened", "synchronize", "reopened", "edited"] } });
  });

  it("checks out the pull request's whole history without keeping the token", () => {
    const checkout = steps().find((step) => String(step.uses).startsWith("actions/checkout@"));
    expect(checkout?.with).toEqual({ "persist-credentials": false, "fetch-depth": 0, ref: "${{ github.event.pull_request.head.sha }}" });
  });

  it("runs main's copy of the guard with node, reading the bot login from a repository variable", () => {
    const step = steps().find((s) => typeof s.run === "string")!;
    expect((step.env as Yaml).CMS_BOT_LOGIN).toBe("${{ vars.CMS_BOT_LOGIN }}");
    expect(step.run).toContain("git show origin/main:scripts/cms-guard.mjs");
    // Falls back to the pull request's copy only while main has no guard workflow at all.
    expect(step.run).toMatch(/elif git cat-file -e origin\/main:\.github\/workflows\/cms-guard\.yml[^\n]*\n[^\n]*\n\s*exit 1/);
    expect(step.run).toMatch(/node "\$RUNNER_TEMP\/cms-guard\.mjs"\s*$/);
    // Nothing from the pull request is installed or run: no npm, no setup step.
    expect(steps().map((s) => String(s.uses ?? "").split("@")[0])).toEqual(["actions/checkout", ""]);
    expect(step.run).not.toMatch(/\bnpm\b|\bnpx\b/);
    // Values from the pull request reach the script only through env, never inline in the script.
    expect(step.run).not.toContain("${{");
  });
});

describe("cms-auto-merge.yml", () => {
  const auto = workflows.find((w) => w.file === PRIVILEGED);
  const all = () => jobs(auto!.doc);
  const job = (name: string) => all().find(([n]) => n === name)?.[1] ?? {};
  const steps = (name: string) => (job(name).steps ?? []) as Yaml[];

  it("runs when a pull request opens or changes, from the base branch's copy of the workflow", () => {
    expect(auto).toBeDefined();
    expect(auto!.doc.on).toEqual({
      pull_request_target: { types: ["opened", "synchronize", "reopened", "edited", "ready_for_review", "converted_to_draft"] },
    });
    // One run per pull request at a time; a newer event replaces an older run.
    expect(auto!.doc.concurrency).toEqual({ group: "cms-auto-merge-${{ github.event.pull_request.number }}", "cancel-in-progress": true });
  });

  it("grants nothing at the workflow level, read only to the check and write only to the jobs that act", () => {
    expect(auto!.doc.permissions).toEqual({});
    expect(all().map(([name]) => name)).toEqual(["check", "merge", "withdraw"]);
    expect(job("check").permissions).toEqual({ contents: "read", "pull-requests": "read" });
    for (const name of ["merge", "withdraw"]) {
      // Contents write is what enabling and disabling auto-merge need; nothing is pushed.
      expect(job(name).permissions, name).toEqual({ contents: "write", "pull-requests": "write" });
    }
  });

  it("only looks at pull requests the CMS bot opened, and acts only on the check's answer", () => {
    expect(job("check").if).toBe("github.event.pull_request.user.login == vars.CMS_BOT_LOGIN");
    expect(job("merge").needs).toBe("check");
    expect(job("merge").if).toBe("needs.check.outputs.eligible == 'true'");
    expect(job("withdraw").needs).toBe("check");
    // A failed check takes back too; a skipped one (not the bot's pull request) does nothing.
    expect(job("withdraw").if).toBe("!cancelled() && needs.check.result != 'skipped' && needs.check.outputs.eligible != 'true'");
  });

  it("never checks out or names the pull request's code, only main", () => {
    expect(auto!.text).not.toMatch(/pull_request\.head|github\.head_ref|head_ref/);
    for (const [name] of all()) {
      const uses = steps(name).map((s) => String(s.uses ?? "").split("@")[0]);
      expect(uses, name).toEqual(["actions/checkout", ""]);
      const checkout = steps(name)[0];
      expect(checkout.with, name).toEqual({ "persist-credentials": false, ref: "main" });
    }
  });

  it("runs main's script with node, and nothing else, passing values only through env", () => {
    for (const [name] of all()) {
      const run = steps(name)[1];
      expect(run.run, name).toBe(`node scripts/cms-auto-merge.mjs ${name}`);
      const env = run.env as Yaml;
      expect(env.GITHUB_TOKEN, name).toBe("${{ github.token }}");
      expect(env.CMS_BOT_LOGIN, name).toBe("${{ vars.CMS_BOT_LOGIN }}");
      expect(env.PR_NUMBER, name).toBe("${{ github.event.pull_request.number }}");
    }
    expect((steps("merge")[1].env as Yaml).HEAD_SHA).toBe("${{ needs.check.outputs.head_sha }}");
  });

  it("uses no credential but the workflow's own token", () => {
    for (const { at, name, value } of envEntries(auto!.doc)) {
      if (!CREDENTIAL_NAME.test(name)) continue;
      expect(`${name}=${value}`, at).toBe("GITHUB_TOKEN=${{ github.token }}");
    }
  });
});

it("CODEOWNERS gives the workflows, the CMS guard and the auto-merge to a maintainer", () => {
  const owners = fs.readFileSync(path.resolve(".github/CODEOWNERS"), "utf8");
  for (const pattern of ["/.github/", "/scripts/cms-guard.mjs", "/scripts/cms-guard.test.ts", "/scripts/cms-auto-merge.mjs", "/scripts/cms-auto-merge.test.ts"]) {
    expect(owners).toMatch(new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+@hturnbull93$`, "m"));
  }
});
