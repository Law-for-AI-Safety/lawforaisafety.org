"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Editor } from "@tiptap/core";
import { richTextToEditorDoc, type PMNode } from "@/cms/editor-doc";
import { parseRichTextLoose, type Run } from "@/cms/rich-text";
import { appendItem, entryDate, entryHref, entryRuns, linkedHrefs } from "@/news-radar/newsletter";

/** A News radar item as the composer offers it. */
export type PickerItem = {
  id: string;
  title: string;
  outlet: string;
  url: string;
  /** ISO time, or null when the source gave none. */
  publishedAt: string | null;
  topics: string[];
  state: "new" | "useful";
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Puts the items' bullets where the editor's cursor is: after the bullet it is in, or as a list
 * after the paragraph it is in. An empty paragraph is replaced. A list next to where they land
 * takes them instead (the one before an empty paragraph first, else the one after it), so they
 * join it rather than start a second list.
 */
export function insertAtCursor(editor: Editor, entries: Run[][]) {
  const list = richTextToEditorDoc([{ type: "bulletList", items: entries }]).content![0];
  const bullets = list.content as PMNode[];
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "listItem") {
      editor.chain().focus().insertContentAt($from.after(depth), bullets).run();
      return;
    }
  }
  if ($from.depth === 0) {
    editor.chain().focus().insertContentAt(editor.state.doc.content.size, list).run();
    return;
  }
  const block = $from.node(1);
  const before = $from.before(1);
  const after = $from.after(1);
  const next = editor.state.doc.nodeAt(after);
  const isList = (node: { type: { name: string } } | null | undefined) => node?.type.name === "bulletList";
  if (block.content.size === 0) {
    const previous = editor.state.doc.resolve(before).nodeBefore;
    const chain = editor.chain().focus().deleteRange({ from: before, to: after });
    // With the empty paragraph gone, the list before it ends at `before - 1` and the one after starts at `before`.
    if (isList(previous)) chain.insertContentAt(before - 1, bullets).run();
    else if (isList(next)) chain.insertContentAt(before + 1, bullets).run();
    else editor.chain().focus().insertContentAt({ from: before, to: after }, list).run();
  } else if (isList(next)) editor.chain().focus().insertContentAt(after + 1, bullets).run();
  else editor.chain().focus().insertContentAt(after, list).run();
}

/**
 * "Insert from News radar": a dialog listing recent radar items, Useful first, to search, filter
 * by topic and tick. Inserting puts each ticked item's bullet (linked title, outlet and date) at
 * the editor's cursor, or at the end of the newsletter when the editor has not been clicked into.
 * Items the newsletter already links to are marked and cannot be ticked.
 */
export default function RadarPicker({
  items,
  body,
  editor,
  onAppend,
}: {
  items: PickerItem[];
  body: string;
  editor: Editor | null;
  /** Takes the whole new body, for items added at the end. */
  onAppend: (body: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // The cursor counts once the editor has been clicked or tabbed into.
  useEffect(() => {
    setPlaced(false);
    if (!editor) return;
    const mark = () => setPlaced(true);
    editor.on("focus", mark);
    return () => {
      editor.off("focus", mark);
    };
  }, [editor]);

  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);

  const present = useMemo(() => linkedHrefs(body), [body]);
  // Whether the editor shows the body (as RichTextField decides), so items can go in through it.
  const readable = useMemo(() => {
    try {
      parseRichTextLoose(body);
      return true;
    } catch {
      return false;
    }
  }, [body]);
  const atCursor = editor !== null && placed && readable;
  // The links ticked so far: two radar items with the same link go in once.
  const ticked = useMemo(() => new Map(items.filter((i) => chosen.has(i.id)).map((i) => [entryHref(i.url), i.id])), [items, chosen]);
  const blocked = (item: PickerItem) => {
    const href = entryHref(item.url);
    return present.has(href) || (ticked.has(href) && ticked.get(href) !== item.id);
  };
  const topics = useMemo(() => [...new Set(items.flatMap((i) => i.topics))].sort(), [items]);
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      if (topic && !item.topics.includes(topic)) return false;
      const text = `${item.title} ${item.outlet}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [items, query, topic]);

  const close = () => {
    setOpen(false);
    setProblem(null);
    opener.current?.focus();
  };

  const toggle = (itemId: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

  const insert = () => {
    const picked = items.filter((i) => chosen.has(i.id) && !blocked(i));
    const entries = picked.map((i) => ({ ...i, publishedAt: i.publishedAt ? new Date(i.publishedAt) : null }));
    const bullets: Run[][] = [];
    for (const entry of entries) {
      const runs = entryRuns(entry);
      if (!runs.ok) return setProblem(`“${entry.title}”: ${runs.problem}`);
      bullets.push(runs.runs);
    }
    if (atCursor) insertAtCursor(editor, bullets);
    else {
      let next = body;
      for (const entry of entries) {
        const appended = appendItem(next, entry);
        if (!appended.ok) return setProblem(appended.problem);
        next = appended.body;
      }
      onAppend(next);
    }
    setChosen(new Set());
    setOpen(false);
    setProblem(null);
    setDone(`Inserted ${entries.length} ${entries.length === 1 ? "item" : "items"} from the News radar.`);
    if (!atCursor) opener.current?.focus();
  };

  // Keeps Tab within the dialog, and closes it on Escape.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab" || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  const count = items.filter((i) => chosen.has(i.id) && !blocked(i)).length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <button
          ref={opener}
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
          className="rounded-sm border border-brand-navy px-3 py-1 text-sm text-brand-navy"
        >
          Insert from News radar
        </button>
        {done && (
          <span role="status" className="text-sm text-brand-black/70">
            {done}
          </span>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-about`}
            onKeyDown={onKeyDown}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 rounded-sm bg-brand-white p-4"
          >
            <h2 id={`${id}-title`} className="font-sans text-xl text-brand-black">
              Insert from News radar
            </h2>
            <p id={`${id}-about`} className="text-sm text-brand-black/70">
              Useful and new items from the last 60 days, Useful first. Each goes into the subscriber newsletter as a bullet with
              its linked title, outlet and date, {atCursor ? "at the cursor" : "at the end"}.
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-brand-black/80">
                Search
                <input
                  ref={search}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="rounded-sm border border-brand-black/30 px-2 py-1"
                />
              </label>
              <label className="flex min-w-0 max-w-full flex-col gap-1 text-sm text-brand-black/80">
                Topic
                <select value={topic} onChange={(e) => setTopic(e.target.value)} className="max-w-full rounded-sm border border-brand-black/30 bg-brand-white px-2 py-1">
                  <option value="">All topics</option>
                  {topics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {shown.length === 0 ? (
              <p className="text-brand-black/60">{items.length === 0 ? "The News radar has nothing recent to offer." : "Nothing matches."}</p>
            ) : (
              <ul aria-label="News radar items" className="flex min-h-0 flex-col overflow-y-auto">
                {shown.map((item) => {
                  const already = present.has(entryHref(item.url));
                  const twin = !already && blocked(item);
                  const details = [item.outlet, item.publishedAt ? entryDate(new Date(item.publishedAt)) : null, item.topics.join(", ")]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={item.id} className="border-t border-brand-black/10 py-2">
                      <label className={`flex items-start gap-2 ${already || twin ? "text-brand-black/60" : "text-brand-black"}`}>
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={already || chosen.has(item.id)}
                          disabled={already || twin}
                          onChange={() => toggle(item.id)}
                          aria-labelledby={`${id}-${item.id}-title`}
                          aria-describedby={`${id}-${item.id}`}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span id={`${id}-${item.id}-title`}>{item.title}</span>
                          <span id={`${id}-${item.id}`} className="text-sm text-brand-black/70">
                            {details}
                            {item.state === "useful" && " · Useful"}
                            {already && " · Already in this newsletter"}
                            {twin && " · Same link as a ticked item"}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {problem && (
              <p role="alert" className="text-sm text-brand-red">
                {problem}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={insert} disabled={count === 0} className="rounded-sm bg-brand-navy px-4 py-2 text-brand-white disabled:opacity-40">
                {count === 0 ? "Insert" : `Insert ${count} ${count === 1 ? "item" : "items"}`}
              </button>
              <button type="button" onClick={close} className="rounded-sm border border-brand-black/30 px-4 py-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
