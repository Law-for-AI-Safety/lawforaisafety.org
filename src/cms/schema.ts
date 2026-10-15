import { z } from "zod";
import { applySourceFor, pagePath, pageRules, type BlockType } from "./pages";
import { formatRichText, hasForbiddenText, hrefProblem, parseRichText, upgradeHref } from "./rich-text";

/**
 * The shape of a content file, `content/<slug>.json`.
 *
 * Every schema is built in one of three modes. "strict" accepts only the canonical form and is
 * what pages and checks use. "format" first rewrites each field into the canonical form
 * (trimmed plain text, canonical rich text, `http:` links upgraded), then applies the strict
 * rules, for `npm run content:format`. Object keys come out in the order declared here, so
 * printing the result gives a deterministic file.
 *
 * "draft" checks only the shape an editor's unfinished draft must keep: the same objects,
 * block types and keys, every text field a string within its length limit, and no list
 * longer than its maximum. Text may be empty or not yet valid, lists may be empty, and page
 * rules are not applied; a draft is saved in this shape and checked strictly to say whether
 * it is valid.
 *
 * Rich-text fields stay strings in the parsed value; the renderer parses them again.
 */
export type Mode = "strict" | "format" | "draft";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function plainText(mode: Mode, max: number) {
  if (mode === "draft") return z.string().max(max, `At most ${max} characters`);
  const strict = z
    .string()
    .min(1, "Required")
    .max(max, `At most ${max} characters`)
    .refine((s) => s.trim() === s, "No spaces at the start or end")
    .refine((s) => !hasForbiddenText(s), "No line breaks, tabs, control or invisible formatting characters")
    .refine((s) => s === s.normalize("NFC"), "Text is not in Unicode NFC form; run npm run content:format");
  return mode === "strict" ? strict : z.string().transform((s) => s.trim().normalize("NFC")).pipe(strict);
}

/** `inline`: exactly one paragraph. `blocks`: paragraphs and bullet lists. */
function richText(mode: Mode, kind: "inline" | "blocks", max: number) {
  // A draft keeps any string here, so an unfinished or unsafe one is saved rather than lost.
  // Whether it is valid comes from the strict mode, which parses it (link targets included):
  // the save marks the draft invalid, the preview will not render it, and publishing refuses it.
  if (mode === "draft") return z.string().max(max, `At most ${max} characters`);
  const strict = z
    .string()
    .max(max, `At most ${max} characters`)
    .superRefine((s, ctx) => {
      let doc;
      try {
        doc = parseRichText(s);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: message(e) });
        return;
      }
      if (doc.length === 0) ctx.addIssue({ code: "custom", message: "Required" });
      else if (kind === "inline" && (doc.length > 1 || doc[0].type !== "paragraph")) {
        ctx.addIssue({ code: "custom", message: "Only one paragraph is allowed here, with no list" });
      }
    });
  if (mode === "strict") return strict;
  return z
    .string()
    .transform((s, ctx) => {
      try {
        return formatRichText(s);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: message(e) });
        return z.NEVER;
      }
    })
    .pipe(strict);
}

/** The site path of an image content may use. */
export const IMAGE_PATH = /^\/images\/[a-z0-9-]+\.(webp|png|jpg)$/;

/** An image already in `public/images/`; that the file exists is checked with the content (no uploads). */
function imagePath(mode: Mode) {
  const shape = z.string().max(300, "At most 300 characters");
  return mode === "draft" ? shape : shape.regex(IMAGE_PATH, "Pick an image from /images/");
}

function linkedinUrl(mode: Mode) {
  const shape = z.string().max(300, "At most 300 characters");
  if (mode === "draft") return shape;
  return shape.refine(
    (s) => /^https:\/\/(www\.)?linkedin\.com\//.test(s) && hrefProblem(s) === null,
    "Must be a link to a linkedin.com page",
  );
}

/** A button's target: a site path, an `https:` address or a `mailto:` address. */
function linkTarget(mode: Mode) {
  const shape = z.string().max(300, "At most 300 characters");
  if (mode === "draft") return shape;
  const strict = shape.superRefine((s, ctx) => {
    const problem = hrefProblem(s);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });
  return mode === "strict" ? strict : z.string().transform((s) => upgradeHref(s.trim())).pipe(strict);
}

/**
 * A list that may be left out. An empty list means the same, so outside a draft it is
 * dropped from the value (and so from the file), keeping one canonical form.
 */
function optionalList<T extends z.ZodType>(mode: Mode, item: T, max: [number, string]) {
  const shape = z.array(item).max(...max);
  if (mode === "draft") return shape.optional();
  return shape.optional().transform((items) => (items && items.length > 0 ? items : undefined));
}

/**
 * A list with at least `min` items (except in a draft) and at most `max`. `refine` adds the
 * strict rules that relate one item to another, which a draft skips.
 */
function list<T extends z.ZodType>(
  mode: Mode,
  item: T,
  { min, max }: { min: string; max: [number, string] },
  refine?: (items: z.output<T>[]) => string | null,
) {
  const shape = z.array(item).max(...max);
  if (mode === "draft") return shape;
  const strict = shape.min(1, min);
  return refine ? strict.superRefine((items, ctx) => {
    const problem = refine(items);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }) : strict;
}

/** A strict rule tying an object's fields together, which a draft skips. */
function tied<T extends z.ZodType>(mode: Mode, object: T, ok: (value: z.output<T>) => boolean, message: string, path: string) {
  return mode === "draft" ? object : object.refine(ok, { message, path: [path] });
}

export function blockSchema(mode: Mode) {
  const plain = (max = 200) => plainText(mode, max);
  const inline = (max = 2000) => richText(mode, "inline", max);
  const blocks = (max = 6000) => richText(mode, "blocks", max);
  const card = z.strictObject({ title: plain(), body: inline(3000) });
  // Photos picked from the repo's images, shown side by side (one fills the width).
  const photos = optionalList(mode, z.strictObject({ image: imagePath(mode), alt: plain(200) }), [3, "At most 3 photos"]);
  // Link buttons; the last is the filled one, and a LinkedIn link shows the LinkedIn logo.
  const buttons = optionalList(mode, z.strictObject({ label: plain(60), href: linkTarget(mode) }), [2, "At most 2 buttons"]);
  const cards = list(mode, card, { min: "Add at least one item", max: [12, "At most 12 items"] });

  return z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("hero"), heading: plain(), lede: inline(1000) }),
    tied(
      mode,
      z.strictObject({
        type: z.literal("quoteBand"),
        quote: inline(600),
        // Paragraphs under the quote, in the same band.
        body: blocks().optional(),
        photos,
        caption: plain(300).optional(),
      }),
      (b) => b.caption === undefined || b.photos !== undefined,
      "A caption needs a photo",
      "caption",
    ),
    // The heading may be left out, for a section that continues the one before.
    z.strictObject({ type: z.literal("textSection"), heading: plain().optional(), body: blocks(), photos }),
    z.discriminatedUnion("style", [
      // Numbered sections with no heading of their own.
      z.strictObject({ type: z.literal("cardList"), style: z.literal("numbered"), items: cards }),
      // A heading over ring-bulleted items.
      z.strictObject({
        type: z.literal("cardList"),
        style: z.literal("bullets"),
        heading: plain(),
        items: cards,
      }),
    ]),
    z.strictObject({
      type: z.literal("teamGrid"),
      heading: plain(),
      members: list(
        mode,
        tied(
          mode,
          z.strictObject({
            name: plain(100),
            role: plain(),
            bio: plain(1000),
            linkedin: linkedinUrl(mode).optional(),
            photo: imagePath(mode).optional(),
            // Describes the photo for screen readers; required with a photo.
            photoAlt: plain(200).optional(),
          }),
          (m) => (m.photo === undefined) === (m.photoAlt === undefined),
          "A photo needs alt text, and alt text needs a photo",
          "photoAlt",
        ),
        { min: "Add at least one person", max: [40, "At most 40 people"] },
      ),
    }),
    z.strictObject({
      type: z.literal("timeline"),
      heading: plain(),
      entries: list(
        mode,
        tied(
          mode,
          z.strictObject({
            date: plain(60),
            // "tentative" shows a dashed ring instead of a time.
            time: plain(40).optional(),
            // The moment `time` names, shown again in the visitor's own time zone.
            utc: (mode === "draft" ? z.string().max(40, "At most 40 characters") : z.iso.datetime()).optional(),
            text: plain(500),
          }),
          (e) => e.utc === undefined || e.time !== undefined,
          "A UTC time needs a time to go with it",
          "utc",
        ),
        { min: "Add at least one entry", max: [30, "At most 30 entries"] },
        (es) => (new Set(es.map((e) => e.date)).size === es.length ? null : "Each date may appear only once"),
      ),
    }),
    z.strictObject({
      type: z.literal("milestones"),
      heading: plain(),
      entries: list(
        mode,
        z.strictObject({ title: plain(), body: blocks(), photos, buttons }),
        { min: "Add at least one entry", max: [30, "At most 30 entries"] },
      ),
    }),
    z.discriminatedUnion("form", [
      z.strictObject({
        type: z.literal("applicationSection"),
        form: z.literal("apply"),
        heading: plain(),
        intro: blocks(),
        buttons,
        showForm: z.boolean(),
        // While the form shows: the newsletter sign-up above it under this heading, and this
        // heading over the application form itself.
        newsletterHeading: plain().optional(),
        formHeading: plain().optional(),
        closedMessage: blocks(),
      }),
      z.strictObject({
        type: z.literal("applicationSection"),
        form: z.literal("redLines"),
        heading: plain(),
        intro: blocks(),
        showForm: z.boolean(),
        // Shown above the form while it is open.
        formNote: blocks().optional(),
        closedMessage: blocks(),
      }),
    ]),
  ]);
}

/** The most blocks a draft may hold; a page's own rules allow far fewer. */
const MAX_DRAFT_BLOCKS = 100;

export function pageSchema(slug: string, mode: Mode = "strict") {
  const page = z.strictObject({
    title: plainText(mode, 120),
    description: plainText(mode, 300),
    shareImage: imagePath(mode).optional(),
    updatedAt: z.iso.date(),
    blocks: list(mode, blockSchema(mode), {
      min: "Add at least one block",
      max: [MAX_DRAFT_BLOCKS, `At most ${MAX_DRAFT_BLOCKS} blocks`],
    }),
  });
  if (mode === "draft") return page;
  return page
    .superRefine((page, ctx) => {
      const rules = pageRules(slug);
      if (page.blocks[0]?.type !== "hero") {
        ctx.addIssue({ code: "custom", message: "The first block must be the hero", path: ["blocks", 0] });
      }
      const counts = new Map<BlockType, number>();
      page.blocks.forEach((block, i) => {
        const count = (counts.get(block.type) ?? 0) + 1;
        counts.set(block.type, count);
        const max = rules.blocks[block.type];
        if (max === undefined) {
          ctx.addIssue({ code: "custom", message: `This page cannot have a ${block.type} block`, path: ["blocks", i] });
        } else if (count > max) {
          ctx.addIssue({ code: "custom", message: `This page can have at most ${max} ${block.type} block(s)`, path: ["blocks", i] });
        }
        if (block.type === "applicationSection") {
          if (!rules.forms.includes(block.form)) {
            ctx.addIssue({ code: "custom", message: `This page cannot show the ${block.form} form`, path: ["blocks", i, "form"] });
          } else if (block.form === "apply" && !applySourceFor(pagePath(slug))) {
            ctx.addIssue({
              code: "custom",
              message: `No apply form is registered for ${pagePath(slug)} (src/lib/application-pages.ts)`,
              path: ["blocks", i, "form"],
            });
          }
        }
      });
    });
}

export type PageContent = z.infer<ReturnType<typeof pageSchema>>;
export type BlockContent = PageContent["blocks"][number];

/** Parses a content file's value for `slug`, throwing a readable error when it is invalid. */
export function parsePage(slug: string, value: unknown): PageContent {
  const result = pageSchema(slug).safeParse(value);
  if (!result.success) throw new Error(`content/${slug}.json is invalid:\n${z.prettifyError(result.error)}`);
  return result.data;
}
