import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getBusiness } from "@/lib/business";
import { formatRM, toSen } from "@/lib/money";
import { hasManagerPin } from "@/lib/pin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PrintButton } from "./print-button";
import { RefundButton } from "./refund-button";

// "/receipt/12" → [id] folder = a changing part of the address; here id = "12"
// NEW: "?show=bar" / "?show=kitchen" = show that ticket instead of the customer receipt
export default function ReceiptPage({ params, searchParams }: PageProps<"/receipt/[id]">) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Receipt params={params} searchParams={searchParams} />
        </Suspense>
    );
}

// one order line as saved by create_order (options = snapshot of the chosen options)
// NEW: notes = "less sugar"; station = which ticket it prints on ("bar" / "kitchen")
type Line = {
    id: number;
    item_name: string;
    quantity: number;
    line_total: number | string;
    options: { name: string }[];
    notes: string | null;
    station: string | null;
};

const METHOD_NAMES: Record<string, string> = { cash: "Cash", card: "Card", duitnow: "DuitNow QR", ewallet: "E-wallet" };

async function Receipt({
    params,
    searchParams,
}: {
    params: PageProps<"/receipt/[id]">["params"];
    searchParams: PageProps<"/receipt/[id]">["searchParams"];
}) {
    const { id } = await params;
    const query = await searchParams; // NEW
    const show = query.show === "bar" || query.show === "kitchen" ? query.show : "receipt"; // NEW

    const business = await getBusiness();
    if (!business) notFound();

    // orders are private (RLS), so read them with the secret key — this file only runs on the server
    const { data: order } = await supabaseAdmin
        .from("orders")
        .select("*, order_items(id, item_name, quantity, line_total, options, notes, station)") // NEW: notes, station
        .eq("business_id", business.id) // only THIS shop's orders
        .eq("id", id)
        .maybeSingle();
    if (!order) notFound(); // shows the 404 page

    // the server may be in another country: always show Malaysia time
    const when = new Date(order.created_at).toLocaleString("en-MY", {
        timeZone: "Asia/Kuala_Lumpur",
        dateStyle: "medium",
        timeStyle: "short",
    });
    const rounding = toSen(order.rounding);
    const change = toSen(order.change_due);
    const refunded = order.status === "refunded";
    const hasPin = await hasManagerPin(business.id);

    // NEW: "Dine-in · Table 5" or "Takeaway" — used by the receipt and both tickets
    const place = order.order_type === "dine_in" ? `Dine-in${order.table_label ? ` · Table ${order.table_label}` : ""}` : "Takeaway";

    // NEW: split the lines by station (old orders without a station count as kitchen)
    const lines: Line[] = order.order_items;
    const bar = lines.filter((l) => l.station === "bar");
    const kitchen = lines.filter((l) => l.station !== "bar");
    const count = (list: Line[]) => list.reduce((n, l) => n + l.quantity, 0);

    return (
        <div className="flex flex-col items-center gap-4 p-6 print:p-0">
            {/* NEW: TABS — only for stations that have items in this order */}
            <div className="flex w-[72mm] gap-1 rounded-2xl bg-tint p-1 print:hidden">
                <Tab href={`/receipt/${id}`} label="Receipt" active={show === "receipt"} />
                {bar.length > 0 && <Tab href={`/receipt/${id}?show=bar`} label={`Drinks (${count(bar)})`} active={show === "bar"} />}
                {kitchen.length > 0 && (
                    <Tab href={`/receipt/${id}?show=kitchen`} label={`Kitchen (${count(kitchen)})`} active={show === "kitchen"} />
                )}
            </div>

            {show === "receipt" ? (
                // the paper: 80mm thermal printers print about 72mm wide
                <div className="w-[72mm] bg-surface p-4 font-mono text-[12px] leading-snug text-black shadow print:shadow-none">
                    {/* SHOP */}
                    <div className="text-center">
                        <p className="font-sans text-base font-bold">{business.name}</p>
                        {business.address && <p>{business.address}</p>}
                        {business.phone && <p>Tel: {business.phone}</p>}
                        {business.sst_registered && business.sst_reg_no && <p>SST No: {business.sst_reg_no}</p>}
                    </div>

                    {/* big REFUNDED stamp (also prints, so a reprint can't be used as a valid receipt) */}
                    {refunded && <p className="mt-2 border-2 border-black py-1 text-center text-base font-bold">*** REFUNDED ***</p>}

                    <Divider />
                    <Row left={`Order #${order.order_no}`} right={METHOD_NAMES[order.payment_method] ?? order.payment_method} bold />
                    <p>{when}</p>
                    {order.cashier && <p>Cashier: {order.cashier}</p>}
                    <p>{place}</p>
                    <Divider />

                    {/* LINES */}
                    {lines.map((line) => (
                        <div key={line.id} className="mb-1">
                            <Row left={`${line.quantity} x ${line.item_name}`} right={formatRM(toSen(line.line_total))} />
                            {line.options.length > 0 && <p className="pl-4">{line.options.map((o) => o.name).join(", ")}</p>}
                            {/* NEW: the item note */}
                            {line.notes && <p className="pl-4 italic">&quot;{line.notes}&quot;</p>}
                        </div>
                    ))}

                    <Divider />
                    <Row left="Subtotal" right={formatRM(toSen(order.subtotal))} />
                    {toSen(order.discount) > 0 && (
                        <Row left={`Discount ${Number(order.discount_pct)}%`} right={`-${formatRM(toSen(order.discount))}`} />
                    )}
                    {rounding !== 0 && <Row left="Rounding" right={`${rounding < 0 ? "-" : ""}${formatRM(Math.abs(rounding))}`} />}
                    <Row left="TOTAL" right={formatRM(toSen(order.total))} bold />
                    <Row left={METHOD_NAMES[order.payment_method] ?? "Paid"} right={formatRM(toSen(order.amount_paid))} />
                    {change > 0 && <Row left="Change" right={formatRM(change)} />}
                    <Divider />

                    <div className="text-center">
                        {business.receipt_footer && <p>{business.receipt_footer}</p>}
                        <p>Thank you!</p>
                    </div>
                </div>
            ) : (
                // NEW: a ticket for the bar or the kitchen
                <Ticket
                    title={show === "bar" ? "DRINKS" : "KITCHEN"}
                    orderNo={order.order_no}
                    place={place}
                    when={when}
                    lines={show === "bar" ? bar : kitchen}
                    refunded={refunded}
                />
            )}

            {/* BUTTONS — print:hidden = not on the paper */}
            <div className="grid w-[72mm] grid-cols-2 gap-2 print:hidden">
                <Link href="/" className="flex h-12 items-center justify-center rounded-2xl bg-tint font-semibold">
                    Next customer
                </Link>
                <PrintButton label={show === "receipt" ? "Print receipt" : "Print ticket"} />
                {!refunded && <RefundButton orderId={order.id} hasPin={hasPin} />}
            </div>
        </div>
    );
}

// NEW: KITCHEN / DRINKS TICKET — big text, no prices, so it can be read from a distance
function Ticket({
    title,
    orderNo,
    place,
    when,
    lines,
    refunded,
}: {
    title: string;
    orderNo: number;
    place: string;
    when: string;
    lines: Line[];
    refunded: boolean;
}) {
    return (
        <div className="w-[72mm] bg-surface p-4 font-mono leading-snug text-black shadow print:shadow-none">
            <p className="text-center font-sans text-xl font-bold tracking-widest">{title}</p>
            {refunded && <p className="mt-1 text-center font-bold">*** CANCELLED ***</p>}
            <Divider />
            <p className="text-3xl font-bold">#{orderNo}</p>
            <p className="text-lg font-bold">{place}</p>
            <p className="text-[12px]">{when}</p>
            <Divider />
            {lines.map((l) => (
                <div key={l.id} className="mb-3">
                    <p className="text-xl font-bold">
                        {l.quantity} x {l.item_name}
                    </p>
                    {l.options.length > 0 && <p className="pl-4 text-base">{l.options.map((o) => o.name).join(", ")}</p>}
                    {l.notes && <p className="pl-4 text-base font-bold">** {l.notes}</p>}
                </div>
            ))}
        </div>
    );
}

// NEW: one tab button at the top; active = white "lifted" look
function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
    return (
        <Link href={href} className={`flex-1 rounded-xl py-2 text-center text-sm font-semibold ${active ? "bg-surface shadow" : "text-ink-2"}`}>
            {label}
        </Link>
    );
}

// one line: text on the left, amount on the right
function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
    return (
        <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
            <span>{left}</span>
            <span className="shrink-0">{right}</span>
        </div>
    );
}

// dashed line across the receipt
function Divider() {
    return <div className="my-2 border-t border-dashed border-black" />;
}