import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LAIS - Login",
  robots: { index: false, follow: false },
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "That login link isn't valid. Please try again.",
  denied: "Google login was cancelled.",
  workspace:
    "Use your Law for AI Safety Google account. Personal Google accounts and other organisations' accounts can't access the admin area.",
  forbidden: "That Google account isn't authorised to access the admin area.",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // Own keys only: a code such as "toString" or "__proto__" must not reach Object.prototype.
  const errorMessage = error && Object.hasOwn(ERROR_MESSAGES, error) ? ERROR_MESSAGES[error] : null;

  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-32 text-center">
      <h1 className="font-sans text-4xl text-brand-black">Admin login</h1>
      <p className="text-brand-black/70">
        Sign in with your Law for AI Safety Google account.
      </p>
      {errorMessage && (
        <p role="alert" className="border border-brand-red bg-brand-red/10 px-4 py-3 text-brand-red">
          {errorMessage}
        </p>
      )}
      <a
        href="/api/admin/auth/google"
        className="bg-brand-navy px-6 py-3 text-brand-white"
      >
        Log in with Google
      </a>
    </main>
  );
}
