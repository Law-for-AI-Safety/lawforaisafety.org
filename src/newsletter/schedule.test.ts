import { describe, expect, it } from "vitest";
import { describeTime, formatLocalInput, offsetLabel, offsetMinutes, scheduleProblem } from "./schedule";

const NOW = new Date("2026-11-15T12:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe("scheduleProblem", () => {
  it("accepts a time between ten minutes and 180 days ahead", () => {
    expect(scheduleProblem(minutes(10), NOW)).toBeNull();
    expect(scheduleProblem(minutes(180 * 24 * 60), NOW)).toBeNull();
  });

  it("refuses a time too soon, in the past, too far ahead, or not a time", () => {
    expect(scheduleProblem(minutes(9), NOW)).toMatch(/at least 10 minutes from now, or send it now/);
    expect(scheduleProblem(minutes(-60), NOW)).toMatch(/at least 10 minutes/);
    expect(scheduleProblem(minutes(180 * 24 * 60 + 1), NOW)).toBe("Choose a time within 180 days.");
    expect(scheduleProblem(new Date("nonsense"), NOW)).toBe("Choose a date and time.");
  });
});

describe("timezones", () => {
  const winter = new Date("2026-11-20T09:00:00Z");
  const summer = new Date("2026-07-01T08:00:00Z");

  it("finds the offset, including summer time and half hours", () => {
    expect(offsetMinutes(winter, "Europe/London")).toBe(0);
    expect(offsetMinutes(summer, "Europe/London")).toBe(60);
    expect(offsetMinutes(winter, "America/New_York")).toBe(-300);
    expect(offsetMinutes(winter, "Asia/Kolkata")).toBe(330);
  });

  it("labels it", () => {
    expect(offsetLabel(winter, "Europe/London")).toBe("UTC");
    expect(offsetLabel(summer, "Europe/London")).toBe("UTC+1");
    expect(offsetLabel(winter, "America/New_York")).toBe("UTC−5");
    expect(offsetLabel(winter, "Asia/Kolkata")).toBe("UTC+5:30");
  });

  it("formats a datetime-local value in the zone", () => {
    expect(formatLocalInput(summer, "Europe/London")).toBe("2026-07-01T09:00");
    expect(formatLocalInput(winter, "Asia/Kolkata")).toBe("2026-11-20T14:30");
  });

  it("describes a time in full with its zone named", () => {
    expect(describeTime(winter, "Europe/London")).toBe("Friday, 20 November 2026, 09:00 (Europe/London, UTC)");
    expect(describeTime(summer, "Europe/Paris")).toBe("Wednesday, 1 July 2026, 10:00 (Europe/Paris, UTC+2)");
  });
});
