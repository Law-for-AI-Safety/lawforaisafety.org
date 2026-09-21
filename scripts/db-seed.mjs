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
      newsletter_opt_in, auth_provider, name, email, picture_url, provider_id, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')`,
    [
      row.id,
      row.organisation ?? null,
      row.linkedinUrl ?? null,
      cvBlobKey,
      row.positionStatement ?? null,
      null,
      row.newsletterOptIn,
      row.authProvider,
      row.name,
      row.email,
      null,
      providerId,
    ],
  );
}

await client.end();

console.log(`Seeded ${ROWS.length} sample applications (3 verification methods x 3 credential types).`);
