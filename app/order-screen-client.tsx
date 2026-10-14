"use client";

import dynamic from "next/dynamic";

// The cart lives in THIS browser (localStorage), which the server can't see.
// So this screen is drawn only in the browser: ssr: false.
export const OrderScreenClient = dynamic(() => import("./order-screen").then((m) => m.OrderScreen), {
  ssr: false,
  loading: () => <p className="p-6">Loading…</p>,
});