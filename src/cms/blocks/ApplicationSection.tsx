import { Suspense } from "react";
import ApplyForm from "../../app/apply/ApplyForm";
import ContactErrorBanner from "../../app/ContactErrorBanner";
import RedLinesApplyForm from "../../app/red-lines-dialogue/ApplyForm";
import RedLinesErrorBanner from "../../app/red-lines-dialogue/ErrorBanner";
import type { LightTone } from "../bands";
import { applySourceFor } from "../pages";
import { RichTextBlocks } from "../render";
import LightSection from "./LightSection";
import Rule from "./Rule";
import type { BlockOf } from "./types";

const TEXT = "text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl";
const LIST_ITEM = "text-lg font-light text-brand-navy/85 leading-relaxed flex gap-3";

/**
 * The application form, or the closed message when `showForm` is off. The admin toggles stay
 * an emergency stop in the submit routes; they never hide the form.
 */
export default function ApplicationSection({
  block,
  tone,
  path,
}: {
  block: BlockOf<"applicationSection">;
  tone: LightTone;
  path: string;
}) {
  if (block.form === "redLines") {
    return (
      <LightSection tone={tone} id="apply">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">{block.heading}</h2>
          <RichTextBlocks value={block.intro} paragraphClassName={TEXT} listItemClassName={LIST_ITEM} />
          {block.showForm ? (
            <>
              {block.formNote && (
                <RichTextBlocks value={block.formNote} paragraphClassName={TEXT} listItemClassName={LIST_ITEM} />
              )}
              <Suspense fallback={null}>
                <RedLinesErrorBanner />
              </Suspense>
              <div className="max-w-2xl">
                <RedLinesApplyForm />
              </div>
            </>
          ) : (
            <RichTextBlocks value={block.closedMessage} paragraphClassName={TEXT} listItemClassName={LIST_ITEM} />
          )}
        </div>
      </LightSection>
    );
  }

  const source = applySourceFor(path);
  if (!source) throw new Error(`No apply form is registered for ${path}`);
  return (
    <LightSection tone={tone} id="contact">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <Rule />
        <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight max-w-xl">{block.heading}</h2>
        <RichTextBlocks
          value={block.intro}
          paragraphClassName="text-lg md:text-xl font-light text-brand-navy/85 leading-relaxed max-w-2xl"
          listItemClassName={LIST_ITEM}
        />

        <Suspense fallback={null}>
          <ContactErrorBanner />
        </Suspense>

        {block.showForm ? (
          <div className="max-w-2xl">
            <ApplyForm source={source} />
          </div>
        ) : (
          <RichTextBlocks value={block.closedMessage} paragraphClassName={TEXT} listItemClassName={LIST_ITEM} />
        )}
      </div>
    </LightSection>
  );
}
