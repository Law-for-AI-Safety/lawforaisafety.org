"use client";

import { useState } from "react";

/**
 * The on/off button for public signup. A plain form post (the route
 * redirects back here), made a client component for two things a bare
 * button can't do: show that the press registered while the request is in
 * flight, and — when the privacy policy isn't published — make turning
 * signup ON a deliberate act rather than one tap on a phone.
 */
export default function SignupToggle({
  enabled,
  policyPublished,
}: {
  enabled: boolean;
  policyPublished: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const needsAcknowledgement = !enabled && !policyPublished;
  const blocked = needsAcknowledgement && !acknowledged;

  return (
    <form
      action="/api/admin/settings/signup"
      method="post"
      onSubmit={() => setSubmitting(true)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />

      {needsAcknowledgement && (
        <label className="flex items-start gap-3 border border-brand-red bg-brand-red/10 px-3 py-3 text-brand-black/80">
          <input
            type="checkbox"
            className="mt-1.5"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            disabled={submitting}
          />
          <span>
            The privacy policy is not published on this site. Turning signup
            on means collecting people&apos;s data with no notice they can
            read. Tick to turn it on anyway.
          </span>
        </label>
      )}

      <button
        type="submit"
        disabled={submitting || blocked}
        aria-busy={submitting}
        className={`w-full rounded-sm px-6 py-4 text-lg disabled:opacity-50 ${
          enabled
            ? "border border-brand-red text-brand-red"
            : "bg-brand-navy text-brand-white"
        }`}
      >
        {submitting
          ? "Saving…"
          : enabled
            ? "Turn signup off"
            : "Turn signup on"}
      </button>
    </form>
  );
}
