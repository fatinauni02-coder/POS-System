import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { Suspense } from "react";

import { getBusiness } from "@/lib/business";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PrintButton } from "@/app/merchant/receipt/[id]/print-button";
import { Loading } from "@/components/loading";

// "/merchant/tables/qr" = printable QR codes: one card per table + one takeaway card for the counter.
// Managers only: app/(pos)/tables/qr/layout.tsx (staff can see /tables, but not this page).
export default function QrCodesPage() {
    return (
        <Suspense fallback={<Loading />}>
            <QrCodes />
        </Suspense>
    );
}

async function QrCodes() {
    const business = await getBusiness();
    if (!business) return <p className="p-6 text-red-600">Shop not found</p>;

    // the website's own address (localhost:3000 on your laptop, the Vercel address when live),
    // so the printed codes always point to the site they were printed from
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    const site = `${proto}://${host}`;

    const [{ data: tables }, { data: shop }] = await Promise.all([
        supabaseAdmin
            .from("dining_tables")
            .select("id, label, qr_code")
            .eq("business_id", business.id)
            .eq("is_active", true)
            .order("sort_order")
            .order("label"),
        supabaseAdmin.from("businesses").select("takeaway_qr_code").eq("id", business.id).single(),
    ]);

    // every card: title + the address its QR code opens
    const cards = [
        ...(tables ?? []).map((t) => ({ key: t.id, title: `Table ${t.label}`, sub: "Dine-in or takeaway", url: `${site}/order/${t.qr_code}` })),
        ...(shop ? [{ key: "takeaway", title: "Takeaway", sub: "Order here, pay at the counter", url: `${site}/order/${shop.takeaway_qr_code}` }] : []),
    ];

    // draw each QR code as an SVG picture on the server (sharp when printed, no images to download)
    const svgs = await Promise.all(cards.map((c) => QRCode.toString(c.url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })));

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 md:p-6 print:max-w-none print:p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">QR codes</h1>
                    <p className="text-sm text-ink-2">
                        Print and stick one on each table. Codes point to <span className="font-semibold">{site}</span> — print them from the live site, not from localhost.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link href="/merchant/tables" className="flex h-11 items-center rounded-xl px-4 font-semibold text-ink-2 hover:bg-tint">
                        ← Tables
                    </Link>
                    <PrintButton label="Print all" />
                </div>
            </div>

            {cards.length === 1 && <p className="text-ink-2 print:hidden">No tables yet — add them on the Tables page. The takeaway card works anyway.</p>}

            {/* CARDS: 2 per row on screen and paper; break-inside-avoid = a card is never cut across 2 pages */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 print:grid-cols-2">
                {cards.map((c, i) => (
                    <div key={c.key} className="flex break-inside-avoid flex-col items-center gap-2 rounded-2xl border-2 border-line bg-white p-5 text-center">
                        <p className="text-sm font-semibold uppercase tracking-wide text-ink-2">{business.name}</p>
                        <p className="text-3xl font-bold">{c.title}</p>
                        {/* the SVG text comes from the qrcode library (made on our server from our own URL) */}
                        <div className="w-full max-w-[220px]" dangerouslySetInnerHTML={{ __html: svgs[i] }} />
                        <p className="font-bold">Scan to order</p>
                        <p className="text-xs text-ink-2">{c.sub}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
