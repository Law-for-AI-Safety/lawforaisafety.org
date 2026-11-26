import { describe, expect, it } from "vitest";
import { decodeEntities, parseRss, plainText } from "./rss";

describe("parseRss", () => {
  it("reads each item's fields, CDATA and entities included", () => {
    const xml = `<rss><channel><title>x</title>
      <item><title><![CDATA[AI & the law]]></title><link>https://a.test/1</link><pubDate>Mon, 23 Nov 2026 09:00:00 GMT</pubDate>
        <description>&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;</description><source url="https://www.a.test">A &amp; B</source></item>
      <item><title>No link</title></item>
      <item><title>Bad date</title><link>https://a.test/2</link><pubDate>someday</pubDate></item>
    </channel></rss>`;
    expect(parseRss(xml)).toEqual([
      { title: "AI & the law", link: "https://a.test/1", pubDate: new Date("2026-11-23T09:00:00Z"), description: "Hello & welcome", source: "A & B", sourceUrl: "https://www.a.test" },
      { title: "Bad date", link: "https://a.test/2", pubDate: null, description: "", source: "", sourceUrl: "" },
    ]);
  });

  it("decodes numeric entities and leaves unknown ones", () => {
    expect(decodeEntities("&#8217;&#x2019;&bogus;&#0;")).toBe("’’&bogus;&#0;");
    expect(plainText("<b>a</b>&nbsp;b")).toBe("a b");
  });
});
