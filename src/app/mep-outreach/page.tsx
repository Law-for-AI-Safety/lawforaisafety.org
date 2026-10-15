import type { Metadata } from "next";
import content from "../../../content/mep-outreach.json";
import PageView, { pageMetadata } from "@/cms/PageView";
import { parsePage } from "@/cms/schema";

// Rendered from content/mep-outreach.json at build time; the page is static.
const page = parsePage("mep-outreach", content);

export const metadata: Metadata = pageMetadata("mep-outreach", page);

export default function MepOutreachPage() {
  return <PageView slug="mep-outreach" page={page} />;
}
