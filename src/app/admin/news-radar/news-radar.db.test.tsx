import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { adminAuditLog, newsletters, newsRadarItems, newsRadarRuns, newsRadarSettings } from "@/drizzle/schema";
import { EMAIL_SENT, getNewsRadarSettings, saveNewsRadarSettings, type FoundItem, recordFound, startRun, finishRun } from "@/lib/news-radar-store";
import { insertNewsletter } from "@/lib/newsletter-store";
import { startAdminSession } from "@/lib/session";
import { DEFAULT_SETTINGS } from "@/news-radar/defaults";
import type { SourceOutcome } from "@/news-radar/types";
import { setRunSleep } from "@/news-radar/run";
import { formatTime, RUN_STALE_MS } from "@/news-radar/view";
import { cookieJar } from "../../../../test/next-headers";
import { navigation } from "../../../../test/next-navigation";
import { emails } from "../../../../test/fakes/email";
import { DEPLOY_ORIGIN, netlifyFunctions } from "../../../../test/fakes/netlify-functions";
import { newsSources } from "../../../../test/fakes/news-sources";
import { runNow, saveSettings, triageItem } from "./actions";
import NewsRadarLayout from "./layout";
import NewsRadarPage from "./page";
import NewsRadarSettingsPage from "./settings/page";
import { REFRESH_MS } from "./RunNowButton";

vi.mock("next/headers", () => import("../../../../test/next-headers"));

/**
 * The News radar's admin pages and actions against a real database: who may do what, triage,
 * which items the subscriber newsletter links to, the run status line and the settings.
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
  setRunSleep(async () => {});
});

afterEach(() => setRunSleep());

describe("who may do what", () => {
  it("refuses every action when signed out, and the pages send to the login", async () => {
    await seedRun(MONDAY, [found(1)]);
    const { id } = await itemRow("Item 1");
    await signInAs("signed out");
    for (const result of [await triageItem(id, "useful"), await runNow(), await saveSettings(DEFAULT_SETTINGS)]) {
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
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Done: the result is above. No email is sent."));
    expect(navigation.refresh).toHaveBeenCalled();
    const [run] = await db.select().from(newsRadarRuns);
    expect(run).toMatchObject({ trigger: "manual", triggeredBy: EMAIL.tech, email: null, newCount: 1 });
    expect(emails.sent).toEqual([]);
    expect((await db.select().from(adminAuditLog)).map((r) => [r.action, r.detail])).toContainEqual(["news_radar_run", { runId: run.id, sendDigest: false }]);
  });

  it("lets a technical admin run it and send the digest, after confirming the recipient", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    await saveNewsRadarSettings({ ...DEFAULT_SETTINGS, recipient: "group@example.org" }, EMAIL.tech);
    newsSources.googleNews({ title: "Families sue chatbot maker in class action", url: "https://n.test/a", outlet: "N", date: "2026-11-27T00:00:00Z" }, "lawsuit");
    await signInAs("tech");
    render(await page());
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

    await userEvent.click(screen.getByRole("button", { name: "Run and send digest" }));
    expect(confirm).toHaveBeenLastCalledWith("Run the radar now and email the summary to group@example.org?");
    expect(await db.select().from(newsRadarRuns)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Run and send digest" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Done: the result is above, with what became of the email."));
    const [run] = await db.select().from(newsRadarRuns);
    expect(run).toMatchObject({ trigger: "manual", email: EMAIL_SENT });
    expect(emails.to("group@example.org")[0].html).toContain("Families sue chatbot maker");
    expect((await db.select().from(adminAuditLog)).map((r) => [r.action, r.detail])).toContainEqual([
      "news_radar_run",
      { runId: run.id, sendDigest: true, recipient: "group@example.org" },
    ]);
  });

  it("says off production that the digest will not actually be sent", async () => {
    await saveNewsRadarSettings({ ...DEFAULT_SETTINGS, recipient: "group@example.org" }, EMAIL.tech);
    await signInAs("tech");
    render(await page());
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(screen.getByRole("button", { name: "Run and send digest" }));
    expect(confirm).toHaveBeenCalledWith(
      "Run the radar now and email the summary to group@example.org? This is not the production site, so the email will not actually be sent.",
    );
  });

  it("offers the digest only once a recipient is set", async () => {
    await signInAs("tech");
    render(await page());
    expect(screen.getByRole("button", { name: "Run and send digest" })).toBeDisabled();
    expect(screen.getByText("Set a recipient in the settings to send the digest.")).toBeInTheDocument();
    expect(await runNow(true)).toEqual({ ok: false, message: "No recipient is set in the News radar settings." });
    expect(await db.select().from(newsRadarRuns)).toEqual([]);
  });

  it("starts the run in the background on Netlify, and the page follows it until it finishes", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "deploy-preview");
    vi.stubEnv("DEPLOY_ORIGIN", DEPLOY_ORIGIN);
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    newsSources.down("gdelt");
    await signInAs("tech");
    render(await page());
    await userEvent.click(screen.getByRole("button", { name: "Run now" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Started: the result appears above when it finishes, usually within a few minutes. No email is sent."),
    );
    expect(netlifyFunctions.answers).toHaveLength(1);
  });

  it("says why a run could not start", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "deploy-preview");
    vi.stubEnv("DEPLOY_ORIGIN", DEPLOY_ORIGIN);
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    netlifyFunctions.failNext(401);
    await signInAs("tech");
    render(await page());
    await userEvent.click(screen.getByRole("button", { name: "Run now" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The run could not start: the background function answered HTTP 401"));
  });

  it("shows a run that is still going, refreshes until it finishes, and starts no other meanwhile", async () => {
    const startedAt = new Date(Date.now() - 60_000);
    await startRun("manual", EMAIL.tech, startedAt);
    await signInAs("tech");
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render(await page());
    expect(screen.getByText(/^Running since .* \(run by hand by tech@example.com\)\. This updates when it finishes\.$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run now" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run and send digest" })).toBeDisabled();
    navigation.refresh.mockClear();
    vi.advanceTimersByTime(REFRESH_MS);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    expect(await runNow()).toEqual({ ok: false, message: `A run is already going: it started ${formatTime(startedAt)}. Wait for it to finish.` });
    expect(await db.select().from(newsRadarRuns)).toHaveLength(1);
  });

  it("says a run stopped when it never finished", async () => {
    await startRun("schedule", null, new Date(Date.now() - RUN_STALE_MS - 1000));
    await signInAs("tech");
    render(await page());
    expect(screen.getByText("The run failed: it stopped without finishing. The news-radar-run function's log on Netlify says why.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run now" })).toBeEnabled();
  });

  it("refuses arguments that are not what the page sends", async () => {
    await signInAs("admin");
    expect(await triageItem("nope", "useful")).toEqual({ ok: false, message: "The request was not understood." });
    expect(await triageItem("00000000-0000-4000-8000-000000000000", "useful", ["nope"])).toEqual({ ok: false, message: "The request was not understood." });
    expect(await triageItem("00000000-0000-4000-8000-000000000000", "archived")).toEqual({ ok: false, message: "The request was not understood." });
    expect(await triageItem("00000000-0000-4000-8000-000000000000", "useful")).toEqual({ ok: false, message: "That item no longer exists." });
    await signInAs("tech");
    expect(await runNow("yes")).toEqual({ ok: false, message: "The request was not understood." });
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

  it("says which include keywords each item matches under the current settings", async () => {
    await seedRun(MONDAY, [
      found(1, { title: "Chatbot class action filed", snippet: "A lawsuit over an AI chatbot." }),
      found(2, { title: "Unrelated" }),
    ]);
    await signInAs("admin");
    render(await page());
    const matched = within(screen.getByRole("link", { name: "Chatbot class action filed" }).closest("li")!);
    expect(matched.getByText("Matched: lawsuit, class action")).toBeInTheDocument();
    const unmatched = within(screen.getByRole("link", { name: "Unrelated" }).closest("li")!);
    expect(unmatched.getByText("Matches no topic under the current settings")).toBeInTheDocument();
  });

  it("triages one story's copies from other outlets along with it, unless triaged on their own", async () => {
    const copy = (n: number) => found(n, { storyKey: "item 1", urlKey: `https://other.test/${n}`, titleKey: `item 1|other ${n}`, outlet: `Other ${n}`, score: 0 });
    // A wire story: more copies than any one page of buttons would ever send at once before.
    await seedRun(MONDAY, [found(1, { score: 100 }), ...Array.from({ length: 60 }, (_, i) => copy(i + 2))]);
    await signInAs("admin");
    await triageItem((await itemRow("Item 3")).id, "useful");
    render(await page());
    expect(screen.getAllByRole("button", { name: "Dismiss" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(async () => expect((await itemRow("Item 61")).state).toBe("dismissed"));
    expect((await itemRow("Item 1")).state).toBe("dismissed");
    expect((await itemRow("Item 3")).state).toBe("useful");
  });

  it("says when a run failed", async () => {
    const runId = await startRun("schedule", null, MONDAY);
    await finishRun(runId, { sources: [], newCount: 0, seenCount: 0, email: null, error: "connection reset" });
    await signInAs("admin");
    render(await page());
    expect(screen.getByText("The run failed: connection reset")).toBeInTheDocument();
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

describe("the subscriber newsletter", () => {
  it("is not added to from here: items go in from the newsletter composer", async () => {
    await seedRun(MONDAY, [found(1)]);
    await insertNewsletter(EMAIL.admin);
    await signInAs("admin");
    render(await page());
    expect(screen.queryByRole("button", { name: /newsletter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /newsletter/i })).not.toBeInTheDocument();
  });

  it("marks items a sent or scheduled issue or a draft links to, a sent one first, and not one partway to Brevo", async () => {
    await seedRun(MONDAY, [found(1), found(2), found(3), found(4, { url: "http://news.test/4" })]);
    const draft = await insertNewsletter(EMAIL.admin);
    await db.update(newsletters).set({ body: "- [One](https://news.test/1)\n- [Two](https://news.test/2)\n- [Four](https://news.test/4)" }).where(eq(newsletters.id, draft));
    const sent = await insertNewsletter(EMAIL.admin);
    await db.update(newsletters).set({ state: "submitted", body: "See [two](https://news.test/2)." }).where(eq(newsletters.id, sent));
    const handing = await insertNewsletter(EMAIL.admin);
    await db.update(newsletters).set({ state: "submitting", body: "See [three](https://news.test/3)." }).where(eq(newsletters.id, handing));
    const broken = await insertNewsletter(EMAIL.admin);
    await db.update(newsletters).set({ body: "**unclosed [three](https://news.test/3)" }).where(eq(newsletters.id, broken));
    await signInAs("admin");
    render(await page());
    const entry = (title: string) => screen.getByRole("link", { name: title }).closest("li")!;
    expect(within(entry("Item 1")).getByText("In a subscriber newsletter draft")).toBeInTheDocument();
    expect(within(entry("Item 2")).getByText("In a sent or scheduled subscriber newsletter")).toBeInTheDocument();
    expect(within(entry("Item 2")).queryByText("In a subscriber newsletter draft")).not.toBeInTheDocument();
    expect(within(entry("Item 3")).queryByText(/In a subscriber newsletter/)).not.toBeInTheDocument();
    // Its stored http: link went in upgraded to https:.
    expect(within(entry("Item 4")).getByText("In a subscriber newsletter draft")).toBeInTheDocument();
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
    expect(await saveSettings({ ...DEFAULT_SETTINGS, recipient: "someone@else.example" })).toMatchObject({ ok: true });
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
    // Renamed and saved again without reloading, the new topic keeps the id it was given.
    const renamed = within(screen.getByRole("region", { name: "Deepfake rulings" }));
    await userEvent.type(renamed.getByLabelText("Topic name"), " and synthetic media");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(async () => expect((await getNewsRadarSettings()).topics.at(-1)?.name).toBe("Deepfake rulings and synthetic media"));

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
