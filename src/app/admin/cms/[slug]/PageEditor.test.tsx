import fs from "node:fs";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Problem } from "@/cms/publish-checks";
import type { PublishDraftResult, SaveDraftResult } from "../actions";
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
      images={["/images/team-group.webp"]}
      save={server.save}
      discard={server.discard}
      publish={server.publish}
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
