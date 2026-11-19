/** An issue's send date as the site shows it, e.g. "17 November 2026", in UK time whatever the server's zone. */
export function formatIssueDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
}
