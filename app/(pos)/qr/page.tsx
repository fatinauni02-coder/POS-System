import { BellRing, Check, CheckCheck, HandCoins, Printer, QrCode } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { LiveRefresh } from "@/components/live-refresh";
import { Loading } from "@/components/loading";
import { Toast } from "@/components/toast";
import { getBusiness } from "@/lib/business";
import { formatRM, toSen } from "@/lib/money";
import { getStaff } from "@/lib/staff";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { acceptQr, moveQr, setQrOrdering } from "./actions";
import { RejectButton } from "./reject-button";
import { SubmitButton } from "@/components/submit-button";

// "/qr" = the staff board for orders customers sent from their phones (QR codes).
// Look copied from the approved prototype: pos_html/qr-orders.html + assets/pages/qr-orders.js
export default function QrBoardPage({ searchParams }: PageProps<"/qr">) {
    return (
        <Suspense fallback={<Loading />}>
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

// the 3 columns, each with its coloured dot
const COLUMNS = [
    { status: "new", title: "New", dot: "bg-danger" },
    { status: "preparing", title: "Preparing", dot: "bg-warning" },
    { status: "ready", title: "Ready", dot: "bg-success" },
] as const;

const BTN = "flex h-11 flex-1 items-center justify-center gap-1.5 text-sm";

async function QrBoard({ searchParams }: { searchParams: PageProps<"/qr">["searchParams"] }) {
    const params = await searchParams;
    await connection(); // always the latest orders

    const business = await getBusiness();
    if (!business) return <p className="p-6 text-danger">Shop not found</p>;
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
    const fresh = orders.filter((o) => o.status === "new").length;

    return (
        // full height: header bar, red alert, then the 3 columns fill the rest
        <div className="flex h-full flex-col">
            {/* checks for new phone orders every 10 seconds */}
            {/* live: new / changed QR orders show up straight away (+ a ding for new ones) */}
            <LiveRefresh topic={`qr-board:${business.id}`} beepOnNew />
            {typeof params.msg === "string" && <Toast key={String(params.t)} kind="msg" text={params.msg} />}
            {typeof params.error === "string" && <Toast key={String(params.t)} kind="error" text={params.error} />}

            {/* HEADER BAR */}
            <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-6 py-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tint text-primary">
                    <QrCode className="h-6 w-6" />
                </span>
                <div className="mr-auto">
                    <h1 className="text-2xl font-bold tracking-tight">QR orders</h1>
                    <p className="text-sm text-ink-2">Orders customers send from the QR code on their table</p>
                </div>

                {/* ON / OFF SWITCH (managers can flip it; staff only see it) */}
                <form action={setQrOrdering}>
                    <input type="hidden" name="on" value={String(!qrOn)} />
                    <SubmitButton spinner={false}
                        disabled={!isManager}
                        className="flex h-12 items-center gap-3 rounded-xl bg-tint px-4 font-semibold disabled:cursor-default"
                        aria-label={qrOn ? "Pause QR ordering" : "Turn on QR ordering"}
                    >
                        <span>Accepting QR orders</span>
                        <span className={`relative h-7 w-12 rounded-full transition ${qrOn ? "bg-success" : "bg-line"}`}>
                            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${qrOn ? "left-6" : "left-1"}`} />
                        </span>
                    </SubmitButton>
                </form>
                {isManager && (
                    <Link href="/tables/qr" className="btn-soft flex h-12 items-center gap-2 px-4">
                        <Printer className="h-5 w-5" />
                        Table QR codes
                    </Link>
                )}
            </div>

            {/* RED ALERT when phone orders are waiting */}
            {fresh > 0 && (
                <div role="alert" className="flex items-center gap-3 bg-danger px-6 py-3 font-bold text-white">
                    <BellRing className="h-5 w-5 animate-bounce" />
                    {fresh} new QR {fresh === 1 ? "order" : "orders"} waiting — accept or reject
                </div>
            )}

            {/* 3 COLUMNS (one under the other on phones) */}
            <div className="grid min-h-0 flex-1 gap-4 p-6 lg:grid-cols-3">
                {COLUMNS.map((col) => {
                    const list = orders.filter((o) => o.status === col.status);
                    return (
                        <section key={col.status} className="flex min-h-0 flex-col rounded-2xl bg-tint p-3">
                            <h2 className="flex items-center gap-2 px-1 pb-3 font-bold">
                                <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                                {col.title}
                                <span className="money rounded-full bg-surface px-2 text-sm">{list.length}</span>
                            </h2>
                            <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto">
                                {list.length === 0 && <p className="py-10 text-center text-sm text-ink-3">Nothing here</p>}
                                {list.map((o) => (
                                    <Card key={o.id} order={o} />
                                ))}
                            </div>
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
    const takeaway = o.order_type === "takeaway";
    const code = `Q${o.ticket_no}`;
    const items = o.lines.reduce((n, l) => n + l.qty, 0);

    // small chip top-right: where the money is
    const payChip = !takeaway ? (
        <span className="label-caps rounded-md bg-tint px-2 py-1 text-ink-2">{o.status === "new" ? "Pay at end" : `On table ${o.table_label} bill`}</span>
    ) : paid ? (
        <span className="label-caps rounded-md bg-success/10 px-2 py-1 text-success">Paid</span>
    ) : (
        <span className="label-caps rounded-md bg-warning/15 px-2 py-1 text-warning">Unpaid</span>
    );

    return (
        <article className={`card p-4 ${o.status === "new" ? "ring-2 ring-danger/40" : ""}`}>
            <div className="flex items-start gap-2">
                <div className="flex-1">
                    <p className="money text-2xl font-extrabold tracking-tight">{code}</p>
                    <p className="text-sm text-ink-2">
                        <b className="text-ink">{takeaway ? `Takeaway · ${o.customer_name}` : `Table ${o.table_label}`}</b> · {minutesAgo(o.created_at)}
                    </p>
                </div>
                {payChip}
            </div>

            {/* WHAT THEY ORDERED */}
            <ul className="mt-3 space-y-1.5 border-t border-dashed border-line pt-3 text-sm">
                {o.lines.map((l, i) => (
                    <li key={i}>
                        <b className="money">{l.qty}×</b> {l.name}
                        {l.options.length > 0 && <span className="block pl-6 text-ink-2">{l.options.map((x) => x.name).join(" · ")}</span>}
                        {l.note && <span className="block pl-6 italic text-primary">“{l.note}”</span>}
                    </li>
                ))}
            </ul>
            {o.note && (
                <p className="mt-2 rounded-lg bg-tint-2 p-2 text-sm">
                    <b>Note:</b> {o.note}
                </p>
            )}
            <p className="money mt-3 flex justify-between font-bold">
                <span className="text-ink-2">
                    {items} {items === 1 ? "item" : "items"}
                </span>
                {formatRM(toSen(o.subtotal))}
            </p>

            {/* BUTTONS for each column */}
            <div className="mt-3 flex gap-2">
                {o.status === "new" && (
                    <>
                        <RejectButton id={o.id} code={code} />
                        <form action={acceptQr} className="flex flex-1">
                            <input type="hidden" name="id" value={o.id} />
                            <SubmitButton className={`btn-primary ${BTN}`}>
                                <Check className="h-4 w-4" />
                                Accept
                            </SubmitButton>
                        </form>
                    </>
                )}

                {o.status === "preparing" && (
                    <>
                        <Link href={`/receipt/${o.order_id}?round=${o.round}`} className={`btn-soft ${BTN}`}>
                            <Printer className="h-4 w-4" />
                            Tickets
                        </Link>
                        <form action={moveQr} className="flex flex-1">
                            <input type="hidden" name="id" value={o.id} />
                            <input type="hidden" name="status" value="ready" />
                            <SubmitButton className={`btn-primary ${BTN}`}>
                                <BellRing className="h-4 w-4" />
                                Mark ready
                            </SubmitButton>
                        </form>
                    </>
                )}

                {o.status === "ready" &&
                    (takeaway && !paid ? (
                        // takeaway pays at the counter when collecting (same payment screen as tables)
                        <Link href={`/?bill=${o.order_id}`} className={`btn-primary ${BTN}`}>
                            <HandCoins className="h-4 w-4" />
                            Take payment
                        </Link>
                    ) : (
                        <form action={moveQr} className="flex flex-1">
                            <input type="hidden" name="id" value={o.id} />
                            <input type="hidden" name="status" value="done" />
                            <SubmitButton className={`btn-primary ${BTN}`}>
                                <CheckCheck className="h-4 w-4" />
                                {takeaway ? "Collected" : "Served"}
                            </SubmitButton>
                        </form>
                    ))}
            </div>
        </article>
    );
}

// "just now" / "5 min ago" (a helper, so the page itself stays "pure" for React's lint rule)
function minutesAgo(iso: string) {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    return mins < 1 ? "just now" : `${mins} min ago`;
}
