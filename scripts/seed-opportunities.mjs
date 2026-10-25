// Seeds the real listings that used to be the step-1 fixture content, for local UI review only.
// Run by hand (`node scripts/seed-opportunities.mjs`) - not wired into any npm script, same as
// `scripts/seed-task-tracker.mjs`.
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";

const { Client } = pg;

const ENV_FILE = ".env.local";

function loadEnvFile(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    env[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
  }
  return env;
}

if (existsSync(ENV_FILE)) {
  const envVars = loadEnvFile(ENV_FILE);
  for (const [key, value] of Object.entries(envVars)) {
    if (!(key in process.env)) process.env[key] = value;
  }
}

if (!process.env.DATABASE_URL) {
  console.error(`\nDATABASE_URL not set and not found in ${ENV_FILE}. Run "npm run db:up" first.\n`);
  process.exit(1);
}

const SEEDER = "seed@local.dev";

// Fixed UUIDs so re-running is idempotent (delete-then-insert, same ids).
const OPPORTUNITIES = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    slug: "princint-senior-compliance-legal-operations-manager",
    type: "job",
    title: "Senior Compliance & Legal Operations Manager",
    org: "Principles of Intelligence (PrincInt)",
    orgUrl: "https://princint.ai",
    summary: "Oversee legal and regulatory compliance across PrincInt's US and UK charities and the AI safety projects it fiscally sponsors.",
    description:
      "PrincInt is hiring a senior manager to oversee legal and regulatory compliance across its US and UK charities and the AI safety projects it fiscally sponsors.\n\nResponsibilities include drafting and negotiating contracts, building organisational policies, running the data protection programme, ensuring grant funds are spent as agreed, and managing a junior compliance associate alongside external advisers.\n\nThe role is remote, with at least two hours of overlap with US West Coast and European time zones, and includes two weeks of in-person onboarding in Belgrade, Serbia, at the start of employment. London-based candidates may be eligible for UK Skilled Worker visa sponsorship.",
    locationCountry: "GLOBAL",
    locationCity: null,
    locationNote: "Min. 2hr overlap with US-West and EU; 2-week in-person onboarding in Belgrade, Serbia",
    remote: true,
    commitment: "full_time",
    compMin: 100000,
    compMax: 125000,
    compCurrency: "GBP",
    compPeriod: "year",
    compNote: "London-based; benchmarked locally elsewhere",
    deadline: "2026-10-30",
    startDate: "2026-11-15",
    endDate: null,
    tags: ["Compliance", "Legal operations", "Nonprofit management"],
    applyUrl: "https://docs.google.com/forms/d/e/1FAIpQLSeQzwNbPha28IgDs2c2M9pAfeubSQbQRYZM_Yj_SI2QtfM0iw/viewform",
    applyLabel: "Apply now",
    sourceUrl: "https://princint.ai/now-hiring-senior-compliance-operations-manager-at-principles-of-intelligence/",
    publishedAt: "2026-10-21",
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    slug: "lawai-summer-research-fellowship",
    type: "fellowship",
    title: "Summer Research Fellowship (Legal Frontiers)",
    org: "Institute for Law & AI (LawAI)",
    orgUrl: "https://law-ai.org",
    summary: "A paid fellowship for law students, professionals and academics to research law-following AI and automated governance alongside LawAI's Legal Frontiers team.",
    description:
      "The Institute for Law & AI's Summer Research Fellowship (Legal Frontiers) is a paid programme that offers law students, professionals and academics the opportunity to work at the leading edge of AI, law and policy.\n\nThe Legal Frontiers team focuses primarily on Law-Following AI and Automated Governance and the Rule of Law, and welcomes fellows who can apply novel methodological or interdisciplinary approaches — originalism, empirical legal studies, law and economics, legal history, and comparative legal studies among them.\n\nFellows collaborate with an assigned mentor on a project tailored to their experience and interests, from a single extended piece of writing to contributing to ongoing LawAI research and advisory work. The fellowship is remote-first, running ten weeks with a Convening Week in Washington, DC, plus admission to LawAI's Workshop on Law-Following AI in Cambridge, UK, with travel expenses covered for both.",
    locationCountry: "GLOBAL",
    locationCity: null,
    locationNote: "In-person Convening Week in Washington, DC",
    remote: true,
    commitment: "fellowship",
    compMin: 1800,
    compMax: 1800,
    compCurrency: "USD",
    compPeriod: "week",
    compNote: "US-based; £1,000/week for EU/UK-based; higher for exceptional candidates",
    deadline: "2027-01-29",
    startDate: "2027-06-14",
    endDate: "2027-08-20",
    tags: ["Fellowship", "AI governance", "Legal research"],
    applyUrl: "https://law-ai.org/srf-lf/",
    applyLabel: "Apply now",
    sourceUrl: "https://law-ai.org/srf-lf/",
    publishedAt: "2026-10-21",
  },
];

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const ids = OPPORTUNITIES.map((o) => o.id);
await client.query("DELETE FROM opportunities WHERE id = ANY($1)", [ids]);

for (const o of OPPORTUNITIES) {
  await client.query(
    `INSERT INTO opportunities (
      id, slug, type, title, org, org_url, summary, description,
      location_country, location_city, location_note, remote,
      commitment, comp_min, comp_max, comp_currency, comp_period, comp_note,
      deadline, start_date, end_date, tags, apply_url,
      apply_label, source_url, published_at, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
    [
      o.id,
      o.slug,
      o.type,
      o.title,
      o.org,
      o.orgUrl,
      o.summary,
      o.description,
      o.locationCountry,
      o.locationCity,
      o.locationNote,
      o.remote,
      o.commitment,
      o.compMin,
      o.compMax,
      o.compCurrency,
      o.compPeriod,
      o.compNote,
      o.deadline,
      o.startDate,
      o.endDate,
      JSON.stringify(o.tags ?? []),
      o.applyUrl,
      o.applyLabel,
      o.sourceUrl,
      o.publishedAt,
      SEEDER,
    ],
  );
}

await client.end();

console.log(`Seeded ${OPPORTUNITIES.length} opportunities.`);
