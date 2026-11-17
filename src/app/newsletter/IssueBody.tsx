import { RichTextBlocks } from "@/cms/render";

/**
 * An issue's body on the website, through the CMS's rich-text renderer: text only ever becomes
 * text nodes, and links are checked again as they render. Site links stay on the site.
 */
export default function IssueBody({ body }: { body: string }) {
  return (
    <RichTextBlocks
      value={body}
      paragraphClassName="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl"
      listItemClassName="text-lg font-light text-brand-navy/85 leading-relaxed flex gap-3"
    />
  );
}
