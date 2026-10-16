import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import RichTextField from "./RichTextField";

/** The Tiptap editor behind the field, which Tiptap attaches to its element. */
function editorOf(): Editor {
  return (screen.getByRole("textbox") as HTMLElement & { editor: Editor }).editor;
}

async function renderField(value: string, kind: "inline" | "blocks" = "blocks") {
  const onChange = vi.fn();
  const view = render(<RichTextField label="Text" value={value} kind={kind} onChange={onChange} />);
  await screen.findByRole("toolbar");
  return { onChange, view };
}

describe("RichTextField", () => {
  it("shows the text with its formatting, labelled, under a toolbar", async () => {
    await renderField("Some **bold** and ==wavy==.");
    const box = screen.getByRole("textbox", { name: "Text" });
    expect(box.querySelector("strong")).toHaveTextContent("bold");
    expect(box.querySelector("[data-wavy]")).toHaveTextContent("wavy");
    expect(screen.getByRole("button", { name: "Bullet list" })).toBeInTheDocument();
  });

  it("has no bullet list button in a single-paragraph field", async () => {
    await renderField("One line.", "inline");
    expect(screen.queryByRole("button", { name: "Bullet list" })).toBeNull();
  });

  it("formats the selection and reports the new content-file string", async () => {
    const { onChange } = await renderField("word");
    act(() => {
      editorOf().commands.selectAll();
    });
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onChange).toHaveBeenLastCalledWith("**word**");
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    fireEvent.click(screen.getByRole("button", { name: "Wavy underline" }));
    expect(onChange).toHaveBeenLastCalledWith("==***word***==");
    fireEvent.click(screen.getByRole("button", { name: "Bullet list" }));
    expect(onChange).toHaveBeenLastCalledWith("- ==***word***==");
  });

  it("asks for a selection before linking", async () => {
    await renderField("word");
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(screen.getByRole("status")).toHaveTextContent("Select the words to link first.");
    expect(screen.queryByRole("button", { name: "Apply link" })).toBeNull();
  });

  it("links the selection, upgrading http:, and refuses a link that is not allowed", async () => {
    const { onChange } = await renderField("word");
    act(() => {
      editorOf().commands.selectAll();
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    const input = screen.getByLabelText(/Link to a web address/);
    fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply link" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Only https:, mailto: and site links");

    fireEvent.change(input, { target: { value: " http://example.org/a b " } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("[word](https://example.org/a%20b)");

    act(() => {
      editorOf().commands.selectAll();
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(screen.getByLabelText(/Link to a web address/)).toHaveValue("https://example.org/a%20b");
    fireEvent.keyDown(screen.getByLabelText(/Link to a web address/), { key: "Escape" });
    expect(screen.queryByLabelText(/Link to a web address/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));
    expect(onChange).toHaveBeenLastCalledWith("word");
  });

  it("closes the link form on Cancel, and ignores other keys", async () => {
    await renderField("word");
    act(() => {
      editorOf().commands.selectAll();
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.keyDown(screen.getByLabelText(/Link to a web address/), { key: "a" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText(/Link to a web address/)).toBeNull();
  });

  it("replaces its content when the value changes from outside", async () => {
    const { onChange, view } = await renderField("first");
    view.rerender(<RichTextField label="Text" value="*second*" kind="blocks" onChange={onChange} />);
    expect(screen.getByRole("textbox").querySelector("em")).toHaveTextContent("second");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not report a change that leaves the string as it was", async () => {
    const { onChange } = await renderField("word");
    act(() => {
      editorOf().commands.insertContentAt(1, "  ");
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks the field invalid", async () => {
    render(<RichTextField label="Text" value="" kind="inline" onChange={() => {}} invalid />);
    await screen.findByRole("toolbar");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows text it cannot read as raw text with the reason, for correcting", async () => {
    const onChange = vi.fn();
    const view = render(<RichTextField label="Text" value="See [x](javascript:alert)" kind="blocks" onChange={onChange} />);
    const raw = screen.getByRole("textbox", { name: "Text" });
    expect(raw.tagName).toBe("TEXTAREA");
    expect(raw).toHaveValue("See [x](javascript:alert)");
    expect(raw).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Only https:, mailto: and site links");
    expect(screen.queryByRole("toolbar")).toBeNull();

    fireEvent.change(raw, { target: { value: "See [x](/field-building)" } });
    expect(onChange).toHaveBeenLastCalledWith("See [x](/field-building)");

    view.rerender(<RichTextField label="Text" value="See [x](/field-building)" kind="blocks" onChange={onChange} />);
    await screen.findByRole("toolbar");
    expect(screen.getByRole("textbox", { name: "Text" }).querySelector("a")).toHaveTextContent("x");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("switches to raw text, without changing it, when an unreadable value arrives from outside", async () => {
    const { onChange, view } = await renderField("first");
    view.rerender(<RichTextField label="Text" value="<b>moved in</b>" kind="blocks" onChange={onChange} />);
    expect(screen.getByRole("textbox", { name: "Text" })).toHaveValue("<b>moved in</b>");
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
