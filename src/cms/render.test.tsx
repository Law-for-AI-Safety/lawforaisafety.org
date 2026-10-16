import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineText, RichTextBlocks, Runs } from "./render";

const ch = (code: number) => String.fromCharCode(code);

// A component that throws while rendering makes React log the error; the tests expect it.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.mocked(console.error).mockRestore();
});

function inline(value: string) {
  return render(
    <p>
      <InlineText value={value} />
    </p>,
  ).container.firstElementChild!;
}

describe("marks", () => {
  it("renders bold, italic and wavy underline", () => {
    const p = inline("a **b** *c* ==d==");
    expect(p.querySelector("strong")).toHaveTextContent("b");
    expect(p.querySelector("em")).toHaveTextContent("c");
    const wavy = p.querySelector("span.relative.inline-block");
    expect(wavy).toHaveTextContent("d");
    expect(wavy?.querySelector("svg[aria-hidden]")).not.toBeNull();
    expect(p).toHaveTextContent("a b c d");
  });

  it("nests marks", () => {
    const p = inline("***both*** and [==**linked**==](/field-building)");
    expect(p.querySelector("strong > em")).toHaveTextContent("both");
    expect(p.querySelector("a > span.relative > strong")).toHaveTextContent("linked");
  });
});

describe("links", () => {
  it("renders a site path as a client-side link with no target", () => {
    const a = inline("[FOI work](/freedom-of-information#contact)").querySelector("a")!;
    expect(a.getAttribute("href")).toBe("/freedom-of-information#contact");
    expect(a).toHaveClass("underline", "hover:text-brand-black");
    expect(a).not.toHaveAttribute("target");
    expect(a).not.toHaveAttribute("rel");
  });

  it("renders a mailto link in the same tab", () => {
    const a = inline("[email us](mailto:info@lawforaisafety.org)").querySelector("a")!;
    expect(a.getAttribute("href")).toBe("mailto:info@lawforaisafety.org");
    expect(a).toHaveClass("underline", "hover:text-brand-black");
    expect(a).not.toHaveAttribute("target");
  });

  it("opens an https link in a new tab without an opener or referrer", () => {
    const a = inline("[YouTube channel](https://www.youtube.com/@LawforAISafety)").querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://www.youtube.com/@LawforAISafety");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
    expect(a).toHaveClass("underline", "hover:text-brand-black");
  });

  it.each([
    "javascript:alert",
    "JAVASCRIPT:alert",
    "data:text/html,x",
    "vbscript:x",
    "//evil.example",
    "http://example.org",
    "https://user:pass@example.org",
    "https://user@example.org",
    `java${ch(0x09)}script:alert`,
    `${ch(0x200b)}/field-building`,
    `/field-building${ch(0x202e)}`,
    `https://ex${ch(0x430)}mple.org`,
    "/\\evil.example",
    "javascript:alert(1)",
    "%6Aavascript:alert",
  ])("never renders a link to %j", (href) => {
    expect(() => render(<InlineText value={`[x](${href})`} />)).toThrow();
    expect(document.querySelector("a")).toBeNull();
  });

  it("checks links again when given runs directly", () => {
    expect(() => render(<Runs runs={[{ text: "x", marks: { link: "javascript:alert" } }]} />)).toThrow("Link not allowed");
    expect(() => render(<Runs runs={[{ text: "x", marks: { link: `/a${ch(0x0a)}` } }]} />)).toThrow("Link not allowed");
    expect(document.querySelector("a")).toBeNull();
  });
});

describe("never raw HTML", () => {
  it("renders escaped markup as visible text", () => {
    const p = inline("\\<img src\\=x onerror\\=alert(1)> \\<script>alert(1)\\</script> \\&amp;");
    expect(p.querySelector("img, script")).toBeNull();
    expect(p.textContent).toBe("<img src=x onerror=alert(1)> <script>alert(1)</script> &amp;");
  });

  it("refuses unescaped markup", () => {
    expect(() => render(<InlineText value="<b>x</b>" />)).toThrow("HTML is not supported");
  });

  it("renders text from runs as text, whatever it holds", () => {
    const { container } = render(<Runs runs={[{ text: "<b>bold?</b>", marks: {} }]} />);
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toBe("<b>bold?</b>");
  });
});

describe("InlineText", () => {
  it.each(["One.\n\nTwo.", "- a list", ""])("refuses %j, which is not one paragraph", (value) => {
    expect(() => render(<InlineText value={value} />)).toThrow("Expected a single paragraph");
  });

  it("refuses non-canonical text", () => {
    expect(() => render(<InlineText value="**a****b**" />)).toThrow("Not in canonical form");
  });
});

describe("RichTextBlocks", () => {
  it("renders paragraphs and ring-bullet lists with the block's classes", () => {
    const { container } = render(
      <div>
        <RichTextBlocks value={"First.\n\n- one\n- **two**\n\nLast."} paragraphClassName="para" listItemClassName="item" />
      </div>,
    );
    const root = container.firstElementChild!;
    expect([...root.children].map((el) => el.tagName)).toEqual(["P", "UL", "P"]);
    expect(root.querySelectorAll("p.para")).toHaveLength(2);
    const items = root.querySelectorAll("ul.flex.flex-col.gap-3 > li.item");
    expect(items).toHaveLength(2);
    expect(items[1].querySelector("span.flex-shrink-0 svg")).not.toBeNull();
    expect(items[1].querySelector("strong")).toHaveTextContent("two");
  });
});
