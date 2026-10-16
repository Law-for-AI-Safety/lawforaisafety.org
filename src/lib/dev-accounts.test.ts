import { describe, expect, it } from "vitest";
import { DEV_ACCOUNTS, devAccountFor, isLocalDatabase, withDevAccounts } from "./dev-accounts";

const ALL = DEV_ACCOUNTS.map((a) => a.email).join(",");

describe("devAccountFor", () => {
  it("reads the account from the subdomain, or from ?as=", () => {
    expect(devAccountFor("publish.localhost:3001", null)?.email).toBe("publish@example.com");
    expect(devAccountFor("tech.localhost", null)?.email).toBe("tech@example.com");
    expect(devAccountFor("localhost:3001", "draft")?.email).toBe("draft@example.com");
    expect(devAccountFor("publish.localhost:3001", "reviewer")?.email).toBe("reviewer@example.com");
  });

  it("finds nobody for another host or an unknown name", () => {
    expect(devAccountFor("localhost:3001", null)).toBeNull();
    expect(devAccountFor("publish.lawforaisafety.org", null)).toBeNull();
    expect(devAccountFor("anon.localhost:3001", null)).toBeNull();
    expect(devAccountFor(null, null)).toBeNull();
  });
});

describe("isLocalDatabase", () => {
  it("accepts only this machine", () => {
    expect(isLocalDatabase("postgresql://postgres:postgres@localhost:5432/lais")).toBe(true);
    expect(isLocalDatabase("postgresql://postgres@127.0.0.1:5432/lais")).toBe(true);
    expect(isLocalDatabase("postgresql://postgres@[::1]:5432/lais")).toBe(true);
    expect(isLocalDatabase("postgresql://user@db.example.net:5432/lais")).toBe(false);
    expect(isLocalDatabase("not a url")).toBe(false);
  });
});

describe("withDevAccounts", () => {
  it("fills empty lists, leaving every other line as it is", () => {
    const env = "# Admins\nADMIN_EMAILS=\nTECH_ADMIN_EMAILS=\nSESSION_SECRET=abc=def\n";
    expect(withDevAccounts(env)).toBe(`# Admins\nADMIN_EMAILS=${ALL}\nTECH_ADMIN_EMAILS=tech@example.com\nSESSION_SECRET=abc=def\n`);
  });

  it("keeps the addresses already listed, and adds each dev account once", () => {
    const env = 'ADMIN_EMAILS="me@lawforaisafety.org, Tech@example.com"\nTECH_ADMIN_EMAILS=me@lawforaisafety.org\n';
    const once = withDevAccounts(env);
    expect(once).toBe(
      `ADMIN_EMAILS=me@lawforaisafety.org,Tech@example.com,${ALL.replace("tech@example.com,", "")}\nTECH_ADMIN_EMAILS=me@lawforaisafety.org,tech@example.com\n`,
    );
    expect(withDevAccounts(once)).toBe(once);
  });

  it("adds the variables a file lacks", () => {
    expect(withDevAccounts("")).toBe(`ADMIN_EMAILS=${ALL}\nTECH_ADMIN_EMAILS=tech@example.com\n`);
    expect(withDevAccounts("DATABASE_URL=x")).toBe(`DATABASE_URL=x\nADMIN_EMAILS=${ALL}\nTECH_ADMIN_EMAILS=tech@example.com\n`);
  });
});
