import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SwitchProblem from "./SwitchProblem";

describe("the message after a refused switch to Google", () => {
  it.each([
    ["workspace", undefined, "That Google account isn't a Law for AI Safety account."],
    ["not_listed", undefined, "Your Law for AI Safety Google account isn't on the admin list yet."],
    ["less_access", "technical", "lose you access to the technical admin pages, because"],
    ["less_access", "projects,opportunities", "lose you access to Projects and Opportunities, because"],
    ["less_access", "technical,projects,opportunities", "the technical admin pages, Projects and Opportunities"],
    ["less_access", "toString,__proto__", "lose you access to parts of the admin area, because"],
  ])("explains %s (%s)", (code, lost, text) => {
    render(<SwitchProblem code={code} lost={lost} />);
    expect(screen.getByRole("alert")).toHaveTextContent(text);
  });

  it("says the admin is still signed in, and what to do", () => {
    render(<SwitchProblem code="not_listed" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ask a technical admin to add it, then switch again. You're still signed in with LinkedIn.",
    );
  });

  it.each([undefined, "", "unknown", "toString"])("shows nothing for %j", (code) => {
    const { container } = render(<SwitchProblem code={code} />);
    expect(container).toBeEmptyDOMElement();
  });
});
