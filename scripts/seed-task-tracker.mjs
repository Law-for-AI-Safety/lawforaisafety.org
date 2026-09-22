// Seeds two realistic project/task structures into the task tracker, for
// local UI review only — content is placeholder, shape is what matters
// (mixed statuses, dependencies, a blocked reason, past + future dates).
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
const PROJECTS = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Volunteer intake & vetting policy",
    description: "Define and publish the criteria used to vet new volunteer applicants.",
    ownerEmail: "alice@example.com",
    status: "in_progress",
    plannedStart: "2026-09-01",
    plannedEnd: "2026-10-10",
    actualStart: "2026-09-02",
    actualEnd: null,
    tasks: [
      {
        id: "10000000-0000-4000-8000-000000000101",
        name: "Draft vetting criteria",
        description: "First pass at credential/verification tiers.",
        resourceLinks: ["https://docs.google.com/document/d/example-vetting-draft"],
        assigneeEmail: "alice@example.com",
        status: "done",
        blockedReason: null,
        plannedStart: "2026-09-01",
        plannedEnd: "2026-09-08",
        actualStart: "2026-09-01",
        actualEnd: "2026-09-07",
        notes: "Reused structure from the 2025 review.",
        dependsOn: [],
      },
      {
        id: "10000000-0000-4000-8000-000000000102",
        name: "Legal review of vetting criteria",
        description: "Check criteria don't create discrimination risk.",
        resourceLinks: [],
        assigneeEmail: "ben@example.com",
        status: "in_progress",
        blockedReason: null,
        plannedStart: "2026-09-08",
        plannedEnd: "2026-09-19",
        actualStart: "2026-09-09",
        actualEnd: null,
        notes: null,
        dependsOn: ["10000000-0000-4000-8000-000000000101"],
      },
      {
        id: "10000000-0000-4000-8000-000000000103",
        name: "Publish policy to volunteers",
        description: "Share the finished policy in the volunteer Slack + wiki.",
        resourceLinks: [],
        assigneeEmail: null,
        status: "draft",
        blockedReason: null,
        plannedStart: "2026-09-22",
        plannedEnd: "2026-09-26",
        actualStart: null,
        actualEnd: null,
        notes: null,
        dependsOn: ["10000000-0000-4000-8000-000000000102"],
      },
      {
        id: "10000000-0000-4000-8000-000000000104",
        name: "Update onboarding form",
        description: "Add the new vetting-tier question to the intake form.",
        resourceLinks: ["https://forms.gle/example-onboarding"],
        assigneeEmail: "cara@example.com",
        status: "blocked",
        blockedReason: "Waiting on IT to grant edit access to the Google Form.",
        plannedStart: "2026-09-15",
        plannedEnd: "2026-09-20",
        actualStart: null,
        actualEnd: null,
        notes: null,
        dependsOn: [],
      },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Slack data retention policy",
    description: "Decide and document how long volunteer Slack history is kept.",
    ownerEmail: "dan@example.com",
    status: "blocked",
    plannedStart: "2026-08-15",
    plannedEnd: "2026-09-30",
    actualStart: "2026-08-18",
    actualEnd: null,
    tasks: [
      {
        id: "10000000-0000-4000-8000-000000000201",
        name: "Audit current Slack retention settings",
        description: "Confirm what's actually configured today vs. assumed.",
        resourceLinks: [],
        assigneeEmail: "dan@example.com",
        status: "done",
        blockedReason: null,
        plannedStart: "2026-08-15",
        plannedEnd: "2026-08-20",
        actualStart: "2026-08-18",
        actualEnd: "2026-08-19",
        notes: "Default retention was 90 days, not unlimited as assumed.",
        dependsOn: [],
      },
      {
        id: "10000000-0000-4000-8000-000000000202",
        name: "Draft retention policy",
        description: null,
        resourceLinks: ["https://docs.google.com/document/d/example-retention-draft"],
        assigneeEmail: "erin@example.com",
        status: "done",
        blockedReason: null,
        plannedStart: "2026-08-20",
        plannedEnd: "2026-08-29",
        actualStart: "2026-08-20",
        actualEnd: "2026-09-02",
        notes: null,
        dependsOn: ["10000000-0000-4000-8000-000000000201"],
      },
      {
        id: "10000000-0000-4000-8000-000000000203",
        name: "Get DPO sign-off",
        description: "Formal sign-off before this becomes policy.",
        resourceLinks: [],
        assigneeEmail: "finn@example.com",
        status: "blocked",
        blockedReason: "DPO is on leave until 2026-09-29.",
        plannedStart: "2026-09-02",
        plannedEnd: "2026-09-09",
        actualStart: null,
        actualEnd: null,
        notes: null,
        dependsOn: ["10000000-0000-4000-8000-000000000202"],
      },
      {
        id: "10000000-0000-4000-8000-000000000204",
        name: "Publish & announce policy",
        description: null,
        resourceLinks: [],
        assigneeEmail: null,
        status: "draft",
        blockedReason: null,
        plannedStart: "2026-09-29",
        plannedEnd: "2026-09-30",
        actualStart: null,
        actualEnd: null,
        notes: null,
        dependsOn: ["10000000-0000-4000-8000-000000000203"],
      },
      {
        id: "10000000-0000-4000-8000-000000000205",
        name: "Update privacy policy references",
        description: "Originally scoped here, moved to the separate privacy policy workstream.",
        resourceLinks: [],
        assigneeEmail: null,
        status: "cancelled",
        blockedReason: null,
        plannedStart: null,
        plannedEnd: null,
        actualStart: null,
        actualEnd: null,
        notes: "Superseded — see the privacy policy project instead.",
        dependsOn: [],
      },
    ],
  },
];

/*
 * Some of the seeded work is handed to whoever is logged in locally, so the
 * "Your work" page has something in every group (overdue, blocked, due soon,
 * later) instead of being empty. Taken from the environment — never
 * hardcoded — so no one's address ends up in this public repo:
 * SEED_ASSIGNEE if set, otherwise the first entry in ADMIN_EMAILS.
 */
const ME = (process.env.SEED_ASSIGNEE ?? (process.env.ADMIN_EMAILS ?? "").split(",")[0] ?? "")
  .trim()
  .toLowerCase();
const MY_NAME = process.env.SEED_ASSIGNEE_NAME ?? "You (local admin)";
const MY_TASK_IDS = [
  "10000000-0000-4000-8000-000000000102", // overdue, in progress
  "10000000-0000-4000-8000-000000000104", // overdue, blocked
  "10000000-0000-4000-8000-000000000103", // due this week, draft
  "10000000-0000-4000-8000-000000000204", // due later, draft
  "10000000-0000-4000-8000-000000000201", // already done
];
const MY_PROJECT_ID = "10000000-0000-4000-8000-000000000001";

if (ME) {
  for (const project of PROJECTS) {
    if (project.id === MY_PROJECT_ID) project.ownerEmail = ME;
    for (const task of project.tasks) {
      if (MY_TASK_IDS.includes(task.id)) task.assigneeEmail = ME;
    }
  }
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const projectIds = PROJECTS.map((p) => p.id);
const taskIds = PROJECTS.flatMap((p) => p.tasks.map((t) => t.id));

// Display names for the seeded assignees/owners. Real ones arrive from the
// OAuth profile at login; these exist so the name pickers have something to
// show locally.
const PEOPLE = [
  ["alice@example.com", "Alice Nkemdirim"],
  ["ben@example.com", "Ben Okafor"],
  ["cara@example.com", "Cara Whitfield"],
  ["dan@example.com", "Dan Alvarez"],
  ["erin@example.com", "Erin Shah"],
  ["finn@example.com", "Finn Doherty"],
];
for (const [email, name] of PEOPLE) {
  await client.query(
    "INSERT INTO admin_people (email, name) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name",
    [email, name],
  );
}

// A placeholder name only until this person logs in — DO NOTHING so a
// re-seed never overwrites the real name their OAuth profile provided.
if (ME) {
  await client.query(
    "INSERT INTO admin_people (email, name) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING",
    [ME, MY_NAME],
  );
}

await client.query("DELETE FROM task_tracker_task_dependencies WHERE task_id = ANY($1)", [taskIds]);
await client.query("DELETE FROM task_tracker_tasks WHERE id = ANY($1)", [taskIds]);
await client.query("DELETE FROM task_tracker_projects WHERE id = ANY($1)", [projectIds]);

for (const project of PROJECTS) {
  await client.query(
    `INSERT INTO task_tracker_projects (
      id, name, description, owner_email, status,
      planned_start, planned_end, actual_start, actual_end, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      project.id,
      project.name,
      project.description,
      project.ownerEmail,
      project.status,
      project.plannedStart,
      project.plannedEnd,
      project.actualStart,
      project.actualEnd,
      SEEDER,
    ],
  );

  for (const task of project.tasks) {
    await client.query(
      `INSERT INTO task_tracker_tasks (
        id, project_id, name, description, resource_links, assignee_email,
        status, blocked_reason, planned_start, planned_end, actual_start,
        actual_end, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        task.id,
        project.id,
        task.name,
        task.description,
        JSON.stringify(task.resourceLinks),
        task.assigneeEmail,
        task.status,
        task.blockedReason,
        task.plannedStart,
        task.plannedEnd,
        task.actualStart,
        task.actualEnd,
        task.notes,
        SEEDER,
      ],
    );
  }

  for (const task of project.tasks) {
    for (const dependsOnTaskId of task.dependsOn) {
      await client.query(
        `INSERT INTO task_tracker_task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)`,
        [task.id, dependsOnTaskId],
      );
    }
  }
}

await client.end();

const taskCount = PROJECTS.reduce((sum, p) => sum + p.tasks.length, 0);
console.log(`Seeded ${PROJECTS.length} projects and ${taskCount} tasks into the task tracker.`);
