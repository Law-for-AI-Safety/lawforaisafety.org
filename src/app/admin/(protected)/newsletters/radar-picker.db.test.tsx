import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { newsletters, newsRadarItems, newsRadarRuns, newsRadarSettings } from "@/drizzle/schema";
import { finishRun, recordFound, saveNewsRadarSettings, startRun, type FoundItem } from "@/lib/news-radar-store";
import { startAdminSession } from "@/lib/session";
import { DEFAULT_SETTINGS } from "@/news-radar/defaults";
import { cookieJar } from "../../../../../test/next-headers";
import { createNewsletter, saveNewsletter } from "./actions";
import NewsletterPage from "./[id]/page";

vi.mock("next/headers", () => import("../../../../../test/next-headers"));

/**
 * "Insert from News radar" in the subscriber newsletter composer, against a real database:
 * which items it offers, searching and filtering them, and where the chosen ones go.
 */

const EMAIL = "reviewer@example.com";
const NOW = new Date("2026-11-27T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const found = (n: number, over: Partial<FoundItem> = {}): FoundItem => ({
  urlKey: `https://news.test/${n}`,
  titleKey: `item ${n}|news`,
  storyKey: `item ${n}`,
  url: `https://news.test/${n}`,
  title: `Item ${n}`,
  outlet: "News",
  snippet: "",
  kind: "news",
  publishedAt: new Date("2026-11-20T00:00:00Z"),
  sources: ["google_news"],
  topics: ["ai-litigation"],
  score: n,
  ...over,
});

async function seedRadar(at: Date, items: FoundItem[]) {
  const runId = await startRun("schedule", null, at);
  await recordFound(runId, at, items);
  await finishRun(runId, { sources: [], newCount: items.length, seenCount: 0, email: null });
}

async function setState(title: string, state: "useful" | "dismissed") {
  await db.update(newsRadarItems).set({ state }).where(eq(newsRadarItems.title, title));
}

/** A signed-in admin's draft holding `body`, open in the composer. `raw` stores it unchecked. */
async function openDraft(body = "", { raw = false } = {}) {
  cookieJar.reset();
  await startAdminSession({ email: EMAIL, name: "Admin" });
  const { id } = (await createNewsletter()) as { id: string };
  if (raw) await db.update(newsletters).set({ body }).where(eq(newsletters.id, id));
  else if (body) await saveNewsletter(id, { subject: "December", previewText: "", body }, 1);
  render(await NewsletterPage({ params: Promise.resolve({ id }) }));
  if (!raw) await screen.findByRole("toolbar");
  return id;
}

const editorOf = () => (screen.getByRole("textbox", { name: "Newsletter" }) as HTMLElement & { editor: Editor }).editor;
const preview = () => (screen.getByTitle("Email preview") as HTMLIFrameElement).getAttribute("srcdoc") ?? "";
const titles = (dialog: HTMLElement) => within(within(dialog).getByRole("list", { name: "News radar items" })).getAllByRole("checkbox").map((c) => c.closest("label")!.querySelector("span > span")!.textContent);

beforeEach(async () => {
  vi.stubEnv("ADMIN_EMAILS", EMAIL);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await db.delete(newsletters);
  await db.delete(newsRadarItems);
  await db.delete(newsRadarRuns);
  await db.delete(newsRadarSettings);
});

describe("Insert from News radar", () => {
  it("offers recent items, Useful first, then New, never Dismissed, with outlet, date and topic", async () => {
    await seedRadar(new Date(NOW.getTime() - 90 * DAY), [found(9, { title: "Too old" })]);
    await seedRadar(new Date(NOW.getTime() - 7 * DAY), [found(1, { title: "Older useful" }), found(2, { title: "Older new" })]);
    await seedRadar(new Date(NOW.getTime() - DAY), [
      found(3, { title: "Newer new", outlet: "Reuters", publishedAt: new Date("2026-11-25T08:00:00Z") }),
      found(4, { title: "Gone", publishedAt: null }),
    ]);
    await setState("Older useful", "useful");
    await setState("Gone", "dismissed");
    await openDraft();

    await userEvent.click(screen.getByRole("button", { name: "Insert from News radar" }));
    const dialog = screen.getByRole("dialog", { name: "Insert from News radar" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("searchbox", { name: "Search" })).toHaveFocus();
    expect(titles(dialog)).toEqual(["Older useful", "Newer new", "Older new"]);
    expect(within(dialog).getByRole("checkbox", { name: "Newer new" })).toHaveAccessibleDescription("Reuters · 25 Nov 2026 · Litigation and class actions over AI harms");
    expect(within(dialog).getByRole("checkbox", { name: "Older useful" })).toHaveAccessibleDescription(/ · Useful$/);
  });

  it("searches titles and outlets, and filters by topic", async () => {
    await saveNewsRadarSettings(DEFAULT_SETTINGS, "seed");
    const [first, second] = DEFAULT_SETTINGS.topics;
    await seedRadar(new Date(NOW.getTime() - DAY), [
      found(1, { title: "Court fines chatbot maker", outlet: "Reuters", topics: [first.id] }),
      found(2, { title: "Regulator opens inquiry", outlet: "Politico", topics: [second.id] }),
      found(3, { title: "Unrelated", outlet: "Blog", topics: [] }),
    ]);
    await openDraft();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Insert from News radar" }));
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByRole("searchbox", { name: "Search" }), "politico INQUIRY");
    expect(titles(dialog)).toEqual(["Regulator opens inquiry"]);
    await user.clear(within(dialog).getByRole("searchbox", { name: "Search" }));
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Topic" }), first.name);
    expect(titles(dialog)).toEqual(["Court fines chatbot maker"]);
    await user.type(within(dialog).getByRole("searchbox", { name: "Search" }), "politico");
    expect(within(dialog).getByText("Nothing matches.")).toBeInTheDocument();
  });

  it("adds several ticked items to the end when the editor has no cursor, and marks them as in the newsletter", async () => {
    await seedRadar(new Date(NOW.getTime() - DAY), [
      found(1, { title: "First", outlet: "Reuters", score: 10 }),
      found(2, { title: "Second", outlet: "", publishedAt: null }),
      found(3, { title: "Third" }),
    ]);
    await openDraft("Intro.");
    const user = userEvent.setup();
    const opener = screen.getByRole("button", { name: "Insert from News radar" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog");
    const insert = within(dialog).getByRole("button", { name: "Insert" });
    expect(insert).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: "First" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Second" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Third" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Third" }));
    await user.click(within(dialog).getByRole("button", { name: "Insert 2 items" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(screen.getByText("Inserted 2 items from the News radar.")).toHaveAttribute("role", "status");
    expect(preview()).toContain('<a href="https://news.test/1"');
    expect(preview()).toContain("(Reuters, 20 Nov 2026)");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    // In the order the dialog lists them.
    expect(editorOf().getHTML()).toBe(
      '<p>Intro.</p><ul><li><p><a href="https://news.test/1">First</a> (Reuters, 20 Nov 2026)</p></li><li><p><a href="https://news.test/2">Second</a></p></li></ul>',
    );

    await user.click(opener);
    const again = screen.getByRole("dialog");
    expect(within(again).getByRole("checkbox", { name: "First" })).toBeDisabled();
    expect(within(again).getByRole("checkbox", { name: "First" })).toHaveAccessibleDescription(/Already in this newsletter$/);
    expect(within(again).getByRole("checkbox", { name: "Third" })).toBeEnabled();
    expect(within(again).getByRole("button", { name: "Insert" })).toBeDisabled();
  });

  it("puts items at the cursor: after the bullet it is in, or as a list after its paragraph", async () => {
    await seedRadar(new Date(NOW.getTime() - DAY), [found(1, { title: "One", publishedAt: null }), found(2, { title: "Two", publishedAt: null })]);
    await openDraft("Start.\n\n- [Old](https://old.test)\n\nEnd.");
    const user = userEvent.setup();
    const pick = async (title: string) => {
      await user.click(screen.getByRole("button", { name: "Insert from News radar" }));
      expect(screen.getByRole("dialog")).toHaveTextContent("at the cursor");
      await user.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: title }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Insert 1 item" }));
    };
    // The cursor in "Start.", which a list follows: the item joins the start of that list.
    act(() => {
      editorOf().chain().focus().setTextSelection(3).run();
    });
    await pick("One");
    expect(editorOf().getHTML()).toBe(
      '<p>Start.</p><ul><li><p><a href="https://news.test/1">One</a> (News)</p></li><li><p><a href="https://old.test">Old</a></p></li></ul><p>End.</p>',
    );
    // The cursor in the "Old" bullet: the item goes after it.
    const old = editorOf().getText().indexOf("Old");
    act(() => {
      editorOf().chain().focus().setTextSelection(old + 3).run();
    });
    await pick("Two");
    expect(editorOf().getHTML()).toContain('<li><p><a href="https://old.test">Old</a></p></li><li><p><a href="https://news.test/2">Two</a> (News)</p></li></ul><p>End.</p>');
  });

  it("puts a list after a paragraph, in place of an empty one, or at the end of an empty newsletter", async () => {
    await seedRadar(new Date(NOW.getTime() - DAY), [found(1, { title: "One", publishedAt: null }), found(2, { title: "Two", publishedAt: null })]);
    await openDraft("Alpha.\n\nOmega.");
    const user = userEvent.setup();
    const pick = async (title: string) => {
      await user.click(screen.getByRole("button", { name: "Insert from News radar" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: title }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Insert 1 item" }));
    };
    act(() => {
      editorOf().chain().focus().setTextSelection(2).run();
    });
    await pick("One");
    expect(editorOf().getHTML()).toBe('<p>Alpha.</p><ul><li><p><a href="https://news.test/1">One</a> (News)</p></li></ul><p>Omega.</p>');
    // An empty paragraph after "Omega." is replaced by the list.
    act(() => {
      editorOf().chain().focus("end").splitBlock().run();
    });
    await pick("Two");
    expect(editorOf().getHTML()).toMatch(/<p>Omega\.<\/p><ul><li><p><a href="https:\/\/news.test\/2">Two<\/a> \(News\)<\/p><\/li><\/ul>$/);
  });

  it("refuses an item whose link cannot go in, and a newsletter that does not read", async () => {
    await seedRadar(new Date(NOW.getTime() - DAY), [found(1, { title: "Bad link", url: "ftp://files.test/1" }), found(2, { title: "Fine" })]);
    await openDraft();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Insert from News radar" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: "Bad link" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Insert 1 item" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("“Bad link”: This item's link cannot go in the subscriber newsletter");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

  });

  it("refuses to add to a stored body the editor cannot read", async () => {
    await seedRadar(new Date(NOW.getTime() - DAY), [found(1, { title: "Fine" })]);
    await openDraft("**unclosed", { raw: true });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Insert from News radar" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("at the end");
    await user.click(within(dialog).getByRole("checkbox", { name: "Fine" }));
    await user.click(within(dialog).getByRole("button", { name: "Insert 1 item" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("The newsletter has a formatting problem. Fix it in the editor first.");
  });

  it("closes on Escape, keeps Tab inside, and says when there is nothing to offer", async () => {
    await openDraft();
    const user = userEvent.setup();
    const opener = screen.getByRole("button", { name: "Insert from News radar" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("The News radar has nothing recent to offer.")).toBeInTheDocument();
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const search = within(dialog).getByRole("searchbox", { name: "Search" });
    cancel.focus();
    await user.tab();
    expect(search).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).not.toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();

    // A click on the backdrop closes it too; a click inside does not.
    await user.click(opener);
    await user.click(screen.getByRole("heading", { name: "Insert from News radar" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
