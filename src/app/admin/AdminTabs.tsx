"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref } from "./nav";

export type AdminTab = { href: string; label: string; count?: { value: number; label: string } };

/** An area's own pages, as a row of tabs along the top of each of them. */
export default function AdminTabs({ label, tabs }: { label: string; tabs: AdminTab[] }) {
  const active = activeHref(usePathname(), tabs.map((tab) => tab.href));
  return (
    <nav aria-label={label} className="sticky top-0 z-10 flex-shrink-0 overflow-x-auto border-b bg-brand-white border-brand-black/10 px-4">
      <ul className="flex gap-1">
        {tabs.map((tab) => {
          const current = tab.href === active;
          const counted = tab.count && tab.count.value > 0 ? tab.count : null;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                aria-label={counted ? `${tab.label} (${counted.value} ${counted.label})` : undefined}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 ${
                  current
                    ? "border-brand-navy font-medium text-brand-black"
                    : "border-transparent text-brand-black/70 hover:border-brand-black/20 hover:text-brand-black"
                }`}
              >
                {tab.label}
                {counted && (
                  <span aria-hidden="true" className="min-w-6 rounded-full bg-brand-navy px-2 text-center text-sm lining-nums tabular-nums text-brand-white">
                    {counted.value}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
