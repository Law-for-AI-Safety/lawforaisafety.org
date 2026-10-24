"use client";

import { useEffect, useId, useState } from "react";
import { fetchSuggestions } from "./api";

/**
 * A plain text input for the city, with the selected country's cities offered as browser-native
 * typeahead (a `<datalist>` - the city list runs to thousands of entries per country, so it's
 * fetched on demand rather than shipped to the client up front). Still accepts any typed value,
 * since the dataset won't cover every real place.
 */
export default function CityPicker({
  value,
  onChange,
  country,
  className,
}: {
  value: string;
  onChange: (city: string) => void;
  country: string;
  className?: string;
}) {
  const listId = useId();
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchSuggestions(`/api/admin/opportunities/cities?country=${encodeURIComponent(country)}`).then((names) => {
      if (!cancelled) setCities(names);
    });
    return () => {
      cancelled = true;
    };
  }, [country]);

  return (
    <>
      <input list={listId} value={value} onChange={(e) => onChange(e.target.value)} className={className} />
      <datalist id={listId}>
        {cities.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
    </>
  );
}
