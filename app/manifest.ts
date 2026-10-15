import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kopi & Co. POS",
    short_name: "Kopi POS",          // shown under the home-screen icon (keep it short)
    start_url: "/",                  // the page that opens when you tap the icon
    display: "standalone",           // no browser address bar: looks like a real app
    background_color: "#fff8f5",     // splash screen colour (your --color-canvas)
    theme_color: "#9a4100",          // status bar colour (your --color-primary)
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}