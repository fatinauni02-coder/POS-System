import { connection } from "next/server";
import { Suspense } from "react";

import { formatRM, toSen } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AutoRefresh } from "./auto-refresh";

// "/order/track/<id>" = the customer's own order status (the id is a long random code only they have)
export default function TrackPage({ params }: PageProps<"/order/track/[id]">) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Track params={params} />
        </Suspense>
    );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// the 3 steps the customer sees
const STEPS = [
    { status: "new", label: "Waiting for staff" },
    { status: "preparing", label: "Preparing" },
    { status: "ready", label: "Ready" },
];

type Line = { name: string; qty: number; unit_sen: number; options: { name: string }[] };

async function Track({ params }: { params: PageProps<"/order/track/[id]">["params"] }) {
    await connection(); // always the latest status
    const { id } = await params;
    if (!UUID.test(id)) return <p className="p-8 text-center">Order not found.</p>;

    const { data: q } = await supabaseAdmin
        .from("qr_orders")
        .select("ticket_no, order_type, table_label, customer_name, status, reject_reason, lines, subtotal, businesses(name)")
        .eq("id", id)
        .maybeSingle();
    if (!q) return <p className="p-8 text-center">Order not found.</p>;

    const shop = (q.businesses as unknown as { name: string } | null)?.name ?? "";
    const lines = q.lines as Line[];
    const stepIndex = q.status === "done" ? 3 : STEPS.findIndex((s) => s.status === q.status);
    const finished = q.status === "done" || q.status === "rejected";

    return (
        <div className="flex min-h-dvh flex-col gap-5 p-5">
            {/* checks again every few seconds until the order is finished */}
            {!finished && <AutoRefresh seconds={5} />}

            <div className="text-center">
                <p className="text-sm font-semibold text-ink-2">{shop}</p>
                <p className="mt-2 text-sm text-ink-2">Your order number</p>
                <p className="text-6xl font-bold text-primary">Q{q.ticket_no}</p>
                <p className="mt-1 font-semibold">
                    {q.order_type === "dine_in" ? `Dine-in · Table ${q.table_label}` : `Takeaway · ${q.customer_name}`}
                </p>
            </div>

            {q.status === "rejected" ? (
                <div className="rounded-2xl bg-red-50 p-4 text-center text-red-700">
                    <p className="font-bold">Sorry, your order was not accepted</p>
                    <p className="mt-1 text-sm">{q.reject_reason}</p>
                </div>
            ) : (
                // STATUS STEPS: done steps filled, the current one highlighted
                <div className="flex flex-col gap-2">
                    {STEPS.map((s, i) => (
                        <div
                            key={s.status}
                            className={`flex items-center gap-3 rounded-2xl p-4 font-semibold ${
                                i < stepIndex ? "bg-tint text-ink-2" : i === stepIndex ? "bg-primary text-white" : "border border-line text-ink-2"
                            }`}
                        >
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/30">{i < stepIndex ? "✓" : i + 1}</span>
                            {s.label}
                        </div>
                    ))}
                    {q.status === "ready" && (
                        <p className="text-center font-semibold">
                            {q.order_type === "takeaway" ? "Please collect it at the counter 🎉" : "It's on the way to your table 🎉"}
                        </p>
                    )}
                    {q.status === "done" && <p className="text-center font-semibold text-green-700">Enjoy! 😊</p>}
                </div>
            )}

            {/* WHAT THEY ORDERED */}
            <div className="rounded-2xl border border-line bg-surface p-4">
                {lines.map((l, i) => (
                    <div key={i} className="mb-2 flex justify-between gap-2">
                        <span>
                            {l.qty} x {l.name}
                            {l.options.length > 0 && <span className="block text-sm text-ink-2">{l.options.map((o) => o.name).join(", ")}</span>}
                        </span>
                        <span className="shrink-0">{formatRM(l.unit_sen * l.qty)}</span>
                    </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-line pt-2 font-bold">
                    <span>Subtotal</span>
                    <span>{formatRM(toSen(q.subtotal))}</span>
                </div>
                <p className="mt-1 text-xs text-ink-2">SST is added when you pay at the counter.</p>
            </div>
        </div>
    );
}
