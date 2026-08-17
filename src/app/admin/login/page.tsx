const ERROR_MESSAGES: Record<string, string> = {
  invalid: "That login link isn't valid. Please try again.",
  denied: "LinkedIn login was cancelled.",
  forbidden: "That LinkedIn account isn't authorised to access the admin area.",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-32 text-center">
      <h1 className="font-sans text-4xl text-brand-black">Admin login</h1>
      {errorMessage && (
        <p className="border border-brand-red bg-brand-red/10 px-4 py-3 text-brand-red">
          {errorMessage}
        </p>
      )}
      <a
        href="/api/admin/auth/linkedin"
        className="bg-brand-navy px-6 py-3 text-brand-white"
      >
        Log in with LinkedIn
      </a>
    </main>
  );
}
