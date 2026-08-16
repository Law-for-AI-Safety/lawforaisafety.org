import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-brand-black px-8 md:px-16 py-12">
      <div className="max-w-4xl mx-auto flex flex-row justify-between items-center gap-6">
        <Image
          src="/logo.svg"
          alt="Law for AI Safety"
          width={160}
          height={48}
          className="w-36 brightness-0 invert opacity-40"
        />
        <p className="text-lg font-light text-brand-white/85 flex flex-wrap items-center gap-x-3">
          <span>© {new Date().getFullYear()} Law for AI Safety. All rights reserved.</span>
          <Link href="/privacy-policy" className="underline hover:text-brand-white">
            Privacy Policy
          </Link>
        </p>
      </div>
    </footer>
  );
}
