import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions, opportunities, opportunitiesAuditLog } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { startAdminSession } from "@/lib/session";
import { getOpportunityBySlug } from "@/opportunities/data";
import { emptyOpportunityForm, roundForm } from "@/opportunities/form-state";
import { cookieJar } from "../../../../test/next-headers";
import EditOpportunityForm from "./[slug]/EditOpportunityForm";
import NewOpportunityForm from "./new/NewOpportunityForm";
import OpportunitiesListPage from "./page";

vi.mock("next/headers", () => import("../../../../test/next-headers"));

const PROJECT_FORM = {
  ...emptyOpportunityForm(),
  type: "project" as const,
  title: "Volunteer legal researcher",
  org: "PauseAI",
  summary: "A short summary.",
  description: "A longer description.",
  locationCountry: "GLOBAL",
  remote: true,
  applyUrl: "https://example.com/join",
};
const SLUG = "pauseai-volunteer-legal-researcher";

const ROW = {
  slug: SLUG,
  type: "project" as const,
  title: PROJECT_FORM.title,
  org: PROJECT_FORM.org,
  summary: PROJECT_FORM.summary,
  description: PROJECT_FORM.description,
  locationCountry: "GLOBAL",
  remote: true,
  rolling: true,
  applyUrl: "mailto:join@pauseai.info",
  publishedAt: "2026-11-01",
  createdBy: "admin@example.com",
};

/** Date inputs take a whole value at once, as a browser's date picker sets it. */
const setDate = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

beforeEach(async () => {
  cookieJar.reset();
  await db.delete(adminSessions);
  await db.delete(opportunitiesAuditLog);
  await db.delete(opportunities);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
  await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
});

describe("rolling applications and email apply links in the admin form", () => {
  it("creates a rolling listing applied to by email, leaving out the deadline typed before ticking rolling", async () => {
    render(<NewOpportunityForm initial={PROJECT_FORM} />);
    const deadline = screen.getByLabelText("Deadline");
    setDate(deadline, "2026-12-01");
    await userEvent.click(screen.getByLabelText("Rolling applications (no deadline)"));
    expect(deadline).toBeDisabled();
    expect(deadline).toHaveValue("");
    const apply = screen.getByLabelText("Apply link or email");
    await userEvent.clear(apply);
    await userEvent.type(apply, "join@pauseai.info");
    await userEvent.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(await screen.findByText(/live now/)).toBeInTheDocument();
    expect(await getOpportunityBySlug(SLUG)).toMatchObject({
      rolling: true,
      deadline: undefined,
      applyUrl: "mailto:join@pauseai.info",
    });
  });

  it("keeps a deadline typed before rolling was ticked, for when it is turned off again", async () => {
    render(<NewOpportunityForm initial={PROJECT_FORM} />);
    setDate(screen.getByLabelText("Deadline"), "2026-12-01");
    const rolling = screen.getByLabelText("Rolling applications (no deadline)");
    await userEvent.click(rolling);
    await userEvent.click(rolling);
    expect(screen.getByLabelText("Deadline")).toHaveValue("2026-12-01");
  });

  it("shows a rolling listing's email as just the address, and turns rolling off for a deadline", async () => {
    await db.insert(opportunities).values(ROW);
    render(<EditOpportunityForm opportunity={(await getOpportunityBySlug(SLUG))!} />);
    expect(screen.getByLabelText("Apply link or email")).toHaveValue("join@pauseai.info");
    const rolling = screen.getByLabelText("Rolling applications (no deadline)");
    expect(rolling).toBeChecked();
    await userEvent.click(rolling);
    setDate(screen.getByLabelText("Deadline"), "2026-12-01");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/Saved/)).toBeInTheDocument();
    expect(await getOpportunityBySlug(SLUG)).toMatchObject({
      rolling: undefined,
      deadline: "2026-12-01",
      applyUrl: "mailto:join@pauseai.info",
    });
  });

  it("leaves rounds' deadlines out while rolling, each round closing on its start", async () => {
    const rounds = [roundForm({ startDate: "2027-01-10" }), roundForm({ deadline: "2027-03-01", startDate: "2027-04-10" })];
    render(<NewOpportunityForm initial={{ ...PROJECT_FORM, type: "course", rounds }} />);
    const second = within(screen.getByRole("group", { name: "Round 2" }));
    expect(second.getByLabelText("Deadline")).toHaveValue("2027-03-01");
    await userEvent.click(screen.getByLabelText("Rolling enrolment (no deadline)"));
    expect(second.getByLabelText("Deadline")).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(await screen.findByText(/live now/)).toBeInTheDocument();
    expect(await getOpportunityBySlug(SLUG)).toMatchObject({
      rolling: true,
      rounds: [{ startDate: "2027-01-10" }, { startDate: "2027-04-10" }],
    });
  });

  it("refuses an apply link that is neither a web address nor an email address, and saves nothing", async () => {
    render(<NewOpportunityForm initial={{ ...PROJECT_FORM, applyUrl: "pauseai.info/join" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Create opportunity" }));
    expect(await screen.findByText("Apply link must be a web address (http:// or https://) or an email address")).toBeInTheDocument();
    expect(await db.select().from(opportunities)).toEqual([]);
  });

  it("notes a rolling listing in the admin list", async () => {
    await db.insert(opportunities).values(ROW);
    render(await OpportunitiesListPage());
    expect(screen.getByText(/Project · PauseAI · Rolling/)).toBeInTheDocument();
  });
});
