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

  it.each(["/", "/?error=", "/?error=unknown-code"])(
    "shows nothing at %s",
    (url) => {
      const { container } = renderAt(url);

      expect(container).toBeEmptyDOMElement();
    },
  );

  it("follows the URL when the page navigates", () => {
    const { container } = renderAt("/");

    act(() => window.history.pushState(null, "", "/?error=ratelimit"));

    expect(container).toHaveTextContent("Please wait a minute and try again below.");
  });
});
