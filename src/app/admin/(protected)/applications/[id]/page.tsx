import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, processedApplications } from "@/drizzle/schema";
import ApplicationDetail from "./ApplicationDetail";

export default async function AdminApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id));

  const isRetriable =
    (application?.status === "approved" || application?.status === "rejected") &&
    application?.notificationStatus === "failed";

  if (!application || (application.status !== "pending" && !isRetriable)) {
    notFound();
  }

  let priorRejection: { processedAt: Date; reviewerNotes: string | null } | null =
    null;
  if (application.priorRejectionId) {
    const [prior] = await db
      .select({
        processedAt: processedApplications.processedAt,
        reviewerNotes: processedApplications.reviewerNotes,
      })
      .from(processedApplications)
      .where(eq(processedApplications.id, application.priorRejectionId));
    priorRejection = prior ?? null;
  }

  return (
    <ApplicationDetail
      application={{
        id: application.id,
        name: application.name,
        email: application.email,
        pictureUrl: application.pictureUrl,
        authProvider: application.authProvider,
        organisation: application.organisation,
        linkedinUrl: application.linkedinUrl,
        hasCv: Boolean(application.cvBlobKey),
        positionStatement: application.positionStatement,
        comments: application.comments,
        newsletterOptIn: application.newsletterOptIn,
        failedNotification: isRetriable
          ? (application.status as "approved" | "rejected")
          : null,
      }}
      priorRejection={
        priorRejection
          ? {
              processedAt: priorRejection.processedAt.toISOString(),
              reviewerNotes: priorRejection.reviewerNotes,
            }
          : null
      }
    />
  );
}
