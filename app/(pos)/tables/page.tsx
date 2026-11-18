import { CirclePlus, Clock, LayoutGrid, QrCode, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Loading } from "@/components/loading";
import { Toast } from "@/components/toast";
import { getBusiness } from "@/lib/business";
import { formatRM, toSen } from "@/lib/money";
import { getStaff } from "@/lib/staff";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { addTable, deleteTable } from "./actions";
import { SubmitButton } from "@/components/submit-button";

// "/tables" = restaurant mode: every table, free or with an open bill.
// Look copied from the approved prototype: pos_html/tables.html + assets/pages/tables.js
export default function TablesPage({ searchParams }: PageProps<"/tables">) {
    return (
        <Suspense fallback={<Loading />}>
            <Tables searchParams={searchParams} />
        </Suspense>
    );
}

const INPUT = "h-11 rounded-xl border border-line bg-canvas px-3 font-semibold outline-none focus:border-primary-soft";

type BillRow = {
    id: number;
    order_no: number;
    table_id: string;
    subtotal: number | string;
    created_at: string;
    order_items: { quantity: number; round: number; voided: boolean }[];
};

async function Tables({ searchParams }: { searchParams: PageProps<"/tables">["searchParams"] }) {
    const params = await searchParams;
    await connection(); // "minutes seated" uses the time right now

    const business = await getBusiness();
    if (!business) return <p className="p-6 text-danger">Shop not found</p>;
    const staff = await getStaff();
    const isManager = staff !== null && staff.role !== "staff";

    // tables + open bills (with their lines, for items / rounds) + QR orders waiting, all at once
    const [{ data: tables }, { data: bills }, { data: waiting }] = await Promise.all([
        supabaseAdmin
            .from("dining_tables")
            .select("id, label")
            .eq("business_id", business.id)
            .eq("is_active", true)
            .order("sort_order")
            .order("label"),
        supabaseAdmin
            .from("orders")
            .select("id, order_no, table_id, subtotal, created_at, order_items(quantity, round, voided)")
            .eq("business_id", business.id)
            .eq("status", "open")
            .not("table_id", "is", null),
        supabaseAdmin.from("qr_orders").select("table_id").eq("business_id", business.id).eq("status", "new"),
    ]);

    // table id → its open bill / how many QR orders wait (Map = quick lookup)
    const billFor = new Map(((bills ?? []) as BillRow[]).map((b) => [b.table_id, b]));
    const qrFor = new Map<string, number>();
    for (const q of waiting ?? []) if (q.table_id) qrFor.set(q.table_id, (qrFor.get(q.table_id) ?? 0) + 1);

    const list = tables ?? [];
    const openTotal = [...billFor.values()].reduce((sum, b) => sum + toSen(b.subtotal), 0);

    return (
        <>
            {typeof params.msg === "string" && <Toast key={String(params.t)} kind="msg" text={params.msg} />}
            {typeof params.error === "string" && <Toast key={String(params.t)} kind="error" text={params.error} />}

            {/* HEADER BAR (white, full width) */}
            <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-6 py-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tint text-primary">
                    <LayoutGrid className="h-6 w-6" />
                </span>
                <div className="mr-auto">
                    <h1 className="text-2xl font-bold tracking-tight">Tables</h1>
                    <p className="money text-sm text-ink-2">
                        {billFor.size} of {list.length} occupied · {formatRM(openTotal)} open on tables
                    </p>
                </div>
                {/* legend */}
                <div className="hidden items-center gap-4 text-sm text-ink-2 md:flex">
                    <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full border-2 border-line bg-surface" />
                        Free
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-primary" />
                        Occupied
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-danger" />
                        QR order waiting
                    </span>
                </div>
                <Link href="/" className="btn-primary flex h-12 items-center gap-2 px-5">
                    <ShoppingBag className="h-5 w-5" />
                    Takeaway order
                </Link>
            </div>

            <div className="flex flex-col gap-6 p-6">
                {list.length === 0 && (
                    <p className="card p-10 text-center text-ink-2">No tables yet{isManager ? " — add them below" : ""}</p>
                )}

                {/* THE FLOOR: as many 200px+ cards per row as fit */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                    {list.map((t) => {
                        const bill = billFor.get(t.id);
                        const qr = qrFor.get(t.id) ?? 0;
                        const qrChip = qr > 0 && (
                            <span className="label-caps flex items-center gap-1 rounded-md bg-danger px-2 py-1 text-white">
                                <QrCode className="h-3 w-3" />
                                {qr} QR waiting
                            </span>
                        );
                        const href = `/?table=${encodeURIComponent(t.label)}`;

                        // FREE TABLE: dashed outline
                        if (!bill) {
                            return (
                                <Link key={t.id} href={href} className="card press flex min-h-40 flex-col gap-2 border-2 border-dashed p-4 hover:border-primary-soft">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-2xl font-bold tracking-tight">{t.label}</p>
                                        {qrChip}
                                    </div>
                                    <p className="mt-auto flex items-center gap-1.5 text-sm font-semibold text-ink-3">
                                        <CirclePlus className="h-4 w-4" />
                                        Free · tap to seat
                                    </p>
                                </Link>
                            );
                        }

                        // OCCUPIED TABLE: orange outline + soft orange fill
                        const lines = bill.order_items.filter((l) => !l.voided);
                        const items = lines.reduce((n, l) => n + l.quantity, 0);
                        const rounds = new Set(lines.map((l) => l.round)).size;
                        const mins = minutesSince(bill.created_at);
                        return (
                            <Link key={t.id} href={href} className="card press flex min-h-40 flex-col gap-2 border-2 border-primary bg-tint p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-2xl font-bold tracking-tight text-primary">{t.label}</p>
                                    <span
                                        className={`money flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs font-bold ${mins >= 60 ? "text-danger" : "text-ink-2"}`}
                                    >
                                        <Clock className="h-3 w-3" />
                                        {mins} min
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {qrChip}
                                    <span className="label-caps rounded-md bg-surface px-2 py-1 text-ink-2">#{bill.order_no}</span>
                                    {rounds > 0 && (
                                        <span className="label-caps rounded-md bg-surface px-2 py-1 text-ink-2">
                                            {rounds} {rounds === 1 ? "round" : "rounds"}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-auto flex items-end justify-between">
                                    <span className="text-sm text-ink-2">
                                        {items} {items === 1 ? "item" : "items"}
                                    </span>
                                    <span className="money text-xl font-bold">{formatRM(toSen(bill.subtotal))}</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {/* MANAGERS ONLY: add / remove tables */}
                {isManager && (
                    <div className="card flex flex-col gap-3 p-4">
                        <div className="flex items-center justify-between">
                            <p className="label-caps text-ink-2">Manage tables</p>
                            <Link href="/tables/qr" className="btn-soft flex h-10 items-center gap-2 px-3 text-sm">
                                <QrCode className="h-4 w-4" />
                                Print QR codes
                            </Link>
                        </div>
                        <form action={addTable} className="flex gap-2">
                            <input name="label" required maxLength={20} placeholder="e.g. 5 or Patio 1" className={`${INPUT} flex-1`} />
                            <SubmitButton className="btn-primary h-11 px-5">Add</SubmitButton>
                        </form>
                        <div className="flex flex-wrap gap-2">
                            {list.map((t) => (
                                <form key={t.id} action={deleteTable} className="flex items-center gap-1 rounded-xl bg-tint py-1 pl-3 pr-1">
                                    <input type="hidden" name="id" value={t.id} />
                                    <input type="hidden" name="label" value={t.label} />
                                    <span className="font-semibold">{t.label}</span>
                                    <SubmitButton replace aria-label={`Remove table ${t.label}`} className="h-8 w-8 rounded-lg font-bold text-danger hover:bg-surface">
                                        ×
                                    </SubmitButton>
                                </form>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

// how long ago, in whole minutes (a helper, so the page itself stays "pure" for React's lint rule)
function minutesSince(iso: string) {
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}
