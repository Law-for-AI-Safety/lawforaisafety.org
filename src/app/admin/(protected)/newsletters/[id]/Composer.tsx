"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RichTextField from "@/app/admin/cms/[slug]/RichTextField";
import { scheduleProblem } from "@/newsletter/schedule";
import { siteUrl, TEST_UNSUBSCRIBE_HREF } from "@/newsletter/site";
import {
  newsletterProblems,
  PREVIEW_TEXT_MAX,
  renderNewsletterHtml,
  SUBJECT_MAX,
  type NewsletterFields,
} from "@/newsletter/template";
import { deleteNewsletter, saveNewsletter, scheduleNewsletter, sendTestNewsletter } from "../actions";
import ConfirmSend from "../ConfirmSend";
import WhenPicker, { whenFromInput } from "../WhenPicker";

type Notice = { tone: "ok" | "error"; text: string } | null;

function TextField({
  label,
  value,
  onChange,
  max,
  hint,
  problem,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  hint: string;
  problem?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-brand-black/80">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={problem ? "true" : undefined}
        aria-describedby={`${id}-hint`}
        className={`rounded-sm border bg-brand-white px-2 py-1 ${problem ? "border-brand-red" : "border-brand-black/30"}`}
      />
      <span id={`${id}-hint`} className="text-sm text-brand-black/60">
        {hint} {value.trim().length}/{max}
      </span>
    </div>
  );
}

/**
 * The newsletter editor: subject, preview text and body on one side, the email exactly as it
 * will look on the other. Then, in order: save, send yourself a test, and schedule or send now,
 * through a confirmation step.
 */
export default function Composer({
  id,
  initial,
  initialVersion,
  initialTestedVersion,
  me,
  sender,
}: {
  id: string;
  initial: NewsletterFields;
  initialVersion: number;
  initialTestedVersion: number | null;
  me: string;
  sender: string;
}) {
  const router = useRouter();
  const [fields, setFields] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [version, setVersion] = useState(initialVersion);
  const [testedVersion, setTestedVersion] = useState(initialTestedVersion);
  const [notice, setNotice] = useState<Notice>(null);
  const [mode, setMode] = useState<"schedule" | "now">("schedule");
  const [when, setWhen] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = fields.subject !== saved.subject || fields.previewText !== saved.previewText || fields.body !== saved.body;
  const problems = newsletterProblems(fields);
  const ready = Object.keys(problems).length === 0;
  const tested = !dirty && testedVersion === version;
  const html = useMemo(
    () => renderNewsletterHtml(fields, { siteUrl: siteUrl(), unsubscribeHref: TEST_UNSUBSCRIBE_HREF }),
    [fields],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (key: keyof NewsletterFields) => (value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setConfirming(false);
  };

  // Any change to what is being sent closes an open confirmation, so it is confirmed afresh.
  const chooseMode = (next: "schedule" | "now") => {
    setMode(next);
    setConfirming(false);
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveNewsletter(id, fields, version);
      if (!result.ok) {
        setNotice({ tone: "error", text: result.message });
        return;
      }
      setSaved(fields);
      setVersion(result.version);
      setNotice({ tone: "ok", text: "Saved." });
    });

  const sendTest = () =>
    startTransition(async () => {
      const result = await sendTestNewsletter(id, version);
      if (!result.ok) {
        setNotice({ tone: "error", text: result.message });
        return;
      }
      setTestedVersion(version);
      setNotice({ tone: "ok", text: `Test sent to ${result.to}. Open it and check it before sending.` });
    });

  const remove = () => {
    if (!window.confirm("Delete this draft? This can't be undone.")) return;
    startTransition(async () => {
      const result = await deleteNewsletter(id, version);
      if (!result.ok) setNotice({ tone: "error", text: result.message });
      else router.push("/admin/newsletters");
    });
  };

  const at = mode === "schedule" ? whenFromInput(when) : null;
  const timeProblem = mode === "schedule" ? (at ? scheduleProblem(at, new Date()) : "Choose a date and time.") : null;
  const sendBlocker = dirty
    ? "Save your changes first."
    : !ready
      ? "Finish the newsletter first."
      : !tested
        ? "Send yourself a test of this version first, and check it."
        : timeProblem;

  return (
    <main className="flex w-full flex-col gap-6 px-4 py-8 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:max-w-xl">
        <Link href="/admin/newsletters" className="text-sm underline">
          All newsletters
        </Link>
        <h1 className="font-sans text-3xl text-brand-black">Write the newsletter</h1>
        <TextField
          label="Subject"
          value={fields.subject}
          onChange={set("subject")}
          max={SUBJECT_MAX}
          hint="The email's subject line, also its heading."
          problem={problems.subject}
        />
        <TextField
          label="Preview text"
          value={fields.previewText}
          onChange={set("previewText")}
          max={PREVIEW_TEXT_MAX}
          hint="Shown after the subject in most inboxes. Optional."
          problem={problems.previewText}
        />
        <RichTextField label="Newsletter" value={fields.body} kind="blocks" onChange={set("body")} invalid={!!problems.body && fields.body !== ""} />
        {problems.body && fields.body !== "" && <p className="text-sm text-brand-red">{problems.body}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="rounded-sm bg-brand-navy px-4 py-2 text-brand-white disabled:opacity-40"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={sendTest}
            disabled={dirty || !ready || pending}
            className="rounded-sm border border-brand-navy px-4 py-2 text-brand-navy disabled:opacity-40"
          >
            Send me a test
          </button>
          <span className="text-sm text-brand-black/70">
            {dirty ? "Unsaved changes" : tested ? `Test of this version sent` : "Saved"}
          </span>
        </div>
        <p className="text-sm text-brand-black/60">The test goes to {me}, with [Test] before the subject.</p>
        {notice && (
          <p role={notice.tone === "error" ? "alert" : "status"} className={notice.tone === "error" ? "text-brand-red" : "text-brand-black"}>
            {notice.text}
          </p>
        )}

        <section className="flex flex-col gap-3 border-t border-brand-black/10 pt-4">
          <h2 className="font-sans text-xl text-brand-black">Send to the list</h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">When</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="when" checked={mode === "schedule"} onChange={() => chooseMode("schedule")} />
              Schedule for a date and time
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="when" checked={mode === "now"} onChange={() => chooseMode("now")} />
              Send now
            </label>
          </fieldset>
          {mode === "schedule" && <WhenPicker label="Send at" value={when} onChange={(v) => { setWhen(v); setConfirming(false); }} />}
          {sendBlocker && <p className="text-sm text-brand-black/70">{sendBlocker}</p>}
          {!confirming ? (
            <button
              type="button"
              disabled={!!sendBlocker || pending}
              onClick={() => setConfirming(true)}
              className="self-start rounded-sm border-2 border-brand-red px-4 py-2 text-brand-red disabled:opacity-40"
            >
              {mode === "schedule" ? "Schedule…" : "Send now…"}
            </button>
          ) : (
            <ConfirmSend
              subject={fields.subject.trim()}
              at={at}
              action="Schedule"
              onClose={() => setConfirming(false)}
              onConfirm={async (count) => {
                const result = await scheduleNewsletter(id, version, at ? at.toISOString() : null, count);
                if (result.ok) router.refresh();
                return result;
              }}
            />
          )}
        </section>

        <button type="button" onClick={remove} disabled={pending} className="self-start text-sm text-brand-red underline">
          Delete this draft
        </button>
      </div>

      <section aria-label="Preview" className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 className="font-sans text-xl text-brand-black">Preview</h2>
        <div className="rounded-sm border border-brand-black/10 bg-brand-white p-3 text-sm">
          <p className="text-brand-black/70">From: {sender}</p>
          <p className="font-bold text-brand-black">{fields.subject.trim() || "(no subject)"}</p>
          <p className="truncate text-brand-black/70">{fields.previewText.trim() || "(no preview text: inboxes show the start of the email)"}</p>
        </div>
        <iframe title="Email preview" srcDoc={html} className="h-[75vh] w-full border border-brand-black/10 bg-brand-white" />
      </section>
    </main>
  );
}
