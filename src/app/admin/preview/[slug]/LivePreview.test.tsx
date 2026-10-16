import fs from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parsePage } from "@/cms/schema";
import LivePreview from "./LivePreview";

const SLUG = "field-building";
const file = JSON.parse(fs.readFileSync(`content/${SLUG}.json`, "utf8"));
const withHeading = (heading: string) => ({ ...file, blocks: [{ ...file.blocks[0], heading }, ...file.blocks.slice(1)] });

/** Frames the preview: `window.parent` becomes a fake editor window that records what it is sent. */
function framed() {
  const editor = { postMessage: vi.fn() };
  vi.spyOn(window, "parent", "get").mockReturnValue(editor as unknown as Window);
  return editor;
}

function fromEditor(source: unknown, data: unknown, origin = window.location.origin) {
  const event = new MessageEvent("message", { data, origin });
  Object.defineProperty(event, "source", { value: source });
  act(() => {
    window.dispatchEvent(event);
  });
}

const heading = () => screen.getByRole("heading", { level: 1 });

describe("opened in its own tab", () => {
  it("shows the saved content and asks nothing of any editor", () => {
    render(<LivePreview slug={SLUG} initial={parsePage(SLUG, file)} of="the live page" />);
    expect(heading()).toHaveTextContent(file.blocks[0].heading);
    expect(screen.getByRole("note")).toHaveTextContent("Preview of the live page.");
  });

  it("links back to the editor when the saved draft is not finished", () => {
    render(<LivePreview slug={SLUG} initial={null} of="the draft" />);
    expect(screen.getByRole("heading", { name: "This draft is not finished" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the editor" })).toHaveAttribute("href", `/admin/cms/${SLUG}`);
  });
});

describe("framed by the editor", () => {
  it("tells the editor it is ready, then follows the draft it is sent", () => {
    const editor = framed();
    render(<LivePreview slug={SLUG} initial={parsePage(SLUG, file)} of="the live page" />);
    expect(editor.postMessage).toHaveBeenCalledWith({ type: "cms-preview-ready", slug: SLUG }, window.location.origin);

    fromEditor(editor, { type: "cms-preview-draft", slug: SLUG, content: withHeading("Typed, not saved") });
    expect(heading()).toHaveTextContent("Typed, not saved");
    expect(screen.getByRole("note")).toHaveTextContent("Preview of the draft.");
  });

  it("keeps the last finished version while a field is not valid, and says so", () => {
    const editor = framed();
    render(<LivePreview slug={SLUG} initial={parsePage(SLUG, file)} of="the draft" />);
    fromEditor(editor, { type: "cms-preview-draft", slug: SLUG, content: withHeading("") });
    expect(heading()).toHaveTextContent(file.blocks[0].heading);
    expect(screen.getByRole("note")).toHaveTextContent("Showing the last finished version.");

    fromEditor(editor, { type: "cms-preview-draft", slug: SLUG, content: withHeading("Fixed") });
    expect(heading()).toHaveTextContent("Fixed");
    expect(screen.getByRole("note")).toHaveTextContent("Preview of the draft.");
  });

  it("starts from an unfinished draft without a link back, and renders once it is finished", () => {
    const editor = framed();
    render(<LivePreview slug={SLUG} initial={null} of="the draft" />);
    expect(screen.queryByRole("link", { name: "Back to the editor" })).toBeNull();
    fromEditor(editor, { type: "cms-preview-draft", slug: SLUG, content: file });
    expect(heading()).toHaveTextContent(file.blocks[0].heading);
  });

  it("ignores messages from another origin, another window or for another page", () => {
    const editor = framed();
    render(<LivePreview slug={SLUG} initial={parsePage(SLUG, file)} of="the draft" />);
    fromEditor(editor, { type: "cms-preview-draft", slug: SLUG, content: withHeading("Elsewhere") }, "https://evil.example");
    fromEditor({}, { type: "cms-preview-draft", slug: SLUG, content: withHeading("Other window") });
    fromEditor(editor, { type: "cms-preview-draft", slug: "about", content: withHeading("Other page") });
    fromEditor(editor, { type: "something-else", slug: SLUG, content: withHeading("Other type") });
    fromEditor(editor, "not an object");
    expect(heading()).toHaveTextContent(file.blocks[0].heading);
  });

  it("opens the page's links in a new tab, except links within the page", () => {
    framed();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<LivePreview slug={SLUG} initial={parsePage(SLUG, file)} of="the draft" />);
    const links = [...document.querySelectorAll<HTMLAnchorElement>("main a[href]")];
    const away = links.find((a) => !a.getAttribute("href")!.startsWith("#"))!;
    expect(fireEvent.click(away)).toBe(false);
    expect(open).toHaveBeenCalledWith(away.getAttribute("href"), "_blank", "noopener");

    const within = document.createElement("a");
    within.href = "#apply";
    heading().append(within);
    open.mockClear();
    fireEvent.click(within);
    expect(open).not.toHaveBeenCalled();
  });
});
