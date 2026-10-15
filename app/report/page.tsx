import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Stat } from "@/components/stat";
import { getBusiness } from "@/lib/business";
import { addDays, dayInKL, TZ } from "@/lib/dates";
import { formatRM, toSen } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PrintButton } from "@/app/receipt/[id]/print-button";

// "/report" = today; "/report?date=2026-10-14" = another day
export default function ReportPage({ searchParams }: PageProps<"/report">) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Report searchParams={searchParams} />
        </Suspense>
    );
}

const METHODS = [
    { key: "cash", name: "Cash" },
    { key: "card", name: "Card" },
    { key: "duitnow", name: "DuitNow QR" },
    { key: "ewallet", name: "E-wallet" },
];

type Order = {
    status: string; payment_method: string | null; subtotal: string; discount: string; sst_amount: string; rounding: string; total: string; cashier: string | null
    order_items: { item_name: string; quantity: number; line_total: string; }[]
};
type MoneyColumn = "subtotal" | "discount" | "sst_amount" | "rounding" | "total";

// add up one money column (in sen) over a list of orders
function sum(rows: Order[], col: MoneyColumn) {
    return rows.reduce((s, o) => s + toSen(o[col]), 0);
}

async function Report({ searchParams }: { searchParams: PageProps<"/report">["searchParams"] }) {
    const params = await searchParams;
    await connection();
    const today = dayInKL(new Date());
    const day = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

    const business = await getBusiness();
    if (!business) return <p className="p-6 text-red-600">Shop not found</p>;

    const { data, error } = await supabaseAdmin
        .from("orders")
        .select("status, payment_method, subtotal, discount, sst_amount, rounding, total, cashier, order_items(item_name, quantity, line_total)")
        .eq("business_id", business.id)
        .gte("created_at", `${day}T00:00:00+08:00`)
        .lt("created_at", `${addDays(day, 1)}T00:00:00+08:00`);
    if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;

    const orders = (data ?? []) as Order[];
    const paid = orders.filter((o) => o.status === "completed");
    const refunded = orders.filter((o) => o.status === "refunded");

    const net = sum(paid, "total");
    const average = paid.length > 0 ? Math.round(net / paid.length) : 0;
    // items sold: name → { how many, how much money }, then most sold first
    const byItem = new Map<string, { qty: number; sen: number }>();
    for (const o of paid) {
        for (const l of o.order_items) {
            const row = byItem.get(l.item_name) ?? { qty: 0, sen: 0 };
            row.qty += l.quantity;
            row.sen += toSen(l.line_total);
            byItem.set(l.item_name, row);
        }
    }
    const items = [...byItem].sort((a, b) => b[1].qty - a[1].qty);
    // sales per cashier (old orders without a name → "—")
    const byCashier = new Map<string, { orders: number; sen: number }>();
    for (const o of paid) {
        const name = o.cashier ?? "—";
        const row = byCashier.get(name) ?? { orders: 0, sen: 0 };
        row.orders += 1;
        row.sen += toSen(o.total);
        byCashier.set(name, row);
    }

    const title = new Date(`${day}T12:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: TZ, dateStyle: "full" });

    return (
        <div className="flex flex-col gap-5 p-6">
            {/* HEADER: same day buttons as Order history */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="mr-auto">
                    <h1 className="text-2xl font-bold tracking-tight">End-of-day report</h1>
                    <p className="text-sm text-ink-2">{title}</p>
                </div>
                <Link href={`/report?date=${addDays(day, -1)}`} className="print:hidden rounded-xl border border-line bg-surface px-4 py-2 font-semibold">
                    ‹ Previous day
                </Link>
                <PrintButton label="Print report" />
                {day !== today && (
                    <>
                        <Link href={`/report?date=${addDays(day, 1)}`} className="print:hidden rounded-xl border border-line bg-surface px-4 py-2 font-semibold">
                            Next day ›
                        </Link>
                        <Link href="/report" className="print:hidden rounded-xl bg-primary px-4 py-2 font-semibold text-white">
                            Today
                        </Link>
                    </>
                )}
            </div>

            {/* 4 BIG NUMBERS */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Net sales" value={formatRM(net)} />
                <Stat label="Orders" value={String(paid.length)} />
                <Stat label="Average order" value={formatRM(average)} />
                <Stat label={`Refunds (${refunded.length})`} value={formatRM(sum(refunded, "total"))} />
            </div>

            {/* TWO CARDS side by side: how the sales add up | how customers paid */}
            <div className="grid gap-5 lg:grid-cols-2">
                <Card title="Sales breakdown">
                    <Line label="Gross sales" value={formatRM(sum(paid, "subtotal"))} />
                    <Line label="Discounts" value={`−${formatRM(sum(paid, "discount"))}`} />
                    <Line label="SST collected" value={formatRM(sum(paid, "sst_amount"))} />
                    <Line label="Cash rounding" value={formatRM(sum(paid, "rounding"))} />
                    <Line label="Net sales" value={formatRM(net)} bold />
                </Card>

                <Card title="Payments">
                    {METHODS.map((m) => {
                        const rows = paid.filter((o) => o.payment_method === m.key);
                        return <Line key={m.key} label={`${m.name} (${rows.length})`} value={formatRM(sum(rows, "total"))} />;
                    })}
                    <Line label="Total" value={formatRM(net)} bold />
                </Card>
            </div>
            <Card title="By cashier">
                {[...byCashier].map(([name, r]) => (
                    <Line key={name} label={`${name} (${r.orders})`} value={formatRM(r.sen)} />
                ))}
                {byCashier.size === 0 && <p className="text-ink-2">No sales on this day</p>}
            </Card>
            <Card title={`Items sold (${items.reduce((n, [, r]) => n + r.qty, 0)})`}>
                {items.length === 0 && <p className="text-ink-2">Nothing sold on this day</p>}
                {items.map(([name, r]) => (
                    <Line key={name} label={`${r.qty} × ${name}`} value={formatRM(r.sen)} />
                ))}
            </Card>
        </div>
    );
}

// a white box with a title; {children} = the rows inside it
function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-3 text-lg font-bold">{title}</h2>
            {children}
        </section>
    );
}

// one row: label on the left, amount on the right; bold = the total row (with a line above it)
function Line({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
    return (
        <div className={`flex justify-between py-1.5 ${bold ? "mt-1 border-t border-line pt-3 text-lg font-bold" : "text-ink-2"}`}>
            <span>{label}</span>
            <span>{value}</span>
        </div>
    );
}