import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LAIS - Applications",
  robots: { index: false, follow: false },
};

export default function AdminApplicationsIndexPage() {
  return (
    <main className="flex h-full items-center justify-center px-4">
      <p className="text-lg text-brand-black/60">
        Select an application from the list to review it.
      </p>
    </main>
  );
}
