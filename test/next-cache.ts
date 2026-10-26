/**
 * A stand-in for `next/cache`, whose data cache needs Next's runtime (`unstable_cache` throws
 * "incrementalCache missing" outside it). Mocked for every test in test/setup-env.ts, and the
 * harness clears it before each test.
 *
 * It behaves as Next's does: entries are keyed by key parts plus arguments, and once an entry
 * is past its `revalidate` seconds (by the fakeable clock) the next read still gets the old
 * value while a refresh runs in the background; `dataCache.settle()` waits for those.
 * `revalidateTag(tag, { expire: 0 })` drops tagged entries so the next read waits for fresh
 * data; any other profile marks them stale, refreshed in the background like an expired one.
 */
type Entry = { value: unknown; tags: string[]; staleAt: number };

const entries = new Map<string, Entry>();
const refreshing = new Map<string, Promise<void>>();

export const dataCache = {
  /** Number of results currently cached. */
  get size() {
    return entries.size;
  },
  /** Waits for every background refresh started so far. */
  settle: async () => {
    await Promise.all(refreshing.values());
  },
  reset: () => {
    entries.clear();
    refreshing.clear();
  },
};

export function unstable_cache<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[] = [],
  { tags = [], revalidate = false }: { tags?: string[]; revalidate?: number | false } = {},
): (...args: Args) => Promise<Result> {
  const store = async (key: string, args: Args) => {
    // Next stores results as JSON, so a cached value comes back as plain data.
    const value = JSON.parse(JSON.stringify(await fn(...args))) as Result;
    entries.set(key, { value, tags, staleAt: revalidate === false ? Infinity : Date.now() + revalidate * 1000 });
    return value;
  };

  return async (...args) => {
    const key = JSON.stringify([keyParts, args]);
    const hit = entries.get(key);
    if (!hit) return store(key, args);
    if (hit.staleAt <= Date.now() && !refreshing.has(key)) {
      refreshing.set(key, store(key, args).then(() => void refreshing.delete(key)));
    }
    return hit.value as Result;
  };
}

export function revalidateTag(tag: string, profile: string | { expire?: number }) {
  const expireNow = typeof profile === "object" && profile.expire === 0;
  for (const [key, entry] of entries) {
    if (!entry.tags.includes(tag)) continue;
    if (expireNow) entries.delete(key);
    else entry.staleAt = -Infinity;
  }
}

/** Pages aren't cached in tests, so there is nothing to clear. */
export function revalidatePath() {}
