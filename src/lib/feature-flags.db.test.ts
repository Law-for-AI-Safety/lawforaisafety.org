import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { featureFlags } from "@/drizzle/schema";
import {
  getRedLinesFlagState,
  getSignupFlagState,
  isRedLinesApplicationsEnabled,
  isSignupEnabled,
  redLinesApplicationsClosedRedirect,
  setRedLinesApplicationsEnabled,
  setSignupEnabled,
  signupClosedJson,
  signupClosedRedirect,
} from "@/lib/feature-flags";

// The flag cache is module state that outlives a test, so every test sets the flags it reads
// through the setters, which clear it, before reading them.
beforeEach(async () => {
  await setSignupEnabled(false, "reset@example.com");
  await setRedLinesApplicationsEnabled(false, "reset@example.com");
});

describe("signup guards", () => {
  it("let the request through while signup is open", async () => {
    await setSignupEnabled(true, "admin@example.com");

    expect(await signupClosedRedirect("/field-building")).toBeNull();
    expect(await signupClosedJson()).toBeNull();
  });

  it("send a closed form back to the page it came from", async () => {
    const response = await signupClosedRedirect("/field-building");

    expect(response?.status).toBe(303);
    expect(response?.headers.get("Location")).toBe("/field-building?error=closed#contact");
  });

  it("send a closed form to the homepage when no page is given", async () => {
    const response = await signupClosedRedirect();

    expect(response?.headers.get("Location")).toBe("/?error=closed#contact");
  });

  it("answer a closed newsletter request with JSON", async () => {
    const response = await signupClosedJson();

    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({ error: "Signups are currently closed" });
  });

  it("are independent of the Red Lines flag", async () => {
    await setRedLinesApplicationsEnabled(true, "admin@example.com");

    expect(await isSignupEnabled()).toBe(false);
    expect(await signupClosedJson()).not.toBeNull();
  });
});

describe("Red Lines guard", () => {
  it("lets the request through while applications are open", async () => {
    await setRedLinesApplicationsEnabled(true, "admin@example.com");

    expect(await redLinesApplicationsClosedRedirect()).toBeNull();
  });

  it("sends a closed application back to the Red Lines page", async () => {
    const response = await redLinesApplicationsClosedRedirect();

    expect(response?.status).toBe(303);
    expect(response?.headers.get("Location")).toBe("/red-lines-dialogue?error=closed#apply");
  });

  it("is independent of the signup flag", async () => {
    await setSignupEnabled(true, "admin@example.com");

    expect(await isRedLinesApplicationsEnabled()).toBe(false);
  });
});

describe("flag state", () => {
  it("records who changed a flag and when", async () => {
    const before = Date.now();
    await setSignupEnabled(true, "admin@example.com");

    const state = await getSignupFlagState();
    expect(state).toMatchObject({ enabled: true, updatedBy: "admin@example.com" });
    expect(state!.updatedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("is null for a flag that has never been set", async () => {
    await db.delete(featureFlags);

    expect(await getRedLinesFlagState()).toBeNull();
    expect(await isRedLinesApplicationsEnabled()).toBe(false);
  });
});

describe("flag cache", () => {
  it("serves a read from the cache until it expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await setSignupEnabled(false, "admin@example.com");
    expect(await isSignupEnabled()).toBe(false);

    // A change that bypasses setSignupEnabled, as another server instance's would.
    await db.update(featureFlags).set({ enabled: true }).where(eq(featureFlags.key, "signup"));
    expect(await isSignupEnabled()).toBe(false);

    vi.setSystemTime(Date.now() + 60_001);
    expect(await isSignupEnabled()).toBe(true);
  });

  it("is cleared by a change made through the setter", async () => {
    expect(await isSignupEnabled()).toBe(false);

    await setSignupEnabled(true, "admin@example.com");

    expect(await isSignupEnabled()).toBe(true);
  });
});

describe("when the database cannot be read", () => {
  it("treats every flag as off, closing the forms", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await setSignupEnabled(true, "admin@example.com");
    await db.execute(sql`ALTER TABLE feature_flags RENAME TO feature_flags_unavailable`);
    try {
      expect(await signupClosedJson()).not.toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Failed to read feature flag "signup"',
        expect.any(Error),
      );
    } finally {
      await db.execute(sql`ALTER TABLE feature_flags_unavailable RENAME TO feature_flags`);
    }
  });

  it("lets the admin page see the failure", async () => {
    await db.execute(sql`ALTER TABLE feature_flags RENAME TO feature_flags_unavailable`);
    try {
      await expect(getSignupFlagState()).rejects.toThrow();
    } finally {
      await db.execute(sql`ALTER TABLE feature_flags_unavailable RENAME TO feature_flags`);
    }
  });
});
