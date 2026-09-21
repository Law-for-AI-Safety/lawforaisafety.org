import { NextResponse } from "next/server";
import { requireTechAdmin } from "@/lib/admin-guard";
import { recordAdminAction } from "@/lib/audit-log";
import {
  eraseDataForEmail,
  findDataForEmail,
  isPlausibleEmail,
  type ErasureScopes,
} from "@/lib/erasure";

/**
 * Lookup and erasure for a single email address, behind the admin session.
 *
 * `action` is required and has no default: erasure is irreversible, so a
 * malformed or truncated request must fail rather than fall through to
 * deleting something. The UI always looks up first, so whoever clicks delete
 * has seen exactly what it will remove.
 */
export async function POST(request: Request) {
  const session = await requireTechAdmin(request);
  if (session instanceof NextResponse) return session;

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    action?: string;
    scopes?: Partial<ErasureScopes>;
  };
  const email = body.email?.trim() ?? "";

  if (!isPlausibleEmail(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address" },
      { status: 400 },
    );
  }

  if (body.action === "lookup") {
    return NextResponse.json(await findDataForEmail(email));
  }

  if (body.action === "erase") {
    // Each scope must be asked for. A dropped or malformed field erases
    // nothing rather than defaulting to erasing everything.
    const scopes: ErasureScopes = {
      applications: body.scopes?.applications === true,
      newsletterSignups: body.scopes?.newsletterSignups === true,
      processed: body.scopes?.processed === true,
    };

    if (!Object.values(scopes).some(Boolean)) {
      return NextResponse.json(
        { error: "Select at least one thing to erase" },
        { status: 400 },
      );
    }

    const result = await eraseDataForEmail(email, scopes);
    console.log(
      `[erasure] ${session.email} erased data for an applicant: ` +
        `${result.applications} application(s), ${result.cvs} CV(s), ` +
        `${result.newsletterSignups} newsletter signup(s), ` +
        `${result.processed} processed record(s)`,
    );
    // Counts only, no subject hash: an erasure that left a pointer to the
    // person it erased wouldn't be one.
    await recordAdminAction({
      actorEmail: session.email,
      action: "erase",
      detail: { scopes, ...result },
    });
    return NextResponse.json(result);
  }

  return NextResponse.json(
    { error: "Unknown action" },
    { status: 400 },
  );
}
