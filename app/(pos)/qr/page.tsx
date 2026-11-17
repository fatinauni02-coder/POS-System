import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { Toast } from "@/components/toast";
import { getBusiness } from "@/lib/business";
import { formatRM, toSen } from "@/lib/money";
import { getStaff } from "@/lib/staff";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { acceptQr, moveQr, rejectQr, setQrOrdering } from "./actions";

// "/qr" = the staff board for orders customers sent from their phones (QR codes)
export default function QrBoardPage({ searchParams }: PageProps<"/qr">) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <QrBoard searchParams={searchParams} />
        </Suspense>
    );
}

type QrLine = { name: string; qty: number; unit_sen: number; note: string; options: { name: string }[] };
type QrRow = {
    id: string;
    ticket_no: number;
    order_type: "dine_in" | "takeaway";
    table_label: string | null;
    customer_name: string | null;
    note: string | null;
    lines: QrLine[];
    subtotal: number | string;
    status: "new" | "preparing" | "ready";
    order_id: number | null;
    round: number | null;
    created_at: string;
    orders: { status: string } | null; // the bill it went onto (takeaway: open = not paid yet)
};

const COLUMNS = [
    { status: "new", title: "New", hint: "Check, then accept or reject" },
    { status: "preparing", title: "Preparing", hint: "Tickets went to the kitchen" },
    { status: "ready", title: "Ready", hint: "Serve or hand over" },
] as const;

const BTN = "h-11 rounded-xl px-4 font-bold";

async function QrBoard({ searchParams }: { searchParams: PageProps<"/qr">["searchParams"] }) {
    const params = await searchParams;
    await connection(); // always the latest orders

    const business = await getBusiness();
    if (!business) return <p className="p-6 text-red-600">Shop not found</p>;
    const staff = await getStaff();
    const isManager = staff !== null && staff.role !== "staff";

    const [{ data: shop }, { data }] = await Promise.all([
        supabaseAdmin.from("businesses").select("qr_ordering").eq("id", business.id).single(),
        supabaseAdmin
            .from("qr_orders")
            .select("id, ticket_no, order_type, table_label, customer_name, note, lines, subtotal, status, order_id, round, created_at, orders(status)")
            .eq("business_id", business.id)
            .in("status", ["new", "preparing", "ready"])
            .order("created_at"),
    ]);
    const orders = (data ?? []) as unknown as QrRow[];
    const qrOn = shop?.qr_ordering ?? false;

    return (
        <div className="flex flex-col gap-4 p-4 md:p-6">
            {/* checks for new phone orders every 10 seconds */}
            <AutoRefresh seconds={10} />

            {typeof params.msg === "string" && <Toast key={String(params.t)} kind="msg" text={params.msg} />}
            {typeof params.error === "string" && <Toast key={String(params.t)} kind="error" text={params.error} />}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">QR orders</h1>
                    <p className="text-sm text-ink-2">Orders customers sent from their phones. Nothing goes to the kitchen until you accept.</p>
                </div>
                {/* ON / PAUSED switch (managers) */}
                <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${qrOn ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {qrOn ? "QR ordering ON" : "QR ordering PAUSED"}
                    </span>
                    {isManager && (
                        <form action={setQrOrdering}>
                            <input type="hidden" name="on" value={String(!qrOn)} />
                            <button className={`${BTN} border border-line bg-surface`}>{qrOn ? "Pause" : "Turn on"}</button>
                        </form>
                    )}
                </div>
            </div>

            {/* 3 COLUMNS side by side (one under the other on phones) */}
            <div className="grid gap-4 lg:grid-cols-3">
                {COLUMNS.map((col) => {
                    const list = orders.filter((o) => o.status === col.status);
                    return (
                        <section key={col.status} className="flex flex-col gap-3 rounded-2xl bg-tint/60 p-3">
                            <div className="flex items-baseline justify-between px-1">
                                <h2 className="text-lg font-bold">
                                    {col.title} <span className="text-ink-2">({list.length})</span>
                                </h2>
                                <span className="text-xs text-ink-2">{col.hint}</span>
                            </div>
                            {list.length === 0 && <p className="py-6 text-center text-sm text-ink-2">Nothing here</p>}
                            {list.map((o) => (
                                <Card key={o.id} order={o} />
                            ))}
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

// ONE ORDER CARD
function Card({ order: o }: { order: QrRow }) {
    const paid = o.orders?.status === "completed";
    return (
        <div className={`flex flex-col gap-2 rounded-2xl border-2 bg-surface p-4 ${o.status === "new" ? "border-primary" : "border-line"}`}>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="text-2xl font-bold">Q{o.ticket_no}</p>
                    <p className="font-semibold">{o.order_type === "dine_in" ? `Dine-in · Table ${o.table_label}` : `Takeaway · ${o.customer_name}`}</p>
                </div>
                <span className="text-sm text-ink-2">{minutesAgo(o.created_at)}</span>
            </div>

            <div className="flex flex-col gap-1 text-sm">
                {o.lines.map((l, i) => (
                    <div key={i}>
                        <div className="flex justify-between gap-2">
                            <span className="font-semibold">
                                {l.qty} x {l.name}
                            </span>
                            <span>{formatRM(l.unit_sen * l.qty)}</span>
                        </div>
                        {l.options.length > 0 && <p className="pl-4 text-ink-2">{l.options.map((x) => x.name).join(", ")}</p>}
                        {l.note && <p className="pl-4 italic text-ink-2">&quot;{l.note}&quot;</p>}
                    </div>
                ))}
                {o.note && <p className="rounded-lg bg-tint p-2 font-semibold">Note: {o.note}</p>}
                <div className="flex justify-between border-t border-line pt-1 font-bold">
                    <span>Subtotal</span>
                    <span>{formatRM(toSen(o.subtotal))}</span>
                </div>
            </div>

            {/* BUTTONS for each column */}
            {o.status === "new" && (
                <div className="flex flex-col gap-2">
                    <form action={acceptQr}>
                        <input type="hidden" name="id" value={o.id} />
                        <button className={`${BTN} w-full bg-primary text-white`}>Accept</button>
                    </form>
                    {/* reject with a short reason the customer will see */}
                    <form action={rejectQr} className="flex gap-2">
                        <input type="hidden" name="id" value={o.id} />
                        <input
                            name="reason"
                            maxLength={120}
                            placeholder="Reason (e.g. sold out)"
                            className="h-11 min-w-0 flex-1 rounded-xl bg-tint px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                        />
                        <button className={`${BTN} border border-red-200 text-red-700`}>Reject</button>
                    </form>
                </div>
            )}

            {o.status === "preparing" && (
                <div className="grid grid-cols-2 gap-2">
                    <Link href={`/receipt/${o.order_id}?round=${o.round}`} className={`${BTN} flex items-center justify-center bg-tint`}>
                        Tickets
                    </Link>
                    <form action={moveQr}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="status" value="ready" />
                        <button className={`${BTN} w-full bg-primary text-white`}>Ready</button>
                    </form>
                </div>
            )}

            {o.status === "ready" && (
                <div className="grid grid-cols-2 gap-2">
                    {o.order_type === "takeaway" && !paid ? (
                        // takeaway pays at the counter when collecting (the same payment screen as tables)
                        <Link href={`/?bill=${o.order_id}`} className={`${BTN} col-span-2 flex items-center justify-center bg-primary text-white`}>
                            Take payment
                        </Link>
                    ) : (
                        <span className="col-span-2 text-center text-sm font-semibold text-green-700">
                            {o.order_type === "takeaway" ? "Paid ✓" : "On the table's bill"}
                        </span>
                    )}
                    <form action={moveQr} className="col-span-2">
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="status" value="done" />
                        <button className={`${BTN} w-full border border-line`}>{o.order_type === "takeaway" ? "Collected" : "Served"}</button>
                    </form>
                </div>
            )}
        </div>
    );
}

// "just now" / "5 min ago" (a helper, so the page itself stays "pure" for React's lint rule)
function minutesAgo(iso: string) {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    return mins < 1 ? "just now" : `${mins} min ago`;
}
