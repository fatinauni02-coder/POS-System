"use client"; // needs the browser: usePathname reads the current address

import { Package, ReceiptText, Settings, ShoppingBasket, UtensilsCrossed, LayoutGrid, QrCode } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// MENU LINKS — add / remove / reorder buttons here (same order as the pos_html prototype).
// icon = any icon from lucide.dev (import it on line 3 first)
// also = other pages that light up this button (Report lives under History, Staff under Settings)
export const NAV = [
  { href: "/tables", label: "Tables", icon: LayoutGrid, managerOnly: false, restaurantOnly: true },
  { href: "/", label: "Order", icon: ShoppingBasket, managerOnly: false },
  { href: "/qr", label: "QR", icon: QrCode, managerOnly: false },
  { href: "/history", label: "History", icon: ReceiptText, managerOnly: false, also: ["/report"] },
  { href: "/stock", label: "Stock", icon: Package, managerOnly: true },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed, managerOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, managerOnly: true, also: ["/staff"] },
];

// true when this button belongs to the page you're on
export function isActive(n: (typeof NAV)[number], path: string) {
  if (n.href === "/") return path === "/";
  return [n.href, ...(n.also ?? [])].some((h) => path.startsWith(h));
}

// which links this person sees: managers see everything, staff don't see managerOnly;
// "Tables" only when the shop is in restaurant mode
export function visibleNav(isManager: boolean, isRestaurant: boolean) {
  return NAV.filter((n) => (isManager || !n.managerOnly) && (isRestaurant || !n.restaurantOnly));
}

// what the nav needs to know: role, mode, and the numbers for the badges
export type NavProps = {
  isManager: boolean;
  isRestaurant: boolean;
  newQr: number; // phone orders waiting → red number on "QR"
  lowStock: number; // stock items low or out → amber number on "Stock" (managers only)
};

export function SideNav({ isManager, isRestaurant, newQr, lowStock }: NavProps) {
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
        {visibleNav(isManager, isRestaurant).map((n) => {
          const { href, label, icon: Icon } = n;
          const active = isActive(n, path); // true for the page you are on
          return (
            // ONE BUTTON (icon on top, label under it)
            // w-[56px] = button width (keep it smaller than the sidebar width)
            // py-2.5 = button height (padding top + bottom)
            // text-[11px] = label size; rounded-2xl = corner roundness
            // active page → orange with white text; others → brown text, light hover
            <Link
              key={href}
              href={href}
              className={`press relative flex w-[56px] flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-semibold ${active ? "bg-primary-soft text-on-primary shadow-card" : "text-ink-2 hover:bg-tint"
                }`}
            >
              {/* icon size: h-5 w-5 (20px). Try h-6 w-6 for bigger */}
              <Icon className="h-5 w-5" />
              {label}
              <NavBadge href={href} newQr={newQr} lowStock={lowStock} />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

// small circle with a number, top-right of a nav button:
// red on "QR" (orders waiting), amber on "Stock" (items low or out)
export function NavBadge({ href, newQr, lowStock }: { href: string; newQr: number; lowStock: number }) {
  const count = href === "/qr" ? newQr : href === "/stock" ? lowStock : 0;
  if (count === 0) return null;
  return (
    <span
      className={`absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white ${
        href === "/qr" ? "bg-danger" : "bg-warning"
      }`}
    >
      {count}
    </span>
  );
}
