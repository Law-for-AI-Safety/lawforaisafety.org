// Client-safe (no server imports) so the apply form and admin components can
// share it. This is the one place each public apply page is described: its
// identifier (stored as applications.source), what it's for, which audience it
// takes, and the form copy it shows. The server takes purpose and labels from
// here, and the form takes its copy from here.
//
// Adding a page: add an entry below, add its id to the `application_source`
// enum in src/drizzle/schema.ts, and generate a migration.

export const APPLICATION_AUDIENCES = ["individual", "organisation"] as const;
export type ApplicationAudience = (typeof APPLICATION_AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<ApplicationAudience, string> = {
  individual: "Individual",
  organisation: "Organisation",
};

export type AudienceCopy = {
  heading: string;
  organisationLabel: string;
  statementTabLabel: string;
  statementLabel: string;
  statementPlaceholder: string;
  commentsPlaceholder: string;
  validationMessage: string;
};

type PageBase = { label: string; purpose: string; path: string };

/** The page only ever takes one audience. */
type FixedAudiencePage = PageBase & {
  audience: ApplicationAudience;
  copy: AudienceCopy;
};

/** The page asks the applicant which audience they are, then shows that audience's copy. */
type ChoiceAudiencePage = PageBase & {
  audience: "choice";
  copy: Record<ApplicationAudience, AudienceCopy>;
};

export type ApplyPage = FixedAudiencePage | ChoiceAudiencePage;

const ORGANISATION_STATEMENT: Omit<AudienceCopy, "validationMessage"> = {
  heading: "Tell us about your organisation",
  organisationLabel: "Organisation name",
  statementTabLabel: "Tell us more",
  statementLabel: "How would you like to support this work?",
  statementPlaceholder:
    "Funding, partnership, in-kind support, or something else. Tell us what you have in mind",
  commentsPlaceholder: "Anything else about funding, partnership, or timing we should know",
};

const ORGANISATION_VALIDATION = "Provide a LinkedIn profile URL or a short statement.";

export const APPLY_PAGES = {
  homepage: {
    label: "Homepage",
    purpose: "General volunteer or enquiry",
    path: "/",
    audience: "individual",
    copy: {
      heading: "Show your credentials",
      organisationLabel: "Organisation / firm (optional)",
      statementTabLabel: "Position statement",
      statementLabel: "Position statement",
      statementPlaceholder: "Describe your current role and why you're relevant",
      commentsPlaceholder: "Anything else you'd like us to know",
      validationMessage:
        "Provide at least one of: LinkedIn profile URL, CV upload, or a position statement.",
    },
  },

  mep_outreach: {
    label: "MEP Outreach",
    purpose: "Funding or partnership for MEP briefings",
    path: "/mep-outreach",
    audience: "organisation",
    copy: { ...ORGANISATION_STATEMENT, validationMessage: ORGANISATION_VALIDATION },
  },

  council_of_europe: {
    label: "Council of Europe Engagement",
    purpose: "Funding or partnership for Council of Europe work",
    path: "/council-of-europe",
    audience: "organisation",
    copy: { ...ORGANISATION_STATEMENT, validationMessage: ORGANISATION_VALIDATION },
  },

  field_building: {
    label: "Field-building and Coordination",
    purpose: "Volunteering, research, or funding for field-building",
    path: "/field-building",
    audience: "choice",
    copy: {
      individual: {
        heading: "Tell us about you",
        organisationLabel: "Organisation / firm (optional)",
        statementTabLabel: "About you",
        statementLabel: "Tell us about yourself",
        statementPlaceholder:
          "Your background, and anything that helps us understand who you are",
        commentsPlaceholder:
          "What would you like to help with? For example, a meet-up, contributing research, funding this work, or starting something similar elsewhere",
        validationMessage:
          "Provide at least one of: LinkedIn profile URL, CV upload, or a short statement about yourself.",
      },
      organisation: {
        ...ORGANISATION_STATEMENT,
        commentsPlaceholder:
          "What would you like to help with? For example, a meet-up, contributing research, funding this work, or starting something similar elsewhere",
        validationMessage: ORGANISATION_VALIDATION,
      },
    },
  },
} satisfies Record<string, ApplyPage>;

export type ApplicationSource = keyof typeof APPLY_PAGES;
export const APPLICATION_SOURCES = Object.keys(APPLY_PAGES) as ApplicationSource[];

export function purposeFor(source: ApplicationSource): string {
  return APPLY_PAGES[source].purpose;
}

/** The audience to store. A fixed page always stores its own audience, whatever the browser posted. */
export function resolveAudience(
  source: ApplicationSource,
  chosen: string | null,
): ApplicationAudience {
  const page = APPLY_PAGES[source];
  if (page.audience !== "choice") return page.audience;
  return chosen === "organisation" ? "organisation" : "individual";
}

export function appliedVia(source: ApplicationSource, audience: ApplicationAudience): string {
  return `${APPLY_PAGES[source].label}, ${AUDIENCE_LABELS[audience].toLowerCase()}`;
}
