import fs from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Problem } from "@/cms/publish-checks";
import type { PublishDraftResult, SaveDraftResult, WithdrawResult } from "../actions";
import PageEditor, { type PageEditorProps } from "./PageEditor";

const file = JSON.parse(fs.readFileSync("content/field-building.json", "utf8"));

/** A fake server for the page's shared draft, refusing a save from a stale version. */
function fakeServer() {
  const server = {
    version: 0,
    saves: [] as { content: unknown; version: number }[],
    problems: [] as Problem[],
    save: vi.fn(async (_slug: string, content: unknown, version: number): Promise<SaveDraftResult> => {
      if (version !== server.version) return { ok: false, reason: "conflict", message: "Someone else changed this page since you opened it." };
      server.saves.push({ content, version });
      server.version++;
      return { ok: true, version: server.version, valid: true, state: "draft", problems: server.problems };
    }),
    discard: vi.fn(async () => ({ ok: true as const })),
    publish: vi.fn(async (): Promise<PublishDraftResult> => ({ ok: false, reason: "unavailable", message: "Publishing is not available yet. Your draft is saved." })),
    withdraw: vi.fn(async (): Promise<WithdrawResult> => ({ ok: true })),
  };
  return server;
}

function renderEditor(server = fakeServer(), props: Partial<PageEditorProps> = {}) {
  render(
    <PageEditor
      slug="field-building"
      initialContent={structuredClone(file)}
      initialVersion={server.version}
      initialState="live"
      initialProblems={[]}
      baseChanged={false}
      canPublish={false}
      publishSetUp={true}
      publishing={{ sent: null, approved: false, note: null }}
      statusChecked={true}
      images={["/images/team-group.webp"]}
      save={server.save}
      discard={server.discard}
      publish={server.publish}
      withdraw={server.withdraw}
      {...props}
    />,
  );
  return server;
}

const title = () => screen.getByLabelText("Page title");

describe("autosave", () => {
  it("saves the draft after a pause and shows the page as a draft", async () => {
    const server = renderEditor();
    fireEvent.change(title(), { target: { value: "New title" } });
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
    await waitFor(() => expect(server.saves).toHaveLength(1), { timeout: 3000 });
    expect(server.saves[0]).toEqual({ content: { ...file, title: "New title" }, version: 0 });
    await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("stops at a conflict, says so, and offers a reload", async () => {
    const server = fakeServer();
    server.version = 4; // Another editor has saved since this copy was loaded at version 3.
    renderEditor(server, { initialVersion: 3 });
    fireEvent.change(title(), { target: { value: "Mine" } });
    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert).toHaveTextContent("Someone else changed this page since you opened it.");
    expect(within(alert).getByRole("button", { name: "Reload" })).toBeInTheDocument();

    fireEvent.change(title(), { target: { value: "Mine again" } });
    expect(title()).toHaveValue("Mine");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(server.save).toHaveBeenCalledTimes(1);
    expect(server.saves).toEqual([]);
  });

  it("keeps the change after a failed save and sends it on Try again", async () => {
    const server = fakeServer();
    const save = server.save;
    server.save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementation(save);
    renderEditor(server);
    fireEvent.change(title(), { target: { value: "Kept" } });
    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert).toHaveTextContent("Could not save");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(server.saves).toHaveLength(1));
    expect(server.saves[0].content).toMatchObject({ title: "Kept" });
  });

  it("asks before leaving with unsaved changes", () => {
    renderEditor();
    fireEvent.change(title(), { target: { value: "x" } });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("text the editor cannot read", () => {
  it("is kept as stored when another field changes", async () => {
    const server = fakeServer();
    const content = structuredClone(file);
    content.blocks[0].lede = "Unsafe [x](javascript:alert)";
    renderEditor(server, { initialContent: content });
    expect(screen.getByDisplayValue("Unsafe [x](javascript:alert)")).toBeInTheDocument();

    fireEvent.change(title(), { target: { value: "New title" } });
    await waitFor(() => expect(server.saves).toHaveLength(1), { timeout: 3000 });
    const saved = server.saves[0].content as typeof file;
    expect(saved.title).toBe("New title");
    expect(saved.blocks[0].lede).toBe("Unsafe [x](javascript:alert)");
  });
});

describe("blocks", () => {
  it("adds only allowed blocks, moves and removes them, but never the page heading", async () => {
    const server = renderEditor();
    const add = screen.getByLabelText("Add a block");
    const offered = within(add).getAllByRole("option").map((o) => o.textContent);
    expect(offered).toEqual(["Choose…", "Quote band", "Text section", "Card list", "Timeline"]);

    fireEvent.change(add, { target: { value: "timeline" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const sections = () => screen.getAllByRole("region").map((s) => s.getAttribute("aria-label"));
    expect(sections().at(-1)).toBe("Block 6: Timeline");

    const first = screen.getByRole("region", { name: "Block 1: Page heading" });
    expect(within(first).queryByRole("button", { name: /Move|Remove/ })).toBeNull();

    fireEvent.click(within(screen.getByRole("region", { name: "Block 3: Card list" })).getByRole("button", { name: "Move up" }));
    expect(sections().slice(1, 3)).toEqual(["Block 2: Card list", "Block 3: Quote band"]);

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove block 6" }));
    expect(sections()).toHaveLength(5);

    await waitFor(() => expect(server.saves.length).toBeGreaterThan(0), { timeout: 3000 });
    const saved = server.saves.at(-1)!.content as { blocks: { type: string }[] };
    expect(saved.blocks.map((b) => b.type)).toEqual(["hero", "cardList", "quoteBand", "cardList", "applicationSection"]);
  });

  it("switches a card list between bullets and numbered sections", () => {
    renderEditor();
    const numbered = screen.getByRole("region", { name: "Block 3: Card list" });
    expect(within(numbered).queryByLabelText("Heading")).toBeNull();
    fireEvent.click(within(numbered).getByLabelText("Heading over bullet points"));
    expect(within(numbered).getByLabelText("Heading")).toHaveValue("");
  });

  it("adds, moves and removes list items", () => {
    renderEditor();
    const cards = screen.getByRole("region", { name: "Block 3: Card list" });
    const titles = () => within(cards).getAllByLabelText("Title").map((i) => (i as HTMLInputElement).value);
    expect(titles()[0]).toBe("Meet-ups");
    fireEvent.click(within(cards).getByRole("button", { name: "Move item 1 down" }));
    expect(titles().slice(0, 2)).toEqual(["Field directory", "Meet-ups"]);
    fireEvent.click(within(cards).getByRole("button", { name: "Remove item 1" }));
    expect(titles()[0]).toBe("Meet-ups");
    fireEvent.click(within(cards).getByRole("button", { name: "Add item" }));
    expect(titles().at(-1)).toBe("");
  });
});

describe("fields", () => {
  it("leaves an emptied optional field and an unpicked image out of the page", async () => {
    const server = renderEditor();
    const image = screen.getByLabelText("Share image (optional)");
    fireEvent.change(image, { target: { value: "/images/team-group.webp" } });
    expect(document.querySelector("img")).toHaveAttribute("src", "/images/team-group.webp");
    fireEvent.change(image, { target: { value: "" } });
    await waitFor(() => expect(server.saves.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(server.saves.at(-1)!.content).not.toHaveProperty("shareImage");
  });

  it("never uses a draft's image value as an image source unless it is a site image path", () => {
    renderEditor(fakeServer(), { initialContent: { ...structuredClone(file), shareImage: "https://evil.example/x.png" } });
    expect(screen.getByLabelText("Share image (optional)")).toHaveValue("https://evil.example/x.png");
    expect(document.querySelector("img")).toBeNull();
  });

  it("switches the application form off", async () => {
    const server = renderEditor();
    fireEvent.click(screen.getByLabelText(/Show the application form/));
    await waitFor(() => expect(server.saves.length).toBeGreaterThan(0), { timeout: 3000 });
    const blocks = (server.saves.at(-1)!.content as { blocks: { showForm?: boolean }[] }).blocks;
    expect(blocks.at(-1)!.showForm).toBe(false);
  });
});

describe("checks and publishing", () => {
  const problems: Problem[] = [
    { path: ["title"], message: "Required" },
    { path: ["blocks", 2, "items", 0, "body"], message: "The link /x does not lead to a page on this site" },
  ];

  it("shows each problem at its field and in the list", () => {
    renderEditor(fakeServer(), { initialProblems: problems });
    expect(title()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Page title:").parentElement).toHaveTextContent("Page title: Required");
    expect(screen.getByText("Block 3 (Card list) › Items › Item 1 › Text:")).toBeInTheDocument();
    expect(screen.getAllByText("The link /x does not lead to a page on this site")).toHaveLength(2);
  });

  it("says when everything passes", () => {
    renderEditor();
    expect(screen.getByText("Everything is filled in and every link works.")).toBeInTheDocument();
  });

  it("hides Publish from someone who may only edit", () => {
    renderEditor();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  });

  it("publishes the saved version after confirming, and reports the result", async () => {
    const server = renderEditor(fakeServer(), { canPublish: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.change(title(), { target: { value: "Ready" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await screen.findByText("Publishing is not available yet. Your draft is saved.");
    expect(server.saves).toHaveLength(1);
    expect(server.publish).toHaveBeenCalledWith("field-building", 1);
  });

  it("shows the problems the server finds at publishing", async () => {
    const server = fakeServer();
    server.publish.mockResolvedValue({ ok: false, reason: "checks", message: "Fix the problems listed before publishing.", problems });
    renderEditor(server, { canPublish: true, initialState: "draft", initialVersion: 0 });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Fix the problems listed before publishing.");
    expect(title()).toHaveAttribute("aria-invalid", "true");
  });

  it("does nothing when publishing is not confirmed, and cannot publish a live page", () => {
    const server = renderEditor(fakeServer(), { canPublish: true, initialState: "draft" });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(server.publish).not.toHaveBeenCalled();
  });

  it("disables Publish while the page is live", () => {
    renderEditor(fakeServer(), { canPublish: true });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("never mentions how publishing works behind the scenes", () => {
    renderEditor(fakeServer(), { canPublish: true, baseChanged: true });
    expect(document.body.textContent).not.toMatch(/github|pull request/i);
  });
});

describe("discarding the draft", () => {
  it("is offered only when there is a draft, and asks first", async () => {
    const server = fakeServer();
    server.version = 2;
    renderEditor(server, { initialVersion: 2, initialState: "draft" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(server.discard).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    server.discard.mockResolvedValueOnce({ ok: false, reason: "conflict", message: "Someone else changed this page." } as never);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Discard draft" })));
    expect(server.discard).toHaveBeenCalledWith("field-building", 2);
    expect(screen.getByRole("alert")).toHaveTextContent("Someone else changed this page.");
  });

  it("is not offered for a page with no draft", () => {
    renderEditor();
    expect(screen.queryByRole("button", { name: "Discard draft" })).toBeNull();
  });
});

it("links to the preview in a new tab", () => {
  renderEditor();
  const link = screen.getByRole("link", { name: "Preview (opens a new tab)" });
  expect(link).toHaveAttribute("href", "/admin/preview/field-building");
  expect(link).toHaveAttribute("target", "_blank");
});

describe("the preview beside the fields", () => {
  const frame = () => screen.getByTitle<HTMLIFrameElement>("Preview of /field-building");
  const ready = { type: "cms-preview-ready", slug: "field-building" };
  const draft = (content: unknown, showChanges = false) => ({ type: "cms-preview-draft", slug: "field-building", content, showChanges });

  function fromFrame(source: unknown, data: unknown, origin = window.location.origin) {
    const event = new MessageEvent("message", { data, origin });
    Object.defineProperty(event, "source", { value: source });
    act(() => {
      window.dispatchEvent(event);
    });
  }

  /** Renders the editor with its preview listening, and returns what the preview is sent. */
  function withPreview(props: Partial<PageEditorProps> = {}) {
    renderEditor(fakeServer(), props);
    const preview = frame().contentWindow!;
    const post = vi.spyOn(preview, "postMessage").mockImplementation(() => {});
    fromFrame(preview, ready);
    return { preview, post };
  }

  beforeEach(() => {
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("frames the preview page, and sends it the draft once it is ready and on every change", () => {
    renderEditor();
    expect(frame()).toHaveAttribute("src", "/admin/preview/field-building");
    const preview = frame().contentWindow!;
    const post = vi.spyOn(preview, "postMessage").mockImplementation(() => {});

    fireEvent.change(title(), { target: { value: "Before it is ready" } });
    expect(post).not.toHaveBeenCalled();

    fromFrame(preview, ready);
    expect(post).toHaveBeenLastCalledWith(draft({ ...file, title: "Before it is ready" }), window.location.origin);

    fireEvent.change(title(), { target: { value: "Typed" } });
    expect(post).toHaveBeenLastCalledWith(draft({ ...file, title: "Typed" }), window.location.origin);

    // A reloaded preview says it is ready again, and is sent the draft again.
    post.mockClear();
    fromFrame(preview, ready);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("listens only to its own frame", () => {
    renderEditor();
    const post = vi.spyOn(frame().contentWindow!, "postMessage").mockImplementation(() => {});
    fromFrame(window, ready);
    fromFrame(frame().contentWindow, ready, "https://evil.example");
    fromFrame(frame().contentWindow, { ...ready, slug: "about" });
    expect(post).not.toHaveBeenCalled();
  });

  it("asks the preview to mark changed blocks when the editor ticks the box", () => {
    const { post } = withPreview();
    fireEvent.click(screen.getByLabelText("Mark changes since the live page"));
    expect(post).toHaveBeenLastCalledWith(draft(file, true), window.location.origin);
  });

  it("scrolls the preview to the block whose fields are being edited", () => {
    const { post } = withPreview();
    const quote = screen.getByRole("region", { name: "Block 2: Quote band" });
    fireEvent.focus(within(quote).getAllByRole("textbox")[0]);
    expect(post).toHaveBeenLastCalledWith({ type: "cms-preview-show", slug: "field-building", index: 1 }, window.location.origin);
    expect(quote.className).toContain("border-brand-navy");
    post.mockClear();
    fireEvent.focus(within(quote).getAllByRole("textbox")[1]);
    expect(post).not.toHaveBeenCalled();
  });

  it("opens and scrolls to a block's fields when it is clicked in the preview", () => {
    const { preview, post } = withPreview();
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    fromFrame(preview, { type: "cms-preview-select", slug: "field-building", index: 2 });
    const cards = screen.getByRole("region", { name: "Block 3: Card list" });
    expect(within(cards).getAllByRole("textbox").length).toBeGreaterThan(0);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts[0]).toBe(cards);
    expect(cards.className).toContain("border-brand-navy");
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
    // The preview chose the block, so it is not sent back to scroll there.
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: "cms-preview-show" }), expect.anything());
  });

  it("switches between a desktop and a mobile window width, and can be hidden, remembering each choice", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "true");
    expect(frame().style.width).toBe("1280px");
    fireEvent.click(screen.getByRole("button", { name: "Mobile" }));
    expect(screen.getByRole("button", { name: "Mobile" })).toHaveAttribute("aria-pressed", "true");
    expect(frame().style.width).toBe("390px");

    fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
    expect(screen.queryByRole("complementary", { name: "Preview" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();

    cleanup();
    renderEditor();
    expect(screen.queryByRole("complementary", { name: "Preview" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    expect(frame().style.width).toBe("390px");
  });

  it("keeps the choices for the page's life where the browser keeps nothing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Mobile" }));
    expect(frame().style.width).toBe("390px");
  });

  it("previews the mobile layout on a phone until a view is chosen", () => {
    const phone = vi.fn((query: string) => ({ matches: query === "(max-width: 47.99rem)" }) as MediaQueryList);
    vi.stubGlobal("matchMedia", phone);
    renderEditor();
    expect(phone).toHaveBeenCalled();
    expect(frame().style.width).toBe("390px");
    // Hiding the preview is not a choice of view.
    fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
    expect(JSON.parse(localStorage.getItem("cms-editor-preview")!)).toEqual({ show: false });
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Desktop" }));
    cleanup();
    renderEditor();
    expect(frame().style.width).toBe("1280px");
  });

  it("ignores a remembered setting it does not understand", () => {
    localStorage.setItem("cms-editor-preview", "{not json");
    renderEditor();
    expect(frame().style.width).toBe("1280px");
    cleanup();
    localStorage.setItem("cms-editor-preview", JSON.stringify({ show: "yes", view: "tablet", changes: 1 }));
    renderEditor();
    expect(frame().style.width).toBe("1280px");
    expect(screen.getByLabelText("Mark changes since the live page")).not.toBeChecked();
    cleanup();
    localStorage.setItem("cms-editor-preview", "null");
    renderEditor();
    expect(frame().style.width).toBe("1280px");
    expect(screen.getByLabelText("Mark changes since the live page")).not.toBeChecked();
  });

  it("takes turns with the fields on a narrow screen", () => {
    renderEditor();
    const fields = title().closest("main")!.parentElement!;
    const pane = screen.getByRole("complementary", { name: "Preview" });
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
    expect(pane.className).toMatch(/(^| )hidden /);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(pane.className).not.toMatch(/(^| )hidden /);
    expect(fields.className).toMatch(/(^| )hidden /);
  });

  it("scales the frame down to fit the pane", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
    renderEditor();
    expect(frame().style.transform).toBe("scale(0.5)");
    expect(frame().style.height).toBe("1000px");
    fireEvent.click(screen.getByRole("button", { name: "Mobile" }));
    expect(frame().style.transform).toBe("scale(1)");
  });

  it("stays while the page is locked for publishing", () => {
    renderEditor(fakeServer(), { initialState: "publishing", initialVersion: 3 });
    expect(frame()).toBeInTheDocument();
  });
});

describe("collapsing blocks", () => {
  const region = (name: string) => screen.getByRole("region", { name });
  const toggle = (name: string) => within(region(name)).getByRole("button", { expanded: true });

  it("hides a block's fields, saying how many problems they hold", () => {
    renderEditor(fakeServer(), {
      initialProblems: [
        { path: ["blocks", 1, "quote"], message: "Required" },
        { path: ["blocks", 1, "caption"], message: "A caption needs a photo" },
        { path: ["blocks", 0, "heading"], message: "Required" },
      ],
    });
    fireEvent.click(toggle("Block 2: Quote band"));
    expect(within(region("Block 2: Quote band")).queryAllByRole("textbox")).toEqual([]);
    expect(region("Block 2: Quote band")).toHaveTextContent("2 things to fix");
    fireEvent.click(toggle("Block 1: Page heading"));
    expect(region("Block 1: Page heading")).toHaveTextContent("1 thing to fix");
    fireEvent.click(within(region("Block 2: Quote band")).getByRole("button", { expanded: false }));
    expect(within(region("Block 2: Quote band")).getAllByRole("textbox").length).toBeGreaterThan(0);
  });

  it("collapses and expands every block at once, card list style included", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByLabelText("Page title")).toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toEqual([]);
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(file.blocks.length);
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.queryAllByRole("button", { expanded: false })).toEqual([]);
  });

  it("keeps a block collapsed as it moves, and opens them all when a block is removed", () => {
    renderEditor();
    fireEvent.click(toggle("Block 2: Quote band"));
    fireEvent.click(within(region("Block 2: Quote band")).getByRole("button", { name: "Move down" }));
    expect(within(region("Block 3: Quote band")).getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(within(region("Block 2: Card list")).getByRole("button", { expanded: true })).toBeInTheDocument();

    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove block 3" }));
    expect(within(region("Block 3: Quote band")).getByRole("button", { expanded: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove block 3" }));
    expect(screen.queryAllByRole("button", { expanded: false })).toEqual([]);
  });
});

describe("publishing states", () => {
  const sent = { at: new Date("2026-10-15T12:00:00Z"), by: "pat@example.com" };

  it("locks the page while it is Publishing, with Withdraw for a publisher", async () => {
    const server = fakeServer();
    server.withdraw.mockResolvedValueOnce({ ok: false, reason: "failed", message: "Withdrawing did not work this time." });
    renderEditor(server, { initialState: "publishing", initialVersion: 3, canPublish: true, publishing: { sent, approved: false, note: null } });
    expect(screen.getByText("Publishing")).toBeInTheDocument();
    expect(screen.getByText(/^Sent for publishing on 15 Oct 2026, 12:00 UTC by pat@example\.com\./)).toBeInTheDocument();
    expect(screen.queryByLabelText("Page title")).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard draft" })).toBeNull();
    expect(screen.getByRole("link", { name: "Preview (opens a new tab)" })).toBeInTheDocument();

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw from publishing" }));
    expect(server.withdraw).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Withdraw from publishing" })));
    expect(server.withdraw).toHaveBeenCalledWith("field-building");
    expect(screen.getByRole("alert")).toHaveTextContent("Withdrawing did not work this time.");
    expect(document.body.textContent).not.toMatch(/github|pull request/i);
  });

  it("says when it was approved and is going live, without Withdraw", () => {
    renderEditor(fakeServer(), { initialState: "publishing", canPublish: true, publishing: { sent, approved: true, note: null } });
    expect(screen.getByText(/^Approved\. The website is being updated/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw from publishing" })).toBeNull();
  });

  it("offers no Withdraw to someone who may only edit", () => {
    renderEditor(fakeServer(), { initialState: "publishing", publishing: { sent: null, approved: false, note: null } });
    expect(screen.getByText(/^Sent for publishing\. It goes live once it is approved\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw from publishing" })).toBeNull();
  });

  it("shows Not published with the reviewer's comment as plain text, and edits make it a Draft", async () => {
    const server = fakeServer();
    server.version = 2;
    renderEditor(server, { initialState: "not_published", initialVersion: 2, publishing: { sent: null, approved: false, note: { by: "owner", text: "Too long. <b>Shorten</b> it." } } });
    expect(screen.getByText("Not published")).toBeInTheDocument();
    expect(document.querySelector("blockquote")!.textContent).toBe("owner: Too long. <b>Shorten</b> it.");
    expect(document.querySelector("blockquote b")).toBeNull();
    fireEvent.change(title(), { target: { value: "Shorter" } });
    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument(), { timeout: 3000 });
  });

  it("lists what changed on the live page when publishing is refused for that", async () => {
    const server = fakeServer();
    server.publish.mockResolvedValue({
      ok: false,
      reason: "stale",
      message: "The live page was changed by someone else since this draft was started.",
      changes: [{ path: ["description"], label: "Description", before: "Old", after: "New" }],
    });
    renderEditor(server, { canPublish: true, initialState: "draft" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
    expect(screen.getByRole("alert")).toHaveTextContent("The live page was changed by someone else");
    const list = screen.getByRole("list", { name: "Changed on the live page" });
    expect(list).toHaveTextContent("Description");
    expect(list).toHaveTextContent("Was: Old");
    expect(list).toHaveTextContent("Now: New");
  });

  it("says when publishing is not set up, and when the status could not be checked", () => {
    renderEditor(fakeServer(), { canPublish: true, initialState: "draft", publishSetUp: false, statusChecked: false });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText("Publishing is not set up on this site yet. Drafts are saved as usual.")).toBeInTheDocument();
    expect(screen.getByText("Could not check whether this page has been approved yet. Reload the page to try again.")).toBeInTheDocument();
  });
});

describe("the document picker", () => {
  it("offers the repo's PDFs for a text section's document, and keeps the pick in the draft", async () => {
    const letter = "/documents/red-lines-dialogue-mep-beke-letter-2026-09-01.pdf";
    const content = JSON.parse(fs.readFileSync("content/red-lines-dialogue.json", "utf8"));
    const server = renderEditor(fakeServer(), { slug: "red-lines-dialogue", initialContent: content, documents: [letter, "/documents/other.pdf"] });
    const picker = screen.getByLabelText("PDF") as HTMLSelectElement;
    expect(picker.value).toBe(letter);
    expect([...picker.options].map((o) => o.value)).toEqual(["", letter, "/documents/other.pdf"]);
    fireEvent.change(picker, { target: { value: "/documents/other.pdf" } });
    await waitFor(() => expect(server.saves).toHaveLength(1), { timeout: 3000 });
    expect((server.saves[0].content as typeof content).blocks[1].documents[0].file).toBe("/documents/other.pdf");
  });

  it("shows a picked file that is no longer in the repo, and can clear it", () => {
    const content = JSON.parse(fs.readFileSync("content/red-lines-dialogue.json", "utf8"));
    content.blocks[1].documents[0].file = "/documents/gone.pdf";
    renderEditor(fakeServer(), { slug: "red-lines-dialogue", initialContent: content });
    const picker = screen.getByLabelText("PDF") as HTMLSelectElement;
    expect([...picker.options].map((o) => o.value)).toEqual(["", "/documents/gone.pdf"]);
    fireEvent.change(picker, { target: { value: "" } });
    expect(picker.value).toBe("");
  });
});
