import { describe, expect, it } from "vitest";
import { isStaleLock, STALE_LOCK_MS } from "./publish";
import { editorState, isDeployed, type StateInputs } from "./publish-status";

const base: StateInputs = { pageState: "draft", locked: false, draftVersion: 3, latest: null };

describe("editorState", () => {
  it("is Draft or Live from the draft when nothing was sent", () => {
    expect(editorState(base)).toBe("draft");
    expect(editorState({ ...base, pageState: "live", draftVersion: 0 })).toBe("live");
  });

  it("is Publishing while the draft is locked, whatever else holds", () => {
    expect(editorState({ ...base, locked: true })).toBe("publishing");
    expect(editorState({ ...base, locked: true, latest: { state: "merged", draftVersion: 3 } })).toBe("publishing");
  });

  it("is Not published after a decline, until the draft is saved again", () => {
    expect(editorState({ ...base, latest: { state: "closed", draftVersion: 3 } })).toBe("not_published");
    expect(editorState({ ...base, draftVersion: 4, latest: { state: "closed", draftVersion: 3 } })).toBe("draft");
    expect(editorState({ ...base, pageState: "live", draftVersion: 0, latest: { state: "closed", draftVersion: 0 } })).toBe("live");
  });

  it("is Draft after a withdrawal and Live after a merge once the draft is gone", () => {
    expect(editorState({ ...base, latest: { state: "withdrawn", draftVersion: 3 } })).toBe("draft");
    expect(editorState({ ...base, pageState: "live", draftVersion: 0, latest: { state: "merged", draftVersion: 3 } })).toBe("live");
  });
});

describe("isDeployed", () => {
  it("waits until this deployment's file is no longer the one the draft started from", () => {
    expect(isDeployed({ deployedHash: "base", baseHash: "base", mergedHash: "merged" })).toBe(false);
    expect(isDeployed({ deployedHash: "merged", baseHash: "base", mergedHash: "merged" })).toBe(true);
    // A later change on top of the merge is deployed too.
    expect(isDeployed({ deployedHash: "later", baseHash: "base", mergedHash: "merged" })).toBe(true);
  });

  it("counts a merge that left the file as it was as deployed", () => {
    expect(isDeployed({ deployedHash: "base", baseHash: "base", mergedHash: "base" })).toBe(true);
  });
});

it("treats a lock older than STALE_LOCK_MS as left behind", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  expect(isStaleLock(new Date(now.getTime() - STALE_LOCK_MS), now)).toBe(false);
  expect(isStaleLock(new Date(now.getTime() - STALE_LOCK_MS - 1), now)).toBe(true);
});
