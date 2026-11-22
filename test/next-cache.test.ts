import { describe, expect, it, vi } from "vitest";
import { dataCache, unstable_cache } from "./next-cache";

describe("the data cache stand-in", () => {
  it("drops a background refresh that finishes after a reset, so it can't reach the next test", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-22T12:00:00Z"));
    let finish: (value: string) => void = () => {};
    let calls = 0;
    const read = unstable_cache(
      () => {
        calls++;
        return calls === 1 ? Promise.resolve("first") : new Promise<string>((resolve) => (finish = resolve));
      },
      ["stand-in"],
      { revalidate: 60 },
    );

    expect(await read()).toBe("first");
    vi.setSystemTime(new Date("2026-11-22T12:02:00Z"));
    expect(await read()).toBe("first"); // stale, so a refresh starts in the background

    dataCache.reset();
    finish("from the earlier test");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dataCache.size).toBe(0);
  });
});
