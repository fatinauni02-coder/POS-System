import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { getBusiness } from "@/lib/business";
import { addDays, dayInKL, TZ } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase-admin";

// "/stock/history" = today's stock changes; "?date=2026-10-12&item=<id>" = another day / one item
export default function StockHistoryPage({ searchParams }: PageProps<"/stock/history">) {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <StockHistory searchParams={searchParams} />
    </Suspense>
  );
}

// how each reason is shown
const REASONS: Record<string, { label: string; color: string }> = {
  delivery: { label: "Delivery", color: "bg-green-50 text-green-700" },
  sale: { label: "Sale", color: "bg-tint text-ink-2" },
  refund: { label: "Refund", color: "bg-blue-50 text-blue-700" },
  waste: { label: "Waste", color: "bg-red-50 text-red-700" },
  void: { label: "Void", color: "bg-red-50 text-red-700" },
  count: { label: "Count", color: "bg-amber-50 text-amber-700" },
};

async function StockHistory({ searchParams }: { searchParams: PageProps<"/stock/history">["searchParams"] }) {
  const params = await searchParams;
  await connection();
  const today = dayInKL(new Date());
  const day = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const itemId = typeof params.item === "string" && params.item ? params.item : null;

  const business = await getBusiness();
  if (!business) return <p className="p-6 text-red-600">Shop not found</p>;

  // build the question step by step: only add the "one item" filter if one was picked
  let query = supabaseAdmin
    .from("stock_movements")
    .select("id, created_at, change, reason, note, order_id, stock_items(name, unit), orders(order_no)")
    .eq("business_id", business.id)
    .gte("created_at", `${day}T00:00:00+08:00`)
    .lt("created_at", `${addDays(day, 1)}T00:00:00+08:00`);
  if (itemId) query = query.eq("stock_item_id", itemId);

  const [{ data: moves, error }, { data: stock }] = await Promise.all([
    query.order("created_at", { ascending: false }),
    supabaseAdmin.from("stock_items").select("id, name").eq("business_id", business.id).order("name"),
  ]);
  if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;

  // keep the item filter when moving between days
  const link = (d: string) => `/stock/history?date=${d}${itemId ? `&item=${itemId}` : ""}`;
  const title = new Date(`${day}T12:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: TZ, dateStyle: "full" });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <Link href="/stock" className="text-sm font-semibold text-primary">
            ‹ Stock
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Stock history</h1>
          <p className="text-sm text-ink-2">{title}</p>
        </div>
        <Link href={link(addDays(day, -1))} className="rounded-xl border border-line bg-surface px-4 py-2 font-semibold">
          ‹ Previous day
        </Link>
        {day !== today && (
          <Link href={link(addDays(day, 1))} className="rounded-xl border border-line bg-surface px-4 py-2 font-semibold">
            Next day ›
          </Link>
        )}
      </div>

      {/* a plain GET form: no action → the browser just opens /stock/history?date=…&item=… */}
      <form className="flex items-end gap-2">
        <input type="hidden" name="date" value={day} />
        <label className="flex flex-col text-sm font-semibold text-ink-2">
          Show
          <select name="item" defaultValue={itemId ?? ""} className="mt-1 h-11 rounded-xl bg-tint px-2 font-semibold">
            <option value="">All stock items</option>
            {(stock ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button className="h-11 rounded-xl bg-primary px-4 font-bold text-white">Show</button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {(moves ?? []).length === 0 && <p className="p-10 text-center text-ink-2">No stock changes on this day</p>}

        {(moves ?? []).map((m) => {
          // nested selects can come back as an object or a list — take the first either way
          const item = Array.isArray(m.stock_items) ? m.stock_items[0] : m.stock_items;
          const order = Array.isArray(m.orders) ? m.orders[0] : m.orders;
          const change = Number(m.change);
          const reason = REASONS[m.reason] ?? { label: m.reason, color: "bg-tint text-ink-2" };
          const time = new Date(m.created_at).toLocaleTimeString("en-MY", { timeZone: TZ, timeStyle: "short" });
          return (
            <div key={m.id} className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-b-0">
              <span className="w-20 text-ink-2">{time}</span>
              <span className="min-w-0 flex-1 font-semibold">{item?.name ?? "?"}</span>
              <span className={`w-20 rounded-full py-0.5 text-center text-xs font-bold ${reason.color}`}>{reason.label}</span>
              {/* the order number links to its receipt */}
              <span className="w-20 text-sm">
                {order && m.order_id ? (
                  <Link href={`/receipt/${m.order_id}`} className="font-semibold text-primary underline">
                    #{order.order_no}
                  </Link>
                ) : (
                  <span className="text-ink-2">—</span>
                )}
              </span>
              <span className={`w-28 text-right font-bold ${change > 0 ? "text-green-700" : "text-red-700"}`}>
                {change > 0 ? "+" : "−"}
                {Math.abs(change)} {item?.unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}