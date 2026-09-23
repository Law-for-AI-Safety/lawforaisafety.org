import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { redLinesApplications } from "@/drizzle/schema";
import RedLinesApplicationDetail from "./RedLinesApplicationDetail";

export const metadata: Metadata = {
  title: "LAIS - Red Lines Dialogues application",
  robots: { index: false, follow: false },
};

export default async function AdminRedLinesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [application] = await db
    .select()
    .from(redLinesApplications)
    .where(eq(redLinesApplications.id, id));

  // Draft rows haven't completed verification yet, so there's nothing here
  // to review. Decided rows (approved/rejected) are kept, see schema.ts, and
  // shown read-only rather than 404ing, since "who we didn't invite" is the
  // point of keeping them.
  if (!application || application.status === "draft") {
    notFound();
  }

  return (
    <RedLinesApplicationDetail
      application={{
        id: application.id,
        name: application.name,
        email: application.email,
        pictureUrl: application.pictureUrl,
        authProvider: application.authProvider,
        linkedinUrl: application.linkedinUrl,
        areaOfExpertise: application.areaOfExpertise,
        motivation: application.motivation,
        availableHours: application.availableHours,
        availableOct12: application.availableOct12,
        availableNov9: application.availableNov9,
        availableDec7: application.availableDec7,
        euParliamentInterest: application.euParliamentInterest,
        affiliation: application.affiliation,
        publicationExample: application.publicationExample,
        status: application.status as "pending" | "approved" | "rejected",
        reviewedAt: application.reviewedAt ? application.reviewedAt.toISOString() : null,
        reviewedBy: application.reviewedBy,
        reviewerNotes: application.reviewerNotes,
        contactedBy: application.contactedBy,
        contactedAt: application.contactedAt ? application.contactedAt.toISOString() : null,
      }}
    />
  );
}
