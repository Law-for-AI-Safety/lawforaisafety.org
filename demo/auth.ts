import type { DemoCookie } from './engine'
import { DEMO_SESSION_TOKEN } from './data'

/**
 * Skips LinkedIn OAuth with the session demo/seed.ts puts in the demo
 * database for the demo admin. Cookie name must match src/lib/session.ts —
 * if login breaks in a recording, check there first.
 */
export async function demoAdminCookie(): Promise<DemoCookie> {
  return {
    name: 'admin_session',
    value: DEMO_SESSION_TOKEN,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    // Chromium accepts Secure cookies on http://localhost.
    secure: true,
    sameSite: 'Lax',
  }
}
