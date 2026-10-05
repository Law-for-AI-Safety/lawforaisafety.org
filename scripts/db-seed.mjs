// Seeds sample pending applications for local testing — one row per
// (verification method x credential type) combination, so every badge/banner
// state in the admin UI is reachable without going through real OAuth.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

// Realistic sample CV (source: scripts/seed-assets/sample-cv.md, rendered to
// PDF via headless Chrome — see that directory for how to regenerate it).
const SAMPLE_PDF = readFileSync(
  join(process.cwd(), "scripts", "seed-assets", "sample-cv.pdf"),
);

const LOCAL_BLOBS_DIR = join(process.cwd(), ".local-blobs", "cvs");

function seedCvBlob(applicationId) {
  const key = `cv/${applicationId}`;
  mkdirSync(LOCAL_BLOBS_DIR, { recursive: true });
  writeFileSync(join(LOCAL_BLOBS_DIR, key.replaceAll("/", "_")), SAMPLE_PDF);
  return key;
}

// Fixed UUIDs so re-running the seed is idempotent (same rows, same CV blob paths).
const ROWS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    authProvider: "linkedin",
    name: "Alice LinkedIn",
    email: "alice.linkedin@example.com",
    organisation: "Alice & Partners LLP",
    linkedinUrl: "https://www.linkedin.com/in/alice-example",
    credential: "linkedinUrl",
    newsletterOptIn: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    authProvider: "linkedin",
    name: "Ben LinkedIn",
    email: "ben.linkedin@example.com",
    organisation: "Ben Legal Chambers",
    credential: "cv",
    newsletterOptIn: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    authProvider: "linkedin",
    name: "Cara LinkedIn",
    email: "cara.linkedin@example.com",
    organisation: "Cara Policy Institute",
    positionStatement:
      "Policy researcher focused on AI governance frameworks across the EU and UK.",
    credential: "positionStatement",
    newsletterOptIn: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    authProvider: "google",
    name: "Dan Google",
    email: "dan.google@example.com",
    organisation: "Dan & Co Solicitors",
    linkedinUrl: "https://www.linkedin.com/in/dan-example",
    credential: "linkedinUrl",
    newsletterOptIn: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    authProvider: "google",
    name: "Erin Google",
    email: "erin.google@example.com",
    organisation: "Erin Legal Group",
    credential: "cv",
    newsletterOptIn: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    authProvider: "google",
    name: "Finn Google",
    email: "finn.google@example.com",
    organisation: "Finn Consulting",
    positionStatement:
      "Barrister specialising in technology regulation, currently advising on AI liability questions.",
    credential: "positionStatement",
    newsletterOptIn: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    authProvider: "email",
    name: "Grace Unverified",
    email: "grace.unverified@example.com",
    organisation: "Grace Independent Practice",
    linkedinUrl: "https://www.linkedin.com/in/grace-example",
    credential: "linkedinUrl",
    newsletterOptIn: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000008",
    authProvider: "email",
    name: "Hank Unverified",
    email: "hank.unverified@example.com",
    organisation: "Hank Law Office",
    credential: "cv",
    newsletterOptIn: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000009",
    authProvider: "email",
    name: "Ivy Unverified",
    email: "ivy.unverified@example.com",
    organisation: "Ivy AI Safety Research",
    positionStatement:
      "Independent AI safety researcher, self-reported credentials only — no LinkedIn or Google account provided.",
    credential: "positionStatement",
    newsletterOptIn: false,
  },
  // One row per public apply form (see src/lib/application-pages.ts).
  // Homepage rows above are source=homepage, individual audience.
  {
    id: "00000000-0000-4000-8000-000000000010",
    source: "mep_outreach",
    audience: "organisation",
    authProvider: "linkedin",
    name: "Maya MEP-Outreach",
    email: "maya.mep@example.com",
    organisation: "Maya Policy Foundation",
    linkedinUrl: "https://www.linkedin.com/in/maya-example",
    positionStatement:
      "We can fund one in-person briefing for MEP staff in Brussels in early 2027 and would like to co-host with your team.",
    comments:
      "Interested in funding the in-person briefings described on the page. Happy to discuss timing around the March 2027 Parliament presentation.",
    credential: "positionStatement",
    newsletterOptIn: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    source: "council_of_europe",
    audience: "organisation",
    authProvider: "email",
    name: "Nadia Council-Partner",
    email: "nadia.coe@example.com",
    organisation: "Judicial Training Institute (example)",
    positionStatement:
      "We run judicial training programmes and could host a segment on AI risk for judges at the Council of Europe conference.",
    comments: "Open to partnering on the conference and sharing training materials.",
    credential: "positionStatement",
    newsletterOptIn: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    source: "field_building",
    audience: "individual",
    authProvider: "google",
    name: "Omar Field-Volunteer",
    email: "omar.field@example.com",
    organisation: null,
    linkedinUrl: "https://www.linkedin.com/in/omar-example",
    positionStatement: "Recently qualified solicitor with an interest in AI liability.",
    comments:
      "Would like to join a meet-up and help with the field directory from mid-October.",
    credential: "linkedinUrl",
    newsletterOptIn: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000013",
    source: "field_building",
    audience: "individual",
    authProvider: "email",
    name: "Priya Field-Researcher",
    email: "priya.field@example.com",
    organisation: "Independent",
    positionStatement:
      "PhD candidate researching access to justice for diffuse harms, with no LinkedIn or CV to share.",
    comments:
      "Interested in the research fellowship and the access-to-justice research area. Also happy to speak at a webinar.",
    credential: "positionStatement",
    newsletterOptIn: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000014",
    source: "field_building",
    audience: "organisation",
    authProvider: "linkedin",
    name: "Sam Field-Funder",
    email: "sam.field@example.com",
    organisation: "Sam Foundation",
    linkedinUrl: "https://www.linkedin.com/in/sam-example",
    positionStatement: "Foundation programme lead for technology governance.",
    comments:
      "Our foundation would like to fund the webinar series or the research fellowship. Please get in touch about terms.",
    credential: "linkedinUrl",
    newsletterOptIn: false,
  },
];

const RED_LINES_ROWS = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    authProvider: "linkedin",
    name: "Rita Red-Lines Expert",
    email: "rita.redlines@example.com",
    areaOfExpertise: "legal_governance",
    motivation: "Working on legal liability for frontier model incidents.",
    affiliation: "Example University",
    publicationExample: "https://example.com/publication",
    linkedinUrl: "https://www.linkedin.com/in/rita-example",
    euParliamentInterest: "yes",
    availableOct12: true,
    availableNov9: true,
    availableDec7: false,
    availableJan11: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    authProvider: "email",
    name: "Tom Red-Lines Technical",
    email: "tom.redlines@example.com",
    areaOfExpertise: "technical",
    motivation: "Evaluation methods for verifying safety claims.",
    affiliation: "Example Lab",
    publicationExample: null,
    linkedinUrl: null,
    euParliamentInterest: "maybe",
    availableOct12: false,
    availableNov9: true,
    availableDec7: true,
    availableJan11: false,
  },
];

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const ids = ROWS.map((row) => row.id);
await client.query("DELETE FROM applications WHERE id = ANY($1)", [ids]);

for (const row of ROWS) {
  const cvBlobKey = row.credential === "cv" ? seedCvBlob(row.id) : null;
  const providerId = row.authProvider === "email" ? row.email : `seed-${row.authProvider}-${row.id}`;

  await client.query(
    `INSERT INTO applications (
      id, organisation, linkedin_url, cv_blob_key, position_statement, comments,
      newsletter_opt_in, auth_provider, name, email, picture_url, provider_id, status, source, audience
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13, $14)`,
    [
      row.id,
      row.organisation ?? null,
      row.linkedinUrl ?? null,
      cvBlobKey,
      row.positionStatement ?? null,
      row.comments ?? null,
      row.newsletterOptIn,
      row.authProvider,
      row.name,
      row.email,
      null,
      providerId,
      row.source ?? "homepage",
      row.audience ?? "individual",
    ],
  );
}

const redLinesIds = RED_LINES_ROWS.map((row) => row.id);
await client.query("DELETE FROM red_lines_applications WHERE id = ANY($1)", [redLinesIds]);

for (const row of RED_LINES_ROWS) {
  const providerId = row.authProvider === "email" ? row.email : `seed-${row.authProvider}-${row.id}`;

  await client.query(
    `INSERT INTO red_lines_applications (
      id, area_of_expertise, motivation, affiliation, publication_example, linkedin_url,
      eu_parliament_interest, available_oct_12, available_nov_9, available_dec_7, available_jan_11,
      auth_provider, name, email, provider_id, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending')`,
    [
      row.id,
      row.areaOfExpertise,
      row.motivation,
      row.affiliation,
      row.publicationExample,
      row.linkedinUrl,
      row.euParliamentInterest,
      row.availableOct12,
      row.availableNov9,
      row.availableDec7,
      row.availableJan11,
      row.authProvider,
      row.name,
      row.email,
      providerId,
    ],
  );
}

await client.end();

console.log(
  `Seeded ${ROWS.length} sample applications (3 verification methods x 3 credential types, plus one per public apply form source) and ${RED_LINES_ROWS.length} Red Lines Dialogues applications.`,
);
