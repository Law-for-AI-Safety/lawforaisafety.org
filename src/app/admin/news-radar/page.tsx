import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession, isTechAdminEmail } from "@/lib/session";
import { getNewsRadarSettings, latestRuns, listItems, type ItemState } from "@/lib/news-radar-store";
import { listNewsletters } from "@/lib/newsletter-store";
import { safeHref } from "@/news-radar/digest";
import { SOURCES, SOURCE_LABELS } from "@/news-radar/sources";
import type { SourceId } from "@/news-radar/types";
import { formatDay, groupByWeek, isSeenBefore, runSummary } from "@/news-radar/view";
import ItemActions from "./ItemActions";
import RunNowButton from "./RunNowButton";

export const metadata: Metadata = {
  title: "LAIS - News radar",
  robots: { index: false, follow: false },
};

const STATES: { value: ItemState; label: string }[] = [
  { value: "new", label: "New" },
  { value: "useful", label: "Useful" },
  { value: "dismissed", label: "Dismissed" },
];

const STATE_TONE: Record<ItemState, string> = {
  new: "border-brand-navy text-brand-navy",
  useful: "border-brand-navy bg-brand-navy text-brand-white",
  dismissed: "border-brand-black/30 text-brand-black/60",
};

type Search = { topic?: string; source?: string; state?: string };

/**
 * What the weekly run found, for triage: grouped by the week each item was first seen, with
 * the latest run's status above. Filters are a plain form, so they work without JavaScript and
 * a filtered view can be linked to.
 */
export default async function NewsRadarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const search = await searchParams;
  const settings = await getNewsRadarSettings();
  const topicNames = new Map(settings.topics.map((t) => [t.id, t.name]));
  const filter = {
    topic: search.topic && topicNames.has(search.topic) ? search.topic : undefined,
    source: SOURCES.some((s) => s.id === search.source) ? (search.source as SourceId) : undefined,
    state: STATES.some((s) => s.value === search.state) ? (search.state as ItemState) : undefined,
  };
  const [items, runs, newsletters] = await Promise.all([listItems(filter), latestRuns(1), listNewsletters()]);
  const drafts = newsletters.filter((n) => n.state === "draft").map((n) => ({ id: n.id, subject: n.subject.trim() || "Untitled newsletter" }));
  const weeks = groupByWeek(items);
  const run = runs[0] ? runSummary(runs[0]) : null;
  const selectClass = "w-full max-w-full rounded-sm border border-brand-black/30 bg-brand-white px-2 py-1";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-3xl text-brand-black">News radar</h1>
        <p className="text-brand-black/70">
          News and journal articles about enforcing AI law, remedies for AI harms in the EU and AI litigation, found every
          Monday morning and emailed to the team in a short summary. Mark what is useful, dismiss the rest: a dismissed item
          stays dismissed when it turns up again.
        </p>
      </div>

      <section aria-label="Last run" className="flex flex-col gap-2 rounded-sm border border-brand-black/15 p-4">
        {run ? (
          <>
            <p className="text-brand-black">
              Last run {run.when}: {run.counts}.
            </p>
            {run.sources.length > 0 && <p className="text-sm text-brand-black/70">{run.sources.join(" · ")}</p>}
            {run.failures.map((f) => (
              <p key={f} role="status" className="text-sm text-brand-red">
                {f}
              </p>
            ))}
            {run.email && <p className="text-sm text-brand-black/70">Email: {run.email}</p>}
            {run.error && (
              <p role="status" className="text-sm text-brand-red">
                The run failed: {run.error}
              </p>
            )}
          </>
        ) : (
          <p className="text-brand-black/70">The radar has not run yet. It runs every Monday at 06:00 UTC.</p>
        )}
        {isTechAdminEmail(session.email) && <RunNowButton />}
      </section>

      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter items">
        <label className="flex min-w-0 max-w-full flex-col gap-1 text-sm text-brand-black/70">
          Topic
          <select name="topic" defaultValue={filter.topic ?? ""} className={selectClass}>
            <option value="">All topics</option>
            {settings.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-black/70">
          Source
          <select name="source" defaultValue={filter.source ?? ""} className={selectClass}>
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-black/70">
          State
          <select name="state" defaultValue={filter.state ?? ""} className={selectClass}>
            <option value="">Any state</option>
            {STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-sm border border-brand-navy px-4 py-1.5 text-brand-navy">
          Filter
        </button>
      </form>

      {weeks.length === 0 ? (
        <p className="text-brand-black/60">{filter.topic || filter.source || filter.state ? "Nothing matches these filters." : "Nothing found yet."}</p>
      ) : (
        weeks.map((week) => (
          <section key={week.start.toISOString()} className="flex flex-col" aria-label={`Week of ${formatDay(week.start)}`}>
            <h2 className="text-xl text-brand-black">First seen the week of {formatDay(week.start)}</h2>
            <ul className="flex flex-col">
              {week.stories.map(({ item, alsoIn }) => {
                const href = safeHref(item.url);
                return (
                  <li key={item.id} className="flex flex-col gap-1 border-t border-brand-black/10 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-lg text-brand-black underline">
                          {item.title}
                        </a>
                      ) : (
                        <span className="text-lg text-brand-black">{item.title}</span>
                      )}
                      <span className={`rounded-sm border px-2 text-sm ${STATE_TONE[item.state]}`}>
                        {STATES.find((s) => s.value === item.state)?.label}
                      </span>
                    </div>
                    <span className="text-sm text-brand-black/70">
                      {[item.outlet, item.publishedAt ? formatDay(item.publishedAt) : null, item.kind === "paper" ? "Journal article or preprint" : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="text-sm text-brand-black/60">
                      {item.topics.map((t) => topicNames.get(t) ?? t).join(", ")} · via {item.sources.map((s) => SOURCE_LABELS[s as SourceId] ?? s).join(", ")}
                    </span>
                    {isSeenBefore(item) && (
                      <span className="text-sm text-brand-black/60">Seen before (first seen {formatDay(item.firstSeenAt)})</span>
                    )}
                    {alsoIn.length > 0 && (
                      <span className="text-sm text-brand-black/60">
                        Also reported by{" "}
                        {alsoIn.map((other, i) => {
                          const otherHref = safeHref(other.url);
                          return (
                            <span key={other.id}>
                              {i > 0 && ", "}
                              {otherHref ? (
                                <a href={otherHref} target="_blank" rel="noopener noreferrer" className="underline">
                                  {other.outlet}
                                </a>
                              ) : (
                                other.outlet
                              )}
                            </span>
                          );
                        })}
                      </span>
                    )}
                    <ItemActions itemId={item.id} copyIds={alsoIn.map((other) => other.id)} state={item.state} drafts={drafts} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

