import { SignJWT, jwtVerify } from "jose";

const STATE_TTL_SECONDS = 60 * 10; // 10 minutes — just long enough to complete the OAuth round trip

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing required env var: SESSION_SECRET");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Admin login has no draft row to key a state token against (unlike the
 * applicant flow) — this is a short-lived signed token whose only job is
 * proving the callback is a genuine continuation of a request this server
 * issued, i.e. CSRF/replay protection, nothing more.
 */
export async function createAdminOAuthState(): Promise<string> {
  return new SignJWT({ purpose: "admin_oauth_state" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAdminOAuthState(state: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(state, getSecret());
    return payload.purpose === "admin_oauth_state";
  } catch {
    return false;
  }
}
