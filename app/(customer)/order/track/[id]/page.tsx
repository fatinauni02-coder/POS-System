import { BellRing, Check, ChefHat, CirclePlus, CircleX, Send } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { Loading } from "@/components/loading";
import { formatRM, toSen } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase-admin";

// "/order/track/<id>" = the customer's own order status (the id is a long random code only they have).
// Look copied from the approved prototype: the status tracker in pos_html/assets/pages/order-qr.js
export default function TrackPage({ params }: PageProps<"/order/track/[id]">) {
    return (
        <Suspense fallback={<Loading />}>
            <Track params={params} />
        </Suspense>
    );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Line = { name: string; qty: number; unit_sen: number; options: { name: string }[] };
type Row = {
    ticket_no: number;
    order_type: "dine_in" | "takeaway";
    table_label: string | null;
    customer_name: string | null;
    status: "new" | "preparing" | "ready" | "done" | "rejected";
    reject_reason: string | null;
    lines: Line[];
    subtotal: number | string;
    created_at: string;
    businesses: { name: string; takeaway_qr_code: string } | null;
    dining_tables: { qr_code: string } | null;
    orders: { status: string } | null;
};

async function Track({ params }: { params: PageProps<"/order/track/[id]">["params"] }) {
    await connection(); // always the latest status
    const { id } = await params;
    if (!UUID.test(id)) return <NotFound />;

    const { data } = await supabaseAdmin
        .from("qr_orders")
        .select(
            "ticket_no, order_type, table_label, customer_name, status, reject_reason, lines, subtotal, created_at, businesses(name, takeaway_qr_code), dining_tables(qr_code), orders(status)",
        )
        .eq("id", id)
        .maybeSingle();
    if (!data) return <NotFound />;
    const q = data as unknown as Row;

    const takeaway = q.order_type === "takeaway";
    const finished = q.status === "done" || q.status === "rejected";
    const paid = q.orders?.status === "completed";
    // the 3 steps; "at" = which one is happening now (3 = all done)
    const steps = [
        { id: "new", title: "Order sent", sub: "Waiting for the staff to confirm", Icon: Send },
        { id: "preparing", title: "Preparing", sub: "The kitchen and bar are on it", Icon: ChefHat },
        { id: "ready", title: "Ready", sub: takeaway ? "Collect at the counter" : "On its way to your table", Icon: BellRing },
    ];
    const at = q.status === "done" ? 3 : steps.findIndex((s) => s.id === q.status);
    // "Order more" goes back to the same QR code's menu
    const backCode = q.dining_tables?.qr_code ?? q.businesses?.takeaway_qr_code;

    return (
        <div className="flex min-h-dvh flex-col px-4 pb-8 pt-4">
            {/* checks again every 5 seconds until the order is finished */}
            {!finished && <AutoRefresh seconds={5} />}
            <p className="text-center text-sm font-semibold text-ink-2">{q.businesses?.name}</p>

            {/* ORDER NUMBER CARD */}
            <div className="card mt-2 p-5 text-center">
                <p className="label-caps text-ink-2">Your order number</p>
                <p className="money mt-1 text-5xl font-extrabold tracking-tight text-primary">Q{q.ticket_no}</p>
                <p className="money mt-1 text-sm text-ink-2">
                    {takeaway ? `Takeaway · ${q.customer_name}` : `Table ${q.table_label}`} · {timeHM(q.created_at)} · {formatRM(toSen(q.subtotal))}
                </p>
                {paid ? (
                    <p className="label-caps mx-auto mt-3 w-fit rounded-md bg-success/10 px-2 py-1 text-success">Paid</p>
                ) : (
                    <p className="mt-3 rounded-xl bg-tint-2 p-2 text-sm">Show this number when you pay at the counter</p>
                )}
            </div>

            {q.status === "rejected" ? (
                <div className="card mt-3 flex items-start gap-3 p-4 text-danger">
                    <CircleX className="h-6 w-6 shrink-0" />
                    <div>
                        <p className="font-bold">Sorry, we couldn&apos;t take this order</p>
                        <p className="text-sm text-ink-2">{q.reject_reason || "Please ask the staff for help."}</p>
                    </div>
                </div>
            ) : (
                // STEPS: circles joined by a line; done = green tick, now = orange (pulsing)
                <ol className="card mt-3 p-4">
                    {steps.map(({ id: stepId, title, sub, Icon }, i) => {
                        const done = i < at;
                        const now = i === at;
                        return (
                            <li key={stepId} className={`flex gap-3 ${i ? "mt-1" : ""}`}>
                                <div className="flex flex-col items-center">
                                    <span
                                        className={`flex h-10 w-10 items-center justify-center rounded-full ${
                                            done ? "bg-success text-white" : now ? "bg-primary text-on-primary" : "bg-tint text-ink-3"
                                        }`}
                                    >
                                        {done ? <Check className="h-5 w-5" /> : <Icon className={`h-5 w-5 ${now && stepId !== "ready" ? "animate-pulse" : ""}`} />}
                                    </span>
                                    {i < steps.length - 1 && <span className={`my-1 h-6 w-0.5 ${done ? "bg-success" : "bg-line"}`} />}
                                </div>
                                <div className="pt-2">
                                    <p className={`font-bold ${now || done ? "" : "text-ink-3"}`}>{title}</p>
                                    {now && <p className="text-sm text-ink-2">{sub}</p>}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
            {q.status === "done" && <p className="mt-3 text-center font-semibold text-success">Enjoy! 😊</p>}

            {/* WHAT THEY ORDERED */}
            <div className="card mt-3 p-4">
                <p className="label-caps mb-2 text-ink-2">Items</p>
                {q.lines.map((l, i) => (
                    <p key={i} className="flex justify-between gap-2 py-1 text-sm">
                        <span>
                            <b className="money">{l.qty}×</b> {l.name}
                            {l.options.length > 0 && <span className="text-ink-3"> · {l.options.map((o) => o.name).join(", ")}</span>}
                        </span>
                        <span className="money shrink-0">{formatRM(l.unit_sen * l.qty)}</span>
                    </p>
                ))}
                <p className="mt-1 text-xs text-ink-3">SST is added when you pay at the counter.</p>
            </div>

            {backCode && (
                <Link href={`/order/${backCode}`} className="btn-soft mt-4 flex h-12 items-center justify-center gap-2">
                    <CirclePlus className="h-5 w-5" />
                    Order more
                </Link>
            )}
        </div>
    );
}

function NotFound() {
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-8 text-center">
            <h1 className="text-xl font-bold">Order not found</h1>
            <p className="text-ink-2">Please ask the staff for help.</p>
        </div>
    );
}

// "12:05 pm" in Malaysia time (the server may be in another country)
function timeHM(iso: string) {
    return new Date(iso).toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit" });
}
