import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { turnstile } from "../../../test/fakes/turnstile";
import RedLinesApplyForm from "../red-lines-dialogue/ApplyForm";
import ApplyForm from "./ApplyForm";
import { FormPreview } from "./form-preview";

const FORMS = [
  ["apply", () => <ApplyForm source="field_building" />],
  ["Red Lines", () => <RedLinesApplyForm />],
] as const;

const submitControls = () => [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')];

describe("forms in the CMS preview", () => {
  it.each(FORMS)("the %s form shows, says it is disabled, and cannot be submitted", (_, form) => {
    render(<FormPreview>{form()}</FormPreview>);
    turnstile.solve();

    expect(screen.getByText("Preview: form disabled")).toBeInTheDocument();
    expect(submitControls().length).toBeGreaterThan(0);
    for (const control of submitControls()) expect(control).toBeDisabled();

    // Even a submit that gets past the disabled buttons (Enter in a field, a script) goes nowhere.
    const formElement = document.querySelector("form")!;
    const event = new Event("submit", { bubbles: true, cancelable: true });
    fireEvent(formElement, event);
    expect(event.defaultPrevented).toBe(true);
    expect(sessionStorage.length).toBe(0);
  });

  it.each(FORMS)("the %s form on a live page has no note and can submit", (_, form) => {
    render(form());

    expect(screen.queryByText("Preview: form disabled")).toBeNull();
    for (const control of submitControls()) expect(control).toBeEnabled();
  });
});
