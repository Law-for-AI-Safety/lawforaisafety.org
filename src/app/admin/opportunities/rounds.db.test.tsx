import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions, opportunities, opportunitiesAuditLog } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { startAdminSession } from "@/lib/session";
import { getOpportunityBySlug } from "@/opportunities/data";
import { cookieJar } from "../../../../test/next-headers";
import EditOpportunityForm from "./[slug]/EditOpportunityForm";
import NewOpportunityForm from "./new/NewOpportunityForm";
import { emptyOpportunityForm, roundForm } from "./OpportunityFields";
import OpportunitiesListPage from "./page";

vi.mock("next/headers", () => import("../../../../test/next-headers"));

const COURSE_FORM = {
  ...emptyOpportunityForm(),
  type: "course" as const,
  title: "Frontier AI Governance",
  org: "BlueDot",
  summary: "A short summary.",
  description: "A longer description.",
  locationCountry: "GLOBAL",
  remote: true,
  applyUrl: "https://example.com/enrol",
};

const DRAFT = {
  slug: "bluedot-frontier-ai-governance",
  type: "course" as const,
  title: "Frontier AI Governance",
  org: "BlueDot",
  summary: "A short summary.",
  description: "A longer description.",
  locationCountry: "GLOBAL",
  remote: true,
  applyUrl: "https://example.com/enrol",
  status: "draft" as const,
  rounds: [
    { label: "Intensive", deadline: "2026-11-15" },
    { label: "Part-time", deadline: "2026-12-06" },
  ],
  createdBy: "admin@example.com",
};

const round = (n: number) => within(screen.getByRole("group", { name: `Round ${n}` }));
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

describe("rounds in the admin form", () => {
  it("splits the dates already entered into the first round, and creates the listing with every round", async () => {
    render(<NewOpportunityForm initial={COURSE_FORM} />);
    setDate(screen.getByLabelText("Enrol by"), "2026-11-15");
    await userEvent.click(screen.getByRole("button", { name: "Runs in several rounds? Add rounds" }));

    // Only the two rounds' own: the listing's single dates are gone.
    expect(screen.getAllByLabelText("Enrol by")).toHaveLength(2);
    expect(round(1).getByLabelText("Enrol by")).toHaveValue("2026-11-15");
    await userEvent.type(round(1).getByLabelText(/^Label/), "Round 1");
    setDate(round(1).getByLabelText("Starts"), "2026-11-23");
    await userEvent.type(round(2).getByLabelText(/^Label/), "Round 2");
    setDate(round(2).getByLabelText("Enrol by"), "2026-12-06");
    await userEvent.click(screen.getByRole("button", { name: "Add round" }));
    await userEvent.type(round(3).getByLabelText(/^Label/), "Round 3");
    setDate(round(3).getByLabelText("Enrol by"), "2026-12-27");
    await userEvent.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(await screen.findByText(/live now/)).toBeInTheDocument();
    expect(await getOpportunityBySlug(DRAFT.slug)).toMatchObject({
      deadline: undefined,
      rounds: [
        { label: "Round 1", deadline: "2026-11-15", startDate: "2026-11-23" },
        { label: "Round 2", deadline: "2026-12-06" },
        { label: "Round 3", deadline: "2026-12-27" },
      ],
    });
  });

  it("saves a draft with rounds", async () => {
    render(<NewOpportunityForm initial={{ ...COURSE_FORM, rounds: [roundForm({ deadline: "2026-11-15" })] }} />);
    await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    expect(await screen.findByText(/draft/i)).toBeInTheDocument();
    expect(await getOpportunityBySlug(DRAFT.slug)).toMatchObject({ status: "draft", rounds: [{ deadline: "2026-11-15" }] });
  });

  it("shows which round is wrong, and saves nothing", async () => {
    render(<NewOpportunityForm initial={COURSE_FORM} />);
    await userEvent.click(screen.getByRole("button", { name: "Runs in several rounds? Add rounds" }));
    setDate(round(1).getByLabelText("Enrol by"), "2026-11-15");
    await userEvent.click(screen.getByRole("button", { name: "Create opportunity" }));
    expect(await screen.findByText("Round 2: A round needs at least one date")).toBeInTheDocument();
    expect(await db.select().from(opportunities)).toEqual([]);
  });

  it("edits a draft's rounds, removing one, and publishes it", async () => {
    await db.insert(opportunities).values(DRAFT);
    render(<EditOpportunityForm opportunity={(await getOpportunityBySlug(DRAFT.slug))!} />);
    expect(round(2).getByLabelText(/^Label/)).toHaveValue("Part-time");
    await userEvent.click(screen.getByRole("button", { name: "Add round" }));
    setDate(round(3).getByLabelText("Enrol by"), "2026-12-27");
    await userEvent.click(round(1).getByRole("button", { name: "Remove round 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByText(/Published and live now/)).toBeInTheDocument();
    expect(await getOpportunityBySlug(DRAFT.slug)).toMatchObject({
      status: "published",
      rounds: [{ label: "Part-time", deadline: "2026-12-06" }, { deadline: "2026-12-27" }],
    });
  });

  it("moves the last round's dates back to the listing's own when it is removed", async () => {
    await db.insert(opportunities).values({ ...DRAFT, rounds: [DRAFT.rounds[0]] });
    render(<EditOpportunityForm opportunity={(await getOpportunityBySlug(DRAFT.slug))!} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove round 1" }));
    expect(screen.queryByRole("group", { name: "Round 1" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Enrol by")).toHaveValue("2026-11-15");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText(/Draft saved/)).toBeInTheDocument();
    expect(await getOpportunityBySlug(DRAFT.slug)).toMatchObject({ deadline: "2026-11-15", rounds: undefined });
  });

  it("shows a draft's rounds in the order they were saved in, soonest closing first", async () => {
    await db.insert(opportunities).values(DRAFT);
    render(<EditOpportunityForm opportunity={(await getOpportunityBySlug(DRAFT.slug))!} />);
    await userEvent.click(screen.getByRole("button", { name: "Add round" }));
    setDate(round(3).getByLabelText("Enrol by"), "2026-11-08");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText(/Draft saved/)).toBeInTheDocument();
    expect(round(1).getByLabelText("Enrol by")).toHaveValue("2026-11-08");
    expect(round(2).getByLabelText(/^Label/)).toHaveValue("Intensive");
    expect((await getOpportunityBySlug(DRAFT.slug))?.rounds?.[0]).toEqual({ deadline: "2026-11-08" });
  });

  it("stops adding rounds at the most a listing may have", async () => {
    const rounds = Array.from({ length: 20 }, () => roundForm({ deadline: "2026-11-15" }));
    render(<NewOpportunityForm initial={{ ...COURSE_FORM, rounds }} />);
    expect(screen.getByRole("button", { name: "Add round" })).toBeDisabled();
  });
});

describe("rounds in the admin list", () => {
  it("shows the next round's deadline and how many rounds there are", async () => {
    await db.insert(opportunities).values({ ...DRAFT, rounds: [{ deadline: "2026-11-01" }, ...DRAFT.rounds] });
    render(await OpportunitiesListPage());
    expect(screen.getByText(/Course · BlueDot · Enrol by 2026-11-15 · 3 rounds/)).toBeInTheDocument();
  });

  it("shows when a round with no deadline closes", async () => {
    await db.insert(opportunities).values({ ...DRAFT, rounds: [{ startDate: "2026-11-20" }, { startDate: "2027-01-10" }] });
    render(await OpportunitiesListPage());
    expect(screen.getByText(/Course · BlueDot · Closes 2026-11-20 · 2 rounds/)).toBeInTheDocument();
  });
});
