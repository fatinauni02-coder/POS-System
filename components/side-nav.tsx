"use client"; // needs the browser: usePathname reads the current address

import { Package, ReceiptText, Settings, ShoppingBasket, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// MENU LINKS — add / remove / reorder buttons here.
// icon = any icon from lucide.dev (import it on line 3 first)
export const NAV = [
  { href: "/", label: "Order", icon: ShoppingBasket },
  { href: "/history", label: "History", icon: ReceiptText },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/stock", label: "Stock", icon: Package },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SideNav() {
  const path = usePathname(); // the current address, e.g. "/menu"

  return (
    // SIDEBAR BOX
    // w-[68px]   = sidebar width → change here (and w-[56px] below, keep it ~12px smaller)
    // shrink-0   = never squeeze the sidebar when the screen is small
    // flex-col items-center gap-2 = logo + links stacked, centred, with gaps
    // border-r   = thin line on the right side
    // py-4       = space at the top and bottom
    <aside className="hidden md:flex w-[68px] print:hidden shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-4">
      {/* LOGO: h-11 w-11 = square size, rounded-xl = corner roundness, mb-3 = gap under it */}
      <Link href="/" className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-white">
        K
      </Link>

      {/* LINKS: gap-1.5 = space between buttons */}
      <nav className="flex flex-col gap-1.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active  = href === "/" ? path === "/" : path.startsWith(href); // true for the page you are on
          return (
            // ONE BUTTON (icon on top, label under it)
            // w-[56px] = button width (keep it smaller than the sidebar width)
            // py-2.5 = button height (padding top + bottom)
            // text-[11px] = label size; rounded-2xl = corner roundness
            // active page → orange with white text; others → brown text, light hover
            <Link
              key={href}
              href={href}
              className={`flex w-[56px] flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] font-semibold ${
                active ? "bg-primary-soft text-white" : "text-ink-2 hover:bg-tint"
              }`}
            >
              {/* icon size: h-5 w-5 (20px). Try h-6 w-6 for bigger */}
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
