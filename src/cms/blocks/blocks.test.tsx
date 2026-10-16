import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tone } from "../bands";
import type { BlockContent } from "../schema";
import { blockSchema } from "../schema";
import Block from "./Block";

/** Renders a block after checking its content against the schema, as a page would. */
function renderBlock(content: unknown, tone: Tone = "white", path = "/field-building", id?: string) {
  const block = blockSchema("strict").parse(content) as BlockContent;
  const { container } = render(<Block block={block} tone={tone} path={path} id={id} />);
  return container.firstElementChild as HTMLElement;
}

const LIGHT_SECTION = "px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10";

describe("Hero", () => {
  it("shows the heading, the rule and the lede", () => {
    const section = renderBlock({ type: "hero", heading: "Field-building", lede: "Lawyers. ==No overview== yet." }, "white");
    expect(section.tagName).toBe("SECTION");
    expect(section.className).toBe("bg-brand-white flex flex-col justify-center px-8 md:px-16 pt-44 pb-20 md:pt-52 md:pb-24");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Field-building");
    expect(section.querySelector("h1 + svg")).not.toBeNull();
    const lede = section.querySelector("p")!;
    expect(lede).toHaveClass("text-xl", "md:text-2xl", "text-brand-navy/85");
    expect(lede).toHaveTextContent("Lawyers. No overview yet.");
    expect(lede.querySelector("span.relative.inline-block")).toHaveTextContent("No overview");
  });
});

describe("QuoteBand", () => {
  it.each([
    ["navy", "bg-brand-navy"],
    ["black", "bg-brand-black"],
  ] as const)("sits in a %s band", (tone, bg) => {
    const section = renderBlock({ type: "quoteBand", quote: "Our *mission*." }, tone);
    expect(section.className).toBe(`${bg} px-8 md:px-16 py-24 md:py-32`);
    const quote = section.querySelector("blockquote")!;
    expect(quote).toHaveClass("text-brand-white");
    expect(quote).toHaveTextContent("Our mission.");
    expect(quote.querySelector("em")).toHaveTextContent("mission");
  });
});

describe("QuoteBand with text and photos", () => {
  const photo = (n: number) => ({ image: `/images/conference-ai-act-${n}.webp`, alt: `Panel ${n}` });

  it("shows paragraphs under the quote, then a wide photo with its caption, and carries an anchor", () => {
    const section = renderBlock(
      { type: "quoteBand", quote: "The time is now.", body: "First.\n\nSecond.", photos: [photo(1)], caption: "On the panel." },
      "navy",
      "/",
      "mission",
    );
    expect(section.id).toBe("mission");
    const paragraphs = [...section.querySelectorAll("p")];
    expect(paragraphs.map((p) => p.textContent)).toEqual(["First.", "Second.", "On the panel."]);
    expect(paragraphs[0]).toHaveClass("text-xl", "md:text-2xl", "text-brand-white/90");
    const img = screen.getByRole("img", { name: "Panel 1" });
    expect(img.parentElement).toHaveClass("aspect-[4/3]", "md:aspect-[16/9]");
  });

  it("shows photos without a caption, and no anchor unless given one", () => {
    const section = renderBlock({ type: "quoteBand", quote: "Q.", photos: [photo(1), photo(2)] }, "black");
    expect(section.id).toBe("");
    expect(section.querySelectorAll("img")).toHaveLength(2);
    expect(section.querySelector(".grid")).toHaveClass("md:grid-cols-2");
    expect(section.querySelectorAll("p")).toHaveLength(0);
  });

  it("refuses a caption without a photo", () => {
    expect(blockSchema("strict").safeParse({ type: "quoteBand", quote: "Q.", caption: "C." }).success).toBe(false);
  });
});

describe("Milestones", () => {
  const entry = (title: string, extra: Record<string, unknown> = {}) => ({ title, body: `About ${title}.`, ...extra });

  it("shows titled entries along the rail, with photos and buttons", () => {
    const section = renderBlock(
      {
        type: "milestones",
        heading: "Our story",
        entries: [
          entry("First", { photos: [1, 2, 3].map((n) => ({ image: `/images/conference-ai-act-${n}.webp`, alt: `P${n}` })) }),
          entry("Second", { buttons: [{ label: "Connect on LinkedIn", href: "https://www.linkedin.com/company/law-for-ai-safety/" }] }),
          entry("Last"),
        ],
      },
      "white",
      "/",
      "our-story",
    );
    expect(section.id).toBe("our-story");
    expect(section.className).toBe(`bg-brand-white ${LIGHT_SECTION}`);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Our story");
    expect(screen.getByRole("heading", { level: 2 })).toHaveClass("text-[2.0625rem]", "md:text-[2.625rem]");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["First", "Second", "Last"]);
    // The rail sits beside every entry but the last.
    const rail = section.querySelector(".h-\\[calc\\(100\\%\\+184px\\)\\]")!;
    expect(rail.parentElement!.querySelectorAll("h3")).toHaveLength(2);
    // The list sits clear of the heading, so the rail's top tip does not reach it.
    expect(rail.parentElement!.parentElement).toHaveClass("pt-6");
    expect(section.querySelector(".grid")).toHaveClass("md:grid-cols-3");
    const button = screen.getByRole("link", { name: "Connect on LinkedIn" });
    expect(button).toHaveAttribute("href", "https://www.linkedin.com/company/law-for-ai-safety/");
    expect(button).toHaveClass("bg-brand-red");
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("has no rail with a single entry", () => {
    const section = renderBlock({ type: "milestones", heading: "Story", entries: [entry("Only")] });
    expect(section.querySelector(".rail-fill")).toBeNull();
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Only");
  });
});

describe("TextSection with a document", () => {
  it("shows the PDF in the page with a link that opens it in a new tab", () => {
    const section = renderBlock({
      type: "textSection",
      body: "The letter.",
      documents: [
        {
          file: "/documents/red-lines-dialogue-mep-beke-letter-2026-09-01.pdf",
          title: "Letter from MEP Wouter Beke",
          linkText: "Open the letter in a new tab",
        },
      ],
    });
    const link = screen.getByRole("link", { name: "Open the letter in a new tab" });
    expect(link).toHaveAttribute("href", "/documents/red-lines-dialogue-mep-beke-letter-2026-09-01.pdf");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.parentElement).toHaveClass("max-w-xl");
    expect(section.querySelectorAll("a")).toHaveLength(1);
  });

  it("refuses a file outside /documents/, or not a PDF", () => {
    for (const file of ["/images/team-group.webp", "/documents/letter.docx", "https://example.org/a.pdf"]) {
      const block = { type: "textSection", body: "B.", documents: [{ file, title: "T", linkText: "L" }] };
      expect(blockSchema("strict").safeParse(block).success, file).toBe(false);
    }
  });
});

describe("heading sizes", () => {
  it("sit halfway between the blocks' first sizes and the old homepage's", () => {
    renderBlock({ type: "hero", heading: "H", lede: "L." });
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("text-[2.625rem]", "md:text-[4.125rem]");
    const quote = renderBlock({ type: "quoteBand", quote: "Q." }, "navy").querySelector("blockquote");
    expect(quote).toHaveClass("text-[2.0625rem]", "md:text-[3.1875rem]");
  });
});

describe("TextSection without a heading", () => {
  it("shows the rule, the text and photos, with no heading", () => {
    const section = renderBlock({
      type: "textSection",
      body: "Workshops.",
      photos: [{ image: "/images/foi-workshop-audience.webp", alt: "Workshop" }],
    });
    expect(section.querySelector("svg")).not.toBeNull();
    expect(section.querySelector("h2")).toBeNull();
    expect(section).toHaveTextContent("Workshops.");
    expect(screen.getByRole("img", { name: "Workshop" })).toBeInTheDocument();
  });
});

describe("TextSection", () => {
  it("shows a heading over paragraphs and lists", () => {
    const section = renderBlock({ type: "textSection", heading: "Who is working on it?", body: "First.\n\n- a\n- b" }, "tint");
    expect(section.className).toBe(`bg-brand-navy/[0.04] ${LIGHT_SECTION}`);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Who is working on it?");
    expect(section.querySelector("p")).toHaveClass("text-lg", "text-brand-navy/85", "max-w-2xl");
    expect(within(section).getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("CardList", () => {
  const items = [
    { title: "Meet-ups", body: "We meet." },
    { title: "Webinars", body: "See our [channel](https://www.youtube.com/@LawforAISafety)." },
  ];

  it("numbers items when the style is numbered", () => {
    const section = renderBlock({ type: "cardList", style: "numbered", items }, "white");
    expect(section.className).toBe(`bg-brand-white ${LIGHT_SECTION}`);
    expect(section.querySelector("h2")).toBeNull();
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["Meet-ups", "Webinars"]);
    const numbers = [...section.querySelectorAll("span.text-brand-red\\/30")].map((s) => s.textContent);
    expect(numbers).toEqual(["1", "2"]);
    expect(within(section).getByRole("link", { name: "channel" })).toHaveAttribute("target", "_blank");
  });

  it("lists items with ring bullets under a heading when the style is bullets", () => {
    const section = renderBlock({ type: "cardList", style: "bullets", heading: "Two research areas", items }, "tint");
    expect(section.className).toBe(`bg-brand-navy/[0.04] ${LIGHT_SECTION}`);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Two research areas");
    const listItems = within(section).getAllByRole("listitem");
    expect(listItems).toHaveLength(2);
    expect(listItems[0].querySelector("svg")).not.toBeNull();
    const title = listItems[0].querySelector("span.text-xl")!;
    expect(title).toHaveTextContent("Meet-ups");
    // The title carries the wavy underline.
    expect(title.querySelector("span.relative.inline-block svg")).not.toBeNull();
    expect(listItems[0]).toHaveTextContent("We meet.");
  });
});

describe("TeamGrid", () => {
  it("shows each person as text, with a LinkedIn link when there is one", () => {
    const section = renderBlock(
      {
        type: "teamGrid",
        heading: "Team",
        members: [
          { name: "Karolina Gruzel", role: "Executive Director", bio: "Field-builder.", linkedin: "https://www.linkedin.com/in/karolina-gruzel/" },
          { name: "No Profile", role: "Volunteer", bio: "Helps." },
        ],
      },
      "navy",
    );
    expect(section.id).toBe("team");
    expect(section.className).toBe("bg-brand-navy px-8 md:px-16 py-28 md:py-40");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Team");
    expect(section.querySelector("img")).toBeNull();
    expect(section.querySelector(".rounded-full")).toBeNull();
    const link = screen.getByRole("link", { name: "Karolina Gruzel on LinkedIn" });
    expect(link).toHaveAttribute("href", "https://www.linkedin.com/in/karolina-gruzel/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("link", { name: "No Profile on LinkedIn" })).toBeNull();
    expect(section).toHaveTextContent("Executive Director");
    expect(section).toHaveTextContent("Helps.");
  });
});

describe("TeamGrid photos", () => {
  it("shows a picked photo, round, with its alt text", () => {
    const section = renderBlock(
      {
        type: "teamGrid",
        heading: "Team",
        members: [
          {
            name: "Karolina Gruzel",
            role: "Executive Director",
            bio: "Field-builder.",
            photo: "/images/karolina-gruzel.webp",
            photoAlt: "Portrait of Karolina Gruzel",
          },
        ],
      },
      "black",
    );
    expect(section.className).toBe("bg-brand-black px-8 md:px-16 py-28 md:py-40");
    const img = screen.getByRole("img", { name: "Portrait of Karolina Gruzel" });
    // The test runs without next.config's `unoptimized`, so the src may go through the image route.
    expect(decodeURIComponent(img.getAttribute("src")!)).toContain("/images/karolina-gruzel.webp");
    expect(img.closest("div")).toHaveClass("relative", "w-12", "h-12", "rounded-full", "overflow-hidden", "flex-shrink-0");
    expect(img.closest("div")?.nextElementSibling).toHaveTextContent("Karolina Gruzel");
  });
});

describe("Timeline", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  });

  it("shows each date with its time and text", () => {
    const section = renderBlock(
      {
        type: "timeline",
        heading: "Current timeline",
        entries: [
          { date: "5 October 2026", text: "Working Group prepares scope and format" },
          { date: "12 October 2026", time: "09:00 CEST", utc: "2026-10-12T07:00:00Z", text: "Online meeting" },
          { date: "March 2027", time: "tentative", text: "Presentation" },
        ],
      },
      "tint",
    );
    expect(section.className).toBe(`bg-brand-navy/[0.04] ${LIGHT_SECTION}`);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Current timeline");
    expect(section).toHaveTextContent("5 October 2026");
    expect(section).toHaveTextContent("09:00 CEST");
    expect(section).toHaveTextContent("Working Group prepares scope and format");
    expect(section.querySelector("circle[stroke-dasharray]")).not.toBeNull();
  });
});

describe("ApplicationSection", () => {
  const apply = {
    type: "applicationSection",
    form: "apply",
    heading: "Get involved",
    intro: "Apply below.",
    showForm: true,
    closedMessage: "Applications aren't open right now. Email [info@lawforaisafety.org](mailto:info@lawforaisafety.org).",
  };

  it("shows the apply form for the page's source while open", () => {
    const section = renderBlock(apply, "white");
    expect(section.id).toBe("contact");
    expect(section.className).toBe(`bg-brand-white ${LIGHT_SECTION}`);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Get involved");
    expect(section.querySelector("p")).toHaveClass("text-lg", "md:text-xl");
    expect(section.querySelector('input[name="source"]')).toHaveValue("field_building");
    expect(section).not.toHaveTextContent("aren't open");
  });

  it("shows the closed message instead of the form while closed", () => {
    const section = renderBlock({ ...apply, showForm: false }, "tint");
    expect(section.querySelector("form")).toBeNull();
    expect(section).toHaveTextContent("Applications aren't open right now.");
    expect(screen.getByRole("link", { name: "info@lawforaisafety.org" })).toHaveAttribute("href", "mailto:info@lawforaisafety.org");
  });

  it("shows the error banner from the redirect", () => {
    window.history.replaceState(null, "", "/field-building?error=email");
    const section = renderBlock(apply);
    expect(section).toHaveTextContent("That email address doesn't look right.");
  });

  it("shows buttons, the newsletter and a heading over the form, as on the homepage", () => {
    const section = renderBlock(
      {
        ...apply,
        buttons: [
          { label: "Contact us", href: "mailto:info@lawforaisafety.org" },
          { label: "Follow our work", href: "https://www.linkedin.com/company/law-for-ai-safety/" },
        ],
        newsletterHeading: "Stay updated with our newsletter",
        formHeading: "Work with us",
      },
      "white",
      "/",
    );
    const contact = screen.getByRole("link", { name: "Contact us" });
    expect(contact).toHaveClass("border");
    expect(contact).not.toHaveClass("bg-brand-red");
    expect(contact.querySelector("svg path[d^='M20.447']")).toBeNull();
    expect(screen.getByRole("link", { name: "Follow our work" })).toHaveClass("bg-brand-red");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Stay updated with our newsletter", "Work with us"]);
    expect(section.querySelector('input[type="email"]')).not.toBeNull();
    expect(section.querySelector('input[name="source"]')).toHaveValue("homepage");
  });

  it("shows neither the newsletter nor the form heading while closed", () => {
    const section = renderBlock({ ...apply, showForm: false, newsletterHeading: "News", formHeading: "Work with us" }, "white", "/");
    expect(section.querySelector("h3")).toBeNull();
    expect(section.querySelector("form")).toBeNull();
  });

  describe("Red Lines", () => {
    const redLines = { ...apply, form: "redLines", heading: "How can experts contribute?", formNote: "Applying takes about five minutes." };

    it("shows the note and the Red Lines form while open", () => {
      const section = renderBlock(redLines, "white", "/red-lines-dialogue");
      expect(section.id).toBe("apply");
      expect(section.querySelector("h2")).not.toHaveClass("max-w-xl");
      expect(section).toHaveTextContent("Applying takes about five minutes.");
      expect(section.querySelector("form")).not.toBeNull();
      expect(section.querySelector('input[name="source"]')).toBeNull();
    });

    it("works without a note", () => {
      const withoutNote: Record<string, unknown> = { ...redLines };
      delete withoutNote.formNote;
      const section = renderBlock(withoutNote, "white", "/red-lines-dialogue");
      expect(section.querySelector("form")).not.toBeNull();
      expect(section).not.toHaveTextContent("five minutes");
    });

    it("shows the closed message, and not the note, while closed", () => {
      const section = renderBlock({ ...redLines, showForm: false }, "white", "/red-lines-dialogue");
      expect(section.querySelector("form")).toBeNull();
      expect(section).not.toHaveTextContent("five minutes");
      expect(section).toHaveTextContent("Applications aren't open right now.");
    });
  });

  describe("on a page with no registered apply form", () => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      vi.mocked(console.error).mockRestore();
    });

    it("refuses to render rather than post under another page's source", () => {
      expect(() => renderBlock(apply, "white", "/somewhere-else")).toThrow("No apply form is registered for /somewhere-else");
    });
  });
});
