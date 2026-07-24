"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";

const links = [
  { href: "#mission", label: "Mission" },
  { href: "#work", label: "Our Work" },
  { href: "#team", label: "Team" },
  { href: "#contact", label: "Contact" },
];

function MenuIcon({ open }: { open: boolean }) {
  const bar = (closedTransform: string, openTransform: string, extra?: React.CSSProperties) => ({
    transformBox: "fill-box" as const,
    transformOrigin: "center",
    transform: open ? openTransform : closedTransform,
    transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease",
    ...extra,
  });

  return (
    <svg viewBox="0 0 32 28" width="36" height="32" aria-hidden fill="none">
      {/* Bars at y=3,12,21 (9px apart). A=2 wave, T=4 thickness. */}
      <path
        d="M0 3 C10 1 22 5 32 3 C22 9 10 5 0 3Z"
        fill="#9b1c1f"
        style={bar("translateY(0)", "translateY(9px) rotate(45deg)")}
      />
      <path
        d="M0 12 C10 10 22 14 32 12 C22 18 10 14 0 12Z"
        fill="#9b1c1f"
        style={bar("translateY(0)", "translateY(0) scaleX(0)", { opacity: open ? 0 : 1 })}
      />
      <path
        d="M0 21 C10 19 22 23 32 21 C22 27 10 23 0 21Z"
        fill="#9b1c1f"
        style={bar("translateY(0)", "translateY(-9px) rotate(-45deg)")}
      />
    </svg>
  );
}

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const ids = links.map((l) => l.href.slice(1));
    const observers: IntersectionObserver[] = [];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActive(id); },
        { rootMargin: "-40% 0px -55% 0px" }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 flex justify-center transition-all duration-300 ${
          scrolled
            ? "bg-brand-white/95 backdrop-blur-sm shadow-sm py-3"
            : "bg-brand-white py-6"
        }`}
      >
        <div className="max-w-4xl w-full mx-auto px-8 md:px-0 flex justify-between items-center">
          <Image
            src="/logo.svg"
            alt="Law for AI Safety"
            width={280}
            height={84}
            priority
            className={`transition-all duration-300 ${scrolled ? "w-36" : "w-52 md:w-64"}`}
          />

          {/* Desktop links */}
          <div className="hidden md:flex gap-8 p-8 text-xl font-light text-brand-navy">
            {links.map(({ href, label }) => {
              const id = href.slice(1);
              const isActive = active === id;
              return (
                <a key={href} href={href} className="relative group py-1">
                  <span className={`transition-colors duration-200 ${isActive ? "text-brand-red" : "hover:text-brand-red"}`}>
                    {label}
                  </span>
                  <svg
                    className={`absolute -bottom-1 left-0 w-full transition-[clip-path] duration-300 ${
                      isActive
                        ? "[clip-path:inset(0_0%_0_0)]"
                        : "[clip-path:inset(0_100%_0_0)] group-hover:[clip-path:inset(0_0%_0_0)]"
                    }`}
                    viewBox="0 0 52 12"
                    height="8"
                    preserveAspectRatio="none"
                    aria-hidden
                    fill="none"
                  >
                    <path d="M0 5 C14 2 38 8 52 5 C38 10 14 7 0 5Z" fill="#9b1c1f" />
                  </svg>
                </a>
              );
            })}
          </div>

          {/* Hamburger button */}
          <button
            className="md:hidden flex items-center justify-center w-10 h-10 focus:outline-none"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      <div
        className={`fixed inset-0 z-40 bg-brand-white flex flex-col justify-center px-8 transition-all duration-300 md:hidden ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <nav className="flex flex-col gap-8">
          {links.map(({ href, label }) => {
            const id = href.slice(1);
            const isActive = active === id;
            return (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`text-4xl font-light transition-colors duration-200 ${
                  isActive ? "text-brand-red" : "text-brand-navy hover:text-brand-red"
                }`}
              >
                {label}
              </a>
            );
          })}
        </nav>
      </div>
    </>
  );
}
