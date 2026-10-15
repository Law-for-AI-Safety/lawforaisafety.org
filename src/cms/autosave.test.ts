import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DELAY_MS, Autosaver, type AutosaveStatus, type SaveResult } from "./autosave";

/**
 * A fake server for one shared draft: it holds the version, accepts a save that names the
 * current version, and refuses a stale one, as the real saveDraft action does.
 */
function fakeServer() {
  const server = {
    version: 0,
    saved: [] as { value: string; from: number }[],
    gate: null as Promise<void> | null,
    async save(value: string, from: number): Promise<SaveResult> {
      if (server.gate) await server.gate;
      if (from !== server.version) return { ok: false, reason: "conflict", message: "Someone else changed this page." };
      server.saved.push({ value, from });
      server.version++;
      return { ok: true, version: server.version };
    },
  };
  return server;
}

function setup(server = fakeServer(), save = server.save) {
  const statuses: AutosaveStatus[] = [];
  const versions: number[] = [];
  const saver = new Autosaver<string>({
    version: server.version,
    save,
    onStatus: (s) => statuses.push(s),
    onSaved: (v) => versions.push(v),
  });
  return { server, saver, statuses, versions, last: () => statuses[statuses.length - 1] };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("autosave", () => {
  it("saves once the typing pauses, with only the latest value", async () => {
    const { server, saver, versions, last } = setup();
    saver.change("a");
    saver.change("ab");
    expect(last()).toEqual({ state: "pending" });
    expect(saver.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(server.saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.saved).toEqual([{ value: "ab", from: 0 }]);
    expect(versions).toEqual([1]);
    expect(saver.version).toBe(1);
    expect(last()).toEqual({ state: "saved" });
    expect(saver.dirty).toBe(false);
  });

  it("chains saves from the version each one returns, one at a time", async () => {
    const server = fakeServer();
    let open!: () => void;
    server.gate = new Promise((resolve) => (open = resolve));
    const { saver, last } = setup(server);
    saver.change("one");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(last()).toEqual({ state: "saving" });
    saver.change("two");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    server.gate = null;
    open();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.saved).toEqual([
      { value: "one", from: 0 },
      { value: "two", from: 1 },
    ]);
    expect(last()).toEqual({ state: "saved" });
  });

  it("reports a change still waiting after a save finishes", async () => {
    const server = fakeServer();
    let open!: () => void;
    server.gate = new Promise((resolve) => (open = resolve));
    const { saver, statuses } = setup(server);
    saver.change("one");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.change("two");
    open();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.slice(-1)).toEqual([{ state: "pending" }]);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(server.saved.map((s) => s.value)).toEqual(["one", "two"]);
  });

  it("saves now on flush, and does nothing when nothing changed", async () => {
    const { server, saver } = setup();
    await saver.flush();
    expect(server.saved).toEqual([]);
    saver.change("now");
    await saver.flush();
    expect(server.saved).toEqual([{ value: "now", from: 0 }]);
  });

  it("stops at a conflict when another editor saved first, and saves nothing more", async () => {
    const server = fakeServer();
    const mine = setup(server);
    const theirs = setup(server);
    theirs.saver.change("their edit");
    await theirs.saver.flush();

    mine.saver.change("my edit");
    await mine.saver.flush();
    expect(mine.last()).toEqual({ state: "conflict", message: "Someone else changed this page." });
    expect(mine.saver.dirty).toBe(false);

    mine.saver.change("more");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await mine.saver.flush();
    expect(server.saved.map((s) => s.value)).toEqual(["their edit"]);
    expect(mine.last().state).toBe("conflict");
  });

  it("drops a waiting change when the server refuses for good", async () => {
    const server = fakeServer();
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const { saver, last } = setup(server, async () => {
      await gate;
      return { ok: false, reason: "forbidden", message: "No permission." };
    });
    saver.change("one");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.change("two");
    open();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(last()).toEqual({ state: "forbidden", message: "No permission." });
    expect(saver.dirty).toBe(false);
  });

  it("keeps the change after a failed save, and sends it on retry", async () => {
    const server = fakeServer();
    let fail = true;
    const { saver, last } = setup(server, async (value, from) => {
      if (fail) throw new Error("offline");
      return server.save(value, from);
    });
    saver.change("kept");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(last()).toEqual({ state: "error", message: "Could not save. Check your connection; your changes are kept here." });
    expect(saver.dirty).toBe(true);
    // No retry loop: nothing is sent until asked.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 5);
    fail = false;
    await saver.flush();
    expect(server.saved).toEqual([{ value: "kept", from: 0 }]);
    expect(last()).toEqual({ state: "saved" });
  });

  it("keeps a newer change rather than the failed one", async () => {
    const server = fakeServer();
    let open!: () => void;
    let fail = true;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const { saver } = setup(server, async (value, from) => {
      await gate;
      if (fail) return { ok: false, reason: "retry", message: "Signed out." };
      return server.save(value, from);
    });
    saver.change("old");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.change("new");
    open();
    await vi.advanceTimersByTimeAsync(0);
    fail = false;
    await saver.flush();
    expect(server.saved.map((s) => s.value)).toEqual(["new"]);
  });

  it("stops saving when disposed", async () => {
    const { server, saver } = setup();
    saver.change("x");
    saver.dispose();
    saver.dispose();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await saver.flush();
    expect(server.saved).toEqual([]);
  });
});
