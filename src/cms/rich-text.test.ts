import { describe, expect, it } from "vitest";
import {
  formatRichText,
  hasForbiddenText,
  hrefProblem,
  inlineTree,
  isAllowedHref,
  normalizeRuns,
  parseRichText,
  parseRichTextLoose,
  RichTextError,
  serializeRichText,
  upgradeHref,
  type Marks,
  type RichText,
  type Run,
} from "./rich-text";

const ch = (code: number) => String.fromCharCode(code);
/** A code point, or a lone surrogate, as a string. */
const cp = (code: number) => (code >= 0xd800 && code <= 0xdfff ? String.fromCharCode(code) : String.fromCodePoint(code));
const run = (text: string, marks: Marks = {}): Run => ({ text, marks });
const para = (...runs: Run[]): RichText[number] => ({ type: "paragraph", runs });

describe("round trip of every allowed construct", () => {
  const cases: [string, RichText][] = [
    ["Plain text.", [para(run("Plain text."))]],
    ["**bold**", [para(run("bold", { bold: true }))]],
    ["*italic*", [para(run("italic", { italic: true }))]],
    ["==wavy==", [para(run("wavy", { wavy: true }))]],
    ["[a link](/field-building)", [para(run("a link", { link: "/field-building" }))]],
    ["[mail](mailto:info@lawforaisafety.org)", [para(run("mail", { link: "mailto:info@lawforaisafety.org" }))]],
    ["[web](https://www.youtube.com/@LawforAISafety)", [para(run("web", { link: "https://www.youtube.com/@LawforAISafety" }))]],
    [
      "a **b *c* d** e",
      [para(run("a "), run("b ", { bold: true }), run("c", { bold: true, italic: true }), run(" d", { bold: true }), run(" e"))],
    ],
    ["***both***", [para(run("both", { bold: true, italic: true }))]],
    [
      "[==**all**== of *them*](/#contact)",
      [
        para(
          run("all", { link: "/#contact", wavy: true, bold: true }),
          run(" of ", { link: "/#contact" }),
          run("them", { link: "/#contact", italic: true }),
        ),
      ],
    ],
    ["- one\n- **two**", [{ type: "bulletList", items: [[run("one")], [run("two", { bold: true })]] }]],
    [
      "Intro.\n\n- a\n- b\n\nOutro.",
      [para(run("Intro.")), { type: "bulletList", items: [[run("a")], [run("b")]] }, para(run("Outro."))],
    ],
    ["Escapes: \\* \\[ \\] \\= \\\\ \\`", [para(run("Escapes: * [ ] = \\ `"))]],
    ["a\\=b and \\=\\=", [para(run("a=b and =="))]],
    ["snake_case and a ~ tilde, 5 < 6 > 4 (aside)", [para(run("snake_case and a ~ tilde, 5 < 6 > 4 (aside)"))]],
    ["\\_\\_init\\_\\_ \\~\\~gone\\~\\~", [para(run("__init__ ~~gone~~"))]],
    ["\\<b> and \\</i> and \\<!x", [para(run("<b> and </i> and <!x"))]],
    ["Wow\\![x](/a)", [para(run("Wow!"), run("x", { link: "/a" }))]],
    ["Wow! [x](/a)", [para(run("Wow! "), run("x", { link: "/a" }))]],
    ["\\&amp; and \\&#8217; and & alone and AT&T", [para(run("&amp; and &#8217; and & alone and AT&T"))]],
    ["\\# not a heading", [para(run("# not a heading"))]],
    ["\\> not a quote", [para(run("> not a quote"))]],
    ["\\+ not a list", [para(run("+ not a list"))]],
    ["\\- not a list", [para(run("- not a list"))]],
    ["\\-- not a rule", [para(run("-- not a rule"))]],
    ["1\\. not a list", [para(run("1. not a list"))]],
    ["12\\) not a list", [para(run("12) not a list"))]],
    ["- \\- dash item", [{ type: "bulletList", items: [[run("- dash item")]] }]],
    ["Ünïcödé — “quotes” ’", [para(run("Ünïcödé — “quotes” ’"))]],
    [`no${ch(0xa0)}break`, [para(run(`no${ch(0xa0)}break`))]],
  ];

  it.each(cases)("%j", (text, doc) => {
    expect(parseRichText(text)).toEqual(doc);
    expect(serializeRichText(doc)).toBe(text);
  });

  it("parses and prints the empty string as no blocks", () => {
    expect(parseRichText("")).toEqual([]);
    expect(serializeRichText([])).toBe("");
  });
});

describe("serialising", () => {
  it("moves whitespace at the edge of a mark outside it", () => {
    expect(serializeRichText([para(run("a"), run(" b ", { bold: true }), run("c"))])).toBe("a **b** c");
  });

  it("never opens bold directly on top of italic", () => {
    const doc = [para(run("a", { italic: true }), run("b", { italic: true, bold: true }))];
    const text = serializeRichText(doc);
    expect(parseRichText(text)).toEqual(doc);
  });

  it("puts bold outside italic when both open together and last equally long", () => {
    expect(serializeRichText([para(run("x", { italic: true, bold: true }), run("y"))])).toBe("***x***y");
  });

  it("merges neighbouring runs with the same marks and drops empty ones", () => {
    expect(normalizeRuns([run("a"), run(""), run("b"), run("c", { bold: true })])).toEqual([
      run("ab"),
      run("c", { bold: true }),
    ]);
  });

  it.each([
    ["an empty line", [para()], "Empty line"],
    ["a whitespace-only line", [para(run(" "))], "Leading or trailing whitespace"],
    ["leading whitespace", [para(run(" a"))], "Leading or trailing whitespace"],
    ["a line break", [para(run("a\nb"))], "Line break inside a line"],
    ["a tab", [para(run("a\tb"))], "control or invisible"],
    ["a bidi override", [para(run(`a${ch(0x202e)}b`))], "control or invisible"],
    ["a disallowed link", [para(run("x", { link: "javascript:alert(1)" }))], "Link not allowed"],
    ["an empty list", [{ type: "bulletList", items: [] }], "Empty list"],
  ] as [string, RichText, string][])("refuses %s", (_, doc, msg) => {
    expect(() => serializeRichText(doc)).toThrow(msg);
  });
});

describe("parsing rejects anything outside the grammar", () => {
  it.each([
    ["__bold__", "__ is not supported"],
    ["~~strike~~", "~~ is not supported"],
    ["`code`", "Code spans are not supported"],
    ["<b>html</b>", "HTML is not supported"],
    ["<script>alert(1)</script>", "HTML is not supported"],
    ["<!-- comment -->", "HTML is not supported"],
    ["</p>", "HTML is not supported"],
    ["![image](/images/a.webp)", "Images are not supported"],
    ["&amp;", "HTML character references"],
    ["it&#8217;s", "HTML character references"],
    ["it&#x2019;s", "HTML character references"],
    ["# Heading", "Unsupported line start"],
    ["> quote", "Unsupported line start"],
    ["* item", "Unsupported line start"],
    ["+ item", "Unsupported line start"],
    ["1. item", "Unsupported line start"],
    ["---", "Unsupported line start"],
    ["- a\nb", "Every line of a list must start with '- '"],
    ["a\nb", "Single line breaks are not allowed"],
    ["a\n\n\nb", "Single line breaks are not allowed"],
    ["a\r\rb", "Control or invisible formatting character"],
    ["a\tb", "Control or invisible formatting character"],
    [" a", "Leading or trailing whitespace"],
    ["a ", "Leading or trailing whitespace"],
    ["a  ", "Leading or trailing whitespace"],
    ["a\\", "Backslash must escape punctuation"],
    ["a\\b", "Backslash must escape punctuation"],
    ["a = b", "A single = must be escaped"],
    ["****", "Empty bold"],
    ["**", "Unclosed bold"],
    ["*a", "Unclosed italic"],
    ["==a", "Unclosed wavy"],
    ["[a", "Unclosed link"],
    ["a]", "Expected ( after ]"],
    ["[a](/b", "Unclosed link target"],
    ["[a [b](/c)](/d)", "Nested or overlapping link"],
    ["**a *b** c*", "Ambiguous ** inside italic"],
    ["*a **b** c*", "Ambiguous ** inside italic"],
    ["==a **b== c**", "Nested or overlapping wavy"],
    ["[a **b](/x)**", "Overlapping marks"],
    ["[a](javascript:alert)", "Only https:, mailto: and site links"],
    ["[a](javascript:alert(1))", "character that is not allowed"],
    ["[a](http://example.org)", "Use https: links"],
    ["- ", "Empty line"],
    ["-  a", "Leading or trailing whitespace"],
    ["\n\na", "Extra blank line"],
  ])("%j", (text, msg) => {
    expect(() => parseRichText(text)).toThrow(RichTextError);
    expect(() => parseRichText(text)).toThrow(msg);
  });

  it("gives the line and column of the problem", () => {
    expect(() => parseRichText("ok\n\n- fine\n- bad `x`")).toThrow("(line 4, column 7)");
  });

  it.each([
    ["[a](/x)[b](/x)", "[ab](/x)"],
    ["\\(escaped\\) parens", "(escaped) parens"],
    ["**a****b**", "**ab**"],
  ])("refuses the non-canonical %j and names the canonical form", (text, canonicalStart) => {
    expect(() => parseRichText(text)).toThrow("Not in canonical form");
    expect(() => parseRichText(text)).toThrow(JSON.stringify(canonicalStart).slice(0, -1));
  });
});

describe("links", () => {
  it.each([
    "/",
    "/field-building",
    "/field-building#contact",
    "/#contact",
    "/apply?x=1",
    "/documents/a%20b.pdf",
    "mailto:info@lawforaisafety.org",
    "mailto:info@lawforaisafety.org?subject=Hi",
    "https://lawforaisafety.org",
    "https://www.youtube.com/@LawforAISafety",
    "https://example.org/a_b-c~d/?q=1&r=2#frag",
  ])("allows %j", (href) => {
    expect(hrefProblem(href)).toBeNull();
    expect(isAllowedHref(href)).toBe(true);
  });

  it.each([
    ["", "no target"],
    ["javascript:alert(1)", "not allowed"],
    ["JavaScript:alert", "Only https:"],
    ["javascript&colon;alert", "Only https:"],
    ["data:text/html;base64,PHNjcmlwdD4=", "Only https:"],
    ["vbscript:msgbox", "Only https:"],
    ["file:///etc/passwd", "Only https:"],
    ["ftp://example.org", "Only https:"],
    ["HTTPS://example.org", "Only https:"],
    ["http://example.org", "Use https:"],
    ["//evil.example", "Protocol-relative"],
    ["/\\evil.example", "not allowed"],
    ["\\\\evil.example", "not allowed"],
    ["#contact", "Only https:"],
    ["relative/path", "Only https:"],
    ["https://user:pass@example.org", "user name or password"],
    ["https://user@example.org", "user name or password"],
    ["https://example.org@evil.example", "user name or password"],
    ["https://localhost", "full domain name"],
    ["https://:80", "Not a valid web address"],
    ["https://", "Not a valid web address"],
    ["https://exa mple.org", "not allowed"],
    [" https://example.org", "not allowed"],
    ["https://example.org/a b", "not allowed"],
    [`https://example.org/${ch(0x09)}`, "not allowed"],
    [`java${ch(0x0a)}script:alert(1)`, "not allowed"],
    [`${ch(0x200b)}javascript:alert(1)`, "not allowed"],
    [`https://example.org${ch(0x202e)}gro.live`, "not allowed"],
    [`https://ex${ch(0x430)}mple.org`, "not allowed"],
    [`https://example.org${ch(0xff0f)}evil`, "not allowed"],
    [`${ch(0xff0f)}path`, "not allowed"],
    ["https://example.org/%zz", "percent-encoding"],
    ["https://example.org/%2", "percent-encoding"],
    ["https://example.org/\"onmouseover=x", "not allowed"],
    ["https://example.org/<script>", "not allowed"],
    ["https://example.org/(x)", "not allowed"],
    ["https://example.org/'x'", "not allowed"],
    ["mailto:nobody", "Not a valid email link"],
    ["mailto:a@b", "Not a valid email link"],
    ["mailto:a@b.c,d@e.f", "Not a valid email link"],
  ])("refuses %j", (href, msg) => {
    expect(hrefProblem(href)).toContain(msg);
    expect(isAllowedHref(href)).toBe(false);
  });

  it("upgrades http: to https: and leaves everything else alone", () => {
    expect(upgradeHref("http://www.youtube.com/@LawforAISafety")).toBe("https://www.youtube.com/@LawforAISafety");
    expect(upgradeHref("https://a.org")).toBe("https://a.org");
    expect(upgradeHref("/a")).toBe("/a");
    expect(upgradeHref("HTTP://a.org")).toBe("HTTP://a.org");
  });
});

describe("text characters", () => {
  const FORBIDDEN = [
    // C0 and C1 controls, tab, carriage return, delete
    0x00, 0x07, 0x09, 0x0d, 0x1b, 0x7f, 0x85, 0x9f,
    // format characters: soft hyphen, Arabic letter mark, Mongolian vowel separator,
    // zero-width space, non-joiner and joiner, LRM/RLM, bidi embeddings and isolates,
    // word joiner and invisible operators, byte order mark, tag characters
    0xad, 0x61c, 0x180e, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202e, 0x2060, 0x2061, 0x2064,
    0x2066, 0x2069, 0xfeff, 0xe0001, 0xe0041, 0xe007f,
    // line and paragraph separators
    0x2028, 0x2029,
    // variation selectors
    0xfe00, 0xfe0f, 0xe0100,
    // lone surrogates
    0xd800, 0xdbff, 0xdc00, 0xdfff,
  ];

  it.each(FORBIDDEN)("refuses U+%s in text, in marks and in list items", (code) => {
    const c = cp(code);
    expect(hasForbiddenText(`a${c}b`)).toBe(true);
    for (const text of [`a${c}b`, `**a${c}b**`, `[a${c}b](/field-building)`, `- ok\n- a${c}b`]) {
      expect(() => parseRichText(text)).toThrow("Control or invisible formatting character");
      expect(() => formatRichText(text)).toThrow("Control or invisible formatting character");
    }
    expect(() => serializeRichText([para(run(`a${c}b`))])).toThrow("control or invisible");
  });

  it("allows ordinary non-ASCII text, emoji and no-break spaces", () => {
    for (const text of ["Raphaël Weuts, Ondřej Kolář — “AI” ’s", `${cp(0x1f600)} ok`, `15${ch(0xa0)}September`]) {
      expect(hasForbiddenText(text)).toBe(false);
      expect(parseRichText(text)).toEqual([para(run(text))]);
    }
  });
});

describe("Unicode normalisation", () => {
  const nfc = "Raphaël Kolář";
  const nfd = nfc.normalize("NFD");

  it("refuses text not in NFC", () => {
    expect(nfd).not.toBe(nfc);
    expect(() => parseRichText(nfd)).toThrow("not in Unicode NFC form");
    expect(() => parseRichText(`**${nfd}**`)).toThrow("not in Unicode NFC form");
  });

  it("formats and serialises text as NFC", () => {
    expect(formatRichText(nfd)).toBe(nfc);
    expect(formatRichText(`- ==${nfd}==`)).toBe(`- ==${nfc}==`);
    expect(serializeRichText([para(run(nfd, { italic: true }))])).toBe(`*${nfc}*`);
  });
});

describe("formatRichText", () => {
  it.each([
    ["  padded  ", "padded"],
    ["[YouTube](http://www.youtube.com/@LawforAISafety)", "[YouTube](https://www.youtube.com/@LawforAISafety)"],
    ["\\(needless\\) escapes", "(needless) escapes"],
    ["**a****b**", "**ab**"],
    ["**a **b", "**a** b"],
    ["**==a==**", "==**a**=="],
    ["*==a==* and [**==b==**](/x)", "==*a*== and [==**b**==](/x)"],
    ["==ab====cd==", "==abcd=="],
    ["", ""],
  ])("%j becomes %j", (input, output) => {
    expect(formatRichText(input)).toBe(output);
    expect(serializeRichText(parseRichText(output))).toBe(output);
  });

  it("still refuses what the grammar does not allow", () => {
    expect(() => formatRichText("<b>x</b>")).toThrow("HTML is not supported");
    expect(() => formatRichText("[x](javascript:alert)")).toThrow("Only https:");
  });

  it.each(["*a **b** c*", "*a **b c*", "*a**b** c*"])("refuses the ambiguous %j instead of dropping a mark", (text) => {
    expect(() => formatRichText(text)).toThrow("Ambiguous ** inside italic");
  });

  it("formats unambiguous bold and italic next to each other", () => {
    expect(formatRichText("*a* **b**")).toBe("*a* **b**");
    expect(formatRichText("**a *b***")).toBe("**a *b***");
    expect(formatRichText("[x](http://a.org) *a***b**")).toBe("[x](https://a.org) *a***b**");
  });

  it("only upgrades http: links when asked", () => {
    expect(() => parseRichTextLoose("[x](http://a.org)")).toThrow("Use https:");
    expect(parseRichTextLoose("[x](http://a.org)", { upgradeHttp: true })).toEqual([para(run("x", { link: "https://a.org" }))]);
  });
});

describe("inlineTree", () => {
  it("nests marks the way the serialiser writes them", () => {
    const doc = parseRichText("a [**b** *c*](/x) ==d==");
    expect(inlineTree((doc[0] as { runs: Run[] }).runs)).toEqual([
      { type: "text", text: "a " },
      {
        type: "link",
        href: "/x",
        children: [
          { type: "bold", children: [{ type: "text", text: "b" }] },
          { type: "text", text: " " },
          { type: "italic", children: [{ type: "text", text: "c" }] },
        ],
      },
      { type: "text", text: " " },
      { type: "wavy", children: [{ type: "text", text: "d" }] },
    ]);
  });

  it("refuses a link the serialiser would refuse", () => {
    expect(() => inlineTree([run("x", { link: "javascript:alert(1)" })])).toThrow("Link not allowed");
  });
});

// ---------------------------------------------------------------------------
// Random testing, with a fixed seed so a failure always reproduces.

function random(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T,>(xs: readonly T[]) => xs[int(xs.length)];
  return { next, int, pick };
}

const TEXT_PIECES = [
  "a", "b", "word", " ", " ", "  ", "*", "**", "=", "==", "[", "]", "(", ")", "\\", "_", "__", "~", "~~",
  "<", "<b", "</", "!", "#", ">", "- ", "-", "+ ", "1. ", "2) ", "`", "&", "&amp;", "&#1;", ".", ",", "é", "Å", "ñ", "’", ch(0xa0),
];
const HREFS = ["/", "/field-building", "/#contact", "mailto:info@lawforaisafety.org", "https://example.org/a?b=1"];

function randomMarks(r: ReturnType<typeof random>): Marks {
  const m: Marks = {};
  if (r.next() < 0.3) m.bold = true;
  if (r.next() < 0.3) m.italic = true;
  if (r.next() < 0.25) m.wavy = true;
  if (r.next() < 0.2) m.link = r.pick(HREFS);
  return m;
}

function randomLine(r: ReturnType<typeof random>): Run[] {
  const runs: Run[] = [];
  const n = 1 + r.int(5);
  for (let i = 0; i < n; i++) {
    let text = "";
    const pieces = 1 + r.int(4);
    for (let j = 0; j < pieces; j++) text += r.pick(TEXT_PIECES);
    runs.push(run(text, randomMarks(r)));
  }
  // A line holds some visible text and never starts or ends with whitespace.
  runs[0] = run(`x${runs[0].text}`, runs[0].marks);
  runs[runs.length - 1] = run(`${runs[runs.length - 1].text}y`, runs[runs.length - 1].marks);
  return runs;
}

function randomDoc(r: ReturnType<typeof random>): RichText {
  const doc: RichText = [];
  const n = 1 + r.int(3);
  for (let i = 0; i < n; i++) {
    if (r.next() < 0.3) {
      doc.push({ type: "bulletList", items: Array.from({ length: 1 + r.int(3) }, () => randomLine(r)) });
    } else {
      doc.push(para(...randomLine(r)));
    }
  }
  return doc;
}

/** Each character with its marks; whitespace drops its marks, which may move to either side. */
function marksPerChar(runs: Run[]): string[] {
  return runs.flatMap((r) =>
    [...r.text].map((c) =>
      /\s/.test(c) ? c : `${c}${r.marks.bold ? "B" : ""}${r.marks.italic ? "I" : ""}${r.marks.wavy ? "W" : ""}${r.marks.link ?? ""}`,
    ),
  );
}

function lines(doc: RichText): Run[][] {
  return doc.flatMap((block) => (block.type === "paragraph" ? [block.runs] : block.items));
}

describe("random documents", () => {
  it("serialise to canonical text that parses back to the same text and marks", () => {
    const r = random(20261015);
    for (let i = 0; i < 3000; i++) {
      const doc = randomDoc(r);
      const text = serializeRichText(doc);
      const parsed = parseRichText(text);
      expect(serializeRichText(parsed)).toBe(text);
      expect(parsed.map((b) => b.type)).toEqual(doc.map((b) => b.type));
      expect(lines(parsed).map(marksPerChar)).toEqual(lines(doc).map(marksPerChar));
    }
  });

  it("random strings are either refused with a RichTextError or are canonical", () => {
    const r = random(42);
    const pieces = [...TEXT_PIECES, "\n", "\n\n", "- ", "[x](/a)", "](", "](https://a.org)", "](http://a.org)", "***"];
    let accepted = 0;
    for (let i = 0; i < 5000; i++) {
      let text = "";
      const n = 1 + r.int(8);
      for (let j = 0; j < n; j++) text += r.pick(pieces);
      let doc: RichText;
      try {
        doc = parseRichText(text);
      } catch (e) {
        expect(e).toBeInstanceOf(RichTextError);
        continue;
      }
      accepted++;
      expect(serializeRichText(doc)).toBe(text);
      expect(formatRichText(text)).toBe(text);
    }
    expect(accepted).toBeGreaterThan(100);
  });

  /** Rewrites canonical text into a non-canonical spelling of the same document. */
  const MUTATIONS: [string, (text: string) => string][] = [
    ["edge whitespace", (t) => `  ${t}\n `],
    ["http: links", (t) => t.replaceAll("](https://", "](http://")],
    ["needless escapes", (t) => t.replace(/(?<![\]\\])([(,])/g, "\\$1")],
    ["NFD", (t) => t.normalize("NFD")],
    ["mark order", (t) => t.replace(/(?<!\*)==\*\*([A-Za-z]+)\*\*==(?!\*)/g, "**==$1==**")],
    ["split marks", (t) => t.replace(/==([A-Za-z])([A-Za-z]+)==/g, "==$1====$2==")],
  ];

  it("formatting turns non-canonical spellings back into the canonical text, a fixed point", () => {
    const r = random(7);
    const changedBy = new Map<string, number>();
    for (let i = 0; i < 3000; i++) {
      const canonical = serializeRichText(randomDoc(r));
      let messy = canonical;
      for (let k = 0; k < 1 + r.int(3); k++) {
        const [name, mutate] = r.pick(MUTATIONS);
        const next = mutate(messy);
        if (next !== messy) changedBy.set(name, (changedBy.get(name) ?? 0) + 1);
        messy = next;
      }
      const formatted = formatRichText(messy);
      expect(formatted).toBe(canonical);
      expect(serializeRichText(parseRichText(formatted))).toBe(formatted);
      expect(formatRichText(formatted)).toBe(formatted);
    }
    // Every mutation really produced non-canonical text.
    for (const [name] of MUTATIONS) expect(changedBy.get(name) ?? 0, name).toBeGreaterThan(0);
  });
});
