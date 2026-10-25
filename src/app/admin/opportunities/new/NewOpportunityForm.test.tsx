import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import NewOpportunityForm from "./NewOpportunityForm";

describe("NewOpportunityForm", () => {
  it("shows the manual form, submit disabled until required fields are filled", () => {
    render(<NewOpportunityForm />);
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Organisation")).toBeInTheDocument();
    expect(screen.getByLabelText("Apply URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create opportunity" })).toBeDisabled();
  });

  it("labels the dates and button for the chosen type", async () => {
    render(<NewOpportunityForm />);
    expect(screen.getByLabelText("Apply by")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Type"), "event");
    expect(screen.getByLabelText("Register by")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByLabelText("Until")).toBeInTheDocument();
    expect(screen.getByLabelText("Apply label")).toHaveAttribute("placeholder", "Register");
  });
});
