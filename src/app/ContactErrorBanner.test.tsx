import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import ContactErrorBanner from "./ContactErrorBanner";

function renderAt(url: string) {
  window.history.replaceState(null, "", url);
  return render(<ContactErrorBanner />);
}

describe("ContactErrorBanner", () => {
  it("explains a closed form to a visitor sent back by the signup guard", () => {
    renderAt("/field-building?error=closed#contact");

    expect(
      screen.getByText("Signups are closed right now. Please email info@lawforaisafety.org instead."),
    ).toBeVisible();
  });

  it("explains a failed bot check", () => {
    renderAt("/?error=verification");

    expect(screen.getByText(/couldn't verify you're not a robot/)).toBeVisible();
  });

  it.each(["/", "/?error=", "/?error=unknown-code", "/?error=toString", "/?error=__proto__", "/?error=constructor", "/?error=hasOwnProperty"])(
    "shows nothing at %s",
    (url) => {
      const { container } = renderAt(url);

      expect(container).toBeEmptyDOMElement();
    },
  );

  it.each([
    ["validation", "Provide at least one of: LinkedIn profile URL, CV upload, or a position statement."],
    ["toolong", "One of your answers is too long. Please shorten it and try again below."],
    ["linkedin", "That doesn't look like a LinkedIn profile URL. It should start with https://www.linkedin.com/in/"],
    ["name", "Please enter your name without special characters like < or >."],
    ["email", "That email address doesn't look right. Please check it and try again below."],
    ["cv", "Your CV must be a PDF of 5 MB or less."],
    ["organisation", "Enter your organisation's name to apply as an organisation."],
    ["sendfailed", "We couldn't send your confirmation email. Please try again below in a few minutes."],
    ["invalid", "That verification link isn't valid. Please try again below."],
    ["expired", "That verification attempt expired. Please try again below."],
    ["verification", "We couldn't verify you're not a robot. Please try again below."],
    ["ratelimit", "That was a lot of attempts in a short time. Please wait a minute and try again below."],
    ["closed", "Signups are closed right now. Please email info@lawforaisafety.org instead."],
  ])("shows the exact message for the known code %s", (code, message) => {
    const { container } = renderAt(`/?error=${code}`);

    expect(container.querySelector("p")?.textContent).toBe(message);
  });

  it("follows the URL when the page navigates", () => {
    const { container } = renderAt("/");

    act(() => window.history.pushState(null, "", "/?error=ratelimit"));

    expect(container).toHaveTextContent("Please wait a minute and try again below.");
  });
});
