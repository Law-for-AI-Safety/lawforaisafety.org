import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lawforaisafety.org"),
  title: "Law for AI Safety",
  description: "Bringing together legal professionals to address large-scale AI risks and advance AI safety.",
  alternates: {
    canonical: "/",
  },
  twitter: {
    card: "summary_large_image",
  },
  verification: {
    google: "Lw2eiVG3ZZH1wvSYzgPCgTABKKujvX8zLtqToZ57K_M",
    other: {
      "msvalidate.01": "A5F661EC6585249743E67FD5A8C3A8E0",
    },
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Law for AI Safety",
  url: "https://lawforaisafety.org",
  logo: "https://lawforaisafety.org/logo.svg",
  description:
    "Bringing together legal professionals to address large-scale AI risks and advance AI safety.",
  sameAs: ["https://www.linkedin.com/company/law-for-ai-safety/"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        {/*
          Redirects back from the apply flow land on /#contact — smooth-scroll
          (globals.css) also applies to that initial fragment jump on page
          load, which reads as a jarring slow-motion scroll. Force an instant
          jump for that landing, then restore smooth scrolling for normal
          in-page nav-link clicks afterwards. (Newsletter confirm/invalid used
          to land here too via a `newsletter` param, but those now go to their
          own dedicated pages — see /newsletter/confirmed, /newsletter/invalid.)
        */}
        <Script id="redirect-scroll-fix" strategy="beforeInteractive">
          {`
            (function () {
              var params = new URLSearchParams(window.location.search);
              if (params.has("applied") || params.has("error")) {
                document.documentElement.style.scrollBehavior = "auto";
                window.addEventListener("load", function () {
                  setTimeout(function () {
                    document.documentElement.style.scrollBehavior = "";
                  }, 0);
                });
              }
            })();
          `}
        </Script>
        <Script id="organization-jsonld" type="application/ld+json" strategy="beforeInteractive">
          {JSON.stringify(organizationJsonLd)}
        </Script>
        {children}
      </body>
    </html>
  );
}
