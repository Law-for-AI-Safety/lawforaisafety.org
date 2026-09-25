"use client";

import { useEffect, useRef, useState } from "react";
import {
  FORM_RENDERED_AT_FIELD_NAME,
  HONEYPOT_FIELD_NAME,
} from "@/lib/abuse-protection";
import FormSubmissionTabs from "../FormSubmissionTabs";
import Checkbox from "./Checkbox";
import CvFileField from "./CvFileField";
import TurnstileWidget from "./TurnstileWidget";
import { FIELD_CLASSES, LABEL_CLASSES } from "./field-styles";

type CredentialTab = "linkedin" | "cv" | "statement";

const CREDENTIAL_TABS: { id: CredentialTab; label: string }[] = [
  { id: "linkedin", label: "LinkedIn URL" },
  { id: "cv", label: "CV / résumé" },
  { id: "statement", label: "Position statement" },
];

export default function ApplyForm() {
  const [error, setError] = useState<string | null>(null);
  // Which submit button is mid-flight (its formAction), or null. Submitting
  // uploads the CV and then leaves for LinkedIn/Google, which can take several
  // seconds with nothing on screen changing — without this, people press
  // again, and each press is another upload, another draft and another tick
  // on the rate limiter.
  const [submittingTo, setSubmittingTo] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());
  const [activeCredentialTab, setActiveCredentialTab] =
    useState<CredentialTab>("linkedin");

  const linkedinUrlRef = useRef<HTMLInputElement>(null);
  const cvRef = useRef<HTMLInputElement>(null);
  const positionStatementRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Coming back with the browser's Back button can restore this page from the
  // back/forward cache exactly as it was left: mid-submit, buttons dead.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setSubmittingTo(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

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
        if (submittingTo !== null || !validate(submitter)) {
          event.preventDefault();
          return;
        }
        // The Turnstile panel is hidden unless it needs the visitor, so there
        // is nothing on screen to show it's still working. If its token
        // hasn't arrived yet, say so here rather than letting the server
        // bounce the whole submission (CV upload included) as unverified.
        const form = event.currentTarget;
        const token = form.querySelector<HTMLInputElement>(
          'input[name="cf-turnstile-response"]',
        );
        if (form.querySelector(".cf-turnstile") && !token?.value) {
          event.preventDefault();
          setError(
            "Still checking you're not a robot. Give it a second and press the button again. If a checkbox has appeared below, tick it first.",
          );
          return;
        }
        setSubmittingTo(submitter?.getAttribute("formaction") ?? "");
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
              maxLength={300}
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
              <input type="text" name="organisation" maxLength={200} className={FIELD_CLASSES} />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL_CLASSES}>Position statement</span>
              <textarea
                ref={positionStatementRef}
                name="positionStatement"
                maxLength={5000}
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
            maxLength={5000}
            rows={3}
            placeholder="Anything else you'd like us to know"
            className={FIELD_CLASSES}
          />
        </label>

        <Checkbox name="newsletterOptIn" label="Also subscribe me to the newsletter" />
      </div>

      <FormSubmissionTabs
        linkedinAction="/api/auth/linkedin"
        googleAction="/api/auth/google"
        emailAction="/api/auth/email"
        submittingTo={submittingTo}
        nameInputRef={nameRef}
        emailInputRef={emailRef}
      />

      <TurnstileWidget />

      {error && <p className="text-lg text-brand-red">{error}</p>}
    </form>
  );
}
