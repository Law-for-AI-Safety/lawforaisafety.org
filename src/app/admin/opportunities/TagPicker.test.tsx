import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TagPicker from "./TagPicker";

describe("TagPicker", () => {
  it("adds an existing suggestion on click, as a removable chip", async () => {
    const onChange = vi.fn();
    render(<TagPicker value={[]} onChange={onChange} suggestions={["Compliance", "AI governance"]} />);

    await userEvent.type(screen.getByRole("combobox"), "Compl");
    await userEvent.click(screen.getByRole("option", { name: "Compliance" }));

    expect(onChange).toHaveBeenCalledWith(["Compliance"]);
  });

  it("offers to add a non-matching query as a new tag, and picks it via keyboard", async () => {
    const onChange = vi.fn();
    render(<TagPicker value={[]} onChange={onChange} suggestions={["Compliance"]} />);

    const input = screen.getByRole("combobox");
    await userEvent.type(input, "Robotics");
    expect(screen.getByRole("option", { name: /Add .Robotics. as a new tag/ })).toBeInTheDocument();

    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(["Robotics"]);
  });

  it("does not offer to add a tag that already matches a suggestion", async () => {
    const onChange = vi.fn();
    render(<TagPicker value={[]} onChange={onChange} suggestions={["Compliance"]} />);

    await userEvent.type(screen.getByRole("combobox"), "Compliance");
    expect(screen.queryByText(/as a new tag/)).not.toBeInTheDocument();
  });

  it("removes a chosen tag", async () => {
    const onChange = vi.fn();
    render(<TagPicker value={["Compliance"]} onChange={onChange} suggestions={["Compliance"]} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove Compliance" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("cycles the active option with the arrow keys", async () => {
    const onChange = vi.fn();
    render(<TagPicker value={[]} onChange={onChange} suggestions={["Alpha", "Beta"]} />);

    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith(["Beta"]);
  });
});
