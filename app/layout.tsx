import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
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

// ROOT LAYOUT — wraps EVERY page, staff AND customer: only the font, colours and <html>/<body>.
// The staff frame (sidebar + top bar) is in app/(pos)/layout.tsx, so the customer QR page
// (app/(customer)/…) never shows any staff buttons.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // antialiased = smoother font edges
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="h-dvh">{children}</body>
    </html>
  );
}
