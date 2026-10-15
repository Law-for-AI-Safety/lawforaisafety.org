import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import content from "../../content/field-building.json";
import PageView, { pageMetadata } from "./PageView";
import { parsePage, type PageContent } from "./schema";

const fieldBuilding = parsePage("field-building", content);

describe("the field-building page", () => {
  it("renders its blocks in alternating bands between the nav and the footer", () => {
    const { container } = render(<PageView slug="field-building" page={fieldBuilding} />);
    const main = container.querySelector("main.flex.flex-col.font-sans")!;
    const sections = [...main.querySelectorAll(":scope > section")];
    expect(sections.map((s) => s.className.split(" ")[0])).toEqual([
      "bg-brand-white",
      "bg-brand-navy",
      "bg-brand-white",
      "bg-brand-navy/[0.04]",
      "bg-brand-white",
    ]);
    expect(main.querySelector("nav")).not.toBeNull();
    expect(main.querySelector("footer")).not.toBeNull();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Field-building and Coordination");
    expect(sections[1].querySelector("blockquote")).toHaveTextContent(/^Our mission is to build/);
    expect(within(sections[2] as HTMLElement).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Meet-ups",
      "Field directory",
      "Research",
      "Webinars",
      "Franchise",
    ]);
    expect(screen.getByRole("link", { name: "YouTube channel" })).toHaveAttribute("href", "https://www.youtube.com/@LawforAISafety");
    expect(sections[3].querySelector("h2")).toHaveTextContent("Two research areas we're eager to explore");
    expect(sections[4].id).toBe("contact");
    expect(sections[4].querySelector('input[name="source"]')).toHaveValue("field_building");
  });

  it("shows the apply toast after an application", () => {
    window.history.replaceState(null, "", "/field-building?applied=1");
    render(<PageView slug="field-building" page={fieldBuilding} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("a page with the Red Lines form", () => {
  const page: PageContent = {
    ...fieldBuilding,
    blocks: [
      fieldBuilding.blocks[0],
      {
        type: "applicationSection",
        form: "redLines",
        heading: "How can experts contribute?",
        intro: "Apply.",
        showForm: true,
        closedMessage: "Closed.",
      },
    ],
  };

  it("uses the Red Lines toast", () => {
    window.history.replaceState(null, "", "/red-lines-dialogue?applied=1");
    render(<PageView slug="red-lines-dialogue" page={page} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("pageMetadata", () => {
  it("gives the field-building title, description and canonical URL, and no share image of its own", () => {
    expect(pageMetadata("field-building", fieldBuilding)).toEqual({
      title: "Field-building and Coordination | Law for AI Safety",
      description:
        "Building, coordinating, and mobilising a European legal field dedicated to reducing large-scale risks from AI.",
      alternates: { canonical: "/field-building" },
    });
  });

  it("uses a picked share image for Open Graph and Twitter", () => {
    const metadata = pageMetadata("field-building", { ...fieldBuilding, shareImage: "/images/team-group.webp" });
    expect(metadata.openGraph).toEqual({ images: ["/images/team-group.webp"] });
    expect(metadata.twitter).toEqual({ card: "summary_large_image", images: ["/images/team-group.webp"] });
  });
});
