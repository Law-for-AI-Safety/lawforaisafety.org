import Link from "next/link";

/** Where to get the issues by email: the newsletter form on the homepage. */
export default function SignupNote() {
  return (
    <p className="text-lg font-light text-brand-navy/85">
      Get these by email:{" "}
      <Link href="/#contact" className="underline hover:text-brand-black">
        sign up to the newsletter
      </Link>
      .
    </p>
  );
}
