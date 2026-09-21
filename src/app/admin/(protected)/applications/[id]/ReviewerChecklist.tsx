"use client";

/**
 * What a reviewer confirms before Approve unlocks. The sign-in badge at the
 * top of the page is the weakest thing on it: OAuth (or the emailed link)
 * proves someone controls an account with this name and email — not that
 * they are the person in the profile or CV they attached, both of which are
 * self-reported. Everything an impostor would rely on is a step here.
 *
 * Rejecting isn't gated: saying no needs no checks.
 */
export const REVIEWER_CHECKS = [
  {
    id: "email-fits",
    label:
      "The email address fits the person: it's on their firm's or institution's domain, or it's a personal address and I've done the next check.",
  },
  {
    id: "contacted-independently",
    label:
      "For a personal address, or anything that feels off: I contacted them through a channel I found myself (the firm's published details, or a message to the LinkedIn profile) and they confirmed they applied. I did not use contact details from the application.",
  },
  {
    id: "profile-consistent",
    label:
      "The LinkedIn profile or CV is consistent with the sign-in: same name, same person in the photo, and the profile is established (connections, history), not newly created.",
  },
  {
    id: "no-pressure",
    label:
      "Nothing in the statement or comments asks me to use a different email address, hurry, or skip a step. If it does, that's a reason to reject, not to help.",
  },
  {
    id: "invite-this-address",
    label:
      "If approved, the Slack invite goes only to the address in the Email field above. Someone who wants a different address applies again with it.",
  },
] as const;

export type ReviewerCheckId = (typeof REVIEWER_CHECKS)[number]["id"];

export default function ReviewerChecklist({
  checked,
  onToggle,
  disabled,
}: {
  checked: ReadonlySet<ReviewerCheckId>;
  onToggle: (id: ReviewerCheckId) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-3 border border-brand-black/20 px-4 py-4">
      <legend className="px-1 font-sans text-xl text-brand-black">
        Before you approve
      </legend>
      <p className="text-sm text-brand-black/60">
        Approve unlocks once every box is ticked. Rejecting doesn&apos;t need
        them.
      </p>
      {REVIEWER_CHECKS.map((check) => (
        <label key={check.id} className="flex items-start gap-3 text-brand-black/80">
          <input
            type="checkbox"
            className="mt-1.5"
            checked={checked.has(check.id)}
            onChange={() => onToggle(check.id)}
            disabled={disabled}
          />
          <span>{check.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
