import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NewOpportunityForm from "./NewOpportunityForm";

describe("NewOpportunityForm", () => {
  it("shows the url-import box and the manual form, submit disabled until required fields are filled", () => {
    render(<NewOpportunityForm />);
    expect(screen.getByLabelText("Listing URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();

    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Organisation")).toBeInTheDocument();
    expect(screen.getByLabelText("Apply URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create opportunity" })).toBeDisabled();
  });
});
