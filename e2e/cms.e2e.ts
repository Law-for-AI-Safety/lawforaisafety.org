import fs from "node:fs";
import { SignJWT } from "jose";
import { Client } from "pg";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cloneName, createTestDb, dropRun, newRunId, prepareTestDb, testDbUrl } from "../test/pg";
import { githubEnv } from "../test/fakes/github";
import { freePort, startApp } from "./app-server";
import { serveFakeGitHub } from "./fake-github-server";

/**
 * The editor in a real browser: a publisher edits the field-building page with the toolbar,
 * previews it and publishes it, and the fake GitHub receives a pull request with the right
 * file; a draft-only editor can edit but is never offered Publish. The app runs as built
 * (`next start`) against its own Postgres database, with GitHub faked in this process and
 * reached over HTTP.
 */

const PATH = "content/field-building.json";
const FILE = fs.readFileSync(PATH, "utf8");
const file = JSON.parse(FILE);
const SESSION_SECRET = "e2e-session-secret-at-least-32-characters";
const PUBLISHER = "publisher@example.com";
const DRAFTER = "drafter@example.com";

let runId: string;
let browser: Browser;
let app: { url: string; stop: () => void };
let fake: Awaited<ReturnType<typeof serveFakeGitHub>>;

beforeAll(async () => {
  runId = newRunId();
  await prepareTestDb(runId);
  const name = cloneName(runId);
  await createTestDb(runId, name);
  const databaseUrl = testDbUrl(name);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("INSERT INTO admin_people (email, name) VALUES ($1, 'Pat Publisher'), ($2, 'Dee Drafter')", [PUBLISHER, DRAFTER]);
    await client.query("INSERT INTO cms_roles (email, permission, granted_by) VALUES ($1, 'publish', 'e2e'), ($2, 'draft', 'e2e')", [PUBLISHER, DRAFTER]);
  } finally {
    await client.end();
  }

  fake = await serveFakeGitHub();
  fake.github.fileOnMain(PATH, FILE);

  app = await startApp(await freePort(), {
    ...githubEnv(fake.url),
    DATABASE_URL: databaseUrl,
    SESSION_SECRET,
    ADMIN_EMAILS: `${PUBLISHER},${DRAFTER}`,
    TECH_ADMIN_EMAILS: "",
    EMAIL_HASH_SECRET: "e2e-email-hash-secret-at-least-32-chars",
  });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  app?.stop();
  await fake?.close();
  if (runId) await dropRun(runId).catch(() => {});
});

/** A browser signed in to the admin as `email`, as the login flow would leave it. */
async function signedIn(email: string, name: string): Promise<BrowserContext> {
  const token = await new SignJWT({ email, name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("lawforaisafety.org")
    .setAudience("admin_session")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SESSION_SECRET));
  const context = await browser.newContext();
  await context.addCookies([{ name: "admin_session", value: token, url: app.url, httpOnly: true, secure: true, sameSite: "Lax" }]);
  return context;
}

type EditorElement = HTMLElement & { editor: { state: { selection: { from: number; to: number }; doc: { textBetween(from: number, to: number): string } } } };

/**
 * Selects `text`, which ends `fromEnd` characters before the end of `field`, and waits until
 * the editor itself (not only the browser) holds that selection: ProseMirror reads keyboard
 * selections on `selectionchange`, which fires asynchronously.
 */
async function select(field: Locator, fromEnd: number, text: string) {
  const page = field.page();
  await page.keyboard.press("Control+End");
  for (let i = 0; i < fromEnd; i++) await page.keyboard.press("ArrowLeft");
  for (let i = 0; i < text.length; i++) await page.keyboard.press("Shift+ArrowLeft");
  const handle = await field.elementHandle();
  await page.waitForFunction(
    ([el, expected]) => {
      const { selection, doc } = (el as EditorElement).editor.state;
      return doc.textBetween(selection.from, selection.to) === expected;
    },
    [handle, text] as const,
  );
}

/** Presses a toolbar button and waits until it shows as on for the selection. */
async function format(scope: Locator, name: string) {
  const button = scope.getByRole("button", { name, exact: true });
  await button.click();
  await scope.locator(`button[aria-pressed="true"]`, { hasText: name }).first().waitFor();
}

/**
 * Waits for the autosave a change just started to finish. The change shows "Unsaved changes…"
 * for the autosave's pause first, so a "saved" from before the change cannot be mistaken for it.
 */
async function saved(page: Page) {
  await shown(page.getByText("Unsaved changes…"), 2_000);
  await shown(page.getByText("All changes saved"));
}

const shown = (locator: Locator, timeout = 10_000) => locator.waitFor({ state: "visible", timeout });

describe("a publisher", () => {
  it("formats text with the toolbar, previews it, publishes it, and the pull request carries the file", async () => {
    const context = await signedIn(PUBLISHER, "Pat Publisher");
    const page = await context.newPage();
    await page.goto(`${app.url}/admin/cms/field-building`);
    await shown(page.getByText("Live", { exact: true }));

    const hero = page.getByRole("region", { name: "Block 1: Page heading" });
    const lede = hero.getByRole("textbox", { name: "Introduction" });
    await lede.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" Wavy words and a link");
    // Left to right, so the arrow keys never cross a formatted run (a mark boundary can take
    // an extra key press).
    await select(lede, " and a link".length, "Wavy words");
    await format(hero, "Wavy underline");
    await select(lede, " a link".length, "and");
    await format(hero, "Bold");
    await select(lede, 0, "a link");
    await hero.getByRole("button", { name: "Link", exact: true }).click();
    await hero.getByRole("textbox", { name: /^Link to a web address/ }).fill("/council-of-europe");
    await hero.getByRole("button", { name: "Apply link" }).click();

    await saved(page);
    await shown(page.getByText("Draft", { exact: true }));

    const [preview] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: "Preview (opens a new tab)" }).click()]);
    await preview.waitForLoadState();
    expect(await preview.getByRole("note").textContent()).toContain("Preview of the draft.");
    expect(await preview.getByRole("link", { name: "a link" }).getAttribute("href")).toBe("/council-of-europe");
    expect(await preview.locator("strong", { hasText: "and" }).count()).toBeGreaterThan(0);
    await preview.close();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Publish" }).click();
    await shown(page.getByText("Publishing", { exact: true }), 20_000);
    await shown(page.getByRole("button", { name: "Withdraw from publishing" }));
    expect(await page.textContent("body")).not.toMatch(/github|pull request/i);

    const prs = fake.github.openedPRs;
    expect(prs).toHaveLength(1);
    expect(prs[0].head).toMatch(/^cms\/field-building-\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(prs[0].files)).toEqual([PATH]);
    const sent = JSON.parse(prs[0].files[PATH]);
    expect(sent.blocks[0].lede).toBe(`${file.blocks[0].lede} ==Wavy words== **and** [a link](/council-of-europe)`);
    expect(sent.updatedAt).toBe(new Date().toISOString().slice(0, 10));
    // Nothing else in the file changed.
    expect({ ...sent, updatedAt: file.updatedAt, blocks: [{ ...sent.blocks[0], lede: file.blocks[0].lede }, ...sent.blocks.slice(1)] }).toEqual(file);
    expect(prs[0].body).toContain("- **Sent by:** `Pat Publisher`");
    await context.close();
  });
});

describe("a draft-only editor", () => {
  it("can edit, but is never offered Publish or Withdraw", async () => {
    const context = await signedIn(DRAFTER, "Dee Drafter");
    const page = await context.newPage();
    // The page the publisher sent is locked while it is Publishing, and this editor may not withdraw it.
    await page.goto(`${app.url}/admin/cms/field-building`);
    await shown(page.getByText("Publishing", { exact: true }));
    expect(await page.getByRole("button", { name: "Withdraw from publishing" }).count()).toBe(0);
    expect(await page.getByRole("button", { name: "Publish" }).count()).toBe(0);

    // Once the reviewer declines it, the draft opens for editing again, still without Publish.
    fake.github.close(1, { comment: "Not this week." });
    await page.reload();
    await shown(page.getByText("Not published", { exact: true }));
    await shown(page.getByText("reviewer: Not this week."));
    await page.getByLabel("Page title").fill("A draft title");
    await saved(page);
    await shown(page.getByText("Draft", { exact: true }));
    expect(await page.getByRole("button", { name: "Publish" }).count()).toBe(0);
    expect(fake.github.openedPRs).toHaveLength(1);
    await context.close();
  });
});
