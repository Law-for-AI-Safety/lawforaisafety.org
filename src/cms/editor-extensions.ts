/**
 * Tiptap set-up for the CMS rich-text editor. Only the allowed constructs exist in the
 * schema, so ProseMirror drops everything else when parsing pasted or dropped HTML, after
 * `cleanPastedHtml` has fixed what the schema alone gets wrong.
 *
 * There is no hard-break node: a line break inside a paragraph is not part of the format.
 */
import { Mark, type AnyExtension, type EditorOptions } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import { BulletList, ListItem } from "@tiptap/extension-list";
import { UndoRedo } from "@tiptap/extensions";
import { cleanPastedHtml } from "./paste";
import { isAllowedHref } from "./rich-text";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wavy: { toggleWavy: () => ReturnType };
  }
}

/** The site's "wavy underline" flair. Serialised as ==text==. */
export const Wavy = Mark.create({
  name: "wavy",
  parseHTML() {
    return [{ tag: "span[data-wavy]" }];
  },
  renderHTML() {
    return ["span", { "data-wavy": "", class: "cms-wavy" }, 0];
  },
  addCommands() {
    return {
      toggleWavy:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Shift-u": () => this.editor.commands.toggleWavy() };
  },
});

/**
 * `inline` fields hold exactly one paragraph and have no lists; `blocks` fields hold
 * paragraphs and bullet lists.
 */
export type RichTextKind = "inline" | "blocks";

export function cmsExtensions(kind: RichTextKind): AnyExtension[] {
  return [
    Document.extend({ content: kind === "inline" ? "paragraph" : "(paragraph | bulletList)+" }),
    Paragraph,
    Text,
    Bold,
    Italic,
    Wavy,
    Link.configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: true,
      protocols: [],
      isAllowedUri: (url) => isAllowedHref(url),
      // Rendered only inside the editor; the public renderer decides the real attributes.
      HTMLAttributes: { target: null, rel: null, class: null },
    }),
    ...(kind === "blocks" ? [BulletList, ListItem.extend({ content: "paragraph" })] : []),
    UndoRedo,
  ];
}

/** Editor options shared by every CMS rich-text field, in the browser and in tests. */
export function cmsEditorOptions(kind: RichTextKind): Partial<EditorOptions> {
  return {
    extensions: cmsExtensions(kind),
    // The ProseMirror base styles live in the admin stylesheet instead.
    injectCSS: false,
    editorProps: { transformPastedHTML: (html) => cleanPastedHtml(html, { oneParagraph: kind === "inline" }) },
  };
}
