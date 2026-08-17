const BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Subscribes an email to the Brevo mailing list — called once a newsletter
 * signup is confirmed (double opt-in click, or immediately for an
 * OAuth-verified approval-time opt-in). `updateEnabled: true` so re-adding
 * an already-subscribed contact updates rather than errors.
 */
export async function subscribeToBrevoList(email: string): Promise<void> {
  const listId = Number(requireEnv("BREVO_LIST_ID"));
  const res = await fetch(BREVO_CONTACTS_URL, {
    method: "POST",
    headers: {
      "api-key": requireEnv("BREVO_API_KEY"),
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      email,
      listIds: [listId],
      updateEnabled: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo contacts subscribe failed: ${res.status} ${body}`);
  }
}
