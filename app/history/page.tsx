import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { addDays, dayInKL, TZ } from "@/lib/dates";
import { getBusiness } from "@/lib/business";
import { formatRM, toSen } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase-admin";

// "/history" = today's orders; "/history?date=2026-10-12" = another day
export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <History searchParams={searchParams} />
    </Suspense>
  );
}

const METHOD_NAMES: Record<string, string> = { cash: "Cash", card: "Card", duitnow: "DuitNow QR", ewallet: "E-wallet" };

async function History({ searchParams }: { searchParams: PageProps<"/history">["searchParams"] }) {
  const params = await searchParams;
  await connection(); // "render this when someone asks" — so new Date() is the real time now
  const today = dayInKL(new Date());
  const day = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

  const business = await getBusiness();
  if (!business) return <p className="p-6 text-red-600">Shop not found</p>;

  // one Malaysian day = from 00:00 (+08:00) to 00:00 the next day
  const { data: orders, error } = await supabaseAdmin
    .from("orders")
    .select("id, order_no, created_at, payment_method, total, status, order_items(quantity)")
    .eq("business_id", business.id)
    .gte("created_at", `${day}T00:00:00+08:00`)
    .lt("created_at", `${addDays(day, 1)}T00:00:00+08:00`)
    .order("created_at", { ascending: false }); // newest first

  if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;

  const list = orders ?? [];
  const paid = list.filter((o) => o.status === "completed"); // refunded orders don't count as sales
  const sales = paid.reduce((sum, o) => sum + toSen(o.total), 0);
  const cash = paid.filter((o) => o.payment_method === "cash").reduce((sum, o) => sum + toSen(o.total), 0);

  const title = new Date(`${day}T12:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: TZ, dateStyle: "full" });

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* HEADER: title on the left, day buttons on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold tracking-tight">Order history</h1>
          <p className="text-sm text-ink-2">{title}</p>
        </div>
        <Link href={`/history?date=${addDays(day, -1)}`} className="rounded-xl border border-line bg-surface px-4 py-2 font-semibold">
          ‹ Previous day
        </Link>
        {day !== today && (
          <>
            <Link href={`/history?date=${addDays(day, 1)}`} className="rounded-xl border border-line bg-surface px-4 py-2 font-semibold">
              Next day ›
            </Link>
            <Link href="/history" className="rounded-xl bg-primary px-4 py-2 font-semibold text-white">
              Today
            </Link>
          </>
        )}
      </div>

      {/* SUMMARY: 4 boxes in a row */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Orders" value={String(paid.length)} />
        <Stat label="Sales" value={formatRM(sales)} />
        <Stat label="Cash" value={formatRM(cash)} />
        <Stat label="Card / QR / e-wallet" value={formatRM(sales - cash)} />
      </div>

      {/* ORDER LIST */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {list.length === 0 && <p className="p-10 text-center text-ink-2">No orders on this day</p>}

        {list.map((o) => {
          const items = o.order_items.reduce((n, l) => n + l.quantity, 0);
          const time = new Date(o.created_at).toLocaleTimeString("en-MY", { timeZone: TZ, timeStyle: "short" });
          return (
            // each row opens the receipt; border-b = line between rows
            <Link
              key={o.id}
              href={`/receipt/${o.id}`}
              className={`flex items-center gap-4 border-b border-line px-5 py-3 last:border-b-0 hover:bg-tint ${
                o.status === "refunded" ? "opacity-60" : ""
              }`}
            >
              <span className="w-20 text-ink-2">{time}</span>
              <span className="w-20 font-bold">#{o.order_no}</span>
              <span className="flex-1 text-ink-2">
                {items} item{items === 1 ? "" : "s"}
              </span>
              <span className="w-28 text-ink-2">{METHOD_NAMES[o.payment_method] ?? o.payment_method}</span>
              {o.status === "refunded" && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 uppercase">Refunded</span>
              )}
              <span className={`w-24 text-right font-bold ${o.status === "refunded" ? "line-through" : ""}`}>
                {formatRM(toSen(o.total))}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// one summary box: small label on top, big number below
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}