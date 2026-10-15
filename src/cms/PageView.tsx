import type { Metadata } from "next";
import { Suspense } from "react";
import ApplyToast from "../app/ApplyToast";
import Footer from "../app/Footer";
import Nav from "../app/Nav";
import RedLinesApplyToast from "../app/red-lines-dialogue/ApplyToast";
import { bandTones } from "./bands";
import Block from "./blocks/Block";
import { HOME_SLUG, pagePath } from "./pages";
import type { PageContent } from "./schema";

const SITE_NAME = "Law for AI Safety";

/** A content page: nav, the apply toast, each block in its band, and the footer. */
export default function PageView({ slug, page }: { slug: string; page: PageContent }) {
  const path = pagePath(slug);
  const tones = bandTones(page.blocks.map((block) => block.type));
  const redLines = page.blocks.some((block) => block.type === "applicationSection" && block.form === "redLines");
  return (
    <main className="flex flex-col font-sans">
      <Nav />

      <Suspense fallback={null}>{redLines ? <RedLinesApplyToast /> : <ApplyToast />}</Suspense>

      {page.blocks.map((block, i) => (
        <Block key={i} block={block} tone={tones[i]} path={path} />
      ))}

      <Footer />
    </main>
  );
}

/**
 * The page's title, description, canonical URL and share image. Titles get the site name
 * added, except the homepage's, which is the site name. The share image is the one picked
 * for the page, or else a card made from its title (`src/app/og-assets/[slug]`); the
 * homepage keeps the site's own card.
 */
export function pageMetadata(slug: string, page: PageContent): Metadata {
  const image = page.shareImage ?? (slug === HOME_SLUG ? undefined : `/og-assets/${slug}`);
  return {
    title: slug === HOME_SLUG ? { absolute: page.title } : `${page.title} | ${SITE_NAME}`,
    description: page.description,
    alternates: { canonical: pagePath(slug) },
    ...(image
      ? {
          openGraph: { images: [{ url: image, alt: page.title }] },
          twitter: { card: "summary_large_image", images: [{ url: image, alt: page.title }] },
        }
      : {}),
  };
}
