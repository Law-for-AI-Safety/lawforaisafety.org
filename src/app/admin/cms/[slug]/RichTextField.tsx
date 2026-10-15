"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { editorDocToString, richTextToEditorDoc, type PMNode } from "@/cms/editor-doc";
import { cmsEditorOptions, type RichTextKind } from "@/cms/editor-extensions";
import { cleanHref, hrefProblem, parseRichTextLoose } from "@/cms/rich-text";
import styles from "./editor.module.css";

function toDoc(value: string): PMNode | null {
  try {
    return richTextToEditorDoc(parseRichTextLoose(value));
  } catch {
    return null;
  }
}

function LinkForm({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [href, setHref] = useState(() => String(editor.getAttributes("link").href ?? ""));
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();

  const apply = () => {
    const cleaned = cleanHref(href);
    const why = hrefProblem(cleaned);
    if (why) {
      setProblem(why);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: cleaned }).run();
    onClose();
  };

  return (
    <div className="flex w-full flex-col gap-2 border-t border-brand-black/10 p-2">
      <label htmlFor={id} className="text-sm text-brand-black/80">
        Link to a web address (https://…), an email (mailto:…) or a page on this site (/field-building)
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          value={href}
          autoFocus
          onChange={(e) => {
            setHref(e.target.value);
            setProblem(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          className="min-w-0 flex-1 rounded-sm border border-brand-black/30 px-2 py-1"
        />
        <button type="button" onClick={apply} className="rounded-sm bg-brand-navy px-3 py-1 text-brand-white">
          Apply link
        </button>
        <button type="button" onClick={onClose} className="rounded-sm border border-brand-black/30 px-3 py-1">
          Cancel
        </button>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-brand-red">
          {problem}
        </p>
      )}
    </div>
  );
}

function Toolbar({ editor, kind }: { editor: Editor; kind: RichTextKind }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      wavy: editor.isActive("wavy"),
      link: editor.isActive("link"),
      bulletList: editor.isActive("bulletList"),
      empty: editor.state.selection.empty,
    }),
  });
  const [linking, setLinking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const button = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      aria-pressed={active}
      // Keeps the selection in the text while the button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        setHint(null);
        onClick();
      }}
      className={`rounded-sm border px-2 py-0.5 text-sm ${
        active ? "border-brand-navy bg-brand-navy text-brand-white" : "border-brand-black/30 bg-brand-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-2 border-b border-brand-black/10 p-2">
      {button("Bold", state.bold, () => editor.chain().focus().toggleBold().run())}
      {button("Italic", state.italic, () => editor.chain().focus().toggleItalic().run())}
      {button("Wavy underline", state.wavy, () => editor.chain().focus().toggleWavy().run())}
      {button("Link", state.link, () => {
        if (!state.link && state.empty) {
          setHint("Select the words to link first.");
          return;
        }
        setLinking(true);
      })}
      {state.link && button("Remove link", false, () => editor.chain().focus().extendMarkRange("link").unsetLink().run())}
      {kind === "blocks" && button("Bullet list", state.bulletList, () => editor.chain().focus().toggleBulletList().run())}
      {hint && (
        <span role="status" className="text-sm text-brand-black/70">
          {hint}
        </span>
      )}
      {linking && <LinkForm editor={editor} onClose={() => setLinking(false)} />}
    </div>
  );
}

/**
 * A rich-text field: the toolbar editor, holding the field's content-file string. Every change
 * is converted back to the string and passed to `onChange`. A value that changes from outside
 * (a block moved, say) replaces the editor's content.
 */
export default function RichTextField({
  label,
  value,
  kind,
  onChange,
  invalid,
}: {
  label: string;
  value: string;
  kind: RichTextKind;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const labelId = useId();
  const emitted = useRef(value);
  // The editor keeps the callbacks it was created with, so it reads the current one from here.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const [unreadable] = useState(() => toDoc(value) === null);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    ...cmsEditorOptions(kind),
    content: toDoc(value) ?? undefined,
    // The editor exists only in the browser.
    immediatelyRender: false,
    editorProps: {
      ...cmsEditorOptions(kind).editorProps,
      attributes: {
        class: `${styles.editor} ${kind === "inline" ? styles.inline : ""}`,
        role: "textbox",
        "aria-multiline": kind === "blocks" ? "true" : "false",
        "aria-labelledby": labelId,
        ...(invalid ? { "aria-invalid": "true" } : {}),
      },
    },
    onUpdate: ({ editor }) => {
      let next: string;
      try {
        next = editorDocToString(editor.getJSON() as PMNode);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      setError(null);
      if (next === emitted.current) return;
      emitted.current = next;
      onChangeRef.current(next);
    },
  });

  useEffect(() => {
    if (!editor || value === emitted.current) return;
    emitted.current = value;
    const doc = toDoc(value);
    if (doc) editor.commands.setContent(doc, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="text-sm text-brand-black/80">
        {label}
      </span>
      {unreadable ? (
        <p role="alert" className="text-sm text-brand-red">
          This text cannot be shown in the editor. Ask a technical admin to fix it in the page&apos;s file.
        </p>
      ) : (
        <div className={`rounded-sm border bg-brand-white ${invalid ? "border-brand-red" : "border-brand-black/30"}`}>
          {editor ? <Toolbar editor={editor} kind={kind} /> : <div className="p-2 text-sm text-brand-black/60">Loading editor…</div>}
          <EditorContent editor={editor} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-brand-red">
          {error}
        </p>
      )}
    </div>
  );
}
