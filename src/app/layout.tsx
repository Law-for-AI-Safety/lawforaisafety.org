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
  twitter: {
    card: "summary_large_image",
  },
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
          Redirects back from the apply/newsletter flows land on /#contact —
          smooth-scroll (globals.css) also applies to that initial fragment
          jump on page load, which reads as a jarring slow-motion scroll.
          Force an instant jump for that landing, then restore smooth
          scrolling for normal in-page nav-link clicks afterwards.
        */}
        <Script id="redirect-scroll-fix" strategy="beforeInteractive">
          {`
            (function () {
              var params = new URLSearchParams(window.location.search);
              if (params.has("applied") || params.has("error") || params.has("newsletter")) {
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
        {children}
      </body>
    </html>
  );
}
