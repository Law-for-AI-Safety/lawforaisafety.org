const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const TURNSTILE_FIELD_NAME = "cf-turnstile-response";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Verifies a Turnstile token against Cloudflare's siteverify endpoint.
 * Fails closed: missing token, network error, or a non-success response
 * all count as unverified — never let a broken check silently pass.
 */
export async function verifyTurnstile(
  formData: FormData,
  remoteIp: string,
): Promise<boolean> {
  const token = formData.get(TURNSTILE_FIELD_NAME);
  if (typeof token !== "string" || token === "") {
    return false;
  }

  const secret = requireEnv("TURNSTILE_SECRET_KEY");
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
