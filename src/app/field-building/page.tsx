import type { Metadata } from "next";
import content from "../../../content/field-building.json";
import PageView, { pageMetadata } from "@/cms/PageView";
import { parsePage } from "@/cms/schema";

// Rendered from content/field-building.json at build time; the page is static.
const page = parsePage("field-building", content);

export const metadata: Metadata = pageMetadata("field-building", page);

export default function FieldBuildingPage() {
  return <PageView slug="field-building" page={page} />;
}
