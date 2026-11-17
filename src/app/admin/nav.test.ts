import { describe, expect, it } from "vitest";
import { ACCOUNT_ITEMS, NAV_ITEMS, activeHref, visibleTo, type AdminAccess } from "./nav";

const NOBODY: AdminAccess = { tech: false, tracker: false, opportunities: false, cmsEdit: false };
const EVERYTHING: AdminAccess = { tech: true, tracker: true, opportunities: true, cmsEdit: true };

describe("activeHref", () => {
  const hrefs = ["/admin", "/admin/task-tracker", "/admin/task-tracker/projects", "/admin/opportunities#drafts"];

  it("picks the deepest link the page sits under", () => {
    expect(activeHref("/admin/task-tracker/projects/7", hrefs)).toBe("/admin/task-tracker/projects");
    expect(activeHref("/admin/task-tracker/tasks/3", hrefs)).toBe("/admin/task-tracker");
    expect(activeHref("/admin", hrefs)).toBe("/admin");
  });

  it("does not match a link that only shares the start of a path segment", () => {
    expect(activeHref("/admin/task-trackers", ["/admin/task-tracker"])).toBeNull();
  });

  it("never picks a link into a page section", () => {
    expect(activeHref("/admin/opportunities", ["/admin/opportunities#drafts"])).toBeNull();
  });
});

describe("visibleTo", () => {
  it("shows every admin the review areas and nothing gated", () => {
    expect(visibleTo(NAV_ITEMS, NOBODY).map((item) => item.label)).toEqual(["Collaboration", "Red Lines"]);
    expect(visibleTo(ACCOUNT_ITEMS, NOBODY)).toEqual([]);
  });

  it("shows someone with every kind of access everything", () => {
    expect(visibleTo(NAV_ITEMS, EVERYTHING)).toEqual(NAV_ITEMS);
    expect(visibleTo(ACCOUNT_ITEMS, EVERYTHING)).toEqual(ACCOUNT_ITEMS);
  });
});
