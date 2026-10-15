"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/components/side-nav";

export function BottomNav({ isManager }: {isManager: boolean}) {
  const pathname = usePathname();

  return (
    <nav className="flex shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
      {NAV.filter((n) => isManager || !n.managerOnly).map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
              active ? "text-primary font-semibold" : "text-ink-2"
            }`}
          >
            <Icon size={22} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}