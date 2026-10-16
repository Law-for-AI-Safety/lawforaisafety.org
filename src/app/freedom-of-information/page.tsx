import type { Metadata } from "next";
import content from "../../../content/freedom-of-information.json";
import PageView, { pageMetadata } from "@/cms/PageView";
import { parsePage } from "@/cms/schema";

// Rendered from content/freedom-of-information.json at build time; the page is static.
const page = parsePage("freedom-of-information", content);

export const metadata: Metadata = pageMetadata("freedom-of-information", page);

export default function FreedomOfInformationPage() {
  return <PageView slug="freedom-of-information" page={page} />;
}
