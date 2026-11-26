import { describe, expect, it } from "vitest";
import { cleanTitle, hostOf, normaliseText, normaliseUrl, resolveGoogleNewsUrl, storyKey, titleKey } from "./normalise";

/** A Google News id in the older format, which holds the article's own address. */
function oldGoogleId(articleUrl: string): string {
  const bytes = Buffer.concat([Buffer.from([0x08, 0x13, 0x22, articleUrl.length]), Buffer.from(articleUrl, "latin1"), Buffer.from([0xd2, 0x01, 0x00])]);
  return bytes.toString("base64url");
}

describe("normaliseUrl", () => {
  it.each([
    ["https://www.Reuters.com/tech/story/?utm_source=rss&utm_medium=x#top", "https://reuters.com/tech/story"],
    ["http://example.com/a?b=2&a=1&fbclid=x&gclid=y&ref=home", "https://example.com/a?a=1&b=2"],
    ["https://example.com/", "https://example.com"],
    ["  https://example.com/a?id=7  ", "https://example.com/a?id=7"],
    ["not a url", "not a url"],
  ])("%s", (input, expected) => {
    expect(normaliseUrl(input)).toBe(expected);
  });

  it("gives the same key for the same article reached through an old-style Google News link", () => {
    const google = `https://news.google.com/rss/articles/${oldGoogleId("https://www.example.com/story?utm_source=gn")}?oc=5`;
    expect(normaliseUrl(google)).toBe("https://example.com/story");
  });
});

describe("resolveGoogleNewsUrl", () => {
  it("leaves a new-style id, which hides the address, as it is", () => {
    const url = "https://news.google.com/rss/articles/CBMi2AFBVV95cUxQODJaNmNrbFFWVXlTcnRleFNMd0FfV2dZV3JiMXI1TE90SUtWZE8yQnZaRUF3?oc=5";
    expect(resolveGoogleNewsUrl(url)).toBe(url);
  });

  it.each(["https://example.com/a", "not a url", "https://news.google.com/topics/abc"])("leaves %s alone", (url) => {
    expect(resolveGoogleNewsUrl(url)).toBe(url);
  });

  it("leaves an id whose embedded address cannot be read", () => {
    const url = `https://news.google.com/rss/articles/${Buffer.from("\x08\x13http\x01").toString("base64url")}`;
    expect(resolveGoogleNewsUrl(url)).toBe(url);
    const bad = `https://news.google.com/rss/articles/${Buffer.from("\x08https://[bad\x01").toString("base64url")}`;
    expect(resolveGoogleNewsUrl(bad)).toBe(bad);
  });
});

describe("titles", () => {
  it("strips the outlet a news aggregator appends", () => {
    expect(cleanTitle("Court rules on AI - Reuters", "Reuters")).toBe("Court rules on AI");
    expect(cleanTitle("Court rules on AI | The Guardian", "The Guardian")).toBe("Court rules on AI");
    expect(cleanTitle("  Court   rules  ", "")).toBe("Court rules");
    expect(cleanTitle("Court rules on AI - Reuters analysis", "Reuters")).toBe("Court rules on AI - Reuters analysis");
  });

  it("normalises case, accents and punctuation", () => {
    expect(normaliseText("Décision: the CNIL’s AI-fine!")).toBe("decision the cnil s ai fine");
    expect(titleKey("AI Act: first fine", "Reuters")).toBe(titleKey("AI act — first fine.", "reuters"));
    expect(storyKey("AI Act: first fine")).toBe("ai act first fine");
  });

  it("finds an outlet's host", () => {
    expect(hostOf("https://www.example.com/a")).toBe("example.com");
    expect(hostOf("nope")).toBe("");
  });
});
