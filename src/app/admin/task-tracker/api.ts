/**
 * fetch + JSON for the task tracker's client forms. Turns the failure modes
 * a volunteer can actually hit (offline, session expired, server error page
 * instead of JSON) into a readable sentence instead of "Failed to fetch" or
 * "Unexpected token '<'".
 */
export async function sendJson<T = { id: string }>(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session has expired. Log in again in a new tab, then retry.");
    }
    throw new Error(data?.error ?? "Something went wrong saving this. Please try again.");
  }
  return data as T;
}
