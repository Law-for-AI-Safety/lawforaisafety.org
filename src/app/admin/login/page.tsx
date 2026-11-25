import type { Metadata } from "next";
import { configuredAdminWorkspaceDomain } from "@/lib/admin-workspace";

export const metadata: Metadata = {
  title: "LAIS - Login",
  robots: { index: false, follow: false },
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "That login link isn't valid. Please try again.",
  denied: "Login was cancelled.",
  workspace:
    "Use your Law for AI Safety Google account. Personal Google accounts and other organisations' accounts can't access the admin area.",
  forbidden: "That account isn't authorised to access the admin area.",
  use_google:
    "That LinkedIn account uses your Law for AI Safety address, so log in with your Law for AI Safety Google account instead.",
  unavailable: "Google login isn't set up yet. Log in with LinkedIn for now.",
  moved:
    "You've moved to your Law for AI Safety Google account, so LinkedIn login is closed for you. Log in with Google instead.",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // Own keys only: a code such as "toString" or "__proto__" must not reach Object.prototype.
  const errorMessage = error && Object.hasOwn(ERROR_MESSAGES, error) ? ERROR_MESSAGES[error] : null;

  // Google login is offered once ADMIN_GOOGLE_DOMAIN is set; until then LinkedIn is the only way in.
  const googleOn = configuredAdminWorkspaceDomain() !== null;

  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-32 text-center">
      <h1 className="font-sans text-4xl text-brand-black">Admin login</h1>
      {googleOn && (
        <p className="text-brand-black/70">
          Sign in with your Law for AI Safety Google account.
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="border border-brand-red bg-brand-red/10 px-4 py-3 text-brand-red">
          {errorMessage}
        </p>
      )}
      {googleOn ? (
        <>
          <a
            href="/api/admin/auth/google"
            className="bg-brand-navy px-6 py-3 text-brand-white"
          >
            Log in with Google
          </a>
          <div className="flex flex-col items-center gap-3 border-t border-brand-black/15 pt-6 text-sm text-brand-black/70">
            <p>
              Still using LinkedIn? Log in with it, then choose &ldquo;Switch to Google&rdquo; at
              the top of the admin area. After that, LinkedIn login stops working for you.
            </p>
            <a href="/api/admin/auth/linkedin" className="underline">
              Log in with LinkedIn
            </a>
          </div>
        </>
      ) : (
        <a
          href="/api/admin/auth/linkedin"
          className="bg-brand-navy px-6 py-3 text-brand-white"
        >
          Log in with LinkedIn
        </a>
      )}
    </main>
  );
}
