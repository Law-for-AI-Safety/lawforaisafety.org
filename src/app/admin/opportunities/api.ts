import type { Opportunity } from "@/opportunities/types";

/**
 * fetch + JSON for the opportunities admin forms, same shape as the task tracker's
 * `src/app/admin/task-tracker/api.ts`, extended with DELETE for removing a listing.
 */
export async function sendJson(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<Opportunity> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
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
  return data as Opportunity;
}
