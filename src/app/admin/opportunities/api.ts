import type { Opportunity } from "@/opportunities/types";
import { sendJson as sendJsonGeneric } from "../api";

export { fetchSuggestions } from "../api";

/** As the shared `sendJson`, typed to what every opportunities endpoint returns. */
export function sendJson(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<Opportunity> {
  return sendJsonGeneric<Opportunity>(url, method, body);
}
