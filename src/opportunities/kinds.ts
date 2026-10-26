/**
 * Every kind of listing the board takes, and the wording each one is shown with. Client-safe, so
 * the board, the detail page and the admin form all read their labels from here. Adding a kind:
 * add it below and to the `opportunity_type` enum in `src/drizzle/schema.ts`, then generate a
 * migration.
 */
export const OPPORTUNITY_TYPES = ["job", "fellowship", "project", "course", "event"] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

type Kind = {
  label: string;
  plural: string;
  badge: string;
  /** The call to action, unless a listing sets its own `applyLabel`. */
  applyLabel: string;
  deadlineLabel: string;
  startLabel: string;
  endLabel: string;
  /** Shown in place of the call to action once the listing has closed. */
  closedLabel: string;
};

export const OPPORTUNITY_KINDS: Record<OpportunityType, Kind> = {
  job: {
    label: "Job",
    plural: "Jobs",
    badge: "bg-brand-red text-brand-white",
    applyLabel: "Apply now",
    deadlineLabel: "Apply by",
    startLabel: "Start date",
    endLabel: "End date",
    closedLabel: "Applications closed on",
  },
  fellowship: {
    label: "Fellowship",
    plural: "Fellowships",
    badge: "border border-brand-red text-brand-red",
    applyLabel: "Apply now",
    deadlineLabel: "Apply by",
    startLabel: "Starts",
    endLabel: "Ends",
    closedLabel: "Applications closed on",
  },
  project: {
    label: "Project",
    plural: "Projects",
    badge: "border border-brand-navy text-brand-navy",
    applyLabel: "Get involved",
    deadlineLabel: "Apply by",
    startLabel: "Starts",
    endLabel: "Ends",
    closedLabel: "Applications closed on",
  },
  course: {
    label: "Course",
    plural: "Courses",
    badge: "bg-brand-navy text-brand-white",
    applyLabel: "View course",
    deadlineLabel: "Enrol by",
    startLabel: "Starts",
    endLabel: "Ends",
    closedLabel: "Enrolment closed on",
  },
  event: {
    label: "Event",
    plural: "Events",
    badge: "bg-brand-black text-brand-white",
    applyLabel: "Register",
    deadlineLabel: "Register by",
    startLabel: "Date",
    endLabel: "Until",
    closedLabel: "Registration closed on",
  },
};
