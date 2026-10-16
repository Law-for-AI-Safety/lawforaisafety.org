import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { rateLimitHits } from "@/drizzle/schema";
import { FORM_RENDERED_AT_FIELD_NAME } from "@/lib/abuse-protection";
import { setRedLinesApplicationsEnabled, setSignupEnabled } from "@/lib/feature-flags";
import { APP_ORIGIN } from "../../../test/app-fetch";
import { cookieJar } from "../../../test/next-headers";
import { turnstile } from "../../../test/fakes/turnstile";
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
 * message, and open, where it must get past the guard.
 */
// `cookies()` needs Next's request context; the browser's cookies are `cookieJar`.
vi.mock("next/headers", () => import("../../../test/next-headers"));

type Handler = (request: Request) => Promise<Response>;

function post(handler: Handler, path: string, fields: Record<string, string> = {}) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return handler(new Request(`${APP_ORIGIN}${path}`, { method: "POST", body }));
}

function get(handler: Handler, path: string) {
  return handler(new Request(`${APP_ORIGIN}${path}`));
}

const UNKNOWN_STATE = "00000000-0000-4000-8000-000000000000";

/** What the apply form sends once a person has filled it in and passed the bot checks. */
function humanFields(fields: Record<string, string>) {
  return {
    ...fields,
    "cf-turnstile-response": turnstile.accept(),
    [FORM_RENDERED_AT_FIELD_NAME]: String(Date.now() - 60_000),
  };
}

/** The provider sign-in URL the hand-off page sends the browser on to. */
async function handoffUrl(response: Response) {
  expect(response.status).toBe(200);
  const href = (await response.text()).match(/<a href="([^"]+)">Continue to/)?.[1];
  return new URL(href!.replaceAll("&amp;", "&"));
}

function location(response: Response) {
  expect(response.status).toBe(303);
  return response.headers.get("Location");
}

beforeEach(async () => {
  cookieJar.reset();
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

  const signIns: [string, Handler, string][] = [
    ["/api/auth/google", authGoogle.POST, "https://accounts.google.com/o/oauth2/v2/auth"],
    ["/api/auth/linkedin", authLinkedin.POST, "https://www.linkedin.com/oauth/v2/authorization"],
  ];

  it.each(signIns)(
    "POST %s hands a filled-in form on to the provider while signup is on",
    async (path, handler, authorizeUrl) => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
      vi.stubEnv("LINKEDIN_CLIENT_ID", "test-linkedin-client");

      const response = await post(
        handler,
        path,
        humanFields({
          source: "field_building",
          linkedinUrl: "https://www.linkedin.com/in/someone",
        }),
      );

      const url = await handoffUrl(response);
      expect(`${url.origin}${url.pathname}`).toBe(authorizeUrl);
      expect(cookieJar.get("oauth_state")?.value).toBe(url.searchParams.get("state"));
    },
  );

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
      cookieJar.set("oauth_state", UNKNOWN_STATE);

      const response = await get(handler, `${path}?state=${UNKNOWN_STATE}&code=abc`);

      // A state this browser started but no draft matches: past the guard, the sign-in ends.
      expect(location(response)).toBe("/?error=invalid#contact");
      expect(cookieJar.get("oauth_state")).toBeUndefined();
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

  const signIns: [string, Handler, string][] = [
    [
      "/api/red-lines-dialogue/apply/google",
      redLinesGoogle.POST,
      "https://accounts.google.com/o/oauth2/v2/auth",
    ],
    [
      "/api/red-lines-dialogue/apply/linkedin",
      redLinesLinkedin.POST,
      "https://www.linkedin.com/oauth/v2/authorization",
    ],
  ];

  it.each(signIns)(
    "POST %s hands a filled-in form on to the provider while applications are on",
    async (path, handler, authorizeUrl) => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
      vi.stubEnv("LINKEDIN_CLIENT_ID", "test-linkedin-client");

      const response = await post(
        handler,
        path,
        humanFields({
          areaOfExpertise: "legal_governance",
          motivation: "To help draw the red lines.",
          availableHours: "4",
          euParliamentInterest: "maybe",
          affiliation: "Example University",
        }),
      );

      const url = await handoffUrl(response);
      expect(`${url.origin}${url.pathname}`).toBe(authorizeUrl);
      expect(cookieJar.get("red_lines_oauth_state")?.value).toBe(url.searchParams.get("state"));
    },
  );

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
      cookieJar.set("red_lines_oauth_state", UNKNOWN_STATE);

      const response = await get(handler, `${path}?state=${UNKNOWN_STATE}&code=abc`);

      expect(location(response)).toBe("/red-lines-dialogue?error=invalid#apply");
      expect(cookieJar.get("red_lines_oauth_state")).toBeUndefined();
    });
  });

  it("are not closed by the signup flag", async () => {
    await setSignupEnabled(false, "admin@example.com");

    expect(location(await post(redLinesEmail.POST, "/api/red-lines-dialogue/apply/email"))).toBe(
      "/red-lines-dialogue?error=verification#apply",
    );
  });
});
