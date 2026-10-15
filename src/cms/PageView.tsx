import type { Metadata } from "next";
import { Suspense } from "react";
import ApplyToast from "../app/ApplyToast";
import Footer from "../app/Footer";
import Nav from "../app/Nav";
import RedLinesApplyToast from "../app/red-lines-dialogue/ApplyToast";
import { bandTones } from "./bands";
import Block from "./blocks/Block";
import { pagePath } from "./pages";
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

/** The page's title, description, canonical URL and, when one is picked, its share image. */
export function pageMetadata(slug: string, page: PageContent): Metadata {
  return {
    title: `${page.title} | ${SITE_NAME}`,
    description: page.description,
    alternates: { canonical: pagePath(slug) },
    ...(page.shareImage
      ? {
          openGraph: { images: [page.shareImage] },
          twitter: { card: "summary_large_image", images: [page.shareImage] },
        }
      : {}),
  };
}
