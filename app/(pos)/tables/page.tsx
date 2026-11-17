import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Toast } from "@/components/toast";
import { getBusiness } from "@/lib/business";
import { formatRM, toSen } from "@/lib/money";
import { getStaff } from "@/lib/staff";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { addTable, deleteTable } from "./actions";
import { Loading } from "@/components/loading";

// "/tables" = restaurant mode: every table, free or with an open bill
export default function TablesPage({ searchParams }: PageProps<"/tables">) {
    return (
        <Suspense fallback={<Loading />}>
            <Tables searchParams={searchParams} />
        </Suspense>
    );
}

const INPUT = "h-11 rounded-xl bg-tint px-3 font-semibold outline-none focus:ring-2 focus:ring-primary";

async function Tables({ searchParams }: { searchParams: PageProps<"/tables">["searchParams"] }) {
    const params = await searchParams;
    await connection(); // "minutes seated" uses the time right now

    const business = await getBusiness();
    if (!business) return <p className="p-6 text-red-600">Shop not found</p>;
    const staff = await getStaff();
    const isManager = staff !== null && staff.role !== "staff";

    // tables + the open bills, both at once
    const [{ data: tables }, { data: bills }] = await Promise.all([
        supabaseAdmin
            .from("dining_tables")
            .select("id, label")
            .eq("business_id", business.id)
            .eq("is_active", true)
            .order("sort_order")
            .order("label"),
        supabaseAdmin
            .from("orders")
            .select("id, order_no, table_id, subtotal, created_at")
            .eq("business_id", business.id)
            .eq("status", "open"),
    ]);

    // table id → its open bill (Map = quick lookup)
    const billFor = new Map((bills ?? []).map((b) => [b.table_id, b]));
    const list = tables ?? [];

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Tables</h1>
                <p className="text-sm text-ink-2">
                    {list.length} tables · {billFor.size} occupied
                </p>
            </div>

            {typeof params.msg === "string" && <Toast key={String(params.t)} kind="msg" text={params.msg} />}
            {typeof params.error === "string" && <Toast key={String(params.t)} kind="error" text={params.error} />}

            {list.length === 0 && (
                <p className="rounded-2xl border border-line bg-surface p-10 text-center text-ink-2">
                    No tables yet{isManager ? " — add them below" : ""}
                </p>
            )}

            {/* THE GRID: 2 across on phones, more on bigger screens */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {list.map((t) => {
                    const bill = billFor.get(t.id);
                    const mins = bill ? minutesSince(bill.created_at) : 0;
                    return (
                        <Link
                            key={t.id}
                            href={`/?table=${encodeURIComponent(t.label)}`}
                            className={`flex h-32 flex-col justify-between rounded-2xl border-2 p-4 ${
                                bill ? "border-primary bg-tint" : "border-line bg-surface hover:bg-tint"
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-2xl font-bold">{t.label}</p>
                                <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                                        bill ? "bg-primary text-white" : "bg-green-50 text-green-700"
                                    }`}
                                >
                                    {bill ? "Occupied" : "Free"}
                                </span>
                            </div>
                            {bill ? (
                                <div>
                                    <p className="text-lg font-bold">{formatRM(toSen(bill.subtotal))}</p>
                                    <p className="text-sm text-ink-2">
                                        #{bill.order_no} · {mins} min
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-ink-2">Tap to start an order</p>
                            )}
                        </Link>
                    );
                })}
            </div>

            {/* MANAGERS ONLY: add / remove tables */}
            {isManager && (
                <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                    <div className="flex items-center justify-between">
                        <p className="font-bold">Manage tables</p>
                        <Link href="/tables/qr" className="font-semibold text-primary underline">
                            Print QR codes
                        </Link>
                    </div>
                    <form action={addTable} className="flex gap-2">
                        <input name="label" required maxLength={20} placeholder="e.g. 5 or Patio 1" className={`${INPUT} flex-1`} />
                        <button className="h-11 rounded-xl bg-primary px-5 font-bold text-white">Add</button>
                    </form>
                    <div className="flex flex-wrap gap-2">
                        {list.map((t) => (
                            <form key={t.id} action={deleteTable} className="flex items-center gap-1 rounded-xl bg-tint py-1 pl-3 pr-1">
                                <input type="hidden" name="id" value={t.id} />
                                <input type="hidden" name="label" value={t.label} />
                                <span className="font-semibold">{t.label}</span>
                                <button aria-label={`Remove table ${t.label}`} className="h-8 w-8 rounded-lg font-bold text-red-700 hover:bg-red-50">
                                    ×
                                </button>
                            </form>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// how long ago, in whole minutes (a helper, so the page itself stays "pure" for React's lint rule)
function minutesSince(iso: string) {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}
