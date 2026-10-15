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

  it.each(["validation", "toolong", "hours", "linkedin", "name", "email", "sendfailed", "invalid", "expired", "verification", "ratelimit", "closed"])(
    "shows a message for the known code %s",
    (code) => {
      const { container } = renderAt(`/red-lines-dialogue?error=${code}`);

      expect(container.querySelector("p")?.textContent).toMatch(/\w/);
    },
  );

  it.each(["", "unknown-code", "toString", "__proto__", "constructor", "valueOf"])(
    "shows nothing for the code %j",
    (code) => {
      const { container } = renderAt(`/red-lines-dialogue?error=${code}`);

      expect(container).toBeEmptyDOMElement();
    },
  );
});
