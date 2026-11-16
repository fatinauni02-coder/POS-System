import { Suspense } from "react";
import { BottomNavForStaff, SideNavForStaff } from "@/components/role-navs";
import { TopBar } from "@/components/top-bar";

// STAFF LAYOUT — wraps every page in the (pos) folder (Order, Tables, Menu, Stock…).
// A folder name in (brackets) is a "route group": it groups files but is NOT part of the address,
// so app/(pos)/menu/page.tsx is still "/menu".
// Page shape:
//   ┌──────┬──────────────────────────┐
//   │ Side │ TopBar                   │
//   │ Nav  ├──────────────────────────┤
//   │      │ {children} = the page    │
//   │      │ (scrolls on its own)     │
//   └──────┴──────────────────────────┘
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    // flex = SideNav and the right column side by side (a row)
    // h-dvh = exactly the screen height (dvh also works on tablets with browser bars)
    <div className="flex h-dvh">
      {/* SideNav reads the address (usePathname), which only exists when a page is asked for */}
      <Suspense fallback={<aside className="hidden md:block w-[68px] shrink-0 border-r border-line bg-surface print:hidden" />}>
        <SideNavForStaff />
      </Suspense>

      {/* RIGHT COLUMN: flex-col = top bar on top, page below
          flex-1 = take all the width left over after the SideNav
          min-w-0 = allow it to shrink (stops wide content pushing the page sideways) */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* TopBar reads the shop name from Supabase, so it can be slow:
            the fallback is an empty bar of the same height (h-16) while it loads */}
        <Suspense fallback={<header className="h-16 print:hidden border-b border-line bg-surface" />}>
          <TopBar />
        </Suspense>

        {/* PAGE AREA: flex-1 = fills the height under the top bar
            overflow-y-auto = only this area scrolls; sidebar + top bar stay still */}
        <div className="flex-1 overflow-y-auto">{children}</div>
        <Suspense fallback={null}>
          <BottomNavForStaff />
        </Suspense>
      </div>
    </div>
  );
}
