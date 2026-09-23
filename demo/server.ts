import { execSync, spawn, ChildProcess } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { Client } from 'pg'
import { DEMO_PORT, BASE_URL, DEMO_DB_NAME, DEMO_ADMIN } from './data'
import { seedDemoData } from './seed'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const NEXT_BINARY = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'next')
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local')

// Throwaway per run: the demo server trusts only cookies minted by this process.
export const DEMO_SESSION_SECRET = crypto.randomBytes(32).toString('hex')

let demoServer: ChildProcess | null = null

function readEnvFileValue(key: string): string | undefined {
  if (!fs.existsSync(ENV_FILE)) return undefined
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith(`${key}=`)) return trimmed.slice(key.length + 1).trim()
  }
  return undefined
}

/** The local Docker Postgres from `npm run dev`, pointed at a separate database. */
function demoDatabaseUrl(): { demo: string; admin: string } {
  const base = process.env.DATABASE_URL ?? readEnvFileValue('DATABASE_URL')
  if (!base) throw new Error('DATABASE_URL not found in the environment or .env.local')
  const demo = new URL(base)
  if (!['localhost', '127.0.0.1'].includes(demo.hostname)) {
    // Dropping and recreating a database is only ever safe on your own machine.
    throw new Error(`Refusing to create a demo database on non-local host "${demo.hostname}"`)
  }
  demo.pathname = `/${DEMO_DB_NAME}`
  const admin = new URL(demo)
  admin.pathname = '/postgres'
  return { demo: demo.toString(), admin: admin.toString() }
}

export async function buildForDemo(): Promise<void> {
  execSync(`"${NEXT_BINARY}" build`, { cwd: PROJECT_ROOT, stdio: 'inherit' })
}

/** Starts Docker Postgres if needed, then wipes, migrates and seeds the demo database. */
export async function prepareDemoDatabase(): Promise<string> {
  execSync('node scripts/db-ensure.mjs', { cwd: PROJECT_ROOT, stdio: 'pipe' })
  const { demo, admin } = demoDatabaseUrl()

  const client = new Client({ connectionString: admin })
  await client.connect()
  try {
    await client.query(`DROP DATABASE IF EXISTS ${DEMO_DB_NAME} WITH (FORCE)`)
    await client.query(`CREATE DATABASE ${DEMO_DB_NAME}`)
  } finally {
    await client.end()
  }

  execSync('npx drizzle-kit migrate', {
    cwd: PROJECT_ROOT,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: demo },
  })
  await seedDemoData(demo)
  return demo
}

/** Starts `next start` against the demo database. Resolves once it serves pages. */
export async function startDemoServer(databaseUrl: string): Promise<void> {
  try {
    execSync(`lsof -ti :${DEMO_PORT} | xargs kill -TERM 2>/dev/null || true`, {
      shell: '/bin/sh',
    })
  } catch {
    /* nothing listening */
  }

  demoServer = spawn(NEXT_BINARY, ['start', '-p', String(DEMO_PORT)], {
    env: {
      ...process.env,
      PORT: String(DEMO_PORT),
      // Real process env wins over .env.local in Next, so these replace your
      // dev values for this server only.
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: DEMO_SESSION_SECRET,
      ADMIN_EMAILS: DEMO_ADMIN.email,
      TASK_TRACKER_TEAM_EMAILS: DEMO_ADMIN.email,
      TECH_ADMIN_EMAILS: '',
      ADMIN_LINKEDIN_SUBS: '',
      // Nothing recorded should reach a real inbox or Slack channel.
      SLACK_WEBHOOK_URL: '',
      SLACK_BOT_TOKEN: '',
      BREVO_API_KEY: '',
    },
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  })

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE_URL}/admin/login`)
      if (r.ok) return
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('Demo server did not become ready within 60s')
}

export function stopDemoServer(): void {
  if (demoServer) {
    demoServer.kill('SIGTERM')
    demoServer = null
  }
}
