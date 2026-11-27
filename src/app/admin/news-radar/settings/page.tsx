import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession, isTechAdminEmail } from "@/lib/session";
import { getNewsRadarSettings } from "@/lib/news-radar-store";
import { formatTime } from "@/news-radar/view";
import SettingsForm from "./SettingsForm";

export const metadata: Metadata = {
  title: "LAIS - News radar settings",
  robots: { index: false, follow: false },
};

/** What the radar searches for and where its weekly email goes. */
export default async function NewsRadarSettingsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const settings = await getNewsRadarSettings();
  const tech = isTechAdminEmail(session.email);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-3xl text-brand-black">News radar settings</h1>
        <p className="text-brand-black/70">
          Each topic&apos;s search terms go to the sources every week. An article counts for a topic when its title or summary
          holds one of the topic&apos;s include keywords, one of its required words (if it has any), and none of its exclude
          keywords. Articles from trusted outlets are ranked higher. Changes apply from the next run.
        </p>
        <p className="text-sm text-brand-black/60">
          {settings.updatedBy && settings.updatedAt
            ? `Last changed by ${settings.updatedBy}, ${formatTime(settings.updatedAt)}.`
            : "Never changed: these are the starting topics."}
        </p>
      </div>
      <SettingsForm
        initial={{
          topics: settings.topics,
          trustedOutlets: settings.trustedOutlets,
          recipient: settings.recipient ?? "",
        }}
        canSetRecipient={tech}
      />
    </main>
  );
}
