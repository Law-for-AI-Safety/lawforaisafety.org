"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { activeHref, type ShellGroup, type ShellLink } from "./nav";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** Tailwind's `lg`: from here up the sidebar sits beside the page instead of in a drawer. */
const WIDE = "(min-width: 1024px)";

function Badge({ count }: { count: NonNullable<ShellLink["count"]> }) {
  return (
    <span
      aria-hidden="true"
      className={`ml-auto min-w-6 rounded-full px-2 text-center text-sm lining-nums tabular-nums ${
        count.urgent ? "bg-brand-red text-brand-white" : "bg-brand-navy text-brand-white"
      }`}
    >
      {count.value}
    </span>
  );
}

function NavLink({ link, active }: { link: ShellLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      aria-label={link.count ? `${link.label} (${link.count.value} ${link.count.label})` : undefined}
      className={`flex items-center gap-2 border-l-4 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-navy ${
        active
          ? "border-brand-navy bg-brand-navy/10 font-medium text-brand-black"
          : "border-transparent text-brand-black/80 hover:bg-brand-black/5 hover:text-brand-black"
      }`}
    >
      {link.label}
      {link.count && <Badge count={link.count} />}
    </Link>
  );
}

/** The signed-in person's name, opening their account links and Log out. */
function AccountMenu({ name, links, active }: { name: string; links: ShellLink[]; active: string | null }) {
  // Starts open on one of its own pages, so the highlighted link is in view.
  const [open, setOpen] = useState(() => links.some((link) => link.href === active));
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  return (
    <div
      ref={root}
      className="border-t border-brand-black/10"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          // Closes the menu only, not the drawer around it.
          event.stopPropagation();
          setOpen(false);
          root.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus();
        }
      }}
    >
      {open && (
        <ul id={menuId} className="flex flex-col py-2">
          {links.map((link) => (
            <li key={link.href}>
              <NavLink link={link} active={link.href === active} />
            </li>
          ))}
          <li>
            <form action="/api/admin/logout" method="post">
              <button
                type="submit"
                className="w-full border-l-4 border-transparent px-3 py-2 text-left text-brand-black/80 hover:bg-brand-black/5 hover:text-brand-black"
              >
                Log out
              </button>
            </form>
          </li>
        </ul>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((was) => !was)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-brand-black/5"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-xs uppercase tracking-wide text-brand-black/60">Signed in as</span>
          <span className="truncate text-brand-black">{name}</span>
        </span>
        <span aria-hidden="true" className="text-brand-black/60">
          {open ? "▾" : "▴"}
        </span>
      </button>
    </div>
  );
}

/**
 * The admin's navigation: a column beside the page on wide screens, and below `lg` a top bar
 * whose Menu button opens the same column as a modal drawer (focus kept inside, Escape or the
 * backdrop closes it, focus goes back to the button).
 */
export default function AdminSidebar({ groups, account, name }: { groups: ShellGroup[]; account: ShellLink[]; name: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawerId = useId();

  const hrefs = ["/admin", ...groups.flatMap((g) => g.links.map((l) => l.href)), ...account.map((l) => l.href)];
  const active = activeHref(pathname, hrefs);

  const close = useCallback(() => {
    setOpen(false);
    menuButton.current?.focus();
  }, []);

  // Following a link closes the drawer.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    // Widening the window past `lg` turns the drawer back into the plain column.
    const wide = window.matchMedia?.(WIDE);
    const onWide = (event: MediaQueryListEvent) => event.matches && setOpen(false);
    wide?.addEventListener("change", onWide);
    return () => wide?.removeEventListener("change", onWide);
  }, [open]);

  const onDrawerKey = (event: React.KeyboardEvent) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(drawer.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-brand-black/10 px-4 py-3 lg:hidden">
        <Link href="/admin" className="font-sans text-xl text-brand-black">
          Admin
        </Link>
        <button
          ref={menuButton}
          type="button"
          aria-expanded={open}
          aria-controls={drawerId}
          onClick={() => setOpen(true)}
          className="border border-brand-black/20 px-3 py-1 text-brand-black hover:border-brand-black/40"
        >
          Menu
        </button>
      </header>

      {open && <div aria-hidden="true" onClick={close} className="fixed inset-0 z-40 bg-brand-black/40 lg:hidden" />}

      <aside
        ref={drawer}
        id={drawerId}
        onKeyDown={onDrawerKey}
        {...(open ? { role: "dialog", "aria-modal": true, "aria-label": "Admin menu" } : {})}
        className={`z-50 w-64 flex-shrink-0 flex-col overflow-y-auto border-r border-brand-black/10 bg-brand-white max-lg:fixed max-lg:inset-y-0 max-lg:left-0 lg:flex lg:w-56 ${
          open ? "flex" : "hidden"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Link
            href="/admin"
            aria-current={active === "/admin" ? "page" : undefined}
            className={`font-sans text-xl text-brand-black ${active === "/admin" ? "underline underline-offset-4" : ""}`}
          >
            Admin
          </Link>
          {open && (
            <button type="button" onClick={close} className="px-2 text-brand-black/70 underline lg:hidden">
              Close
            </button>
          )}
        </div>
        <nav aria-label="Admin" className="flex flex-1 flex-col gap-4 pb-4">
          {groups.map((group) => (
            <div key={group.name} className="flex flex-col">
              <h2 className="px-4 pb-1 text-xs uppercase tracking-wide text-brand-black/60">{group.name}</h2>
              <ul className="flex flex-col">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <NavLink link={link} active={link.href === active} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <AccountMenu name={name} links={account} active={active} />
      </aside>
    </>
  );
}
