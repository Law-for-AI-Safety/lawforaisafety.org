import { z } from "zod";
import { applySourceFor, pagePath, pageRules, type BlockType } from "./pages";
import { formatRichText, hasForbiddenText, hrefProblem, parseRichText } from "./rich-text";

/**
 * The shape of a content file, `content/<slug>.json`.
 *
 * Every schema is built in one of two modes. "strict" accepts only the canonical form and is
 * what pages and checks use. "format" first rewrites each field into the canonical form
 * (trimmed plain text, canonical rich text, `http:` links upgraded), then applies the strict
 * rules, for `npm run content:format`. Object keys come out in the order declared here, so
 * printing the result gives a deterministic file.
 *
 * Rich-text fields stay strings in the parsed value; the renderer parses them again.
 */
type Mode = "strict" | "format";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function plainText(mode: Mode, max: number) {
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

/** An image already in `public/images/`; that the file exists is checked with the content (no uploads). */
const imagePath = z
  .string()
  .max(300, "At most 300 characters")
  .regex(/^\/images\/[a-z0-9-]+\.(webp|png|jpg)$/, "Pick an image from /images/");

const linkedinUrl = z
  .string()
  .max(300, "At most 300 characters")
  .refine(
    (s) => /^https:\/\/(www\.)?linkedin\.com\//.test(s) && hrefProblem(s) === null,
    "Must be a link to a linkedin.com page",
  );

export function blockSchema(mode: Mode) {
  const plain = (max = 200) => plainText(mode, max);
  const inline = (max = 2000) => richText(mode, "inline", max);
  const blocks = (max = 6000) => richText(mode, "blocks", max);
  const card = z.strictObject({ title: plain(), body: inline(3000) });
  const cards = z.array(card).min(1, "Add at least one item").max(12, "At most 12 items");

  return z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("hero"), heading: plain(), lede: inline(1000) }),
    z.strictObject({ type: z.literal("quoteBand"), quote: inline(600) }),
    z.strictObject({ type: z.literal("textSection"), heading: plain(), body: blocks() }),
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
      members: z
        .array(
          z
            .strictObject({
              name: plain(100),
              role: plain(),
              bio: plain(1000),
              linkedin: linkedinUrl.optional(),
              photo: imagePath.optional(),
              // Describes the photo for screen readers; required with a photo.
              photoAlt: plain(200).optional(),
            })
            .refine((m) => (m.photo === undefined) === (m.photoAlt === undefined), {
              message: "A photo needs alt text, and alt text needs a photo",
              path: ["photoAlt"],
            }),
        )
        .min(1, "Add at least one person")
        .max(40, "At most 40 people"),
    }),
    z.strictObject({
      type: z.literal("timeline"),
      heading: plain(),
      entries: z
        .array(
          z
            .strictObject({
              date: plain(60),
              // "tentative" shows a dashed ring instead of a time.
              time: plain(40).optional(),
              // The moment `time` names, shown again in the visitor's own time zone.
              utc: z.iso.datetime().optional(),
              text: plain(500),
            })
            .refine((e) => e.utc === undefined || e.time !== undefined, {
              message: "A UTC time needs a time to go with it",
              path: ["utc"],
            }),
        )
        .min(1, "Add at least one entry")
        .max(30, "At most 30 entries")
        .refine((es) => new Set(es.map((e) => e.date)).size === es.length, "Each date may appear only once"),
    }),
    z.discriminatedUnion("form", [
      z.strictObject({
        type: z.literal("applicationSection"),
        form: z.literal("apply"),
        heading: plain(),
        intro: blocks(),
        showForm: z.boolean(),
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

export function pageSchema(slug: string, mode: Mode = "strict") {
  return z
    .strictObject({
      title: plainText(mode, 120),
      description: plainText(mode, 300),
      shareImage: imagePath.optional(),
      updatedAt: z.iso.date(),
      blocks: z.array(blockSchema(mode)).min(1, "Add at least one block"),
    })
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
