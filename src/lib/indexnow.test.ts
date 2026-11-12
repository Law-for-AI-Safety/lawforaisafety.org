import { describe, expect, it, vi } from "vitest";
import { indexNow, INDEXNOW_KEY } from "../../test/fakes/indexnow";
import { indexNowKey, notifyIndexNow } from "./indexnow";
import { GET } from "@/app/indexnow-key.txt/route";

function onProduction(key = INDEXNOW_KEY) {
  vi.stubEnv("DEPLOY_CONTEXT", "production");
  vi.stubEnv("INDEXNOW_KEY", key);
}

describe("notifyIndexNow", () => {
  it("sends the site's URLs, once each, with its host, key and key file", async () => {
    onProduction();
    await notifyIndexNow(["/opportunities/a-job", "/opportunities", "/opportunities"]);
    expect(indexNow.pings).toEqual([
      {
        host: "lawforaisafety.org",
        key: INDEXNOW_KEY,
        keyLocation: "https://lawforaisafety.org/indexnow-key.txt",
        urlList: ["https://lawforaisafety.org/opportunities/a-job", "https://lawforaisafety.org/opportunities"],
      },
    ]);
  });

  it("sends nothing off the production deploy", async () => {
    vi.stubEnv("INDEXNOW_KEY", INDEXNOW_KEY);
    vi.stubEnv("DEPLOY_CONTEXT", "deploy-preview");
    await notifyIndexNow(["/"]);
    expect(indexNow.pings).toEqual([]);
  });

  it("sends nothing without a valid key", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    await notifyIndexNow(["/"]);
    onProduction("short");
    await notifyIndexNow(["/"]);
    onProduction("not a key!");
    await notifyIndexNow(["/"]);
    expect(indexNow.pings).toEqual([]);
  });

  it("sends nothing for no URLs", async () => {
    onProduction();
    await notifyIndexNow([]);
    expect(indexNow.pings).toEqual([]);
  });

  it("only logs a refused or failed ping", async () => {
    onProduction();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    indexNow.failNext("http");
    await expect(notifyIndexNow(["/"])).resolves.toBeUndefined();
    indexNow.failNext("network");
    await expect(notifyIndexNow(["/"])).resolves.toBeUndefined();
    expect(indexNow.pings).toHaveLength(2);
    expect(errors).toHaveBeenCalledTimes(2);
  });
});

describe("the key file", () => {
  it("serves the key as plain text", async () => {
    vi.stubEnv("INDEXNOW_KEY", ` ${INDEXNOW_KEY}\n`);
    expect(indexNowKey()).toBe(INDEXNOW_KEY);
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe(INDEXNOW_KEY);
  });

  it("is not found without a key", async () => {
    expect(GET().status).toBe(404);
  });
});
