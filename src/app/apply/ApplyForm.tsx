"use client";

import { useRef, useState } from "react";
import {
  FORM_RENDERED_AT_FIELD_NAME,
  HONEYPOT_FIELD_NAME,
} from "@/lib/abuse-protection";
import WipeSubmitButton from "../WipeSubmitButton";
import Checkbox from "./Checkbox";
import CvFileField from "./CvFileField";
import { FIELD_CLASSES, HELPER_TEXT_CLASSES, LABEL_CLASSES } from "./field-styles";

type VerifyTab = "linkedin" | "google" | "email";

const TABS: { id: VerifyTab; label: string }[] = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "google", label: "Google" },
  { id: "email", label: "Name & email" },
];

type CredentialTab = "linkedin" | "cv" | "statement";

const CREDENTIAL_TABS: { id: CredentialTab; label: string }[] = [
  { id: "linkedin", label: "LinkedIn URL" },
  { id: "cv", label: "CV / résumé" },
  { id: "statement", label: "Position statement" },
];

export default function ApplyForm() {
  const [error, setError] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<VerifyTab>("linkedin");
  const [activeCredentialTab, setActiveCredentialTab] =
    useState<CredentialTab>("linkedin");

  const linkedinUrlRef = useRef<HTMLInputElement>(null);
  const cvRef = useRef<HTMLInputElement>(null);
  const positionStatementRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  function validate(submitter: HTMLElement | null): boolean {
    const hasLinkedin = Boolean(linkedinUrlRef.current?.value.trim());
    const hasCv = Boolean(cvRef.current?.files?.length);
    const hasStatement = Boolean(positionStatementRef.current?.value.trim());

    if (!hasLinkedin && !hasCv && !hasStatement) {
      setError(
        "Provide at least one of: LinkedIn profile URL, CV upload, or a position statement.",
      );
      return false;
    }

    const isManualSubmit =
      submitter?.getAttribute("formaction") === "/api/auth/email";
    if (isManualSubmit) {
      const hasName = Boolean(nameRef.current?.value.trim());
      const hasEmail = Boolean(emailRef.current?.value.trim());
      if (!hasName || !hasEmail) {
        setError("Name and email are required.");
        return false;
      }
    }

    setError(null);
    return true;
  }

  return (
    <form
      encType="multipart/form-data"
      method="post"
      className="flex flex-col gap-12"
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent)
          .submitter as HTMLElement | null;
        if (!validate(submitter)) event.preventDefault();
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <label>
          Website
          <input type="text" name={HONEYPOT_FIELD_NAME} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input type="hidden" name={FORM_RENDERED_AT_FIELD_NAME} value={renderedAt} readOnly />

      <div className="flex flex-col gap-5">
        <h4 className="text-xl font-light text-brand-black">Show your credentials</h4>

        <div className="flex gap-1 border-b border-brand-black/10" role="tablist">
          {CREDENTIAL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeCredentialTab === tab.id}
              onClick={() => setActiveCredentialTab(tab.id)}
              className={`rounded-t-sm px-5 py-3 text-lg transition-colors ${
                activeCredentialTab === tab.id
                  ? "bg-brand-navy text-brand-white"
                  : "text-brand-black/60 hover:text-brand-black"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeCredentialTab === "linkedin" && (
          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASSES}>LinkedIn profile URL</span>
            <input
              ref={linkedinUrlRef}
              type="url"
              name="linkedinUrl"
              placeholder="https://www.linkedin.com/in/…"
              className={FIELD_CLASSES}
            />
          </label>
        )}

        {activeCredentialTab === "cv" && (
          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASSES}>CV / résumé</span>
            <CvFileField name="cv" inputRef={cvRef} />
          </label>
        )}

        {activeCredentialTab === "statement" && (
          <div className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className={LABEL_CLASSES}>Organisation / firm</span>
              <input type="text" name="organisation" className={FIELD_CLASSES} />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL_CLASSES}>Position statement</span>
              <textarea
                ref={positionStatementRef}
                name="positionStatement"
                rows={4}
                placeholder="Describe your current role and why you're relevant"
                className={FIELD_CLASSES}
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className={LABEL_CLASSES}>Comments</span>
          <textarea
            name="comments"
            rows={3}
            placeholder="Anything else you'd like us to know"
            className={FIELD_CLASSES}
          />
        </label>

        <Checkbox name="newsletterOptIn" label="Also subscribe me to the newsletter" />
      </div>

      <div className="flex flex-col gap-5">
        <h4 className="text-xl font-light text-brand-black">Verify your identity</h4>

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
              You&apos;ll be taken to LinkedIn to confirm, then brought back here.
              We&apos;ll receive your name, email address and profile photo.
            </p>
            <WipeSubmitButton
              type="submit"
              formAction="/api/auth/linkedin"
              className="self-start bg-brand-navy px-6 py-3 text-lg text-brand-white text-center rounded-sm overflow-hidden"
              hoverBg="rgba(255,255,255,0.15)"
            >
              Verify with LinkedIn
            </WipeSubmitButton>
          </div>
        )}

        {activeTab === "google" && (
          <div className="flex flex-col gap-3">
            <p className={HELPER_TEXT_CLASSES}>
              You&apos;ll be taken to Google to confirm, then brought back here.
              We&apos;ll receive your name, email address and profile photo.
            </p>
            <WipeSubmitButton
              type="submit"
              formAction="/api/auth/google"
              className="self-start bg-brand-navy px-6 py-3 text-lg text-brand-white text-center rounded-sm overflow-hidden"
              hoverBg="rgba(255,255,255,0.15)"
            >
              Verify with Google
            </WipeSubmitButton>
          </div>
        )}

        {activeTab === "email" && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-2">
              <span className={LABEL_CLASSES}>Full name</span>
              <input ref={nameRef} type="text" name="name" className={FIELD_CLASSES} />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL_CLASSES}>Email address</span>
              <input ref={emailRef} type="email" name="email" className={FIELD_CLASSES} />
            </label>
            <WipeSubmitButton
              type="submit"
              formAction="/api/auth/email"
              className="self-start bg-brand-black px-6 py-3 text-lg text-brand-white text-center rounded-sm overflow-hidden"
              hoverBg="rgba(255,255,255,0.15)"
            >
              Submit application
            </WipeSubmitButton>
          </div>
        )}
      </div>

      {error && <p className="text-lg text-brand-red">{error}</p>}
    </form>
  );
}
