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
  location: "Remote",
  remote: true,
  commitment: "Full-time",
  compensation: "£90,000",
  deadline: "2026-10-30",
  applyUrl: "https://example.com/apply",
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
  location: "Virtual",
  remote: true,
  applyUrl: "https://example.com/course",
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

  it("flags a deadline within 30 days as closing soon", () => {
    render(<OpportunityCard opportunity={job} now={new Date("2026-10-25")} />);
    expect(screen.getByText(/Closing soon/)).toBeInTheDocument();
  });
});
