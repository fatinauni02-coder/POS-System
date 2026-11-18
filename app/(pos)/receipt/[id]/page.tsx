import { Check, ChefHat, CircleCheck, CirclePlus, Coffee, LayoutGrid, ReceiptText, RotateCcw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getBusiness } from "@/lib/business";
import { formatRM, toSen } from "@/lib/money";
import { hasManagerPin } from "@/lib/pin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PrintAllButton, PrintButton } from "./print-button";
import { RefundButton } from "./refund-button";
import { Loading } from "@/components/loading";

// "/receipt/12" → [id] folder = a changing part of the address; here id = "12"
// NEW: "?show=bar" / "?show=kitchen" = show that ticket instead of the customer receipt
export default function ReceiptPage({ params, searchParams }: PageProps<"/receipt/[id]">) {
    return (
        <Suspense fallback={<Loading />}>
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
    options: { name: string; group?: string; price_sen?: number }[];
    notes: string | null;
    station: string | null;
    round: number; // restaurant mode: 1 = first send, 2+ = add-on rounds
    voided: boolean; // cancelled after it was sent → left off the receipt and tickets
    sent_at: string;
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
    const query = await searchParams;
    let show = query.show === "bar" || query.show === "kitchen" ? query.show : "receipt";
    // restaurant mode: "?round=2" = only the tickets of that round (sent as an ADD-ON)
    const roundNo = Number(query.round);
    const oneRound = Number.isInteger(roundNo) && roundNo > 0 ? roundNo : null;

    const business = await getBusiness();
    if (!business) notFound();

    // orders are private (RLS), so read them with the secret key — this file only runs on the server
    const { data: order } = await supabaseAdmin
        .from("orders")
        .select("*, order_items(id, item_name, quantity, line_total, options, notes, station, round, voided, sent_at)")
        .eq("business_id", business.id) // only THIS shop's orders
        .eq("id", id)
        .order("id", { referencedTable: "order_items" }) // lines in the order they were added
        .maybeSingle();
    if (!order) notFound(); // shows the 404 page

    // the server may be in another country: always show Malaysia time
    const when = malaysiaTime(order.created_at);
    const rounding = toSen(order.rounding);
    const change = toSen(order.change_due);
    const refunded = order.status === "refunded";
    const open = order.status === "open"; // a table bill that isn't paid yet: tickets only, no receipt
    const cash = order.payment_method === "cash";
    const hasPin = await hasManagerPin(business.id);

    // "Dine-in · Table 5" or "Takeaway" — used by the receipt and both tickets
    const place =
        order.order_type === "dine_in"
            ? `Dine-in${order.table_label ? ` · Table ${order.table_label}` : ""}`
            : `Takeaway${order.customer_name ? ` · ${order.customer_name}` : ""}`; // QR takeaway: who to call

    // split the lines by station (old orders without a station count as kitchen)
    const lines = (order.order_items as Line[]).filter((l) => !l.voided);
    const ticketLines = oneRound ? lines.filter((l) => l.round === oneRound) : lines;
    const bar = ticketLines.filter((l) => l.station === "bar");
    const kitchen = ticketLines.filter((l) => l.station !== "bar");
    const count = (list: Line[]) => list.reduce((n, l) => n + l.quantity, 0);

    // an open bill has no receipt yet → start on a ticket
    if (open && show === "receipt") show = bar.length > 0 ? "bar" : "kitchen";
    // a round's ticket shows when THAT round was sent
    const ticketWhen = oneRound && ticketLines[0] ? malaysiaTime(ticketLines[0].sent_at) : when;
    const roundQ = oneRound ? `&round=${oneRound}` : ""; // keep "?round=…" when switching tabs
    const addOn = oneRound !== null && oneRound > 1 ? " · ADD-ON" : "";

    // THE PRINTOUTS for this order (tabs on the right): receipt (not for open bills), drinks, kitchen
    const docs = [
        ...(!open ? [{ id: "receipt", label: "Receipt", Icon: ReceiptText, href: `/receipt/${id}` }] : []),
        ...(bar.length > 0 ? [{ id: "bar", label: `Drinks (${count(bar)})`, Icon: Coffee, href: `/receipt/${id}?show=bar${roundQ}` }] : []),
        ...(kitchen.length > 0 ? [{ id: "kitchen", label: `Kitchen (${count(kitchen)})`, Icon: ChefHat, href: `/receipt/${id}?show=kitchen${roundQ}` }] : []),
    ];

    // where "next" goes: open table bill → Tables; open QR takeaway → QR board; paid → Order screen (or Tables in restaurant mode)
    const next = open
        ? order.order_type === "takeaway"
            ? { href: "/qr", title: "Back to QR orders", sub: "Order board" }
            : { href: "/tables", title: "Back to Tables", sub: "Floor plan" }
        : business.service_mode === "restaurant"
          ? { href: "/tables", title: "New order", sub: "Back to tables" }
          : { href: "/", title: "New order", sub: "Next customer" };

    const headline = open ? "Sent to the kitchen" : refunded ? "Order refunded" : "Order paid";
    const banner = open
        ? `· ${place}${oneRound ? ` · round ${oneRound}` : ""}`
        : `· ${refunded ? "Refunded" : "Paid"} ${malaysiaTime(order.paid_at ?? order.created_at)}`;

    return (
        <>
            {/* BANNER */}
            <div className="flex items-center gap-3 border-b border-line bg-tint px-6 py-3 print:hidden">
                {refunded ? <RotateCcw className="h-6 w-6 text-danger" /> : <CircleCheck className="h-6 w-6 text-success" />}
                <p className="font-bold">{open ? "Tickets ready" : `Receipt for order #${order.order_no}`}</p>
                <p className="text-sm text-ink-2">{banner}</p>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_420px] print:block print:p-0">
                {/* LEFT: summary + buttons */}
                <section className="flex flex-col gap-4 print:hidden">
                    <div className="card p-6">
                        <div className="flex items-center gap-4">
                            <span
                                className={`flex h-16 w-16 items-center justify-center rounded-full ${
                                    refunded ? "bg-danger/10 text-danger" : open ? "bg-tint text-primary" : "bg-success/10 text-success"
                                }`}
                            >
                                {refunded ? <RotateCcw className="h-8 w-8" /> : open ? <ChefHat className="h-8 w-8" /> : <Check className="h-9 w-9" />}
                            </span>
                            <div>
                                {!open && (
                                    <span className="label-caps rounded-md bg-tint px-2 py-1 text-ink-2">
                                        {METHOD_NAMES[order.payment_method] ?? order.payment_method} payment
                                    </span>
                                )}
                                <h1 className="mt-1 text-3xl font-bold tracking-tight">{headline}</h1>
                                <p className="text-ink-2">
                                    Order #{order.order_no} · {place}
                                </p>
                            </div>
                        </div>

                        {/* CHANGE TO RETURN (cash only) */}
                        {!open && !refunded && cash && change > 0 && (
                            <div className="mt-5 flex items-center justify-between rounded-2xl bg-tint-2 p-5">
                                <div>
                                    <p className="label-caps text-primary">Change to return</p>
                                    <p className="text-sm text-ink-2">Count out and hand over</p>
                                </div>
                                <p className="money rounded-xl bg-surface px-5 py-2 text-4xl font-bold text-primary">{formatRM(change)}</p>
                            </div>
                        )}

                        {/* FACTS */}
                        <dl className="money mt-4 grid grid-cols-2 gap-4 rounded-2xl bg-tint p-5 text-sm">
                            {open ? (
                                <>
                                    <Fact label="On these tickets" value={`${count(ticketLines)} items`} />
                                    <Fact label="Sent" value={ticketWhen} />
                                </>
                            ) : (
                                <>
                                    <Fact label={cash ? "Cash tendered" : "Amount paid"} value={formatRM(toSen(order.amount_paid))} />
                                    <Fact label="Total billed" value={formatRM(toSen(order.total))} />
                                    <Fact label="Cashier" value={order.cashier ?? "—"} />
                                    <Fact label="Settled" value={malaysiaTime(order.paid_at ?? order.created_at)} />
                                </>
                            )}
                        </dl>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Link href={next.href} className="btn-primary flex h-20 items-center gap-3 px-6">
                            {open ? <LayoutGrid className="h-7 w-7" /> : <CirclePlus className="h-7 w-7" />}
                            <span className="text-left">
                                <span className="block text-xl">{next.title}</span>
                                <span className="text-sm font-semibold opacity-80">{next.sub}</span>
                            </span>
                        </Link>
                        <PrintAllButton sub={docs.length > 1 ? `${docs.map((d) => d.label.replace(/ \(\d+\)/, "")).join(" + ")} · 80mm` : "80mm"} />
                    </div>
                    {!refunded && !open && (
                        <div className="grid grid-cols-2">
                            <RefundButton orderId={order.id} hasPin={hasPin} />
                        </div>
                    )}
                </section>

                {/* RIGHT: tabs + the paper + "Print this" */}
                <section className="flex flex-col gap-3 self-start print:block">
                    <div
                        role="tablist"
                        aria-label="Printouts"
                        className="grid gap-1 rounded-xl bg-tint p-1 print:hidden"
                        style={{ gridTemplateColumns: `repeat(${docs.length}, minmax(0, 1fr))` }}
                    >
                        {docs.map(({ id: docId, label, Icon, href }) => (
                            <Link
                                key={docId}
                                href={href}
                                role="tab"
                                aria-selected={show === docId}
                                className={`press flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${
                                    show === docId ? "bg-surface text-primary shadow-card" : "text-ink-2"
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {label}
                            </Link>
                        ))}
                    </div>

                    {/* every printout is on the page; .doc-hidden hides the ones not picked (Print all shows them) */}
                    <div className="card flex justify-center bg-white p-6 print:border-0 print:p-0 print:shadow-none">
                        <div className="flex flex-col">
                            {!open && (
                                <div className={`doc ${show === "receipt" ? "" : "doc-hidden"}`}>
                                    <ReceiptPaper
                                        business={business}
                                        order={order}
                                        lines={lines}
                                        when={when}
                                        place={place}
                                        rounding={rounding}
                                        change={change}
                                        refunded={refunded}
                                    />
                                </div>
                            )}
                            {bar.length > 0 && (
                                <div className={`doc ${show === "bar" ? "" : "doc-hidden"}`}>
                                    <Ticket title={"DRINKS" + addOn} orderNo={order.order_no} place={place} when={ticketWhen} lines={bar} refunded={refunded} note={order.note} />
                                </div>
                            )}
                            {kitchen.length > 0 && (
                                <div className={`doc ${show === "kitchen" ? "" : "doc-hidden"}`}>
                                    <Ticket title={"KITCHEN" + addOn} orderNo={order.order_no} place={place} when={ticketWhen} lines={kitchen} refunded={refunded} note={order.note} />
                                </div>
                            )}
                        </div>
                    </div>
                    <PrintButton
                        label={show === "receipt" ? "Print receipt" : "Print ticket"}
                        className="btn-soft flex h-12 items-center justify-center gap-2 print:hidden"
                    />
                </section>
            </div>
        </>
    );
}

// one fact in the summary box: small label, big value
function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="font-semibold text-ink-2">{label}</dt>
            <dd className="text-lg font-bold">{value}</dd>
        </div>
    );
}

type Business = NonNullable<Awaited<ReturnType<typeof getBusiness>>>;
type Order = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// THE CUSTOMER RECEIPT — 80mm thermal printers print about 72mm wide
function ReceiptPaper({
    business,
    order,
    lines,
    when,
    place,
    rounding,
    change,
    refunded,
}: {
    business: Business;
    order: Order;
    lines: Line[];
    when: string;
    place: string;
    rounding: number;
    change: number;
    refunded: boolean;
}) {
    return (
        <div className="w-[72mm] bg-white p-1 font-mono text-[12px] leading-snug text-black">
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
            {lines.map((line) => {
                const { temp, addOns } = splitOptions(line.options);
                // add-on money for this line (price × quantity)
                const addOnSen = addOns.reduce((sum, o) => sum + (o.price_sen ?? 0), 0) * line.quantity;
                // what's left = item price + temperature extra
                const mainSen = toSen(line.line_total) - addOnSen;

                return (
                    <div key={line.id} className="mb-1">
                        <Row left={`${line.quantity} x ${temp ? temp.name + " " : ""}${line.item_name}`} right={formatRM(mainSen)} />
                        {addOns.map((o) => (
                            <div key={o.name} className="pl-4">
                                <Row left={`+ ${o.name}`} right={o.price_sen ? formatRM(o.price_sen * line.quantity) : ""} />
                            </div>
                        ))}
                        {line.notes && <p className="pl-4 italic">&quot;{line.notes}&quot;</p>}
                    </div>
                );
            })}

            <Divider />
            <Row left="Subtotal" right={formatRM(toSen(order.subtotal))} />
            {toSen(order.discount) > 0 && <Row left={`Discount ${Number(order.discount_pct)}%`} right={`-${formatRM(toSen(order.discount))}`} />}
            {toSen(order.sst_amount) > 0 && <Row left={`SST ${Number(order.sst_rate)}%`} right={formatRM(toSen(order.sst_amount))} />}
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
    );
}

// KITCHEN / DRINKS TICKET — big text, no prices, so it can be read from a distance
function Ticket({
    title,
    orderNo,
    place,
    when,
    lines,
    refunded,
    note,
}: {
    title: string;
    orderNo: number;
    place: string;
    when: string;
    lines: Line[];
    refunded: boolean;
    note: string | null; // kitchen note for the whole order
}) {
    return (
        <div className="w-[72mm] bg-white p-1 font-mono leading-snug text-black">
            <p className="text-center font-sans text-xl font-bold tracking-widest">{title}</p>
            {refunded && <p className="mt-1 text-center font-bold">*** CANCELLED ***</p>}
            <Divider />
            <p className="text-3xl font-bold">#{orderNo}</p>
            <p className="text-lg font-bold">{place}</p>
            <p className="text-[12px]">{when}</p>
            {/* the note for the WHOLE order: boxed, so the kitchen can't miss it */}
            {note && <p className="mt-2 border-2 border-black p-1 text-base font-bold">NOTE: {note}</p>}
            <Divider />
            {lines.map((l) => {
                const { temp, addOns } = splitOptions(l.options);
                return (
                    <div key={l.id} className="mb-3">
                        <p className="text-xl font-bold">
                            {l.quantity} x {temp ? temp.name + " " : ""}
                            {l.item_name}
                        </p>
                        {addOns.map((o) => (
                            <p key={o.name} className="pl-4 text-base">
                                + {o.name}
                            </p>
                        ))}
                        {l.notes && <p className="pl-4 text-base font-bold">** {l.notes}</p>}
                    </div>
                );
            })}
        </div>
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

// "Iced" goes into the item name; every other option is listed under it
function splitOptions(options: Line["options"]) {
    const temp = options.find((o) => o.group === "Temperature");
    return { temp, addOns: options.filter((o) => o !== temp) };
}

// the server may be in another country: always show Malaysia time
function malaysiaTime(iso: string) {
    return new Date(iso).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
}
