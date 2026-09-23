import { SignJWT } from 'jose'
import type { DemoCookie } from './engine'
import { DEMO_ADMIN } from './data'
import { DEMO_SESSION_SECRET } from './server'

/**
 * Skips LinkedIn OAuth by signing the same admin_session JWT the login
 * callback would. Cookie name, issuer and audience must match
 * src/lib/session.ts — if login breaks in a recording, check there first.
 */
export async function demoAdminCookie(): Promise<DemoCookie> {
  const token = await new SignJWT({ email: DEMO_ADMIN.email, name: DEMO_ADMIN.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('lawforaisafety.org')
    .setAudience('admin_session')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(DEMO_SESSION_SECRET))

  return {
    name: 'admin_session',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    // Chromium accepts Secure cookies on http://localhost.
    secure: true,
    sameSite: 'Lax',
  }
}
