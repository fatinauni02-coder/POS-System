import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { getBusiness } from "@/lib/business";
import { shortName } from "@/lib/app-name";
import { readTheme } from "@/lib/theme";

// STAFF POS "Add to Home Screen" / install: name, icon and colours come from the shop's Settings
// (Business name, Logo, Appearance) — so every shop's tablet shows its own POS, not "Kopi & Co.".
// Read on every request (connection), so a new logo / name shows the next time a phone checks.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  await connection();
  const business = await getBusiness();
  const name = business?.name ?? "Cafe";
  const theme = readTheme(business?.theme);
  const logo = (business?.logo_url as string | null) ?? null;

  return {
    name: `${name} POS`,
    short_name: shortName(name),     // shown under the home-screen icon (keep it short)
    start_url: "/merchant",                  // the page that opens when you tap the icon
    display: "standalone",           // no browser address bar: looks like a real app
    background_color: theme.background, // splash screen colour
    theme_color: theme.primary,         // status bar colour
    icons: logo
      ? [
          // the shop's own logo (Settings → Business → Logo, saved as a 512 px square)
          { src: logo, sizes: "192x192", type: "image/png" },
          { src: logo, sizes: "512x512", type: "image/png" },
        ]
      : [
          // no logo uploaded yet → the built-in K icons
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
  };
}
