import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { turnstile } from "../../../test/fakes/turnstile";
import RedLinesApplyForm from "../red-lines-dialogue/ApplyForm";
import ApplyForm from "./ApplyForm";

/**
 * The application forms post natively, and a refusal redirects back with `?error=<code>`.
 * These tests fill a form, submit it (jsdom does not navigate), then render the page again at
 * the URL the server would send the visitor to.
 */
const HUMAN_FILL_MS = 5000;

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  // jsdom reports that it cannot navigate for a form post; the post itself is not under test.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  sessionStorage.clear();
});

async function fillAndSubmitApply(user: ReturnType<typeof userEvent.setup>) {
  window.history.replaceState(null, "", "/field-building");
  render(<ApplyForm source="field_building" />);
  turnstile.solve();
  await user.type(screen.getByLabelText("LinkedIn profile URL"), "https://www.linkedin.com/in/ada/");
  await user.type(screen.getByLabelText("Comments"), "Keen to help.");
  await user.click(screen.getByLabelText("Also subscribe me to the newsletter"));
  await user.click(screen.getByRole("tab", { name: "Name & email" }));
  await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Email address"), "ada@example.com");
  vi.setSystemTime(Date.now() + HUMAN_FILL_MS);
  await user.click(screen.getByRole("button", { name: "Submit application" }));
  expect(screen.getByRole("button", { name: "Sending…" })).toBeInTheDocument();
  cleanup();
}

function reopenAt(url: string, form = <ApplyForm source="field_building" />) {
  window.history.replaceState(null, "", url);
  return render(form);
}

describe("the apply form after a refused submission", () => {
  it("gives back what the visitor typed, on the tabs they used", async () => {
    await fillAndSubmitApply(userEvent.setup());

    reopenAt("/field-building?error=closed#contact");

    expect(screen.getByLabelText("LinkedIn profile URL")).toHaveValue("https://www.linkedin.com/in/ada/");
    expect(screen.getByLabelText("Comments")).toHaveValue("Keen to help.");
    expect(screen.getByRole("tab", { name: "Name & email" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Email address")).toHaveValue("ada@example.com");
  });

  it("does not tick the newsletter consent again", async () => {
    await fillAndSubmitApply(userEvent.setup());

    reopenAt("/field-building?error=closed#contact");

    expect(screen.getByLabelText("Also subscribe me to the newsletter")).not.toBeChecked();
  });

  it("keeps only what the visitor typed: no hidden fields, tokens or consent", async () => {
    await fillAndSubmitApply(userEvent.setup());

    const stored = JSON.parse(sessionStorage.getItem("kept-form-input:apply:field_building")!);
    expect(stored).toEqual({
      values: {
        audience: "individual",
        linkedinUrl: "https://www.linkedin.com/in/ada/",
        comments: "Keen to help.",
        name: "Ada Lovelace",
        email: "ada@example.com",
      },
      checked: [],
    });
  });

  it("is cleared once an application succeeds", async () => {
    await fillAndSubmitApply(userEvent.setup());

    reopenAt("/field-building?applied=1#contact");

    expect(screen.getByLabelText("LinkedIn profile URL")).toHaveValue("");
    expect(sessionStorage.getItem("kept-form-input:apply:field_building")).toBeNull();
    cleanup();
    reopenAt("/field-building?error=closed#contact");
    expect(screen.getByLabelText("LinkedIn profile URL")).toHaveValue("");
  });

  it("reopens on the statement tab when that is what was typed", () => {
    sessionStorage.setItem(
      "kept-form-input:apply:field_building",
      JSON.stringify({ values: { positionStatement: "We fund lawyers.", audience: "organisation", organisation: "Acme" }, checked: [] }),
    );

    reopenAt("/field-building?error=sendfailed#contact");

    expect(screen.getByRole("radio", { name: /organisation/i })).toBeChecked();
    expect(screen.getByRole("tab", { name: "Tell us more" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("textbox").map((t) => (t as HTMLInputElement).value)).toEqual(
      expect.arrayContaining(["We fund lawyers.", "Acme"]),
    );
  });

  it("ignores stored entries that cannot be read", () => {
    sessionStorage.setItem("kept-form-input:apply:field_building", "{not json");
    reopenAt("/field-building?error=closed");
    expect(screen.getByLabelText("LinkedIn profile URL")).toHaveValue("");
    cleanup();

    sessionStorage.setItem("kept-form-input:apply:field_building", JSON.stringify({ values: { linkedinUrl: 5, comments: "ok" }, checked: "x" }));
    reopenAt("/field-building?error=closed");
    expect(screen.getByLabelText("LinkedIn profile URL")).toHaveValue("");
    expect(screen.getByLabelText("Comments")).toHaveValue("ok");
    cleanup();

    sessionStorage.setItem("kept-form-input:apply:field_building", JSON.stringify({}));
    reopenAt("/field-building?error=closed");
    expect(screen.getByLabelText("Comments")).toHaveValue("");
  });

  it("still submits, and still opens, when storage is unavailable", async () => {
    const fail = () => {
      throw new Error("storage disabled");
    };
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(fail);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(fail);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(fail);

    await fillAndSubmitApply(userEvent.setup());
    reopenAt("/field-building?error=closed#contact");
    expect(screen.getByLabelText("LinkedIn profile URL")).toHaveValue("");
    cleanup();
    reopenAt("/field-building");
    expect(screen.getByLabelText("LinkedIn profile URL")).toHaveValue("");
  });

  it("hydrates the prerendered form without a mismatch, then fills it in", async () => {
    sessionStorage.setItem("kept-form-input:apply:field_building", JSON.stringify({ values: { comments: "Kept." }, checked: [] }));
    window.history.replaceState(null, "", "/field-building?error=closed");
    const container = document.createElement("div");
    container.innerHTML = renderToString(<ApplyForm source="field_building" />);
    document.body.append(container);
    expect(container.querySelector("textarea[name=comments]")).toHaveValue("");

    const onRecoverableError = vi.fn();
    const root = await act(async () => hydrateRoot(container, <ApplyForm source="field_building" />, { onRecoverableError }));

    expect(container.querySelector("textarea[name=comments]")).toHaveValue("Kept.");
    expect(onRecoverableError).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});

describe("the Red Lines form after a refused submission", () => {
  it("gives back the text, the choices and the meetings, and keeps nothing else", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/red-lines-dialogue");
    render(<RedLinesApplyForm />);
    turnstile.solve();
    await user.click(screen.getByText("Technical"));
    await user.type(screen.getByLabelText(/Motivation/), "Because.");
    await user.type(screen.getByLabelText(/Available hours/), "20");
    await user.click(screen.getByLabelText(/9 November 2026/));
    await user.click(screen.getByText("Possibly"));
    await user.type(screen.getByLabelText(/Affiliation/), "Uni");
    vi.setSystemTime(Date.now() + HUMAN_FILL_MS);
    await user.click(screen.getByRole("button", { name: "Sign in with LinkedIn & submit" }));
    cleanup();

    reopenAt("/red-lines-dialogue?error=closed#apply", <RedLinesApplyForm />);

    expect(screen.getByRole("radio", { name: "Technical" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Possibly" })).toBeChecked();
    expect(screen.getByLabelText(/Motivation/)).toHaveValue("Because.");
    expect(screen.getByLabelText(/Available hours/)).toHaveValue(20);
    expect(screen.getByLabelText(/Affiliation/)).toHaveValue("Uni");
    expect(screen.getByLabelText(/9 November 2026/)).toBeChecked();
    expect(screen.getByLabelText(/12 October 2026/)).not.toBeChecked();
    expect(screen.getByRole("tab", { name: "LinkedIn" })).toHaveAttribute("aria-selected", "true");
    expect(Object.keys(JSON.parse(sessionStorage.getItem("kept-form-input:red-lines")!).values).sort()).toEqual([
      "affiliation",
      "areaOfExpertise",
      "availableHours",
      "euParliamentInterest",
      "motivation",
    ]);
  });

  it("ignores a kept choice that is not one of the options", () => {
    sessionStorage.setItem("kept-form-input:red-lines", JSON.stringify({ values: { areaOfExpertise: "magic", euParliamentInterest: "no" }, checked: [] }));
    reopenAt("/red-lines-dialogue?error=closed#apply", <RedLinesApplyForm />);
    expect(screen.getByRole("radio", { name: "Technical" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "No" })).toBeChecked();
  });
});
