import { NextResponse } from "next/server";
import { City } from "country-state-city";
import { requireOpportunities } from "@/lib/admin-guard";

// country-state-city's data is static for the process's lifetime, so a country's sorted,
// deduped city list is worth keeping once computed rather than redoing it on every request.
const CACHE = new Map<string, string[]>();

function citiesOf(country: string): string[] {
  const cached = CACHE.get(country);
  if (cached) return cached;

  const cities = City.getCitiesOfCountry(country) ?? [];
  const names = [...new Set(cities.map((c) => c.name))].sort((a, b) => a.localeCompare(b));
  CACHE.set(country, names);
  return names;
}

/** City names for a country's typeahead. The full per-country city list is too large to ship to the client, so it's looked up here on demand. */
export async function GET(request: Request) {
  const session = await requireOpportunities(request);
  if (session instanceof NextResponse) return session;

  const country = new URL(request.url).searchParams.get("country") ?? "";
  return NextResponse.json(citiesOf(country));
}
