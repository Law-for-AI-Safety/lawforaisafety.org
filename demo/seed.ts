import { Client } from 'pg'
import { DEMO_ADMIN } from './data'

// Demo-only data. Same shape as scripts/seed-task-tracker.mjs, but every date
// is relative to the day of recording, so "Overdue", "Due in the next week"
// and the timeline look the same whenever the video is re-recorded.

function daysFromToday(days: number): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const ME = DEMO_ADMIN.email

const PEOPLE: [string, string][] = [
  [ME, DEMO_ADMIN.name],
  ['alice@example.com', 'Alice Nkemdirim'],
  ['ben@example.com', 'Ben Okafor'],
  ['cara@example.com', 'Cara Whitfield'],
  ['dan@example.com', 'Dan Alvarez'],
  ['erin@example.com', 'Erin Shah'],
]

type SeedTask = {
  key: string
  name: string
  description: string | null
  assignee: string | null
  status: string
  blockedReason?: string
  planned: [number, number] | null
  actual?: [number, number | null]
  dependsOn?: string[]
}

type SeedProject = {
  name: string
  description: string
  owner: string
  status: string
  planned: [number, number]
  actualStart: number
  tasks: SeedTask[]
}

const PROJECTS: SeedProject[] = [
  {
    name: 'Volunteer intake & vetting policy',
    description: 'Define and publish the criteria used to vet new volunteer applicants.',
    owner: ME,
    status: 'in_progress',
    planned: [-21, 18],
    actualStart: -20,
    tasks: [
      {
        key: 'draft-criteria',
        name: 'Draft vetting criteria',
        description: 'First pass at credential and verification tiers.',
        assignee: 'alice@example.com',
        status: 'done',
        planned: [-21, -14],
        actual: [-21, -15],
      },
      {
        key: 'legal-review',
        name: 'Legal review of vetting criteria',
        description: "Check the criteria don't create discrimination risk.",
        assignee: ME,
        status: 'in_progress',
        planned: [-14, -3],
        actual: [-13, null],
        dependsOn: ['draft-criteria'],
      },
      {
        key: 'onboarding-form',
        name: 'Update onboarding form',
        description: 'Add the new vetting-tier question to the intake form.',
        assignee: ME,
        status: 'blocked',
        blockedReason: 'Waiting on edit access to the Google Form.',
        planned: [-5, 2],
      },
      {
        key: 'publish-policy',
        name: 'Publish policy to volunteers',
        description: 'Share the finished policy in the volunteer Slack and wiki.',
        assignee: ME,
        status: 'draft',
        planned: [3, 5],
        dependsOn: ['legal-review'],
      },
    ],
  },
  {
    name: 'Slack data retention policy',
    description: 'Decide and document how long volunteer Slack history is kept.',
    owner: 'dan@example.com',
    status: 'blocked',
    planned: [-38, 14],
    actualStart: -35,
    tasks: [
      {
        key: 'audit-slack',
        name: 'Audit current Slack retention settings',
        description: "Confirm what's actually configured today.",
        assignee: 'dan@example.com',
        status: 'done',
        planned: [-38, -33],
        actual: [-35, -34],
      },
      {
        key: 'draft-retention',
        name: 'Draft retention policy',
        description: null,
        assignee: 'erin@example.com',
        status: 'done',
        planned: [-33, -24],
        actual: [-33, -20],
        dependsOn: ['audit-slack'],
      },
      {
        key: 'dpo-signoff',
        name: 'Get DPO sign-off',
        description: 'Formal sign-off before this becomes policy.',
        assignee: 'cara@example.com',
        status: 'blocked',
        blockedReason: 'The DPO is on leave until next week.',
        planned: [-20, 9],
        dependsOn: ['draft-retention'],
      },
      {
        key: 'announce-retention',
        name: 'Publish & announce policy',
        description: null,
        assignee: ME,
        status: 'draft',
        planned: [10, 14],
        dependsOn: ['dpo-signoff'],
      },
    ],
  },
]

export async function seedDemoData(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    for (const [email, name] of PEOPLE) {
      await client.query('INSERT INTO admin_people (email, name) VALUES ($1, $2)', [email, name])
    }

    for (const project of PROJECTS) {
      const {
        rows: [{ id: projectId }],
      } = await client.query(
        `INSERT INTO task_tracker_projects (
          name, description, owner_email, status,
          planned_start, planned_end, actual_start, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          project.name,
          project.description,
          project.owner,
          project.status,
          daysFromToday(project.planned[0]),
          daysFromToday(project.planned[1]),
          daysFromToday(project.actualStart),
          ME,
        ],
      )

      const ids = new Map<string, string>()
      for (const task of project.tasks) {
        const {
          rows: [{ id }],
        } = await client.query(
          `INSERT INTO task_tracker_tasks (
            project_id, name, description, resource_links, assignee_email, status,
            blocked_reason, planned_start, planned_end, actual_start, actual_end, created_by
          ) VALUES ($1, $2, $3, '[]', $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [
            projectId,
            task.name,
            task.description,
            task.assignee,
            task.status,
            task.blockedReason ?? null,
            task.planned && daysFromToday(task.planned[0]),
            task.planned && daysFromToday(task.planned[1]),
            task.actual && daysFromToday(task.actual[0]),
            task.actual?.[1] != null ? daysFromToday(task.actual[1]) : null,
            ME,
          ],
        )
        ids.set(task.key, id)
      }

      for (const task of project.tasks) {
        for (const dependency of task.dependsOn ?? []) {
          await client.query(
            'INSERT INTO task_tracker_task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)',
            [ids.get(task.key), ids.get(dependency)],
          )
        }
      }
    }
  } finally {
    await client.end()
  }
}
