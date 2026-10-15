import type { ReactNode } from "react";
import Link from "next/link";
import RingBullet from "../app/RingBullet";
import WavyUnderline from "../app/WavyUnderline";
import { inlineTree, parseRichText, type InlineNode, type Run } from "./rich-text";

/**
 * Renders rich-text strings as React elements. Text only ever becomes text nodes, never
 * HTML. Links are checked again here (by `inlineTree`), so an unsafe target throws rather
 * than renders.
 */

const LINK_CLASS = "underline hover:text-brand-black";

function renderLink(href: string, children: ReactNode, key: number): ReactNode {
  if (href.startsWith("/")) {
    return (
      <Link key={key} href={href} className={LINK_CLASS}>
        {children}
      </Link>
    );
  }
  if (href.startsWith("mailto:")) {
    return (
      <a key={key} href={href} className={LINK_CLASS}>
        {children}
      </a>
    );
  }
  return (
    <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
      {children}
    </a>
  );
}

function renderNodes(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, key) => {
    switch (node.type) {
      case "text":
        return node.text;
      case "bold":
        return <strong key={key}>{renderNodes(node.children)}</strong>;
      case "italic":
        return <em key={key}>{renderNodes(node.children)}</em>;
      case "wavy":
        return <WavyUnderline key={key}>{renderNodes(node.children)}</WavyUnderline>;
      case "link":
        return renderLink(node.href, renderNodes(node.children), key);
    }
  });
}

/** One line of runs, nested into marks. */
export function Runs({ runs }: { runs: Run[] }) {
  return <>{renderNodes(inlineTree(runs))}</>;
}

/** A single-paragraph rich-text field, placed inside the block's own element. */
export function InlineText({ value }: { value: string }) {
  const doc = parseRichText(value);
  if (doc.length !== 1 || doc[0].type !== "paragraph") {
    throw new Error("Expected a single paragraph of rich text");
  }
  return <Runs runs={doc[0].runs} />;
}

/**
 * A rich-text field of paragraphs and bullet lists. Each paragraph is a `<p>` with the
 * block's paragraph classes; lists use ring bullets.
 */
export function RichTextBlocks({
  value,
  paragraphClassName,
  listItemClassName,
}: {
  value: string;
  paragraphClassName: string;
  listItemClassName: string;
}) {
  return (
    <>
      {parseRichText(value).map((block, i) =>
        block.type === "paragraph" ? (
          <p key={i} className={paragraphClassName}>
            <Runs runs={block.runs} />
          </p>
        ) : (
          <ul key={i} className="flex flex-col gap-3">
            {block.items.map((item, j) => (
              <li key={j} className={listItemClassName}>
                <span className="flex-shrink-0 pt-1.5">
                  <RingBullet size={16} />
                </span>
                <span>
                  <Runs runs={item} />
                </span>
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}
