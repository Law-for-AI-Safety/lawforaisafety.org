import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { adminAuditLog, newsletters, newsRadarItems, newsRadarRuns, newsRadarSettings } from "@/drizzle/schema";
import { getNewsRadarSettings, saveNewsRadarSettings, type FoundItem, recordFound, startRun, finishRun } from "@/lib/news-radar-store";
import { insertNewsletter } from "@/lib/newsletter-store";
import { startAdminSession } from "@/lib/session";
import { DEFAULT_SETTINGS } from "@/news-radar/defaults";
import type { SourceOutcome } from "@/news-radar/types";
import { cookieJar } from "../../../../test/next-headers";
import { navigation } from "../../../../test/next-navigation";
import { newsSources } from "../../../../test/fakes/news-sources";
import { addToNewsletter, runNow, saveSettings, triageItem } from "./actions";
import NewsRadarLayout from "./layout";
import NewsRadarPage from "./page";
import NewsRadarSettingsPage from "./settings/page";

vi.mock("next/headers", () => import("../../../../test/next-headers"));

/**
 * The News radar's admin pages and actions against a real database: who may do what, triage,
 * "Add to newsletter", the run status line and the settings.
 */

type Who = "signed out" | "admin" | "tech";
const EMAIL = { admin: "reviewer@example.com", tech: "tech@example.com" };
const MONDAY = new Date("2026-11-30T06:00:00Z");
const NEXT_MONDAY = new Date("2026-12-07T06:00:00Z");

async function signInAs(who: Who) {
  cookieJar.reset();
  if (who !== "signed out") await startAdminSession({ email: EMAIL[who], name: `${who} person` });
}

const found = (n: number, over: Partial<FoundItem> = {}): FoundItem => ({
  urlKey: `https://news.test/${n}`,
  titleKey: `item ${n}|news`,
  storyKey: `item ${n}`,
  url: `https://news.test/${n}`,
  title: `Item ${n}`,
  outlet: "News",
  snippet: "",
  kind: "news",
  publishedAt: new Date("2026-11-27T00:00:00Z"),
  sources: ["google_news"],
  topics: ["ai-litigation"],
  score: n,
  ...over,
});

/** Runs as the weekly job would have, storing `items` and the source outcomes. */
async function seedRun(now: Date, items: FoundItem[], sources: SourceOutcome[] = [{ source: "google_news", ok: true, found: 10, relevant: items.length }]) {
  const runId = await startRun("schedule", null, now);
  const { added, seenBefore } = await recordFound(runId, now, items);
  await finishRun(runId, { sources, newCount: added, seenCount: seenBefore, email: "Not sent: only the production site sends the weekly email." });
  return runId;
}

const itemRow = async (title: string) => (await db.select().from(newsRadarItems).where(eq(newsRadarItems.title, title)))[0];
const page = (search: Record<string, string> = {}) => NewsRadarPage({ searchParams: Promise.resolve(search) });

beforeEach(async () => {
  vi.stubEnv("ADMIN_EMAILS", Object.values(EMAIL).join(","));
  vi.stubEnv("TECH_ADMIN_EMAILS", EMAIL.tech);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await db.delete(newsRadarItems);
  await db.delete(newsRadarRuns);
  await db.delete(newsRadarSettings);
  await db.delete(newsletters);
  await db.delete(adminAuditLog);
});

describe("who may do what", () => {
  it("refuses every action when signed out, and the pages send to the login", async () => {
    await seedRun(MONDAY, [found(1)]);
    const { id } = await itemRow("Item 1");
    await signInAs("signed out");
    for (const result of [await triageItem(id, "useful"), await addToNewsletter(id, null), await runNow(), await saveSettings(DEFAULT_SETTINGS)]) {
      expect(result).toMatchObject({ ok: false, message: expect.stringContaining("signed out") });
    }
    await expect(page()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    await expect(NewsRadarSettingsPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect((await itemRow("Item 1")).state).toBe("new");
  });

  it("lets every admin triage and change the topics, but only a technical admin run it by hand", async () => {
    await seedRun(MONDAY, [found(1)]);
    const { id } = await itemRow("Item 1");
    await signInAs("admin");
    expect(await triageItem(id, "useful")).toEqual({ ok: true });
    expect(await itemRow("Item 1")).toMatchObject({ state: "useful", triagedBy: EMAIL.admin });
    expect(await runNow()).toEqual({ ok: false, message: "Only technical admins can do this." });
    expect(newsSources.requests).toEqual([]);

    render(await page());
    expect(screen.queryByRole("button", { name: "Run now" })).not.toBeInTheDocument();
  });

  it("lets a technical admin run it now, without sending the email", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    await saveNewsRadarSettings({ ...DEFAULT_SETTINGS, recipient: "group@example.org" }, EMAIL.tech);
    newsSources.googleNews({ title: "Families sue chatbot maker in class action", url: "https://n.test/a", outlet: "N", date: "2026-11-27T00:00:00Z" }, "lawsuit");
    await signInAs("tech");
    render(await page());
    await userEvent.click(screen.getByRole("button", { name: "Run now" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Done: 1 new, 0 seen before. No email is sent for a run by hand."));
    expect(navigation.refresh).toHaveBeenCalled();
    const [run] = await db.select().from(newsRadarRuns);
    expect(run).toMatchObject({ trigger: "manual", triggeredBy: EMAIL.tech, email: null });
    expect((await db.select().from(adminAuditLog)).map((r) => r.action)).toContain("news_radar_run");
  });

  it("refuses arguments that are not what the page sends", async () => {
    await signInAs("admin");
    expect(await triageItem("nope", "useful")).toEqual({ ok: false, message: "The request was not understood." });
    expect(await triageItem("00000000-0000-4000-8000-000000000000", "archived")).toEqual({ ok: false, message: "The request was not understood." });
    expect(await triageItem("00000000-0000-4000-8000-000000000000", "useful")).toEqual({ ok: false, message: "That item no longer exists." });
    expect(await addToNewsletter("00000000-0000-4000-8000-000000000000", "x")).toEqual({ ok: false, message: "The request was not understood." });
    expect(await addToNewsletter("00000000-0000-4000-8000-000000000000", null)).toEqual({ ok: false, message: "That item no longer exists." });
  });
});

describe("the items page", () => {
  it("shows the last run, items by week first seen, and which were seen before", async () => {
    await seedRun(MONDAY, [found(1), found(2, { title: "Item 2 copy", urlKey: "https://other.test/2", titleKey: "item 2|other", outlet: "Other", storyKey: "item 2" }), found(2)]);
    await seedRun(NEXT_MONDAY, [found(3, { kind: "paper", topics: ["ai-liability"], sources: ["openalex"] }), found(1)], [
      { source: "google_news", ok: true, found: 30, relevant: 2 },
      { source: "gdelt", ok: false, error: "GDELT answered 429: Please limit requests" },
    ]);
    await signInAs("admin");
    render(await page());

    const status = within(screen.getByRole("region", { name: "Last run" }));
    expect(status.getByText(/^Last run/)).toHaveTextContent("Last run Mon 7 Dec, 06:00 UTC (weekly run): 1 new, 1 seen before.");
    expect(status.getByText("Google News: 30 found, 2 relevant")).toBeInTheDocument();
    expect(status.getByText("GDELT failed this week: GDELT answered 429: Please limit requests")).toBeInTheDocument();

    const weeks = screen.getAllByRole("region", { name: /^Week of/ });
    expect(weeks.map((w) => w.getAttribute("aria-label"))).toEqual(["Week of 7 Dec 2026", "Week of 30 Nov 2026"]);
    const thisWeek = within(weeks[0]);
    expect(thisWeek.getByRole("link", { name: "Item 3" })).toHaveAttribute("href", "https://news.test/3");
    expect(thisWeek.getByText(/Journal article or preprint/)).toBeInTheDocument();
    expect(thisWeek.getByText(/AI liability and the Product Liability Directive · via OpenAlex/)).toBeInTheDocument();

    const lastWeek = within(weeks[1]);
    const one = within(lastWeek.getByRole("link", { name: "Item 1" }).closest("li")!);
    expect(one.getByText("Seen before (first seen 30 Nov 2026)")).toBeInTheDocument();
    // The syndicated copy shows under the story, not as an item of its own.
    expect(lastWeek.getAllByRole("listitem")).toHaveLength(2);
    expect(lastWeek.getByText(/Also reported by/)).toHaveTextContent("Also reported by News");
  });

  it("filters by topic, source and state", async () => {
    await seedRun(MONDAY, [found(1), found(2, { topics: ["gdpr-ai"], sources: ["gdelt"] })]);
    await signInAs("admin");
    await triageItem((await itemRow("Item 1")).id, "dismissed");

    render(await page({ topic: "gdpr-ai" }));
    expect(screen.queryByRole("link", { name: "Item 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Item 2" })).toBeInTheDocument();
    cleanup();
    render(await page({ source: "google_news", state: "dismissed" }));
    expect(screen.getByRole("link", { name: "Item 1" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Item 2" })).not.toBeInTheDocument();
    cleanup();
    render(await page({ state: "useful" }));
    expect(screen.getByText("Nothing matches these filters.")).toBeInTheDocument();
    cleanup();
    // Values the page does not offer are ignored rather than matching nothing.
    render(await page({ topic: "nope", source: "nope", state: "nope" }));
    expect(screen.getAllByRole("link", { name: /^Item/ })).toHaveLength(2);
  });

  it("says the radar has not run yet", async () => {
    await signInAs("admin");
    render(await page());
    expect(screen.getByText("The radar has not run yet. It runs every Monday at 06:00 UTC.")).toBeInTheDocument();
    expect(screen.getByText("Nothing found yet.")).toBeInTheDocument();
  });

  it("marks items useful, dismissed, and back to new from their buttons", async () => {
    await seedRun(MONDAY, [found(1)]);
    await signInAs("admin");
    render(await page());
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(async () => expect((await itemRow("Item 1")).state).toBe("dismissed"));
    cleanup();
    render(await page());
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to new" }));
    await waitFor(async () => expect((await itemRow("Item 1")).state).toBe("new"));
  });

  it("shows the sidebar link to every admin, with this week's untriaged count", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-08T12:00:00Z"));
    await seedRun(MONDAY, [found(1)]);
    await seedRun(NEXT_MONDAY, [found(2), found(3)]);
    await signInAs("admin");
    render(await NewsRadarLayout({ children: null }));
    const sidebar = within(screen.getByRole("navigation", { name: "Admin" }));
    expect(sidebar.getByRole("link", { name: "News radar (2 new this week to triage)" })).toHaveAttribute("href", "/admin/news-radar");
  });
});

describe("Add to newsletter", () => {
  it("appends the title and link to the chosen draft", async () => {
    await seedRun(MONDAY, [found(1, { title: "Court rules on AI", outlet: "Reuters" })]);
    await signInAs("admin");
    const draft = await insertNewsletter(EMAIL.admin);
    await db.update(newsletters).set({ subject: "December update", body: "Intro." }).where(eq(newsletters.id, draft));

    render(await page());
    expect(screen.getByRole("combobox", { name: "Newsletter draft" })).toHaveValue(draft);
    await userEvent.click(screen.getByRole("button", { name: "Add to newsletter" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Added to “December update”."));
    expect(screen.getByRole("link", { name: "Open the draft" })).toHaveAttribute("href", `/admin/newsletters/${draft}`);
    const [row] = await db.select().from(newsletters).where(eq(newsletters.id, draft));
    expect(row).toMatchObject({ body: "Intro.\n\n- [Court rules on AI](https://news.test/1) (Reuters)", version: 2, updatedBy: EMAIL.admin });
  });

  it("starts a new draft when asked", async () => {
    await seedRun(MONDAY, [found(1)]);
    await signInAs("admin");
    const result = await addToNewsletter((await itemRow("Item 1")).id, null);
    expect(result).toMatchObject({ ok: true, subject: "Untitled newsletter" });
    const rows = await db.select().from(newsletters);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("- [Item 1](https://news.test/1) (News)");
  });

  it("refuses a newsletter that is no longer a draft, and an item whose link cannot go in one", async () => {
    await seedRun(MONDAY, [found(1), found(2, { url: "ftp://files.test/2" })]);
    await signInAs("admin");
    const sent = await insertNewsletter(EMAIL.admin);
    await db.update(newsletters).set({ state: "submitted" }).where(eq(newsletters.id, sent));
    expect(await addToNewsletter((await itemRow("Item 1")).id, sent)).toEqual({ ok: false, message: "That newsletter is no longer a draft. Choose another." });
    expect(await addToNewsletter((await itemRow("Item 2")).id, null)).toMatchObject({ ok: false, message: expect.stringContaining("only https links") });
    expect(await db.select().from(newsletters)).toHaveLength(1);
  });

  it("refuses a draft that would grow too long", async () => {
    await seedRun(MONDAY, [found(1)]);
    await signInAs("admin");
    const draft = await insertNewsletter(EMAIL.admin);
    await db.update(newsletters).set({ body: "a".repeat(100_000) }).where(eq(newsletters.id, draft));
    expect(await addToNewsletter((await itemRow("Item 1")).id, draft)).toEqual({ ok: false, message: "That draft is too long to add more to." });
  });
});

describe("the settings page", () => {
  it("lets any admin change the topics but keeps the recipient for technical admins", async () => {
    await saveNewsRadarSettings({ ...DEFAULT_SETTINGS, recipient: "group@example.org" }, EMAIL.tech);
    await signInAs("admin");
    render(await NewsRadarSettingsPage());
    expect(screen.getByLabelText("Send the summary to")).toBeDisabled();
    expect(screen.getByText("Only technical admins can change where the summary goes.")).toBeInTheDocument();

    const first = within(screen.getByRole("region", { name: DEFAULT_SETTINGS.topics[0].name }));
    await userEvent.clear(first.getByLabelText("Topic name"));
    await userEvent.type(first.getByLabelText("Topic name"), "AI Act enforcement");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved."));

    const saved = await getNewsRadarSettings();
    expect(saved.topics[0]).toMatchObject({ id: "ai-act-enforcement", name: "AI Act enforcement" });
    expect(saved).toMatchObject({ recipient: "group@example.org", updatedBy: EMAIL.admin });
    // A crafted request cannot change it either.
    expect(await saveSettings({ ...DEFAULT_SETTINGS, recipient: "someone@else.example" })).toEqual({ ok: true });
    expect((await getNewsRadarSettings()).recipient).toBe("group@example.org");
  });

  it("lets a technical admin set the recipient, add a topic and remove one", async () => {
    await signInAs("tech");
    render(await NewsRadarSettingsPage());
    expect(screen.getByText("Never changed: these are the starting topics.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Send the summary to"), "group@example.org");
    const last = DEFAULT_SETTINGS.topics.at(-1)!;
    await userEvent.click(within(screen.getByRole("region", { name: last.name })).getByRole("button", { name: "Remove topic" }));
    await userEvent.click(screen.getByRole("button", { name: "Add a topic" }));
    const added = within(screen.getByRole("region", { name: "New topic" }));
    await userEvent.type(added.getByLabelText("Topic name"), "Deepfake rulings");
    await userEvent.type(added.getByLabelText(/^Search terms/), "deepfake ruling");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Give each topic at least one include keyword."));
    await userEvent.type(added.getByLabelText(/^Include keywords/), "deepfake{enter}ruling");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved."));

    const saved = await getNewsRadarSettings();
    expect(saved.recipient).toBe("group@example.org");
    expect(saved.topics.map((t) => t.id)).toEqual([...DEFAULT_SETTINGS.topics.slice(0, -1).map((t) => t.id), "deepfake-rulings"]);
    expect(saved.topics.at(-1)).toMatchObject({ queries: ["deepfake ruling"], include: ["deepfake", "ruling"], require: [], exclude: [] });
    expect((await db.select().from(adminAuditLog)).find((r) => r.action === "news_radar_settings")?.detail).toMatchObject({ recipientChanged: true });
    cleanup();
    render(await NewsRadarSettingsPage());
    expect(screen.getByText(/^Last changed by tech@example.com/)).toBeInTheDocument();
  });
});
