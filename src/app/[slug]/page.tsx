import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageView, { pageMetadata } from "@/cms/PageView";
import { contentRoutePage, contentRoutePages, siteDirs } from "@/cms/site";

// Every content page without a route of its own, built at build time from content/. Any
// other address here is a 404: nothing is rendered on request and nothing reads the database.
export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return contentRoutePages(siteDirs()).map((p) => ({ slug: p.slug }));
}

function load(slug: string) {
  const found = contentRoutePage(siteDirs(), slug);
  if (!found) notFound();
  return found;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return pageMetadata(slug, load(slug).page);
}

export default async function ContentRoutePage({ params }: Props) {
  const { slug } = await params;
  return <PageView slug={slug} page={load(slug).page} />;
}
