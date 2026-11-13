import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Opportunity } from "@/opportunities/types";
import OpportunityCard from "./OpportunityCard";

const job: Opportunity = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "a-job",
  type: "job",
  title: "Senior Thing",
  org: "Acme Org",
  summary: "Do the thing.",
  description: "Body.",
  locationCountry: "GLOBAL",
  remote: true,
  commitment: "full_time",
  compMin: 90_000,
  compCurrency: "GBP",
  compPeriod: "year",
  deadline: "2026-10-30",
  applyUrl: "https://example.com/apply",
  status: "published",
  publishedAt: "2026-01-01",
};

const course: Opportunity = {
  id: "00000000-0000-0000-0000-000000000002",
  slug: "a-course",
  type: "course",
  title: "Intro to Things",
  org: "Acme Institute",
  summary: "Learn the thing.",
  description: "Body.",
  locationCountry: "GLOBAL",
  remote: true,
  applyUrl: "https://example.com/course",
  status: "published",
  publishedAt: "2026-01-01",
};

describe("OpportunityCard", () => {
  it("shows a job's title, org, type, compensation and deadline, linking to its detail page", () => {
    render(<OpportunityCard opportunity={job} now={new Date("2026-10-01")} />);
    expect(screen.getByText("Senior Thing")).toBeInTheDocument();
    expect(screen.getByText("Acme Org")).toBeInTheDocument();
    expect(screen.getByText("Job")).toBeInTheDocument();
    expect(screen.getByText(/£90,000/)).toBeInTheDocument();
    expect(screen.getByText(/Apply by 30 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/opportunities/a-job");
  });

  it("renders a course with no compensation or deadline without showing either", () => {
    render(<OpportunityCard opportunity={course} />);
    expect(screen.getByText("Course")).toBeInTheDocument();
    expect(screen.queryByText(/Apply by/)).not.toBeInTheDocument();
  });

  it("shows an event's dates and registration deadline", () => {
    render(
      <OpportunityCard
        opportunity={{ ...course, type: "event", startDate: "2026-11-20", endDate: "2026-11-21", deadline: "2026-11-10" }}
        now={new Date("2026-10-01")}
      />,
    );
    expect(screen.getByText("Event")).toBeInTheDocument();
    expect(screen.getByText(/20 Nov 2026 – 21 Nov 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Deadline 10 Nov 2026/)).toBeInTheDocument();
  });

  it("says a rolling listing has no deadline, worded for its kind", () => {
    const { unmount } = render(<OpportunityCard opportunity={{ ...job, deadline: undefined, rolling: true }} />);
    expect(screen.getByText("Rolling applications")).toBeInTheDocument();
    unmount();
    render(<OpportunityCard opportunity={{ ...course, rolling: true, startDate: "2026-10-10" }} now={new Date("2026-10-01")} />);
    expect(screen.getByText("Coming up · Rolling enrolment")).toBeInTheDocument();
  });

  it("flags an event with no deadline as coming up when its date is near", () => {
    render(<OpportunityCard opportunity={{ ...course, type: "event", startDate: "2026-10-10" }} now={new Date("2026-10-01")} />);
    expect(screen.getByText("Coming up")).toBeInTheDocument();
  });

  it("flags nothing for an event with no deadline whose date is far off", () => {
    render(<OpportunityCard opportunity={{ ...course, type: "event", startDate: "2026-12-10" }} now={new Date("2026-10-01")} />);
    expect(screen.queryByText("Coming up")).not.toBeInTheDocument();
  });

  it("flags a deadline within 30 days as closing soon", () => {
    render(<OpportunityCard opportunity={job} now={new Date("2026-10-25")} />);
    expect(screen.getByText("Closing soon · Apply by 30 Oct 2026")).toBeInTheDocument();
  });

  it("shows a course's start date, which it closes on with no deadline", () => {
    render(<OpportunityCard opportunity={{ ...course, startDate: "2026-12-01" }} now={new Date("2026-10-01T12:00:00Z")} />);
    expect(screen.getByText(/Starts 1 Dec 2026/)).toBeInTheDocument();
  });

  describe("with rounds", () => {
    const rounds: Opportunity = {
      ...course,
      rounds: [
        { label: "Round 1", deadline: "2026-11-15", startDate: "2026-11-23", endDate: "2027-01-17" },
        { label: "Round 2", deadline: "2026-12-06", startDate: "2026-12-14", endDate: "2027-02-07" },
        { label: "Round 3", deadline: "2026-12-27", startDate: "2027-01-04", endDate: "2027-02-28" },
      ],
    };

    it("shows the next round, and how many more are open", () => {
      render(<OpportunityCard opportunity={rounds} now={new Date("2026-10-01T12:00:00Z")} />);
      expect(screen.getByText(/Round 1 · Starts 23 Nov 2026/)).toBeInTheDocument();
      expect(screen.getByText("Enrol by 15 Nov 2026 · +2 more rounds")).toBeInTheDocument();
    });

    it("moves on to the next round once one has closed", () => {
      render(<OpportunityCard opportunity={rounds} now={new Date("2026-11-20T12:00:00Z")} />);
      expect(screen.getByText(/Round 2 · Starts 14 Dec 2026/)).toBeInTheDocument();
      expect(screen.getByText("Closing soon · Enrol by 6 Dec 2026 · +1 more round")).toBeInTheDocument();
    });

    it("hints at more rounds when the round shown has no deadline", () => {
      const undated: Opportunity = { ...course, type: "job", rounds: [{ startDate: "2027-01-01" }, { startDate: "2027-06-01" }] };
      render(<OpportunityCard opportunity={undated} now={new Date("2026-10-01T12:00:00Z")} />);
      expect(screen.getByText("+1 more round")).toBeInTheDocument();
    });

    it("flags a course round with no deadline as coming up when it starts soon", () => {
      const undated: Opportunity = { ...course, rounds: [{ startDate: "2026-10-10" }, { startDate: "2027-06-01" }] };
      render(<OpportunityCard opportunity={undated} now={new Date("2026-10-01T12:00:00Z")} />);
      expect(screen.getByText("Coming up · +1 more round")).toBeInTheDocument();
    });

    it("shows an event round's dates", () => {
      const event: Opportunity = { ...course, type: "event", rounds: [{ label: "Berlin", startDate: "2026-12-10", endDate: "2026-12-11" }] };
      render(<OpportunityCard opportunity={event} now={new Date("2026-10-01T12:00:00Z")} />);
      expect(screen.getByText(/Berlin · 10 Dec 2026 – 11 Dec 2026/)).toBeInTheDocument();
    });
  });
});
