import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import ContentPage from "@/app/ContentPage";
import Rule from "@/cms/blocks/Rule";
import SubmitErrorBanner from "./SubmitErrorBanner";
import SubmitForm from "./SubmitForm";
import SubmitToast from "./SubmitToast";

export const metadata: Metadata = {
  title: "Submit an opportunity | Law for AI Safety",
  description: "Send us a job, fellowship, project, course or event for the Law for AI Safety opportunities board.",
  alternates: { canonical: "/opportunities/submit" },
};

export default function SubmitOpportunityPage() {
  return (
    <ContentPage gap={6}>
      <Link href="/opportunities" className="w-fit underline">
        ← All opportunities
      </Link>
      <h1 className="text-[2.625rem] md:text-[4.125rem] font-light text-brand-black leading-[1.1] tracking-tight" style={{ textWrap: "balance" }}>
        Submit an opportunity
      </h1>
      <Rule />
      <p className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
        Know of a job, fellowship, project, course or event for lawyers working on AI safety? Send us the link, or fill in
        the details. We review everything before it goes on the board, and we&apos;ll email you when it does.
      </p>

      {/* The banner and toast read the query string, which a prerendered page only has in the browser. */}
      <Suspense>
        <SubmitErrorBanner />
      </Suspense>
      <SubmitForm />
      <Suspense>
        <SubmitToast />
      </Suspense>
    </ContentPage>
  );
}
