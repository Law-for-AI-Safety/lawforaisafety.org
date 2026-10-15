import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { rateLimitHits } from "@/drizzle/schema";
import { setRedLinesApplicationsEnabled, setSignupEnabled } from "@/lib/feature-flags";
import { APP_ORIGIN } from "../../../test/app-fetch";
import * as authEmail from "./auth/email/route";
import * as authEmailConfirm from "./auth/email/confirm/route";
import * as authGoogle from "./auth/google/route";
import * as authGoogleCallback from "./auth/google/callback/route";
import * as authLinkedin from "./auth/linkedin/route";
import * as authLinkedinCallback from "./auth/linkedin/callback/route";
import * as authRetry from "./auth/retry/route";
import * as newsletter from "./newsletter/route";
import * as redLinesEmail from "./red-lines-dialogue/apply/email/route";
import * as redLinesEmailConfirm from "./red-lines-dialogue/apply/email/confirm/route";
import * as redLinesGoogle from "./red-lines-dialogue/apply/google/route";
import * as redLinesGoogleCallback from "./red-lines-dialogue/apply/google/callback/route";
import * as redLinesLinkedin from "./red-lines-dialogue/apply/linkedin/route";
import * as redLinesLinkedinCallback from "./red-lines-dialogue/apply/linkedin/callback/route";
import * as redLinesRetry from "./red-lines-dialogue/apply/retry/route";

/**
 * The public pages are prerendered and always show their forms, so the admin toggles are
 * enforced only here: every submit and OAuth route checks its flag before doing anything
 * else. Each route is called with the flag closed, where it must answer with the closed
 * message, and open, where it must get past the guard to its next check.
 *
 * The OAuth callbacks, once past the guard, reach `cookies()`, which needs Next's request
 * context and so throws here (see test/app-fetch.ts). That throw is the sign they got past.
 */
const OUTSIDE_REQUEST = /outside a request scope/;

type Handler = (request: Request) => Promise<Response>;

function post(handler: Handler, path: string, fields: Record<string, string> = {}) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return handler(new Request(`${APP_ORIGIN}${path}`, { method: "POST", body }));
}

function get(handler: Handler, path: string) {
  return handler(new Request(`${APP_ORIGIN}${path}`));
}

function location(response: Response) {
  expect(response.status).toBe(303);
  return response.headers.get("Location");
}

beforeEach(async () => {
  // Every request here comes from the same unknown client IP.
  await db.delete(rateLimitHits);
  await setSignupEnabled(true, "admin@example.com");
  await setRedLinesApplicationsEnabled(true, "admin@example.com");
});

describe("signup routes", () => {
  const formRoutes: [string, Handler][] = [
    ["/api/auth/email", authEmail.POST],
    ["/api/auth/google", authGoogle.POST],
    ["/api/auth/linkedin", authLinkedin.POST],
  ];

  describe.each(formRoutes)("POST %s", (path, handler) => {
    it("sends the form back to its page as closed while signup is off", async () => {
      await setSignupEnabled(false, "admin@example.com");

      const response = await post(handler, path, { source: "field_building" });

      expect(location(response)).toBe("/field-building?error=closed#contact");
    });

    it("goes on to the bot check while signup is on", async () => {
      const response = await post(handler, path, { source: "field_building" });

      expect(location(response)).toBe("/field-building?error=verification#contact");
    });
  });

  const tokenRoutes: [string, Handler][] = [
    ["/api/auth/email/confirm", authEmailConfirm.POST],
    ["/api/auth/retry", authRetry.POST],
  ];

  describe.each(tokenRoutes)("POST %s", (path, handler) => {
    it("answers as closed while signup is off", async () => {
      await setSignupEnabled(false, "admin@example.com");

      expect(location(await post(handler, path))).toBe("/?error=closed#contact");
    });

    it("goes on to check the token while signup is on", async () => {
      expect(location(await post(handler, path))).toBe("/?error=invalid#contact");
    });
  });

  const callbacks: [string, Handler][] = [
    ["/api/auth/google/callback", authGoogleCallback.GET],
    ["/api/auth/linkedin/callback", authLinkedinCallback.GET],
  ];

  describe.each(callbacks)("GET %s", (path, handler) => {
    it("answers as closed while signup is off", async () => {
      await setSignupEnabled(false, "admin@example.com");

      expect(location(await get(handler, path))).toBe("/?error=closed#contact");
    });

    it("goes on to the sign-in while signup is on", async () => {
      await expect(get(handler, path)).rejects.toThrow(OUTSIDE_REQUEST);
    });
  });

  describe("POST /api/newsletter", () => {
    it("answers with JSON as closed while signup is off", async () => {
      await setSignupEnabled(false, "admin@example.com");

      const response = await post(newsletter.POST, "/api/newsletter");

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Signups are currently closed" });
    });

    it("goes on to the bot check while signup is on", async () => {
      const response = await post(newsletter.POST, "/api/newsletter");

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Verification failed" });
    });
  });

  it("are not closed by the Red Lines flag", async () => {
    await setRedLinesApplicationsEnabled(false, "admin@example.com");

    const response = await post(authEmail.POST, "/api/auth/email", { source: "field_building" });

    expect(location(response)).toBe("/field-building?error=verification#contact");
  });
});

describe("Red Lines Dialogues routes", () => {
  const formRoutes: [string, Handler][] = [
    ["/api/red-lines-dialogue/apply/email", redLinesEmail.POST],
    ["/api/red-lines-dialogue/apply/google", redLinesGoogle.POST],
    ["/api/red-lines-dialogue/apply/linkedin", redLinesLinkedin.POST],
  ];

  describe.each(formRoutes)("POST %s", (path, handler) => {
    it("sends the form back as closed while applications are off", async () => {
      await setRedLinesApplicationsEnabled(false, "admin@example.com");

      expect(location(await post(handler, path))).toBe("/red-lines-dialogue?error=closed#apply");
    });

    it("goes on to the bot check while applications are on", async () => {
      expect(location(await post(handler, path))).toBe(
        "/red-lines-dialogue?error=verification#apply",
      );
    });
  });

  const tokenRoutes: [string, Handler][] = [
    ["/api/red-lines-dialogue/apply/email/confirm", redLinesEmailConfirm.POST],
    ["/api/red-lines-dialogue/apply/retry", redLinesRetry.POST],
  ];

  describe.each(tokenRoutes)("POST %s", (path, handler) => {
    it("answers as closed while applications are off", async () => {
      await setRedLinesApplicationsEnabled(false, "admin@example.com");

      expect(location(await post(handler, path))).toBe("/red-lines-dialogue?error=closed#apply");
    });

    it("goes on to check the token while applications are on", async () => {
      expect(location(await post(handler, path))).toBe("/red-lines-dialogue?error=invalid#apply");
    });
  });

  const callbacks: [string, Handler][] = [
    ["/api/red-lines-dialogue/apply/google/callback", redLinesGoogleCallback.GET],
    ["/api/red-lines-dialogue/apply/linkedin/callback", redLinesLinkedinCallback.GET],
  ];

  describe.each(callbacks)("GET %s", (path, handler) => {
    it("answers as closed while applications are off", async () => {
      await setRedLinesApplicationsEnabled(false, "admin@example.com");

      expect(location(await get(handler, path))).toBe("/red-lines-dialogue?error=closed#apply");
    });

    it("goes on to the sign-in while applications are on", async () => {
      await expect(get(handler, path)).rejects.toThrow(OUTSIDE_REQUEST);
    });
  });

  it("are not closed by the signup flag", async () => {
    await setSignupEnabled(false, "admin@example.com");

    expect(location(await post(redLinesEmail.POST, "/api/red-lines-dialogue/apply/email"))).toBe(
      "/red-lines-dialogue?error=verification#apply",
    );
  });
});
