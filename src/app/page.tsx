import type { Metadata } from "next";
import content from "../../content/home.json";
import PageView, { pageMetadata } from "@/cms/PageView";
import { parsePage } from "@/cms/schema";

// Rendered from content/home.json at build time; the page is static.
const page = parsePage("home", content);

export const metadata: Metadata = pageMetadata("home", page);

export default function HomePage() {
  return <PageView slug="home" page={page} />;
}
