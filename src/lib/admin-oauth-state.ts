import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

const STATE_TTL_SECONDS = 60 * 10; // 10 minutes — just long enough to complete the OAuth round trip

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing required env var: SESSION_SECRET");
  }
  return new TextEncoder().encode(secret);
}

// Shares SESSION_SECRET with the session cookie — issuer + audience keep a
// state token from ever being accepted as a session, and vice versa.
const STATE_ISSUER = "lawforaisafety.org";
const STATE_AUDIENCE = "admin_oauth_state";

/**
 * Admin login has no draft row to key a state token against (unlike the
 * applicant flow) — this is a short-lived signed token whose only job is
 * proving the callback is a genuine continuation of a request this server
 * issued. On its own that isn't tied to a browser — the login route also
 * sets it as a cookie (see oauth-state-cookie.ts) and the callback requires
 * the two to match.
 */
export async function createAdminOAuthState(): Promise<string> {
  return new SignJWT({ purpose: "admin_oauth_state" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(STATE_ISSUER)
    .setAudience(STATE_AUDIENCE)
    // Without this, two logins started in the same second get identical tokens.
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAdminOAuthState(state: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(state, getSecret(), {
      algorithms: ["HS256"],
      issuer: STATE_ISSUER,
      audience: STATE_AUDIENCE,
    });
    return payload.purpose === "admin_oauth_state";
  } catch {
    return false;
  }
}
