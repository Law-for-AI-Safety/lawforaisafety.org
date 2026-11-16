/** An issue's date as the site shows it, such as "20 November 2026". UTC, so server and browser agree. */
export function formatIssueDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
