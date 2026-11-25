import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Two appliers read `netlify/database/migrations/`, and each must see the same order:
 *
 * - Netlify, before each production deploy or deploy preview, takes every `<digits>_<slug>.sql`,
 *   orders them by the digits read as a number, and blocks the deploy if an applied one is
 *   gone or a new one's number is at or below the highest applied.
 * - Drizzle (`drizzle-kit migrate` locally, `test/pg.ts` for the test template) follows
 *   `meta/_journal.json` in entry order, and on a database that already has migrations runs
 *   only the entries whose `when` is later than the newest it applied.
 *
 * The early migrations were named by sequence (0000, 0001, ...) and keep those names. Everything generated since is named
 * by its UTC creation time, which as a number is far above any sequence number.
 */

const DIR = path.resolve("netlify/database/migrations");
/** Netlify's pattern for a migration's name. */
const NETLIFY_NAME = /^(\d+)_[a-z0-9_-]+$/;
const SEQUENTIAL = /^\d{4}$/;
const TIMESTAMP = /^\d{14}$/;
/** drizzle-kit takes the name's time and the journal's `when` from two clock reads. */
const CLOCK_SLACK_MS = 60_000;

// drizzle.config.ts loads .env.local, whose real credentials stay out of the tests.
vi.spyOn(process, "loadEnvFile").mockImplementation(() => {});
const { default: config } = await import("../drizzle.config");
vi.restoreAllMocks();

type Entry = { idx: number; when: number; tag: string };
const journal = JSON.parse(fs.readFileSync(path.join(DIR, "meta/_journal.json"), "utf8")) as {
  entries: Entry[];
};
const sqlFiles = fs
  .readdirSync(DIR)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => file.replace(/\.sql$/, ""));

function prefix(tag: string): string {
  const match = NETLIFY_NAME.exec(tag);
  if (!match) throw new Error(`${tag} is not a name Netlify applies (<digits>_<lowercase slug>)`);
  return match[1];
}

/** `20261125143000` as milliseconds since the epoch, read as UTC. */
function timestampMs(digits: string): number {
  const [y, mo, d, h, mi, s] = [0, 4, 6, 8, 10, 12].map((at, i) =>
    Number(digits.slice(at, at + (i === 0 ? 4 : 2))),
  );
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

describe("database migrations", () => {
  it("are generated with timestamp names", () => {
    expect(config.migrations?.prefix).toBe("timestamp");
  });

  it("have one journal entry per SQL file and per snapshot", () => {
    const tags = journal.entries.map((entry) => entry.tag);
    expect([...tags].sort()).toEqual([...sqlFiles].sort());
    // drizzle-kit diffs against the last snapshot by name, so a stray one would be the parent.
    const snapshots = fs
      .readdirSync(path.join(DIR, "meta"))
      .filter((file) => file.endsWith("_snapshot.json"))
      .map((file) => file.replace(/_snapshot\.json$/, ""));
    expect(snapshots.sort()).toEqual(tags.map(prefix).sort());
  });

  it("are in the same order for Netlify and for Drizzle's journal", () => {
    const tags = journal.entries.map((entry) => entry.tag);
    for (const tag of tags) expect(tag).toMatch(NETLIFY_NAME);
    const netlifyOrder = [...tags].sort((a, b) => Number(prefix(a)) - Number(prefix(b)));
    expect(tags).toEqual(netlifyOrder);
    // An equal number is out of order to Netlify too.
    const numbers = tags.map((tag) => Number(prefix(tag)));
    expect(new Set(numbers).size).toBe(numbers.length);
    // Sorting by name gives the same order, for anything that lists the folder.
    expect([...tags].sort()).toEqual(tags);
  });

  it("have increasing journal times, so Drizzle applies a new one to an existing database", () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
      if (i > 0) expect(entry.when, entry.tag).toBeGreaterThan(journal.entries[i - 1].when);
    });
  });

  it("are numbered 0000 onwards in sequence, then named by the time they were generated", () => {
    expect(namingProblems(journal.entries)).toEqual([]);
  });

  it("would catch a sequential name after a timestamp, or a renamed timestamp", () => {
    const at = Date.UTC(2026, 10, 25, 14, 30, 0);
    const entry = (tag: string, when: number) => ({ idx: 0, when, tag });
    expect(
      namingProblems([entry("0000_a", 1), entry("20261125143000_b", at + 400)]),
    ).toEqual([]);
    expect(
      namingProblems([entry("0000_a", 1), entry("20261125143000_b", at + 400), entry("0001_c", at + 900)]),
    ).toEqual(["0001_c is not a timestamp"]);
    expect(namingProblems([entry("0001_a", 1)])).toEqual(["sequential names must run from 0000"]);
    expect(namingProblems([entry("20261125143000_b", at - 1)])).toEqual([
      "20261125143000_b was generated at a different time than its name",
    ]);
    expect(namingProblems([entry("20261125143000_b", at + CLOCK_SLACK_MS)])).toEqual([
      "20261125143000_b was generated at a different time than its name",
    ]);
  });
});

/** What is wrong with the names of these journal entries, in order. */
function namingProblems(entries: Entry[]): string[] {
  const problems: string[] = [];
  const prefixes = entries.map((entry) => prefix(entry.tag));
  let sequential = prefixes.findIndex((p) => !SEQUENTIAL.test(p));
  if (sequential === -1) sequential = prefixes.length;
  if (prefixes.slice(0, sequential).some((p, i) => p !== String(i).padStart(4, "0"))) {
    problems.push("sequential names must run from 0000");
  }
  for (const entry of entries.slice(sequential)) {
    const digits = prefix(entry.tag);
    if (!TIMESTAMP.test(digits)) {
      problems.push(`${entry.tag} is not a timestamp`);
      continue;
    }
    // A renamed file keeps its old `when`, which Drizzle would then skip or misplace.
    const late = entry.when - timestampMs(digits);
    if (late < 0 || late >= CLOCK_SLACK_MS) {
      problems.push(`${entry.tag} was generated at a different time than its name`);
    }
  }
  return problems;
}
