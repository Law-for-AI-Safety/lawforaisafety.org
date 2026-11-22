/**
 * A stand-in for `next/cache`, whose data cache needs Next's runtime (`unstable_cache` throws
 * "incrementalCache missing" outside it). Mocked for every test in test/setup-env.ts, which
 * waits for its background refreshes after each test and clears it before the next.
 *
 * It behaves as Next's does: entries are keyed by key parts plus arguments, and once an entry
 * is past its `revalidate` seconds (by the fakeable clock) the next read still gets the old
 * value while a refresh runs in the background; `dataCache.settle()` waits for those, and
 * throws if one failed. `revalidateTag(tag, { expire: 0 })` drops tagged entries so the next
 * read waits for fresh data; any other profile marks them stale, refreshed in the background
 * like an expired one. A read or refresh that was under way when its entry was dropped, marked
 * stale or cleared doesn't store what it read, since that may predate the change.
 */
type Entry = { value: unknown; tags: string[]; staleAt: number };

const entries = new Map<string, Entry>();
const refreshing = new Map<string, Promise<void>>();
const failures: unknown[] = [];
// Bumped by `reset()`, and per key by `revalidateTag`; a store checks neither moved while it read.
let generation = 0;
const versions = new Map<string, number>();
const tokenOf = (key: string) => `${generation}/${versions.get(key) ?? 0}`;

export const dataCache = {
  /** Number of results currently cached. */
  get size() {
    return entries.size;
  },
  /** Waits for every background refresh, including any they lead to, and throws the first that failed. */
  settle: async () => {
    while (refreshing.size > 0) await Promise.all(refreshing.values());
    if (failures.length > 0) throw failures.splice(0)[0];
  },
  reset: () => {
    entries.clear();
    refreshing.clear();
    failures.length = 0;
    versions.clear();
    generation++;
  },
};

export function unstable_cache<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[] = [],
  { tags = [], revalidate = false }: { tags?: string[]; revalidate?: number | false } = {},
): (...args: Args) => Promise<Result> {
  const store = async (key: string, args: Args) => {
    const token = tokenOf(key);
    // Next stores results as JSON, so a cached value comes back as plain data.
    const value = JSON.parse(JSON.stringify(await fn(...args))) as Result;
    if (tokenOf(key) === token) {
      entries.set(key, { value, tags, staleAt: revalidate === false ? Infinity : Date.now() + revalidate * 1000 });
    }
    return value;
  };

  return async (...args) => {
    const key = JSON.stringify([keyParts, args]);
    const hit = entries.get(key);
    if (!hit) return store(key, args);
    if (hit.staleAt <= Date.now() && !refreshing.has(key)) {
      // As in Next, a failed refresh keeps the old value; `settle()` reports it.
      const refresh: Promise<void> = store(key, args)
        .then(
          () => {},
          (err: unknown) => void failures.push(err),
        )
        .finally(() => {
          if (refreshing.get(key) === refresh) refreshing.delete(key);
        });
      refreshing.set(key, refresh);
    }
    return hit.value as Result;
  };
}

export function revalidateTag(tag: string, profile: string | { expire?: number }) {
  const expireNow = typeof profile === "object" && profile.expire === 0;
  for (const [key, entry] of entries) {
    if (!entry.tags.includes(tag)) continue;
    versions.set(key, (versions.get(key) ?? 0) + 1);
    if (expireNow) entries.delete(key);
    else entry.staleAt = -Infinity;
  }
}

/** Pages aren't cached in tests, so there is nothing to clear. */
export function revalidatePath() {}
