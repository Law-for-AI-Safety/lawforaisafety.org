import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { FORM_RENDERED_AT_FIELD_NAME } from "@/lib/abuse-protection";
import RedLinesApplyForm from "../red-lines-dialogue/ApplyForm";
import ApplyForm from "./ApplyForm";
import NewsletterForm from "./NewsletterForm";
import RenderedAtField, { useRenderedAt } from "./RenderedAtField";

const BUILT = new Date("2026-10-01T09:00:00Z").getTime();
const OPENED = new Date("2026-10-15T12:00:00Z").getTime();

function TestForm({ onSubmit }: { onSubmit: (data: FormData) => void }) {
  const renderedAt = useRenderedAt();
  return (
    <form
      aria-label="test"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      <RenderedAtField value={renderedAt} />
      <button type="submit" disabled={!renderedAt}>
        Send
      </button>
    </form>
  );
}

const FORMS = [
  ["newsletter", () => <NewsletterForm />],
  ["apply", () => <ApplyForm />],
  ["Red Lines Dialogues apply", () => <RedLinesApplyForm />],
] as const;

/** The form's submit controls, as a browser would use them to post it. */
function submitControls(root: ParentNode) {
  return [...root.querySelectorAll<HTMLButtonElement>('button[type="submit"]')];
}

function renderedAtOf(form: HTMLFormElement) {
  return new FormData(form).get(FORM_RENDERED_AT_FIELD_NAME);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: OPENED });
});

describe("RenderedAtField", () => {
  it("leaves the time out of the prerendered HTML", () => {
    vi.setSystemTime(BUILT);

    const html = renderToString(<TestForm onSubmit={() => {}} />);

    expect(html).toContain(`name="${FORM_RENDERED_AT_FIELD_NAME}" value=""`);
    expect(html).not.toContain(String(BUILT));
  });

  it("fills in the time the browser opened the page once the prerendered form hydrates", async () => {
    vi.setSystemTime(BUILT);
    const container = document.createElement("div");
    container.innerHTML = renderToString(<TestForm onSubmit={() => {}} />);
    document.body.append(container);
    const form = container.querySelector("form")!;
    expect(renderedAtOf(form)).toBe("");

    vi.setSystemTime(OPENED);
    const onRecoverableError = vi.fn();
    const root = await act(async () =>
      hydrateRoot(container, <TestForm onSubmit={() => {}} />, { onRecoverableError }),
    );

    expect(renderedAtOf(form)).toBe(String(OPENED));
    expect(onRecoverableError).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it("sends the time the form mounted with the submission", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);

    vi.setSystemTime(OPENED + 30_000);
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0].get(FORM_RENDERED_AT_FIELD_NAME)).toBe(String(OPENED));
  });

  it.each(FORMS)("is part of the %s form", (_, form) => {
    const { container } = render(form());

    const forms = container.querySelectorAll("form");
    expect(forms.length).toBeGreaterThan(0);
    for (const element of forms) {
      expect(renderedAtOf(element)).toBe(String(OPENED));
    }
  });
});

// Turnstile can hand out its token before React hydrates; a post then would carry no time
// and be dropped as a bot, so the controls wait for it.
describe("submit controls", () => {
  it.each(FORMS)("are disabled in the prerendered %s form", (_, form) => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(form());

    const controls = submitControls(container);
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) expect(control).toBeDisabled();
    expect(renderedAtOf(container.querySelector("form")!)).toBe("");
  });

  it.each(FORMS)("are enabled once the %s form has hydrated", async (_, form) => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(form());
    document.body.append(container);
    const onRecoverableError = vi.fn();

    const root = await act(async () => hydrateRoot(container, form(), { onRecoverableError }));

    const controls = submitControls(container);
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) expect(control).toBeEnabled();
    expect(renderedAtOf(container.querySelector("form")!)).toBe(String(OPENED));
    expect(onRecoverableError).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
