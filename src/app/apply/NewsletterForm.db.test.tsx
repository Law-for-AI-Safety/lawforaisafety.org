import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { db } from "@/lib/db";
import { newsletterSignups, rateLimitHits } from "@/drizzle/schema";
import { setSignupEnabled } from "@/lib/feature-flags";
import { emails, linkParam } from "../../../test/fakes/email";
import { turnstile } from "../../../test/fakes/turnstile";
import NewsletterForm from "./NewsletterForm";

/**
 * The newsletter form end to end: the component posts to the real `/api/newsletter` route,
 * which checks the flag, rate limit and Turnstile, writes to Postgres and sends through Brevo.
 * Only Cloudflare and Brevo are fakes.
 */
const READER = "reader@example.com";
const THANKS = "Thanks. Check your inbox to confirm your subscription.";
// Comfortably slower than the minimum fill time below which looksLikeBot drops a submission.
const HUMAN_FILL_MS = 5000;

beforeEach(async () => {
  await db.delete(newsletterSignups);
  // Every submission here comes from the same unknown client IP.
  await db.delete(rateLimitHits);
  await setSignupEnabled(true, "admin@example.com");
  vi.useFakeTimers({ toFake: ["Date"] });
});

async function subscribe(
  email: string,
  { solveTurnstile = true, fillMs = HUMAN_FILL_MS } = {},
) {
  const user = userEvent.setup();
  render(<NewsletterForm />);
  if (solveTurnstile) turnstile.solve();
  await user.type(screen.getByPlaceholderText("you@example.com"), email);
  vi.setSystemTime(Date.now() + fillMs);
  await user.click(screen.getByRole("button", { name: "Subscribe" }));
}

describe("NewsletterForm", () => {
  it("sends a production visitor a link to confirm their subscription", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");

    await subscribe(" Reader@Example.com ");

    expect(await screen.findByText(THANKS)).toBeVisible();
    const [email] = emails.to(READER);
    expect(email).toMatchObject({ from: "noreply@example.org", subject: "Confirm your subscription" });
    expect(email.html).toContain("https://lawforaisafety.test/newsletter/confirm?token=");
    const rows = await db.select().from(newsletterSignups);
    expect(rows).toEqual([
      expect.objectContaining({
        email: READER,
        confirmationToken: linkParam(email, "token"),
        confirmedAt: null,
      }),
    ]);
  });

  it("emails only admin addresses outside production", async () => {
    await subscribe(READER);

    expect(await screen.findByText(THANKS)).toBeVisible();
    expect(emails.sent).toEqual([]);
    expect(await db.select().from(newsletterSignups)).toHaveLength(1);
  });

  it("thanks a bot that submits instantly, but stores and sends nothing", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");

    await subscribe(READER, { fillMs: 0 });

    expect(await screen.findByText(THANKS)).toBeVisible();
    expect(emails.sent).toEqual([]);
    expect(await db.select().from(newsletterSignups)).toEqual([]);
  });

  it("asks the visitor to retry when the bot check fails", async () => {
    await subscribe(READER, { solveTurnstile: false });

    expect(
      await screen.findByText("We couldn't verify you're not a robot. Please try again."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeEnabled();
    expect(await db.select().from(newsletterSignups)).toEqual([]);
  });

  it("stores nothing while signups are closed", async () => {
    await setSignupEnabled(false, "admin@example.com");

    await subscribe(READER);

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeVisible();
    expect(turnstile.verifications).toEqual([]);
    expect(await db.select().from(newsletterSignups)).toEqual([]);
  });
});
