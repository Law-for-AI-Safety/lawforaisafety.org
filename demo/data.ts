export const DEMO_PORT = 3099
export const BASE_URL = `http://localhost:${DEMO_PORT}`
export const SPEED = 1 // <1 = slower, >1 = faster

// Separate database in the same local Docker Postgres as `npm run dev`, wiped
// and re-seeded on every run — recording never touches your dev data.
export const DEMO_DB_NAME = 'lawforaisafety_demo'

// The signed-in admin in every recording. Fictional, and only ever allowed
// into the demo server (ADMIN_EMAILS is overridden for that process alone).
export const DEMO_ADMIN = {
  email: 'sam.rivera@example.com',
  name: 'Sam Rivera',
}
