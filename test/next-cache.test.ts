import { describe, expect, it, vi } from "vitest";
import { dataCache, revalidateTag, unstable_cache } from "./next-cache";

/** A cached read whose first call answers at once and whose later calls wait to be finished. */
function slowRefresh(tags: string[] = []) {
  const pending: { resolve: (value: string) => void; reject: (err: Error) => void }[] = [];
  let calls = 0;
  const read = unstable_cache(
    () => {
      calls++;
      if (calls === 1) return Promise.resolve("first");
      return new Promise<string>((resolve, reject) => void pending.push({ resolve, reject }));
    },
    ["stand-in", ...tags],
    { revalidate: 60, tags },
  );
  return { read, calls: () => calls, finish: (value: string) => pending.shift()!.resolve(value), fail: (err: Error) => pending.shift()!.reject(err) };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Reads once, then moves the clock past `revalidate` and reads again, starting a background refresh. */
async function startStaleRefresh(cache: ReturnType<typeof slowRefresh>) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T12:00:00Z"));
  expect(await cache.read()).toBe("first");
  vi.setSystemTime(new Date("2026-11-22T12:02:00Z"));
  expect(await cache.read()).toBe("first");
  expect(cache.calls()).toBe(2);
}

describe("the data cache stand-in", () => {
  it("drops a background refresh that finishes after a reset, so it can't reach the next test", async () => {
    const cache = slowRefresh();
    await startStaleRefresh(cache);
    dataCache.reset();
    cache.finish("from the earlier test");
    await tick();
    expect(dataCache.size).toBe(0);
  });

  it("doesn't let a refresh that finishes late clear a newer one's place", async () => {
    const cache = slowRefresh();
    await startStaleRefresh(cache);
    dataCache.reset();

    // The next test reads afresh and starts its own refresh.
    const again = unstable_cache(async () => "second", ["stand-in"], { revalidate: 60 });
    expect(await again()).toBe("second");
    vi.setSystemTime(new Date("2026-11-22T12:04:00Z"));
    await cache.read(); // stale: its refresh waits on `finish`
    expect(cache.calls()).toBe(3);

    cache.finish("from the earlier test");
    await tick();
    const settled = vi.fn();
    void dataCache.settle().then(settled);
    await tick();
    expect(settled).not.toHaveBeenCalled(); // still waiting for the newer refresh
    cache.finish("refreshed");
    await dataCache.settle();
    expect(await cache.read()).toBe("refreshed");
  });

  it("doesn't put back what a refresh read before its tag was revalidated", async () => {
    const cache = slowRefresh(["rows"]);
    await startStaleRefresh(cache);
    revalidateTag("rows", { expire: 0 });
    cache.finish("read before the change");
    await dataCache.settle();
    expect(dataCache.size).toBe(0);
  });

  it("reports a failed refresh from settle, keeping the old value", async () => {
    const cache = slowRefresh();
    await startStaleRefresh(cache);
    cache.fail(new Error("database gone"));
    await expect(dataCache.settle()).rejects.toThrow("database gone");
    // The old value is still served, and the next read tries again.
    expect(await cache.read()).toBe("first");
    cache.finish("second try");
    await expect(dataCache.settle()).resolves.toBeUndefined();
    expect(await cache.read()).toBe("second try");
  });
});
