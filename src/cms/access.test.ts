import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmsCan, isCmsPermission, resolveCmsAccess, type CmsAbility, type CmsAccess } from "./access";

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "editor@example.com, Tech@example.com");
  vi.stubEnv("TECH_ADMIN_EMAILS", "tech@example.com,ghost@example.com");
});

describe("resolving CMS access", () => {
  it("gives a technical admin everything, whatever is stored", () => {
    expect(resolveCmsAccess("TECH@example.com", null)).toBe("superadmin");
    expect(resolveCmsAccess("tech@example.com", "draft")).toBe("superadmin");
  });

  it("gives anyone else only their stored permission, and none by default", () => {
    expect(resolveCmsAccess("editor@example.com", null)).toBe("none");
    expect(resolveCmsAccess("editor@example.com", "draft")).toBe("draft");
    expect(resolveCmsAccess("editor@example.com", "publish")).toBe("publish");
  });

  it("gives nothing to someone not in ADMIN_EMAILS, even a listed technical admin", () => {
    expect(resolveCmsAccess("stranger@example.com", "publish")).toBe("none");
    expect(resolveCmsAccess("ghost@example.com", null)).toBe("none");
  });
});

describe("what each access level can do", () => {
  const table: [CmsAccess, Record<CmsAbility, boolean>][] = [
    ["none", { edit: false, publish: false, manageRoles: false }],
    ["draft", { edit: true, publish: false, manageRoles: false }],
    ["publish", { edit: true, publish: true, manageRoles: false }],
    ["superadmin", { edit: true, publish: true, manageRoles: true }],
  ];
  it.each(table)("%s", (access, abilities) => {
    for (const [ability, allowed] of Object.entries(abilities)) {
      expect(cmsCan(access, ability as CmsAbility)).toBe(allowed);
    }
  });
});

it("recognises stored permissions", () => {
  expect(isCmsPermission("draft")).toBe(true);
  expect(isCmsPermission("publish")).toBe(true);
  expect(isCmsPermission("superadmin")).toBe(false);
  expect(isCmsPermission(undefined)).toBe(false);
});
