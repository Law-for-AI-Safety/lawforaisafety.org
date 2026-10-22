import { describe, expect, it } from "vitest";
import type { Opportunity } from "../src/opportunities/types";
import { checkAllLinks, checkLink, curlStatus } from "./check-opportunity-links";

function make(applyUrl: string): Opportunity {
  return {
    slug: "test",
    type: "job",
    title: "Test",
    org: "Test org",
    summary: "Summary.",
    description: "Body.",
    location: "Remote",
    remote: true,
    applyUrl,
    publishedAt: "2026-01-01",
  };
}

function fakeFetch(responses: Record<string, number | "network-error">) {
  return (async (url: string | URL) => {
    const key = String(url);
    const outcome = responses[key];
    if (outcome === "network-error") throw new Error("fetch failed");
    if (outcome === undefined) throw new Error(`unexpected request to ${key}`);
    return new Response(null, { status: outcome });
  }) as typeof fetch;
}

function fakeCurl(status: number | null) {
  return (async () => status) as typeof curlStatus;
}

describe("checkLink", () => {
  it("is ok when HEAD succeeds", async () => {
    const opportunity = make("https://example.com/job");
    const result = await checkLink(opportunity, fakeFetch({ "https://example.com/job": 200 }), fakeCurl(null));
    expect(result).toEqual({ slug: "test", url: "https://example.com/job", ok: true, status: 200 });
  });

  it("flags a 404 as not ok when curl agrees it's dead", async () => {
    const opportunity = make("https://example.com/gone");
    const result = await checkLink(opportunity, fakeFetch({ "https://example.com/gone": 404 }), fakeCurl(null));
    expect(result).toEqual({ slug: "test", url: "https://example.com/gone", ok: false, status: 404 });
  });

  it("treats a fetch failure as live when curl reaches it (bot-protection false positive)", async () => {
    const opportunity = make("https://example.com/bot-protected");
    const result = await checkLink(opportunity, fakeFetch({ "https://example.com/bot-protected": 403 }), fakeCurl(200));
    expect(result).toEqual({ slug: "test", url: "https://example.com/bot-protected", ok: true, status: 200, via: "curl" });
  });

  it("falls back to curl when fetch itself throws", async () => {
    const opportunity = make("https://example.com/fetch-blocked");
    const result = await checkLink(opportunity, fakeFetch({ "https://example.com/fetch-blocked": "network-error" }), fakeCurl(200));
    expect(result).toEqual({ slug: "test", url: "https://example.com/fetch-blocked", ok: true, status: 200, via: "curl" });
  });

  it("falls back to GET when the server rejects HEAD", async () => {
    const opportunity = make("https://example.com/head-unsupported");
    let headCalls = 0;
    let getCalls = 0;
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        headCalls += 1;
        return new Response(null, { status: 405 });
      }
      getCalls += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const result = await checkLink(opportunity, fetchImpl, fakeCurl(null));
    expect(result.ok).toBe(true);
    expect(headCalls).toBe(1);
    expect(getCalls).toBe(1);
  });

  it("reports a network failure as dead when curl can't reach it either", async () => {
    const opportunity = make("https://example.com/unreachable");
    const result = await checkLink(opportunity, fakeFetch({ "https://example.com/unreachable": "network-error" }), fakeCurl(null));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("fetch failed");
  });
});

describe("curlStatus", () => {
  it("parses the HTTP status curl prints", async () => {
    const run = (async () => ({ stdout: "200\n", stderr: "" })) as unknown as Parameters<typeof curlStatus>[1];
    expect(await curlStatus("https://example.com", run)).toBe(200);
  });

  it("returns null when curl itself fails", async () => {
    const run = (async () => {
      throw new Error("command not found: curl");
    }) as unknown as Parameters<typeof curlStatus>[1];
    expect(await curlStatus("https://example.com", run)).toBeNull();
  });

  it("returns null when curl's output isn't a status code", async () => {
    const run = (async () => ({ stdout: "000\n", stderr: "" })) as unknown as Parameters<typeof curlStatus>[1];
    expect(await curlStatus("https://example.com", run)).toBeNull();
  });
});

describe("checkAllLinks", () => {
  it("checks every opportunity and reports each result", async () => {
    const opportunities = [make("https://example.com/a"), make("https://example.com/b")];
    const results = await checkAllLinks(
      opportunities,
      fakeFetch({ "https://example.com/a": 200, "https://example.com/b": 500 }),
      fakeCurl(null),
    );
    expect(results.map((r) => r.ok)).toEqual([true, false]);
  });
});
