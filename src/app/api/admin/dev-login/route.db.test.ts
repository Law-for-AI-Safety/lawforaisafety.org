import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar } from "../../../../../test/next-headers";
import { adminPeople, adminSessions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { DEV_ACCOUNTS } from "@/lib/dev-accounts";
import { getAdminSession } from "@/lib/session";
import { GET } from "./route";

vi.mock("next/headers", () => import("../../../../../test/next-headers"));

const open = (url: string) => GET(new Request(url, { headers: { host: new URL(url).host } }));

beforeEach(async () => {
  await db.delete(adminSessions);
  await db.delete(adminPeople);
  cookieJar.reset();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ADMIN_EMAILS", DEV_ACCOUNTS.map((a) => a.email).join(","));
});

describe("the dev sign-in", () => {
  it("signs in the account its subdomain names, then goes to the admin", async () => {
    const response = await open("http://publish.localhost:3001/api/admin/dev-login");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin");
    expect(await getAdminSession()).toEqual({ email: "publish@example.com", name: "Pat Publisher (dev)" });
    expect(await db.select().from(adminSessions)).toHaveLength(1);
    expect(await db.select().from(adminPeople)).toEqual([expect.objectContaining({ email: "publish@example.com" })]);
  });

  it("takes the account from ?as=, and goes on to ?next= on this site", async () => {
    const response = await open("http://localhost:3001/api/admin/dev-login?as=tech&next=/admin/settings");
    expect(response.headers.get("location")).toBe("/admin/settings");
    expect((await getAdminSession())?.email).toBe("tech@example.com");
    const away = await open("http://localhost:3001/api/admin/dev-login?as=tech&next=//evil.example");
    expect(away.headers.get("location")).toBe("/");
  });

  it("says how to pick an account, or how to let it in", async () => {
    const nobody = await open("http://localhost:3001/api/admin/dev-login");
    expect(nobody.status).toBe(404);
    expect(await nobody.text()).toMatch(/^No dev account here\. .*tech, publish, draft, reviewer/);

    vi.stubEnv("ADMIN_EMAILS", "");
    const shut = await open("http://draft.localhost:3001/api/admin/dev-login");
    expect(shut.status).toBe(409);
    expect(await shut.text()).toBe("draft@example.com is not in ADMIN_EMAILS. Run npm run dev:accounts, then restart the dev server.");
    expect(cookieJar.get("admin_session")).toBeUndefined();
  });

  it("is not found outside the dev server", async () => {
    for (const mode of ["production", "test"]) {
      vi.stubEnv("NODE_ENV", mode);
      const response = await open("http://publish.localhost:3001/api/admin/dev-login");
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    }
    expect(cookieJar.get("admin_session")).toBeUndefined();
    expect(await db.select().from(adminSessions)).toEqual([]);
  });
});
