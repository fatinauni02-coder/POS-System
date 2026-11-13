import { connection } from "next/server";
import { Suspense } from "react";
import { OptionEffects } from "./option-effects";
import { getBusiness } from "@/lib/business";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { addStockItem, adjustStock, updateStockItem } from "./actions";
import { DeleteStockButton } from "./delete-stock-button";
import Link from "next/link";
import { Toast } from "@/components/toast";

export default function StockPage({ searchParams }: PageProps<"/stock">) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Stock searchParams={searchParams} />
        </Suspense>
    );
}

const INPUT = "h-11 rounded-xl bg-tint px-3 font-semibold outline-none focus:ring-2 focus:ring-primary";

async function Stock({ searchParams }: { searchParams: PageProps<"/stock">["searchParams"] }) {
    const params = await searchParams;
    const editId = typeof params.edit === "string" ? params.edit : null;
    await connection(); // always show the amounts as they are right now

    const business = await getBusiness();
    if (!business) return <p className="p-6 text-red-600">Shop not found</p>;

    // stock is private (RLS: staff only) → read it with the secret key, on the server
    const { data: items, error } = await supabaseAdmin
        .from("stock_items")
        .select("id, name, unit, qty, low_level")
        .eq("business_id", business.id)
        .order("name");
    if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;

    const list = (items ?? []).map((s) => {
        const qty = Number(s.qty);
        const low = Number(s.low_level);
        const status = qty <= 0 ? "out" : qty <= low ? "low" : "ok";
        return { ...s, qty, low, status };
    });
    const lowCount = list.filter((s) => s.status === "low").length;
    const outCount = list.filter((s) => s.status === "out").length;

    return (
        <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Stock{" "}
                    <Link href="/stock/history" className="ml-2 text-base font-semibold text-primary underline">
                        History ›
                    </Link>
                </h1>
                <p className="text-sm text-ink-2">
                    {list.length} items · <span className="text-amber-700">{lowCount} low</span> ·{" "}
                    <span className="text-red-700">{outCount} out</span>
                </p>
            </div>

            {/* green / red message → pop-up at the bottom-right; key = new time → new toast */}
            {typeof params.msg === "string" && <Toast key={String(params.t)} kind="msg" text={params.msg} />}
            {typeof params.error === "string" && <Toast key={String(params.t)} kind="error" text={params.error} />}

            {/* ADD A NEW STOCK ITEM — one row of boxes + button */}
            <form action={addStockItem} className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4">
                <label className="flex min-w-48 flex-1 flex-col text-sm font-semibold text-ink-2">
                    New stock item
                    <input name="name" required maxLength={60} placeholder="e.g. Fresh milk" className={`${INPUT} mt-1`} />
                </label>
                <label className="flex flex-col text-sm font-semibold text-ink-2">
                    Unit
                    <select name="unit" defaultValue="pcs" className={`${INPUT} mt-1`}>
                        <option value="pcs">pcs</option>
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="l">l</option>
                    </select>
                </label>
                <label className="flex w-36 flex-col text-sm font-semibold text-ink-2">
                    Warn when below
                    <input name="low_level" inputMode="decimal" placeholder="0" className={`${INPUT} mt-1`} />
                </label>
                <button className="h-11 rounded-xl bg-primary px-5 font-bold text-white">Add</button>
            </form>

            {/* THE LIST */}
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                {list.length === 0 && <p className="p-10 text-center text-ink-2">No stock items yet — add one above</p>}

                {list.map((s) =>
                    editId === String(s.id) ? (
                        // EDIT MODE for this one row
                        <form key={s.id} action={updateStockItem} className="flex flex-wrap items-end gap-3 border-b border-line bg-tint/40 px-5 py-4 last:border-b-0">
                            <input type="hidden" name="id" value={s.id} />
                            <label className="flex min-w-40 flex-1 flex-col text-sm font-semibold text-ink-2">
                                Name
                                <input name="name" required maxLength={60} defaultValue={s.name} className={`${INPUT} mt-1`} />
                            </label>
                            <label className="flex flex-col text-sm font-semibold text-ink-2">
                                Unit
                                <select name="unit" defaultValue={s.unit} className={`${INPUT} mt-1`}>
                                    <option value="pcs">pcs</option>
                                    <option value="g">g</option>
                                    <option value="kg">kg</option>
                                    <option value="ml">ml</option>
                                    <option value="l">l</option>
                                </select>
                            </label>
                            <label className="flex w-36 flex-col text-sm font-semibold text-ink-2">
                                Warn when below
                                <input name="low_level" inputMode="decimal" defaultValue={s.low} className={`${INPUT} mt-1`} />
                            </label>
                            <button className="h-11 rounded-xl bg-primary px-5 font-bold text-white">Save</button>
                            <Link href="/stock" className="flex h-11 items-center rounded-xl px-4 font-semibold text-ink-2 hover:bg-tint">
                                Cancel
                            </Link>
                            <DeleteStockButton name={s.name} />
                            <p className="w-full text-xs text-ink-2">Changing the unit doesn&apos;t convert the amount or recipes. Deleting also removes this item&apos;s stock history.</p>
                        </form>
                    ) : (
                        // NORMAL ROW (same as before, plus an Edit link)
                        <div key={s.id} className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-3 last:border-b-0">
                            <div className="min-w-40 flex-1">
                                <p className="font-semibold">
                                    {s.name}{" "}
                                    <Link href={`/stock?edit=${s.id}`} className="ml-1 text-sm font-semibold text-primary underline">
                                        Edit
                                    </Link>
                                </p>
                                <p className="text-sm text-ink-2">
                                    warn below {s.low} {s.unit}
                                </p>
                            </div>

                            <p className="w-32 text-right text-lg font-bold">
                                {s.qty} <span className="text-sm font-semibold text-ink-2">{s.unit}</span>
                            </p>

                            <span
                                className={`w-16 rounded-full py-0.5 text-center text-xs font-bold uppercase ${s.status === "out" ? "bg-red-50 text-red-700" : s.status === "low" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
                                    }`}
                            >
                                {s.status === "ok" ? "OK" : s.status}
                            </span>

                            <form action={adjustStock} className="flex items-center gap-2">
                                <input type="hidden" name="id" value={s.id} />
                                <input type="hidden" name="name" value={s.name} />
                                <input name="qty" inputMode="decimal" placeholder={s.unit} aria-label={`Amount of ${s.name}`} className={`${INPUT} w-24 text-right`} />
                                <button name="reason" value="delivery" className="h-11 rounded-xl bg-green-700 px-3 text-sm font-bold text-white">
                                    + Receive
                                </button>
                                <button name="reason" value="waste" className="h-11 rounded-xl border border-red-200 px-3 text-sm font-bold text-red-700">
                                    − Waste
                                </button>
                            </form>
                        </div>
                    ),
                )}
            </div>
            {/* OPTIONS THAT CHANGE STOCK (its own server component, loads its own data) */}
            <OptionEffects />
        </div>
    );
}