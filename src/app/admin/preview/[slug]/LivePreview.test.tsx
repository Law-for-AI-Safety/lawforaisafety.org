import fs from "node:fs";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewBlocks } from "@/cms/preview";
import { parsePage } from "@/cms/schema";
import LivePreview from "./LivePreview";

const SLUG = "field-building";
const file = JSON.parse(fs.readFileSync(`content/${SLUG}.json`, "utf8"));
const live = parsePage(SLUG, file).blocks;
const withHero = (hero: object) => ({ ...file, blocks: [{ ...file.blocks[0], ...hero }, ...file.blocks.slice(1)] });
const withHeading = (heading: string) => withHero({ heading });
const shown = (content: unknown) => previewBlocks(content, [], live);

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

const draft = (content: unknown, showChanges = false) => ({ type: "cms-preview-draft", slug: SLUG, content, showChanges });
const heading = () => screen.getByRole("heading", { level: 1 });
const block = (i: number) => document.querySelector<HTMLElement>(`[data-block="${i}"]`)!;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("opened in its own tab", () => {
  it("shows the saved content and asks nothing of any editor", () => {
    render(<LivePreview slug={SLUG} initial={shown(file)} live={live} of="the live page" />);
    expect(heading()).toHaveTextContent(file.blocks[0].heading);
    expect(screen.getByRole("note")).toHaveTextContent("Preview of the live page.");
    fireEvent.click(block(1));
    expect(block(1).className).not.toContain("outline-brand-navy");
  });

  it("shows an unfinished block as a gap, saying what needs fixing", () => {
    render(<LivePreview slug={SLUG} initial={shown(withHeading(""))} live={live} of="the draft" />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(block(0)).toHaveTextContent("Block 1 (Page heading) is not finished, so it is not shown yet.");
    expect(block(0)).toHaveTextContent("Heading: Required");
    expect(screen.getByRole("note")).toHaveTextContent("Blocks that are not finished are outlined in red.");
  });

  it("links back to the editor when no block is finished", () => {
    render(<LivePreview slug={SLUG} initial={shown({ ...file, blocks: [] })} live={live} of="the draft" />);
    expect(screen.getByRole("heading", { name: "This draft is not finished" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the editor" })).toHaveAttribute("href", `/admin/cms/${SLUG}`);
  });
});

describe("framed by the editor", () => {
  it("tells the editor it is ready, then follows the draft it is sent", () => {
    const editor = framed();
    render(<LivePreview slug={SLUG} initial={shown(file)} live={live} of="the live page" />);
    expect(editor.postMessage).toHaveBeenCalledWith({ type: "cms-preview-ready", slug: SLUG }, window.location.origin);

    fromEditor(editor, draft(withHeading("Typed, not saved")));
    expect(heading()).toHaveTextContent("Typed, not saved");
    expect(screen.getByRole("note")).toHaveTextContent("Preview of the draft.");
  });

  it("holds back only the unfinished block, keeping its last finished version, outlined and explained", () => {
    const editor = framed();
    render(<LivePreview slug={SLUG} initial={shown(file)} live={live} of="the draft" />);
    fromEditor(editor, draft(withHeading("Kept")));
    const quote = { ...file.blocks[1], quote: "A new quote." };
    fromEditor(editor, draft({ ...withHeading(""), blocks: [{ ...file.blocks[0], heading: "" }, quote, ...file.blocks.slice(2)] }));

    expect(heading()).toHaveTextContent("Kept");
    expect(block(0).className).toContain("outline-brand-red");
    expect(within(block(0)).getByText("Not finished: showing its last finished version.")).toBeInTheDocument();
    expect(block(0)).toHaveTextContent("Heading: Required");
    expect(block(1).querySelector("blockquote")).toHaveTextContent("A new quote.");
    expect(screen.getByRole("note")).toHaveTextContent("Blocks that are not finished are outlined in red.");

    fromEditor(editor, draft(withHeading("Fixed")));
    expect(heading()).toHaveTextContent("Fixed");
    expect(block(0).className).not.toContain("outline-brand-red");
    expect(screen.getByRole("note")).toHaveTextContent("Preview of the draft.");
  });

  it("shows a gap for an unfinished block after the finished ones", () => {
    const editor = framed();
    render(<LivePreview slug={SLUG} initial={shown(file)} live={live} of="the draft" />);
    fromEditor(editor, draft({ ...file, blocks: [...file.blocks, { type: "hero", heading: "", lede: "" }] }));
    expect(block(file.blocks.length)).toHaveTextContent(`Block ${file.blocks.length + 1} (Page heading) is not finished`);
  });

  it("marks the blocks that differ from the live page, when the editor asks", () => {
    const editor = framed();
    render(<LivePreview slug={SLUG} initial={shown(file)} live={live} of="the draft" />);
    fromEditor(editor, draft(withHeading("Changed heading")));
    expect(screen.queryByText("Changed")).toBeNull();
    fromEditor(editor, draft(withHeading("Changed heading"), true));
    expect(within(block(0)).getByText("Changed")).toBeInTheDocument();
    expect(within(block(1)).queryByText("Changed")).toBeNull();
  });

  it("starts from an unfinished draft without a link back, and renders once it is finished", () => {
    const editor = framed();
    render(<LivePreview slug={SLUG} initial={shown({ ...file, blocks: [] })} live={live} of="the draft" />);
    expect(screen.queryByRole("link", { name: "Back to the editor" })).toBeNull();
    fromEditor(editor, draft(file));
    expect(heading()).toHaveTextContent(file.blocks[0].heading);
  });

  it("scrolls to and outlines the block being edited", () => {
    const editor = framed();
    render(<LivePreview slug={SLUG} initial={shown(file)} live={live} of="the draft" />);
    fromEditor(editor, { type: "cms-preview-show", slug: SLUG, index: 2 });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts[0]).toBe(block(2));
    expect(block(2).className).toContain("outline-brand-navy");
  });

  it("tells the editor which block was clicked", () => {
    const editor = framed();
    render(<LivePreview slug={SLUG} initial={shown(withHeading(""))} live={live} of="the draft" />);
    fireEvent.click(block(1).querySelector("blockquote")!);
    expect(editor.postMessage).toHaveBeenLastCalledWith({ type: "cms-preview-select", slug: SLUG, index: 1 }, window.location.origin);
    expect(block(1).className).toContain("outline-brand-navy");
    fireEvent.click(block(0));
    expect(editor.postMessage).toHaveBeenLastCalledWith({ type: "cms-preview-select", slug: SLUG, index: 0 }, window.location.origin);
  });

  it("ignores messages from another origin, another window, for another page, or not as expected", () => {
    const editor = framed();
    render(<LivePreview slug={SLUG} initial={shown(file)} live={live} of="the draft" />);
    fromEditor(editor, draft(withHeading("Elsewhere")), "https://evil.example");
    fromEditor({}, draft(withHeading("Other window")));
    fromEditor(editor, { ...draft(withHeading("Other page")), slug: "about" });
    fromEditor(editor, { type: "something-else", slug: SLUG, content: withHeading("Other type") });
    fromEditor(editor, { type: "cms-preview-draft", slug: SLUG, content: withHeading("No setting") });
    fromEditor(editor, { type: "cms-preview-show", slug: SLUG, index: "2" });
    fromEditor(editor, "not an object");
    expect(heading()).toHaveTextContent(file.blocks[0].heading);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("opens the page's links in a new tab, except links within the page", () => {
    framed();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<LivePreview slug={SLUG} initial={shown(file)} live={live} of="the draft" />);
    const links = [...document.querySelectorAll<HTMLAnchorElement>("main a[href]")];
    const away = links.find((a) => !a.getAttribute("href")!.startsWith("#"))!;
    expect(fireEvent.click(away)).toBe(false);
    expect(open).toHaveBeenCalledWith(away.getAttribute("href"), "_blank", "noopener");

    const inPage = document.createElement("a");
    inPage.href = "#apply";
    heading().append(inPage);
    open.mockClear();
    fireEvent.click(inPage);
    expect(open).not.toHaveBeenCalled();
  });
});
