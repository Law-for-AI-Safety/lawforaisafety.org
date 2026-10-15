import { notFound } from "next/navigation";
import { siteDirs, titleCardPages } from "@/cms/site";
import { renderShareImage } from "../../og-image";

// One share image per content page (but the homepage), made from its title at build time.
// pageMetadata (src/cms/PageView.tsx) points the page's Open Graph and X images here.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return titleCardPages(siteDirs()).map((p) => ({ slug: p.slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = titleCardPages(siteDirs()).find((p) => p.slug === slug);
  if (!page) notFound();
  return renderShareImage(page.page.title);
}
