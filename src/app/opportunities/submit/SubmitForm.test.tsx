import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { navigation } from "../../../../test/next-navigation";
import SubmitErrorBanner from "./SubmitErrorBanner";
import SubmitForm from "./SubmitForm";
import SubmitToast from "./SubmitToast";

beforeEach(() => {
  window.history.replaceState(null, "", "/opportunities/submit");
  window.sessionStorage.clear();
});

/** Presses a submit button; jsdom doesn't submit forms, so this only runs the form's checks. */
function press(name: string) {
  const button = screen.getByRole("button", { name });
  act(() => {
    button.closest("form")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button }));
  });
}

describe("SubmitForm", () => {
  it("starts on sending a link, with the type optional", () => {
    render(<SubmitForm />);
    expect(screen.getByRole("radio", { name: "Send a link" })).toBeChecked();
    expect(screen.getByLabelText(/Link to the opportunity/)).toHaveAttribute("name", "sourceUrl");
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("shows the listing fields, worded for the chosen type", async () => {
    render(<SubmitForm />);
    await userEvent.click(screen.getByText("Fill in the details"));
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Apply by")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Event"));
    expect(screen.getByLabelText("Link to register")).toBeInTheDocument();
    expect(screen.getByLabelText("Register by")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
  });

  it("asks for the link before sending", async () => {
    render(<SubmitForm />);
    await act(async () => {}); // let the form's timestamp arrive
    press("Sign in with LinkedIn & submit");
    expect(screen.getByText("Paste the link to the opportunity.")).toBeInTheDocument();
  });

  it("asks for the type, then the required details, then an event's date", async () => {
    render(<SubmitForm />);
    await userEvent.click(screen.getByText("Fill in the details"));

    press("Sign in with LinkedIn & submit");
    expect(screen.getByText("Choose what kind of opportunity this is.")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Event"));
    press("Sign in with LinkedIn & submit");
    expect(screen.getByText("Fill in the title, organisation, link and description.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Title"), "AI Law Summit");
    await userEvent.type(screen.getByLabelText("Organisation"), "Example Org");
    await userEvent.type(screen.getByLabelText("Link to register"), "https://example.org");
    await userEvent.type(screen.getByLabelText(/Description/), "Talks.");
    press("Sign in with LinkedIn & submit");
    expect(screen.getByText("Give the event's date.")).toBeInTheDocument();
  });

  it("asks for a name and email on the email path", async () => {
    render(<SubmitForm />);
    await userEvent.type(screen.getByLabelText(/Link to the opportunity/), "https://example.org/post");
    await userEvent.click(screen.getByRole("tab", { name: "Name & email" }));
    press("Send opportunity");
    expect(screen.getByText("Name and email are required.")).toBeInTheDocument();
  });
});

describe("SubmitErrorBanner", () => {
  it("explains a known error code", () => {
    window.history.replaceState(null, "", "/opportunities/submit?error=eventdate");
    render(<SubmitErrorBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("An event needs its date.");
  });

  it.each(["", "unknown", "toString", "__proto__"])("shows nothing for the code %j", (code) => {
    window.history.replaceState(null, "", `/opportunities/submit?error=${code}`);
    const { container } = render(<SubmitErrorBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SubmitToast", () => {
  it("thanks the submitter, then clears the query string", () => {
    window.history.replaceState(null, "", "/opportunities/submit?submitted=1");
    render(<SubmitToast />);
    expect(screen.getByRole("status")).toHaveTextContent("Thanks, we've got it.");
    expect(navigation.replace).toHaveBeenCalledWith("/opportunities/submit", { scroll: false });
  });

  it("asks an email-path submitter to check their inbox", () => {
    window.history.replaceState(null, "", "/opportunities/submit?submitted=confirm");
    render(<SubmitToast />);
    expect(screen.getByRole("status")).toHaveTextContent("Check your email");
  });

  it("shows nothing on a plain visit", () => {
    const { container } = render(<SubmitToast />);
    expect(container).toBeEmptyDOMElement();
  });
});
