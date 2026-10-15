import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import { BottomNavForStaff, SideNavForStaff } from "@/components/role-navs";
import { TopBar } from "@/components/top-bar";
import "./globals.css";

// Font: downloaded by Next.js, saved into the CSS variable --font-jakarta
// (globals.css uses that variable as the default font)
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

// The browser tab title + description (for Google / link previews)
export const metadata: Metadata = {
  title: "Kopi & Co.",
  description: "Cafe POS",
  appleWebApp: { capable: true, title: "Kopi POS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#9a4100",
  viewportFit: "cover", // lets the app use the full screen on iPhones with a notch
};

// ROOT LAYOUT — wraps EVERY page. {children} = the page you are on (Order, Menu…).
// Page shape:
//   ┌──────┬──────────────────────────┐
//   │ Side │ TopBar                   │
//   │ Nav  ├──────────────────────────┤
//   │      │ {children} = the page    │
//   │      │ (scrolls on its own)     │
//   └──────┴──────────────────────────┘
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // antialiased = smoother font edges
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      {/* flex = SideNav and the right column side by side (a row)
          h-dvh = exactly the screen height (dvh also works on tablets with browser bars) */}
      <body className="flex h-dvh">
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
      </body>
    </html>
  );
}
