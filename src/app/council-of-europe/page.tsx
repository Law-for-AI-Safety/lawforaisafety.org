import type { Metadata } from "next";
import content from "../../../content/council-of-europe.json";
import PageView, { pageMetadata } from "@/cms/PageView";
import { parsePage } from "@/cms/schema";

// Rendered from content/council-of-europe.json at build time; the page is static.
const page = parsePage("council-of-europe", content);

export const metadata: Metadata = pageMetadata("council-of-europe", page);

export default function CouncilOfEuropePage() {
  return <PageView slug="council-of-europe" page={page} />;
}
