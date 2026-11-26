"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Topic } from "@/news-radar/types";
import { saveSettings } from "../actions";

type Draft = { id: string; name: string; queries: string; include: string; require: string; exclude: string };

const lines = (text: string) => text.split("\n");
const toDraft = (t: Topic): Draft => ({
  id: t.id,
  name: t.name,
  queries: t.queries.join("\n"),
  include: t.include.join("\n"),
  require: t.require.join("\n"),
  exclude: t.exclude.join("\n"),
});

const FIELDS: { key: keyof Omit<Draft, "id" | "name">; label: string; hint: string }[] = [
  { key: "queries", label: "Search terms", hint: "One per line. Put a phrase in quotes to search for it exactly." },
  { key: "include", label: "Include keywords", hint: "One per line. An article needs at least one." },
  { key: "require", label: "Required words", hint: "Optional, one per line. When set, an article also needs one of these." },
  { key: "exclude", label: "Exclude keywords", hint: "Optional, one per line. An article holding any of these is left out." },
];

/**
 * The topics, trusted outlets and recipient, saved together. Lists are one entry per line,
 * which works on a phone and needs no add/remove buttons per keyword.
 */
export default function SettingsForm({
  initial,
  canSetRecipient,
}: {
  initial: { topics: Topic[]; trustedOutlets: string[]; recipient: string };
  canSetRecipient: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [topics, setTopics] = useState<Draft[]>(initial.topics.map(toDraft));
  const [outlets, setOutlets] = useState(initial.trustedOutlets.join("\n"));
  const [recipient, setRecipient] = useState(initial.recipient);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const update = (i: number, change: Partial<Draft>) => setTopics((all) => all.map((t, j) => (j === i ? { ...t, ...change } : t)));

  const save = () =>
    startTransition(async () => {
      const result = await saveSettings({
        topics: topics.map((t) => ({
          id: t.id,
          name: t.name,
          queries: lines(t.queries),
          include: lines(t.include),
          require: lines(t.require),
          exclude: lines(t.exclude),
        })),
        trustedOutlets: lines(outlets),
        recipient,
      });
      if (result.ok) {
        setMessage({ text: "Saved. The next run uses these settings.", error: false });
        router.refresh();
      } else setMessage({ text: result.message, error: true });
    });

  const input = "w-full rounded-sm border border-brand-black/30 bg-brand-white px-3 py-2";
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <section className="flex flex-col gap-2 rounded-sm border border-brand-black/15 p-4">
        <h2 className="text-xl text-brand-black">Weekly email</h2>
        <label className="flex flex-col gap-1 text-brand-black/80" htmlFor="recipient">
          Send the summary to
        </label>
        <input
          id="recipient"
          type="email"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          disabled={!canSetRecipient || pending}
          placeholder="the team's Google Group address"
          className={`${input} disabled:bg-brand-black/5`}
        />
        <p className="text-sm text-brand-black/60">
          {canSetRecipient
            ? "A team group, not a person. Only the production site sends it; leave it empty to send nothing."
            : "Only technical admins can change where the summary goes."}
        </p>
      </section>

      {topics.map((topic, i) => (
        <section key={topic.id || `new-${i}`} aria-label={topic.name || "New topic"} className="flex flex-col gap-3 rounded-sm border border-brand-black/15 p-4">
          <div className="flex items-start justify-between gap-2">
            <label className="flex flex-1 flex-col gap-1 text-brand-black/80">
              Topic name
              <input value={topic.name} onChange={(e) => update(i, { name: e.target.value })} disabled={pending} className={input} />
            </label>
            <button
              type="button"
              disabled={pending || topics.length === 1}
              onClick={() => setTopics((all) => all.filter((_, j) => j !== i))}
              className="mt-6 rounded-sm border border-brand-red px-3 py-2 text-sm text-brand-red disabled:opacity-50"
            >
              Remove topic
            </button>
          </div>
          {FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1 text-brand-black/80">
              {field.label}
              <span className="text-sm text-brand-black/60">{field.hint}</span>
              <textarea
                value={topic[field.key]}
                onChange={(e) => update(i, { [field.key]: e.target.value })}
                disabled={pending}
                rows={Math.min(8, Math.max(2, lines(topic[field.key]).length))}
                className={input}
              />
            </label>
          ))}
        </section>
      ))}

      <button
        type="button"
        disabled={pending}
        onClick={() => setTopics((all) => [...all, { id: "", name: "", queries: "", include: "", require: "", exclude: "" }])}
        className="self-start rounded-sm border border-brand-navy px-4 py-2 text-brand-navy"
      >
        Add a topic
      </button>

      <section className="flex flex-col gap-2 rounded-sm border border-brand-black/15 p-4">
        <label className="flex flex-col gap-1 text-brand-black/80">
          <span className="text-xl text-brand-black">Trusted outlets</span>
          <span className="text-sm text-brand-black/60">
            One per line: an outlet&apos;s name as the sources give it (Reuters), or its domain (europa.eu, which also covers its
            subdomains). Their articles rank higher.
          </span>
          <textarea value={outlets} onChange={(e) => setOutlets(e.target.value)} disabled={pending} rows={8} className={input} />
        </label>
      </section>

      <div className="flex flex-col gap-2">
        <button type="submit" disabled={pending} aria-busy={pending} className="self-start rounded-sm bg-brand-navy px-6 py-3 text-brand-white disabled:opacity-60">
          {pending ? "Saving…" : "Save settings"}
        </button>
        {message && (
          <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-brand-red" : "text-brand-black/70"}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
