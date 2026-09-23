"use client";

import { useEffect, useRef, useState } from "react";
import {
  FORM_RENDERED_AT_FIELD_NAME,
  HONEYPOT_FIELD_NAME,
} from "@/lib/abuse-protection";
import Checkbox from "../apply/Checkbox";
import TurnstileWidget from "../apply/TurnstileWidget";
import { FIELD_CLASSES, HELPER_TEXT_CLASSES, LABEL_CLASSES } from "../apply/field-styles";
import FormSubmissionTabs from "../FormSubmissionTabs";
import LocalTime from "./LocalTime";

type Area = "legal_governance" | "technical";
type EuInterest = "yes" | "maybe" | "no";

const AREA_OPTIONS: { id: Area; label: string }[] = [
  { id: "legal_governance", label: "Legal / governance" },
  { id: "technical", label: "Technical" },
];

const EU_INTEREST_OPTIONS: { id: EuInterest; label: string }[] = [
  { id: "yes", label: "Yes" },
  { id: "maybe", label: "Possibly" },
  { id: "no", label: "No" },
];

const MEETINGS: { name: string; date: string; time: string; utc: string; detail: string }[] = [
  {
    name: "availableOct12",
    date: "12 October 2026",
    time: "09:00 CEST",
    utc: "2026-10-12T07:00:00Z",
    detail: "scope and content",
  },
  {
    name: "availableNov9",
    date: "9 November 2026",
    time: "09:00 CET",
    utc: "2026-11-09T08:00:00Z",
    detail: "refinement of the report",
  },
  {
    name: "availableDec7",
    date: "7 December 2026",
    time: "09:00 CET",
    utc: "2026-12-07T08:00:00Z",
    detail: "finalisation of the report",
  },
];

function RadioGroup<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3" role="radiogroup">
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <label
            key={option.id}
            className={`cursor-pointer rounded-sm border px-5 py-3 text-lg transition-colors ${
              selected
                ? "border-brand-navy bg-brand-navy text-brand-white"
                : "border-brand-black/30 text-brand-black hover:border-brand-navy"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={selected}
              onChange={() => onChange(option.id)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export default function RedLinesApplyForm() {
  const [error, setError] = useState<string | null>(null);
  const [submittingTo, setSubmittingTo] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());
  const [area, setArea] = useState<Area | null>(null);
  const [euInterest, setEuInterest] = useState<EuInterest | null>(null);

  const motivationRef = useRef<HTMLTextAreaElement>(null);
  const affiliationRef = useRef<HTMLInputElement>(null);
  const hoursRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setSubmittingTo(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  function validate(submitter: HTMLElement | null): boolean {
    if (!area) {
      setError("Choose an area of expertise.");
      return false;
    }
    if (!motivationRef.current?.value.trim()) {
      setError("Tell us your motivation for applying.");
      return false;
    }
    if (!hoursRef.current?.value.trim()) {
      setError("Enter the hours you can contribute, October–December 2026.");
      return false;
    }
    if (!euInterest) {
      setError("Say whether you're interested in visiting the European Parliament.");
      return false;
    }
    if (!affiliationRef.current?.value.trim()) {
      setError("Enter your affiliation (institution).");
      return false;
    }

    const isEmailSubmit =
      submitter?.getAttribute("formaction") === "/api/red-lines-dialogue/apply/email";
    if (isEmailSubmit) {
      if (!nameRef.current?.value.trim() || !emailRef.current?.value.trim()) {
        setError("Name and email are required.");
        return false;
      }
    }

    setError(null);
    return true;
  }

  return (
    <form
      method="post"
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent)
          .submitter as HTMLElement | null;
        if (submittingTo !== null || !validate(submitter)) {
          event.preventDefault();
          return;
        }
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
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}
      >
        <label>
          Website
          <input type="text" name={HONEYPOT_FIELD_NAME} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input type="hidden" name={FORM_RENDERED_AT_FIELD_NAME} value={renderedAt} readOnly />

      <div className="flex flex-col gap-3">
        <span className={LABEL_CLASSES}>Area of expertise</span>
        <RadioGroup name="areaOfExpertise" options={AREA_OPTIONS} value={area} onChange={setArea} />
      </div>

      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASSES}>Motivation</span>
        <span className={HELPER_TEXT_CLASSES}>In about 100 words</span>
        <textarea
          ref={motivationRef}
          name="motivation"
          maxLength={900}
          rows={4}
          className={FIELD_CLASSES}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASSES}>Available hours, October–December 2026</span>
        <span className={HELPER_TEXT_CLASSES}>Approximate total hours you can contribute across the three months</span>
        <input
          ref={hoursRef}
          type="number"
          name="availableHours"
          min={0}
          max={1000}
          inputMode="numeric"
          className={`${FIELD_CLASSES} max-w-xs`}
        />
      </label>

      <div className="flex flex-col gap-3">
        <span className={LABEL_CLASSES}>Which online meetings can you attend?</span>
        <span className={HELPER_TEXT_CLASSES}>Each lasts approximately two hours</span>
        <div className="flex flex-col gap-3">
          {MEETINGS.map((meeting) => (
            <Checkbox
              key={meeting.name}
              name={meeting.name}
              label={
                <>
                  {meeting.date}, {meeting.time}
                  <LocalTime utc={meeting.utc} />: {meeting.detail}
                </>
              }
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className={LABEL_CLASSES}>
          Interested in visiting the European Parliament in the first quarter of 2027?
        </span>
        <RadioGroup
          name="euParliamentInterest"
          options={EU_INTEREST_OPTIONS}
          value={euInterest}
          onChange={setEuInterest}
        />
      </div>

      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASSES}>Affiliation (institution)</span>
        <input
          ref={affiliationRef}
          type="text"
          name="affiliation"
          maxLength={200}
          className={FIELD_CLASSES}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASSES}>LinkedIn profile URL</span>
        <span className={HELPER_TEXT_CLASSES}>Optional</span>
        <input
          type="url"
          name="linkedinUrl"
          maxLength={300}
          placeholder="https://www.linkedin.com/in/…"
          className={FIELD_CLASSES}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASSES}>Example of relevant publication</span>
        <span className={HELPER_TEXT_CLASSES}>Optional: a title and link, if you have one</span>
        <textarea
          name="publicationExample"
          maxLength={500}
          rows={2}
          className={FIELD_CLASSES}
        />
      </label>

      <FormSubmissionTabs
        linkedinAction="/api/red-lines-dialogue/apply/linkedin"
        googleAction="/api/red-lines-dialogue/apply/google"
        emailAction="/api/red-lines-dialogue/apply/email"
        submittingTo={submittingTo}
        nameInputRef={nameRef}
        emailInputRef={emailRef}
      />

      <TurnstileWidget />

      {error && <p className="text-lg text-brand-red">{error}</p>}
    </form>
  );
}
