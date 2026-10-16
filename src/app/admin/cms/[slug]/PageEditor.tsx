"use client";

import { useEffect, useMemo, useState } from "react";
import { Autosaver, type AutosaveStatus, type SaveResult } from "@/cms/autosave";
import type { FieldChange } from "@/cms/field-diff";
import type { EditorState } from "@/cms/publish-status";
import type { PublishingView } from "@/lib/cms-publishing";
import { addableBlockTypes, canMoveBlock, isLockedBlock, moveBlock, removeBlock, setCardListStyle, setIn, type DraftBlock, type DraftPage } from "@/cms/editor-model";
import { BLOCK_LABELS, blockFields, describePath, newBlock, PAGE_FIELDS } from "@/cms/fields";
import type { BlockType } from "@/cms/pages";
import type { Problem } from "@/cms/publish-checks";
import type { DiscardDraftResult, PublishDraftResult, SaveDraftResult, WithdrawResult } from "../actions";
import PageStateBadge from "../PageStateBadge";
import { Fields, type FieldContext, type Path } from "./FieldEditor";
import PreviewPane from "./PreviewPane";

export type PageEditorProps = {
  slug: string;
  initialContent: unknown;
  initialVersion: number;
  initialState: EditorState;
  initialProblems: Problem[];
  /** The live page changed after the draft was started. */
  baseChanged: boolean;
  canPublish: boolean;
  /** Whether this site can publish at all (the publishing settings are present). */
  publishSetUp: boolean;
  publishing: PublishingView;
  /** False when the publishing status could not be checked on this load. */
  statusChecked: boolean;
  images: string[];
  /** The PDFs a document field may pick; none when left out. */
  documents?: string[];
  save: (slug: string, content: unknown, version: number) => Promise<SaveDraftResult>;
  discard: (slug: string, version: number) => Promise<DiscardDraftResult>;
  publish: (slug: string, version: number) => Promise<PublishDraftResult>;
  withdraw: (slug: string) => Promise<WithdrawResult>;
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" };

const STATUS_TEXT: Record<"saved" | "pending" | "saving", string> = {
  saved: "All changes saved",
  pending: "Unsaved changes…",
  saving: "Saving…",
};

function byPath(problems: Problem[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const p of problems) {
    const k = p.path.join(".");
    map.set(k, [...(map.get(k) ?? []), p.message]);
  }
  return map;
}

/**
 * The page editor: page fields, then the block list, each block's fields, and the publish
 * checks, beside a preview that follows every change. Every change is saved to the shared
 * draft after a short pause (see `Autosaver`).
 */
export default function PageEditor(props: PageEditorProps) {
  const { slug, canPublish, images, documents = [] } = props;
  const [page, setPage] = useState(props.initialContent as DraftPage);
  const [version, setVersion] = useState(props.initialVersion);
  const [pageState, setPageState] = useState<EditorState>(props.initialState);
  const [staleChanges, setStaleChanges] = useState<FieldChange[]>([]);
  const locked = pageState === "publishing";
  const [problems, setProblems] = useState(props.initialProblems);
  const [status, setStatus] = useState<AutosaveStatus>({ state: "saved" });
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [adding, setAdding] = useState<BlockType | "">("");
  const [showPreview, setShowPreview] = useState(true);

  const [saver] = useState(
    () =>
      new Autosaver<DraftPage>({
        version: props.initialVersion,
        onStatus: setStatus,
        onSaved: setVersion,
        save: async (value, from): Promise<SaveResult> => {
          const result = await props.save(slug, value, from);
          if (result.ok) {
            setProblems(result.problems);
            setPageState(result.state);
            return { ok: true, version: result.version };
          }
          if (result.reason === "signed_out") return { ok: false, reason: "retry", message: result.message };
          if (result.reason === "not_found") return { ok: false, reason: "invalid", message: result.message };
          if (result.reason === "locked") return { ok: false, reason: "forbidden", message: result.message };
          return { ok: false, reason: result.reason, message: result.message };
        },
      }),
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saver.dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    // A save still waiting when the editor closes goes ahead.
    return () => window.removeEventListener("beforeunload", warn);
  }, [saver]);

  const stopped = status.state === "conflict" || status.state === "forbidden" || status.state === "invalid";

  const update = (change: (page: DraftPage) => DraftPage) => {
    if (stopped) return;
    setNotice(null);
    setPage((current) => {
      const next = change(current);
      saver.change(next);
      return next;
    });
  };
  const ctx: FieldContext = {
    problems: useMemo(() => byPath(problems), [problems]),
    images,
    documents,
    set: (path: Path, value: unknown) => update((current) => setIn(current, path, value)),
  };
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const setBlocks = (next: DraftBlock[]) => update((current) => ({ ...current, blocks: next }));
  const addable = addableBlockTypes(slug, blocks);

  const publish = async () => {
    setNotice(null);
    if (!window.confirm("Publishing makes this page's text public on the website. Check the preview first. Publish now?")) return;
    await saver.flush();
    if (saver.dirty) return;
    setStaleChanges([]);
    const result = await props.publish(slug, saver.version);
    if (result.ok) {
      saver.dispose();
      window.location.reload();
      return;
    }
    if (result.reason === "checks") setProblems(result.problems);
    if (result.reason === "stale") setStaleChanges(result.changes);
    setNotice({ tone: result.reason === "unavailable" ? "info" : "error", text: result.message });
  };

  const withdraw = async () => {
    if (!window.confirm("Withdraw this page from publishing? The changes stay in the draft, and you can edit and publish again.")) return;
    setNotice(null);
    const result = await props.withdraw(slug);
    if (result.ok) window.location.reload();
    else setNotice({ tone: "error", text: result.message });
  };

  const { sent, approved, note } = props.publishing;

  const discard = async () => {
    if (!window.confirm("Throw away every unpublished change to this page? This cannot be undone.")) return;
    await saver.flush();
    saver.dispose();
    const result = await props.discard(slug, saver.version);
    if (result.ok) window.location.reload();
    else setNotice({ tone: "error", text: result.message });
  };

  return (
    <div className="flex flex-1 flex-col lg:flex-row lg:items-start">
    <main className={`flex w-full flex-col gap-8 px-4 py-8 ${showPreview ? "lg:max-w-2xl lg:shrink-0" : "mx-auto max-w-3xl"}`}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-sans text-3xl text-brand-black">Edit /{slug}</h1>
          <PageStateBadge state={pageState} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <p role="status" className="text-sm text-brand-black/70">
            {status.state === "saved" || status.state === "pending" || status.state === "saving" ? STATUS_TEXT[status.state] : null}
          </p>
          <a href={`/admin/preview/${slug}`} target="_blank" rel="noopener" className="underline">
            Preview (opens a new tab)
          </a>
          <button type="button" onClick={() => setShowPreview((shown) => !shown)} className="text-sm underline">
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
          {version > 0 && !locked && (
            <button type="button" onClick={discard} className="text-sm text-brand-red underline">
              Discard draft
            </button>
          )}
        </div>
        {status.state === "error" && (
          <p role="alert" className="flex flex-wrap items-center gap-3 border border-brand-red px-3 py-2 text-brand-red">
            {status.message}
            <button type="button" onClick={() => void saver.flush()} className="underline">
              Try again
            </button>
          </p>
        )}
        {stopped && (
          <p role="alert" className="flex flex-wrap items-center gap-3 border border-brand-red bg-brand-red/5 px-3 py-2 text-brand-red">
            {status.message}
            {status.state === "conflict" && (
              <button type="button" onClick={() => window.location.reload()} className="underline">
                Reload
              </button>
            )}
          </p>
        )}
        {!props.statusChecked && (
          <p role="status" className="border border-brand-black/30 px-3 py-2 text-sm text-brand-black/80">
            Could not check whether this page has been approved yet. Reload the page to try again.
          </p>
        )}
        {locked && (
          <div role="status" className="flex flex-col gap-2 border border-brand-navy bg-brand-navy/5 px-3 py-3 text-brand-black">
            {approved ? (
              <p>Approved. The website is being updated, which takes a few minutes; then this page shows as Live.</p>
            ) : (
              <p>
                Sent for publishing{sent ? ` on ${sent.at.toLocaleString("en-GB", DATE_FORMAT)} UTC by ${sent.by}` : ""}. It goes live once it is
                approved. The page can&apos;t be changed until then.
              </p>
            )}
            {canPublish && !approved && (
              <button type="button" onClick={withdraw} className="self-start text-sm text-brand-red underline">
                Withdraw from publishing
              </button>
            )}
          </div>
        )}
        {pageState === "not_published" && (
          <div role="status" className="flex flex-col gap-2 border border-brand-red px-3 py-3 text-brand-black">
            <p>The last changes sent were not published. The draft is open for editing again.</p>
            {note && (
              <blockquote className="whitespace-pre-wrap border-l-2 border-brand-black/30 pl-3 text-brand-black/80">
                {note.by ? `${note.by}: ` : ""}
                {note.text}
              </blockquote>
            )}
          </div>
        )}
        {props.baseChanged && !locked && (
          <p className="border border-brand-black/30 px-3 py-2 text-sm text-brand-black/80">
            The live page has changed since this draft was started. Publishing will need the draft to be brought up to date.
          </p>
        )}
      </div>

      {!locked && (
      <>
      <section className="flex flex-col gap-4">
        <h2 className="text-xl text-brand-black">Page details</h2>
        <Fields fields={PAGE_FIELDS} value={page} path={[]} ctx={ctx} />
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-xl text-brand-black">Blocks</h2>
        {blocks.map((block, i) => (
          <section key={i} aria-label={`Block ${i + 1}: ${BLOCK_LABELS[block.type]}`} className="flex flex-col gap-4 rounded-sm border border-brand-black/15 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg text-brand-black">
                {i + 1}. {BLOCK_LABELS[block.type]}
              </h3>
              {!isLockedBlock(blocks, i) && (
                <>
                  <button type="button" disabled={!canMoveBlock(blocks, i, -1)} onClick={() => setBlocks(moveBlock(blocks, i, -1))} className="text-sm underline disabled:no-underline disabled:opacity-40">
                    Move up
                  </button>
                  <button type="button" disabled={!canMoveBlock(blocks, i, 1)} onClick={() => setBlocks(moveBlock(blocks, i, 1))} className="text-sm underline disabled:no-underline disabled:opacity-40">
                    Move down
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Remove block ${i + 1} (${BLOCK_LABELS[block.type]})?`)) setBlocks(removeBlock(blocks, i));
                    }}
                    className="text-sm text-brand-red underline"
                  >
                    Remove block {i + 1}
                  </button>
                </>
              )}
            </div>
            {block.type === "cardList" && (
              <fieldset className="flex flex-wrap gap-4 text-sm text-brand-black/80">
                <legend className="sr-only">Card list style</legend>
                {(["bullets", "numbered"] as const).map((style) => (
                  <label key={style} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`style-${i}`}
                      checked={block.style === style}
                      onChange={() => setBlocks(blocks.map((b, j) => (j === i ? setCardListStyle(b, style) : b)))}
                    />
                    {style === "bullets" ? "Heading over bullet points" : "Numbered sections"}
                  </label>
                ))}
              </fieldset>
            )}
            <Fields fields={blockFields(block)} value={block} path={["blocks", i]} ctx={ctx} />
          </section>
        ))}
        {addable.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="add-block" className="text-sm text-brand-black/80">
              Add a block
            </label>
            <select id="add-block" value={adding} onChange={(e) => setAdding(e.target.value as BlockType | "")} className="rounded-sm border border-brand-black/30 bg-brand-white px-2 py-1">
              <option value="">Choose…</option>
              {addable.map((type) => (
                <option key={type} value={type}>
                  {BLOCK_LABELS[type]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={adding === ""}
              onClick={() => {
                if (adding === "") return;
                setBlocks([...blocks, newBlock(adding, slug) as DraftBlock]);
                setAdding("");
              }}
              className="rounded-sm border border-brand-black/30 px-3 py-1 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-brand-black/15 pt-6">
        <h2 className="text-xl text-brand-black">Checks before publishing</h2>
        {problems.length === 0 ? (
          <p className="text-brand-navy">Everything is filled in and every link works.</p>
        ) : (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-brand-black/80">
            {problems.map((p, i) => (
              <li key={i}>
                <span className="text-brand-black">{describePath(page, p.path)}:</span> {p.message}
              </li>
            ))}
          </ul>
        )}
        {staleChanges.length > 0 && (
          <ul aria-label="Changed on the live page" className="flex flex-col gap-2 text-sm text-brand-black/80">
            {staleChanges.map((change, i) => (
              <li key={i} className="border-l-2 border-brand-red pl-3">
                <span className="text-brand-black">{change.label}</span>
                <span className="block whitespace-pre-wrap">Was: {change.before}</span>
                <span className="block whitespace-pre-wrap">Now: {change.after}</span>
              </li>
            ))}
          </ul>
        )}
        {canPublish && (
          <>
            <button
              type="button"
              onClick={publish}
              // A live page has nothing to publish, unless a change is still on its way to the draft.
              disabled={!props.publishSetUp || stopped || (pageState === "live" && status.state === "saved")}
              className="self-start rounded-sm bg-brand-navy px-6 py-3 text-brand-white disabled:opacity-50"
            >
              Publish
            </button>
            {!props.publishSetUp && <p className="text-sm text-brand-black/70">Publishing is not set up on this site yet. Drafts are saved as usual.</p>}
          </>
        )}
      </section>
      </>
      )}
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={notice.tone === "error" ? "text-brand-red" : "text-brand-navy"}>
          {notice.text}
        </p>
      )}
    </main>
    {showPreview && <PreviewPane slug={slug} page={page} />}
    </div>
  );
}
