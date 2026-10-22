import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import { printOpportunity } from "@/opportunities/files";
import type { Opportunity } from "@/opportunities/types";

/**
 * `getOpportunities()`/`getOpportunityBySlug()` read `content/opportunities/` relative to
 * `process.cwd()` - real, committed content, not an "outside service" seam like `fetch`. A
 * page component that calls them with no arguments (every opportunities page does) can't be
 * handed fixture data through a prop, so tests that render one point `process.cwd()` at a
 * throwaway directory for the duration of the test instead of depending on whatever happens to
 * be committed in the real `content/opportunities/` right now.
 *
 * Call in a `beforeEach`, keep the returned `restore`, call it in `afterEach`.
 */
export function withOpportunities(opportunities: Opportunity[]): { restore: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opportunities-fixture-"));
  fs.mkdirSync(path.join(dir, "content", "opportunities"), { recursive: true });
  for (const opportunity of opportunities) {
    fs.writeFileSync(path.join(dir, "content", "opportunities", `${opportunity.slug}.json`), printOpportunity(opportunity));
  }
  const spy = vi.spyOn(process, "cwd").mockReturnValue(dir);
  return {
    restore: () => {
      spy.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
