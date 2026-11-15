import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getEmailPreviews } from "@/lib/email";
import { getAdminSession, isTechAdminConfigured, isTechAdminEmail } from "@/lib/session";
import TechAdminOnly from "../../TechAdminOnly";

export const metadata: Metadata = {
  title: "LAIS - Email preview",
  robots: { index: false, follow: false },
};

/** Every transactional email as it renders. A technical admin's tool, like the other account-menu pages. */
export default async function EmailPreviewPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!isTechAdminEmail(session.email)) {
    return <TechAdminOnly configured={isTechAdminConfigured()} />;
  }
  const previews = getEmailPreviews();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12">
      <div>
        <h1 className="font-sans text-3xl text-brand-black">Email preview</h1>
        <p className="mt-1 text-brand-black/60">
          Renders exactly what each transactional email sends, including the
          real footer logo (only loads correctly here — the actual
          `NEXT_PUBLIC_SITE_URL`-based image URL isn&apos;t reachable from a
          real inbox when testing against localhost).
        </p>
      </div>

      {previews.map((preview) => (
        <div key={preview.label} className="flex flex-col gap-2">
          <h2 className="font-sans text-xl text-brand-black">{preview.label}</h2>
          <p className="text-sm text-brand-black/60">Subject: {preview.subject}</p>
          <iframe
            srcDoc={preview.html}
            title={preview.label}
            className="h-[420px] w-full border border-brand-black/10 bg-brand-white"
          />
        </div>
      ))}
    </main>
  );
}
