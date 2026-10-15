import type { Metadata } from "next";
import content from "../../../content/red-lines-dialogue.json";
import PageView, { pageMetadata } from "@/cms/PageView";
import { parsePage } from "@/cms/schema";

// Rendered from content/red-lines-dialogue.json at build time; the page is static.
const page = parsePage("red-lines-dialogue", content);

export const metadata: Metadata = pageMetadata("red-lines-dialogue", page);

export default function RedLinesDialoguePage() {
  return <PageView slug="red-lines-dialogue" page={page} />;
}
