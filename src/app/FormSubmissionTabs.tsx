"use client";

import type { RefObject } from "react";
import { useState } from "react";
import WipeSubmitButton from "./WipeSubmitButton";
import { FIELD_CLASSES, HELPER_TEXT_CLASSES, LABEL_CLASSES } from "./apply/field-styles";

type VerifyTabId = "linkedin" | "google" | "email";

const TABS: { id: VerifyTabId; label: string }[] = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "google", label: "Google" },
  { id: "email", label: "Name & email" },
];

/**
 * Lets someone submit a form either by signing in with LinkedIn or Google
 * (which confirms they control that account, not who they actually are:
 * see the admin review copy for the honest version of that distinction) or
 * by typing a name and email, which is emailed a confirmation link before
 * anything is submitted.
 *
 * Deliberately generic (formAction strings, refs, no knowledge of the rest
 * of the form) so it can sit inside any form that needs this choice: both
 * the volunteer apply form and the red-lines-dialogue apply form use it.
 */
export default function FormSubmissionTabs({
  heading = "Confirm your submission",
  linkedinAction,
  googleAction,
  emailAction,
  submittingTo,
  nameInputRef,
  emailInputRef,
}: {
  heading?: string;
  linkedinAction: string;
  googleAction: string;
  emailAction: string;
  submittingTo: string | null;
  nameInputRef: RefObject<HTMLInputElement | null>;
  emailInputRef: RefObject<HTMLInputElement | null>;
}) {
  const [activeTab, setActiveTab] = useState<VerifyTabId>("linkedin");

  return (
    <div className="flex flex-col gap-5">
      <h4 className="text-xl font-light text-brand-black">{heading}</h4>

      <div className="flex gap-1 border-b border-brand-black/10" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-t-sm px-5 py-3 text-lg transition-colors ${
              activeTab === tab.id
                ? "bg-brand-navy text-brand-white"
                : "text-brand-black/60 hover:text-brand-black"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "linkedin" && (
        <div className="flex flex-col gap-3">
          <p className={HELPER_TEXT_CLASSES}>
            You&apos;ll be taken to LinkedIn to sign in, then brought back
            here. We&apos;ll receive your name, email address and profile
            photo. Signing in confirms you control that LinkedIn account, not
            that the details on it are accurate.
          </p>
          <WipeSubmitButton
            type="submit"
            formAction={linkedinAction}
            busy={submittingTo !== null}
            className="self-start bg-brand-navy px-6 py-3 text-lg text-brand-white text-center rounded-sm overflow-hidden"
            hoverBg="rgba(255,255,255,0.15)"
          >
            {submittingTo === linkedinAction
              ? "Taking you to LinkedIn…"
              : "Sign in with LinkedIn & submit"}
          </WipeSubmitButton>
        </div>
      )}

      {activeTab === "google" && (
        <div className="flex flex-col gap-3">
          <p className={HELPER_TEXT_CLASSES}>
            You&apos;ll be taken to Google to sign in, then brought back
            here. We&apos;ll receive your name, email address and profile
            photo. Signing in confirms you control that Google account, not
            that the details on it are accurate.
          </p>
          <WipeSubmitButton
            type="submit"
            formAction={googleAction}
            busy={submittingTo !== null}
            className="self-start bg-brand-navy px-6 py-3 text-lg text-brand-white text-center rounded-sm overflow-hidden"
            hoverBg="rgba(255,255,255,0.15)"
          >
            {submittingTo === googleAction
              ? "Taking you to Google…"
              : "Sign in with Google & submit"}
          </WipeSubmitButton>
        </div>
      )}

      {activeTab === "email" && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASSES}>Full name</span>
            <input
              ref={nameInputRef}
              type="text"
              name="name"
              maxLength={200}
              className={FIELD_CLASSES}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASSES}>Email address</span>
            <input
              ref={emailInputRef}
              type="email"
              name="email"
              maxLength={320}
              className={FIELD_CLASSES}
            />
          </label>
          <p className={HELPER_TEXT_CLASSES}>
            We&apos;ll email a confirmation link to that address. Nothing is
            submitted until you click it.
          </p>
          <WipeSubmitButton
            type="submit"
            formAction={emailAction}
            busy={submittingTo !== null}
            className="self-start bg-brand-black px-6 py-3 text-lg text-brand-white text-center rounded-sm overflow-hidden"
            hoverBg="rgba(255,255,255,0.15)"
          >
            {submittingTo === emailAction ? "Sending…" : "Submit application"}
          </WipeSubmitButton>
        </div>
      )}
    </div>
  );
}
