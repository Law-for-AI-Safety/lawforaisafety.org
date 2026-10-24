/**
 * A stand-in for `next/cache`, whose data cache needs Next's runtime (`unstable_cache` throws
 * "incrementalCache missing" outside it). Mocked for every test in test/setup-env.ts. Entries
 * live in memory, keyed like Next's (key parts plus arguments), expire after `revalidate`
 * seconds by the (fakeable) clock, and are dropped by `revalidateTag`. The harness clears
 * the cache before each test.
 */
type Entry = { value: unknown; tags: string[]; expiresAt: number };

const entries = new Map<string, Entry>();

export const dataCache = {
  reset: () => entries.clear(),
};

export function unstable_cache<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[] = [],
  { tags = [], revalidate = false }: { tags?: string[]; revalidate?: number | false } = {},
): (...args: Args) => Promise<Result> {
  return async (...args) => {
    const key = JSON.stringify([keyParts, args]);
    const hit = entries.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as Result;
    // Next stores results as JSON, so a cached value comes back as plain data.
    const value = JSON.parse(JSON.stringify(await fn(...args))) as Result;
    entries.set(key, { value, tags, expiresAt: revalidate === false ? Infinity : Date.now() + revalidate * 1000 });
    return value;
  };
}

export function revalidateTag(tag: string) {
  for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key);
}

/** Pages aren't cached in tests, so there is nothing to clear. */
export function revalidatePath() {}
