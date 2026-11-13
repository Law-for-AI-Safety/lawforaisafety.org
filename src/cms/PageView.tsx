import type { Metadata } from "next";
import { Fragment, Suspense, type ReactNode } from "react";
import ApplyToast from "../app/ApplyToast";
import Footer from "../app/Footer";
import Nav from "../app/Nav";
import RedLinesApplyToast from "../app/red-lines-dialogue/ApplyToast";
import { bandTones } from "./bands";
import Block from "./blocks/Block";
import { HOME_SLUG, pagePath, pageRules } from "./pages";
import type { PageContent } from "./schema";

const SITE_NAME = "Law for AI Safety";

/**
 * A content page: nav, the apply toast, each block in its band, and the footer. The preview
 * passes `renderBlock` to wrap each rendered block.
 */
export default function PageView({
  slug,
  page,
  renderBlock = (_index, block) => block,
}: {
  slug: string;
  page: Pick<PageContent, "blocks">;
  renderBlock?: (index: number, block: ReactNode) => ReactNode;
}) {
  const path = pagePath(slug);
  const tones = bandTones(page.blocks.map((block) => block.type));
  const anchors = blockAnchors(slug, page);
  const redLines = page.blocks.some((block) => block.type === "applicationSection" && block.form === "redLines");
  return (
    <main className="flex flex-col font-sans">
      <Nav />

      <Suspense fallback={null}>{redLines ? <RedLinesApplyToast /> : <ApplyToast />}</Suspense>

      {page.blocks.map((block, i) => (
        <Fragment key={i}>{renderBlock(i, <Block block={block} tone={tones[i]} path={path} id={anchors[i]} />)}</Fragment>
      ))}

      <Footer />
    </main>
  );
}

/** Each block's anchor id from the page's rules: the nth block of a type gets the nth id listed for it. */
export function blockAnchors(slug: string, page: Pick<PageContent, "blocks">): (string | undefined)[] {
  const anchors = { teamGrid: ["team"], ...pageRules(slug).anchors };
  const seen = new Map<string, number>();
  return page.blocks.map((block) => {
    const n = seen.get(block.type) ?? 0;
    seen.set(block.type, n + 1);
    return anchors[block.type]?.[n];
  });
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
