"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, NavBadge, visibleNav, type NavProps } from "@/components/side-nav";

export function BottomNav({ isManager, isRestaurant, newQr, lowStock }: NavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
      {visibleNav(isManager, isRestaurant).map((n) => {
        const { href, label, icon: Icon } = n;
        const active = isActive(n, pathname);
        return (
          <Link
            key={href}
            href={href}
            className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
              active ? "text-primary font-semibold" : "text-ink-2"
            }`}
          >
            <Icon size={22} />
            {label}
            <NavBadge href={href} newQr={newQr} lowStock={lowStock} />
          </Link>
        );
      })}
    </nav>
  );
}