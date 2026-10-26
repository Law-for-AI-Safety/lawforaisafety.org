"use client";

import { useEffect, useRef, useState } from "react";
import { HONEYPOT_FIELD_NAME } from "@/lib/abuse-protection";
import { OPPORTUNITY_KINDS, OPPORTUNITY_TYPES, type OpportunityType } from "@/opportunities/kinds";
import FormSubmissionTabs from "../../FormSubmissionTabs";
import Checkbox from "../../apply/Checkbox";
import RadioGroup from "../../apply/RadioGroup";
import RenderedAtField, { useRenderedAt } from "../../apply/RenderedAtField";
import TurnstileWidget from "../../apply/TurnstileWidget";
import { FIELD_CLASSES, HELPER_TEXT_CLASSES, LABEL_CLASSES } from "../../apply/field-styles";
import { keepInput, useKeptInput, type KeptInput } from "../../apply/kept-input";

type Mode = "link" | "listing";

const FORM_KEY = "opportunity-submit";
const EMAIL_ACTION = "/api/opportunities/submit/email";

const MODE_OPTIONS: { id: Mode; label: string }[] = [
  { id: "link", label: "Send a link" },
  { id: "listing", label: "Fill in the details" },
];

const TYPE_OPTIONS = OPPORTUNITY_TYPES.map((type) => ({ id: type, label: OPPORTUNITY_KINDS[type].label }));

const LINK_LABEL: Record<OpportunityType, string> = {
  job: "Link to apply",
  fellowship: "Link to apply",
  project: "Link to get involved",
  course: "Link to enrol",
  event: "Link to register",
};

function isMode(value: string | undefined): value is Mode {
  return value === "link" || value === "listing";
}

function isType(value: string | undefined): value is OpportunityType {
  return (OPPORTUNITY_TYPES as readonly string[]).includes(value ?? "");
}

/**
 * Lets someone outside the team send the board a listing, either as just a link for the team
 * to write up or as a short listing. Either way it is only a submission: the team reviews it
 * and adds the structured details before anything goes live.
 */
export default function SubmitForm() {
  const [mode, setMode] = useState<Mode>("link");
  const [type, setType] = useState<OpportunityType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittingTo, setSubmittingTo] = useState<string | null>(null);
  const renderedAt = useRenderedAt();

  // What the visitor typed before the server refused their last submission, if it did.
  const kept = useKeptInput(FORM_KEY);
  const [restored, setRestored] = useState<KeptInput | null>(null);
  if (kept !== restored) {
    setRestored(kept);
    if (isMode(kept?.values.mode)) setMode(kept.values.mode);
    if (isType(kept?.values.type)) setType(kept.values.type);
  }

  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setSubmittingTo(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  function field(name: string): string {
    const element = formRef.current?.elements.namedItem(name);
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value.trim() : "";
  }

  function validate(submitter: HTMLElement | null): boolean {
    if (mode === "link") {
      if (!field("sourceUrl")) {
        setError("Paste the link to the opportunity.");
        return false;
      }
    } else {
      if (!type) {
        setError("Choose what kind of opportunity this is.");
        return false;
      }
      if (!field("title") || !field("org") || !field("applyUrl") || !field("description")) {
        setError("Fill in the title, organisation, link and description.");
        return false;
      }
      if (type === "event" && !field("startDate")) {
        setError("Give the event's date.");
        return false;
      }
    }

    if (submitter?.getAttribute("formaction") === EMAIL_ACTION) {
      if (!nameRef.current?.value.trim() || !emailRef.current?.value.trim()) {
        setError("Name and email are required.");
        return false;
      }
    }

    setError(null);
    return true;
  }

  const kind = type ? OPPORTUNITY_KINDS[type] : null;

  return (
    <form
      ref={formRef}
      method="post"
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        if (submittingTo !== null || !validate(submitter)) {
          event.preventDefault();
          return;
        }
        const form = event.currentTarget;
        const token = form.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
        if (form.querySelector(".cf-turnstile") && !token?.value) {
          event.preventDefault();
          setError(
            "Still checking you're not a robot. Give it a second and press the button again. If a checkbox has appeared below, tick it first.",
          );
          return;
        }
        keepInput(FORM_KEY, form, ["remote"]);
        setSubmittingTo(submitter?.getAttribute("formaction") ?? "");
      }}
    >
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input type="text" name={HONEYPOT_FIELD_NAME} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <RenderedAtField value={renderedAt} />

      <div className="flex flex-col gap-3">
        <span className={LABEL_CLASSES}>How would you like to send it?</span>
        <RadioGroup name="mode" options={MODE_OPTIONS} value={mode} onChange={setMode} />
      </div>

      <div className="flex flex-col gap-3">
        <span className={LABEL_CLASSES}>What kind of opportunity is it?</span>
        {mode === "link" && <span className={HELPER_TEXT_CLASSES}>Optional</span>}
        <RadioGroup name="type" options={TYPE_OPTIONS} value={type} onChange={setType} />
      </div>

      {mode === "link" ? (
        <label className="flex flex-col gap-2">
          <span className={LABEL_CLASSES}>Link to the opportunity</span>
          <span className={HELPER_TEXT_CLASSES}>The page that describes it. We&apos;ll write up the listing from there.</span>
          <input
            type="url"
            name="sourceUrl"
            maxLength={500}
            defaultValue={kept?.values.sourceUrl}
            placeholder="https://…"
            className={FIELD_CLASSES}
          />
        </label>
      ) : (
        <>
          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASSES}>Title</span>
            <input type="text" name="title" maxLength={200} defaultValue={kept?.values.title} className={FIELD_CLASSES} />
          </label>

          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASSES}>Organisation</span>
            <input type="text" name="org" maxLength={200} defaultValue={kept?.values.org} className={FIELD_CLASSES} />
          </label>

          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASSES}>{type ? LINK_LABEL[type] : "Link to apply"}</span>
            <input
              type="url"
              name="applyUrl"
              maxLength={500}
              defaultValue={kept?.values.applyUrl}
              placeholder="https://…"
              className={FIELD_CLASSES}
            />
          </label>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-2">
              <span className={LABEL_CLASSES}>Location</span>
              <span className={HELPER_TEXT_CLASSES}>Optional: a city and country, or &ldquo;Worldwide&rdquo;</span>
              <input type="text" name="location" maxLength={200} defaultValue={kept?.values.location} className={FIELD_CLASSES} />
            </label>
            <Checkbox name="remote" label="Can be done remotely" defaultChecked={kept?.checked.includes("remote")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-2">
              <span className={LABEL_CLASSES}>{kind?.deadlineLabel ?? "Apply by"}</span>
              <input type="date" name="deadline" defaultValue={kept?.values.deadline} className={FIELD_CLASSES} />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL_CLASSES}>{kind?.startLabel ?? "Start date"}</span>
              <input type="date" name="startDate" defaultValue={kept?.values.startDate} className={FIELD_CLASSES} />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL_CLASSES}>{kind?.endLabel ?? "End date"}</span>
              <input type="date" name="endDate" defaultValue={kept?.values.endDate} className={FIELD_CLASSES} />
            </label>
          </div>

          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASSES}>Description</span>
            <span className={HELPER_TEXT_CLASSES}>What it is, who it&apos;s for, and anything about pay or cost</span>
            <textarea
              name="description"
              maxLength={5000}
              rows={6}
              defaultValue={kept?.values.description}
              className={FIELD_CLASSES}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASSES}>Where you saw it</span>
            <span className={HELPER_TEXT_CLASSES}>Optional: a link to the original posting, if it&apos;s not the one above</span>
            <input
              type="url"
              name="sourceUrl"
              maxLength={500}
              defaultValue={kept?.values.sourceUrl}
              placeholder="https://…"
              className={FIELD_CLASSES}
            />
          </label>
        </>
      )}

      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASSES}>Anything else we should know?</span>
        <span className={HELPER_TEXT_CLASSES}>Optional. Only the team sees this.</span>
        <textarea name="note" maxLength={2000} rows={3} defaultValue={kept?.values.note} className={FIELD_CLASSES} />
      </label>

      <FormSubmissionTabs
        // Opens on the name and email tab when that is what was kept.
        key={kept ? "kept" : "new"}
        kept={kept?.values}
        linkedinAction="/api/opportunities/submit/linkedin"
        googleAction="/api/opportunities/submit/google"
        emailAction={EMAIL_ACTION}
        emailSubmitLabel="Send opportunity"
        submittingTo={submittingTo}
        disabled={!renderedAt}
        nameInputRef={nameRef}
        emailInputRef={emailRef}
      />

      <TurnstileWidget />

      {error && <p className="text-lg text-brand-red">{error}</p>}
    </form>
  );
}
