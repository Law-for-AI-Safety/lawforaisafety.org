import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

/**
 * Project rules for the GitHub Actions workflows, alongside the generic audit zizmor runs in
 * CI. Fork PRs run these workflows with a read-only token and no repository secrets, so the
 * workflows must never need either, and nothing they start may reach past the runner. CI must
 * also run the database-backed tests, which `TEST_NO_DB` would leave out.
 */

const WORKFLOW_DIR = path.resolve(".github/workflows");
const ALLOWED_TRIGGERS = ["push", "pull_request"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];
const CREDENTIAL_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIALS?)$/i;

type Yaml = Record<string, unknown>;

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

describe.each(workflows)("$file", ({ doc, text }) => {
  it("is started only by pushes and pull requests", () => {
    const on = doc.on;
    const events =
      typeof on === "string" ? [on] : Array.isArray(on) ? on : Object.keys((on ?? {}) as Yaml);
    for (const event of events) expect(ALLOWED_TRIGGERS).toContain(event);
  });

  it("never references a repository secret", () => {
    for (const { at, value } of strings(doc)) {
      expect(value, `${at} references secrets`).not.toMatch(/secrets\s*\./);
    }
  });

  it("grants only read access to the repository, at the workflow level", () => {
    expect(doc.permissions).toEqual({ contents: "read" });
    for (const [name, job] of jobs(doc)) {
      expect(job.permissions, `job ${name} sets its own permissions`).toBeUndefined();
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

  it("gives every credential-shaped variable a literal dummy value", () => {
    for (const { at, name, value } of envEntries(doc)) {
      if (!CREDENTIAL_NAME.test(name)) continue;
      expect(value, `${at}.${name}`).not.toMatch(/\$\{\{/);
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
    expect(text).not.toContain("TEST_NO_DB");
    expect(text).not.toContain("test:no-db");
  });
});

describe("ci.yml", () => {
  const ci = workflows.find((w) => w.file === "ci.yml");

  it("runs check-all on pull requests and pushes to main, against Postgres", () => {
    expect(ci).toBeDefined();
    expect(ci!.doc.on).toEqual({ pull_request: { branches: ["main"] }, push: { branches: ["main"] } });
    const [, job] = jobs(ci!.doc).find(([, j]) => j.services) ?? [];
    expect(Object.keys((job?.services ?? {}) as Yaml)).toContain("postgres");
    const runs = ((job?.steps ?? []) as Yaml[]).map((step) => step.run);
    expect(runs).toContain("npm run check-all");
  });
});
