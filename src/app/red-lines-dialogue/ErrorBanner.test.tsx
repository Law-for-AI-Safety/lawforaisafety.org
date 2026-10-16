import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RedLinesErrorBanner from "./ErrorBanner";

function renderAt(url: string) {
  window.history.replaceState(null, "", url);
  return render(<RedLinesErrorBanner />);
}

describe("RedLinesErrorBanner", () => {
  it("explains closed applications", () => {
    renderAt("/red-lines-dialogue?error=closed#apply");

    expect(
      screen.getByText("Applications aren't open right now. Please email redlines@lawforaisafety.org instead."),
    ).toBeVisible();
  });

  it.each([
    ["validation", "Motivation and affiliation are required."],
    ["toolong", "One of your answers is too long. Please shorten it and try again below."],
    ["hours", "Enter your available hours as a number."],
    ["linkedin", "That doesn't look like a LinkedIn profile URL. It should start with https://www.linkedin.com/in/"],
    ["name", "Please enter your name without special characters like < or >."],
    ["email", "That email address doesn't look right. Please check it and try again below."],
    ["sendfailed", "We couldn't send your confirmation email. Please try again below in a few minutes."],
    ["invalid", "That verification link isn't valid. Please try again below."],
    ["expired", "That verification attempt expired. Please try again below."],
    ["verification", "We couldn't verify you're not a robot. Please try again below."],
    ["ratelimit", "That was a lot of attempts in a short time. Please wait a minute and try again below."],
    ["closed", "Applications aren't open right now. Please email redlines@lawforaisafety.org instead."],
  ])("shows the exact message for the known code %s", (code, message) => {
    const { container } = renderAt(`/red-lines-dialogue?error=${code}`);

    expect(container.querySelector("p")?.textContent).toBe(message);
  });

  it.each(["", "unknown-code", "toString", "__proto__", "constructor", "valueOf"])(
    "shows nothing for the code %j",
    (code) => {
      const { container } = renderAt(`/red-lines-dialogue?error=${code}`);

      expect(container).toBeEmptyDOMElement();
    },
  );
});
