"use client";

import { useSyncExternalStore } from "react";
import { describeTime } from "@/newsletter/schedule";

const noSubscribe = () => () => {};

/** The viewer's own timezone, or UTC while rendering on the server. */
export function useTimeZone(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC",
  );
}

/** A time shown in the viewer's timezone, with the zone named. */
export default function LocalTime({ iso }: { iso: string }) {
  const timeZone = useTimeZone();
  return <time dateTime={iso}>{describeTime(new Date(iso), timeZone)}</time>;
}
