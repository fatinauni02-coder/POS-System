import {
  Banknote,
  Calendar,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  Clock,
  MousePointerClick,
  Printer,
  QrCode,
  ReceiptText,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { addDays, dayInKL, TZ } from "@/lib/dates";
import { getBusiness } from "@/lib/business";
import { formatRM, toSen } from "@/lib/money";
import { hasManagerPin } from "@/lib/pin";
import { getStaff } from "@/lib/staff";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Loading } from "@/components/loading";
import { RefundButton } from "../receipt/[id]/refund-button";

// "/history" = today's orders. The address remembers what you picked:
//   ?date=2026-10-12  another day      ?f=completed / refunded  status filter
//   ?q=latte          search            ?o=15                    the order shown on the right
export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <Suspense fallback={<Loading />}>
      <History searchParams={searchParams} />
    </Suspense>
  );
}

const METHOD_NAMES: Record<string, string> = { cash: "Cash", card: "Card", duitnow: "DuitNow QR", ewallet: "E-wallet" };
const FILTERS = ["all", "completed", "refunded"] as const;
type Filter = (typeof FILTERS)[number];

type Line = {
  id: number;
  item_name: string;
  quantity: number;
  line_total: number | string;
  options: { name: string }[];
  notes: string | null;
  voided: boolean;
};

async function History({ searchParams }: { searchParams: PageProps<"/history">["searchParams"] }) {
  const params = await searchParams;
  await connection(); // "render this when someone asks" — so new Date() is the real time now
  const today = dayInKL(new Date());
  const day = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const filter: Filter = FILTERS.includes(params.f as Filter) ? (params.f as Filter) : "all";
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const business = await getBusiness();
  if (!business) return <p className="p-6 text-danger">Shop not found</p>;
  const staff = await getStaff();
  const isManager = staff !== null && staff.role !== "staff"; // the Report button is for managers

  // one Malaysian day = from 00:00 (+08:00) to 00:00 the next day
  const { data: orders, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_no, created_at, payment_method, order_type, table_label, customer_name, cashier, note, " +
        "subtotal, discount, discount_pct, sst_amount, sst_rate, rounding, total, status, " +
        "order_items(id, item_name, quantity, line_total, options, notes, voided), qr_orders(ticket_no)",
    )
    .eq("business_id", business.id)
    .in("status", ["completed", "refunded"]) // open table bills and fully voided bills aren't sales
    .gte("created_at", `${day}T00:00:00+08:00`)
    .lt("created_at", `${addDays(day, 1)}T00:00:00+08:00`)
    .order("created_at", { ascending: false }) // newest first
    .order("id", { referencedTable: "order_items" });

  if (error) return <p className="p-6 text-danger">Error: {error.message}</p>;

  // (the select string is built with "+", so tell TypeScript what one row looks like)
  const all = (orders ?? []) as unknown as Order[];
  const items = (o: Order) => o.order_items.filter((l) => !l.voided).reduce((n, l) => n + l.quantity, 0);

  // STATS (refunded orders don't count as sales)
  const paid = all.filter((o) => o.status === "completed");
  const refunds = all.filter((o) => o.status === "refunded");
  const sales = paid.reduce((sum, o) => sum + toSen(o.total), 0);
  const cash = paid.filter((o) => o.payment_method === "cash").reduce((sum, o) => sum + toSen(o.total), 0);
  const dineIn = paid.filter((o) => o.order_type === "dine_in").length;

  // FILTER + SEARCH (order no, table, customer name or item name)
  const needle = q.toLowerCase();
  const list = all.filter((o) => {
    if (filter !== "all" && o.status !== filter) return false;
    if (!needle) return true;
    const hay = `#${o.order_no} ${o.table_label ?? ""} ${o.customer_name ?? ""} ${o.order_items.map((l) => l.item_name).join(" ")}`;
    return hay.toLowerCase().includes(needle);
  });

  // the order on the right: the one picked, or the newest
  const picked = Number(params.o);
  const selected = list.find((o) => o.id === picked) ?? (params.o === "none" ? undefined : list[0]);
  const hasPin = selected ? await hasManagerPin(business.id) : false;

  // build an address that keeps the other choices
  const href = (change: { date?: string; f?: Filter; o?: number | "none" }) => {
    const next = { date: day === today ? undefined : day, f: filter === "all" ? undefined : filter, q: q || undefined, o: selected?.id, ...change };
    if (change.date !== undefined) next.o = undefined; // new day → start on its newest order
    if (next.date === today) next.date = undefined;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v !== undefined && v !== "all") sp.set(k, String(v));
    return `/history${sp.size ? `?${sp}` : ""}`;
  };

  const dayLabel = new Date(`${day}T12:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-MY", { timeZone: TZ, timeStyle: "short" });

  const stats = [
    { label: day === today ? "Today's sales" : "Sales", value: formatRM(sales), Icon: Banknote, sub: `${paid.length} paid · cash ${formatRM(cash)}` },
    { label: "Orders", value: String(all.length), Icon: ReceiptText, sub: `${dineIn} dine-in · ${paid.length - dineIn} takeaway` },
    { label: "Avg ticket", value: formatRM(paid.length ? Math.round(sales / paid.length) : 0), Icon: ChartColumn, sub: "Per paid order" },
    { label: "Refunds", value: String(refunds.length), Icon: RotateCcw, sub: formatRM(refunds.reduce((s, o) => s + toSen(o.total), 0)) },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 lg:flex-row">
      <main className="flex min-w-0 flex-1 flex-col gap-4">
        {/* STATS */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {stats.map(({ label, value, Icon, sub }) => (
            <div key={label} className="card p-4">
              <div className="flex items-center justify-between text-sm font-semibold text-ink-2">
                {label}
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tint text-primary">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="money mt-1 text-2xl font-bold tracking-tight whitespace-nowrap xl:text-[28px]">{value}</p>
              <p className="text-xs text-ink-3">{sub}</p>
            </div>
          ))}
        </div>

        {/* SEARCH · DAY · FILTER */}
        <div className="card flex flex-wrap items-center gap-3 p-3">
          {/* a plain GET form: pressing Enter reloads the page with ?q=… */}
          <form action="/history" className="relative min-w-60 flex-1">
            {day !== today && <input type="hidden" name="date" value={day} />}
            {filter !== "all" && <input type="hidden" name="f" value={filter} />}
            <label>
              <span className="sr-only">Search orders</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ink-3" />
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Search order #, table or item…"
                className="h-12 w-full rounded-xl bg-tint pr-4 pl-12 outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-primary-soft"
              />
            </label>
          </form>

          <div className="flex h-12 items-center rounded-xl bg-tint text-sm font-semibold text-primary">
            <Link href={href({ date: addDays(day, -1) })} aria-label="Previous day" className="press flex h-12 w-10 items-center justify-center rounded-l-xl hover:bg-tint-3">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <span className="flex items-center gap-2 px-1">
              <Calendar className="h-4 w-4" />
              {day === today ? `Today · ${dayLabel}` : dayLabel}
            </span>
            {day !== today ? (
              <Link href={href({ date: addDays(day, 1) })} aria-label="Next day" className="press flex h-12 w-10 items-center justify-center rounded-r-xl hover:bg-tint-3">
                <ChevronRight className="h-5 w-5" />
              </Link>
            ) : (
              <span className="w-3" />
            )}
          </div>

          <div role="tablist" aria-label="Status" className="flex gap-1 rounded-xl bg-tint p-1">
            {FILTERS.map((f) => {
              const n = f === "all" ? all.length : f === "completed" ? paid.length : refunds.length;
              const on = f === filter;
              return (
                <Link
                  key={f}
                  href={href({ f, o: undefined })}
                  role="tab"
                  aria-selected={on}
                  className={`press flex h-10 items-center rounded-lg px-4 text-sm font-semibold ${on ? "bg-primary-soft text-on-primary" : "text-ink-2 hover:bg-tint-3"}`}
                >
                  {f === "all" ? "All" : f === "completed" ? "Completed" : "Refunded"} ({n})
                </Link>
              );
            })}
          </div>

          {/* END-OF-DAY REPORT (managers) — it used to be its own button in the sidebar */}
          {isManager && (
            <Link href={day === today ? "/report" : `/report?date=${day}`} className="btn-soft flex h-12 items-center gap-2 px-4">
              <ChartColumn className="h-5 w-5" />
              Day report
            </Link>
          )}
        </div>

        {/* TABLE */}
        <div className="card overflow-x-auto">
          <table className="w-full text-left">
            <thead className="label-caps bg-tint text-ink-2">
              <tr>
                <th className="px-5 py-3">Order</th>
                <th className="px-3 py-3">Time</th>
                <th className="px-3 py-3">Type</th>
                <th className="hidden px-3 py-3 xl:table-cell">Items</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-right">Payment · status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-ink-3">
                    {q ? "No orders match your search" : "No orders on this day"}
                  </td>
                </tr>
              )}
              {list.map((o) => {
                const on = o.id === selected?.id;
                const refunded = o.status === "refunded";
                const n = items(o);
                // the whole row is a link: each cell holds one (a <tr> can't be a link)
                const cell = (content: React.ReactNode, cls: string) => (
                  <td className="p-0">
                    <Link href={href({ o: o.id })} scroll={false} className={`block ${cls}`}>
                      {content}
                    </Link>
                  </td>
                );
                return (
                  <tr key={o.id} className={on ? "bg-tint shadow-[inset_4px_0_0_var(--color-primary)]" : "hover:bg-canvas"}>
                    {cell(`#${o.order_no}`, `px-5 py-4 text-lg font-bold ${on ? "text-primary" : ""} ${refunded ? "line-through opacity-60" : ""}`)}
                    {cell(time(o.created_at), "money px-3 py-4 text-ink-2")}
                    {cell(
                      <>
                        <span className="block font-semibold">{o.order_type === "dine_in" ? "Dine-in" : "Takeaway"}</span>
                        <span className="text-sm text-ink-3">
                          {o.table_label ? `Table ${o.table_label}` : (o.customer_name ?? "Counter")}
                          {o.qr_orders.length > 0 ? " · QR" : ""}
                        </span>
                      </>,
                      "px-3 py-4",
                    )}
                    <td className="hidden p-0 xl:table-cell">
                      <Link href={href({ o: o.id })} scroll={false} className="money block px-3 py-4 text-ink-2">
                        {n} item{n === 1 ? "" : "s"}
                      </Link>
                    </td>
                    {cell(formatRM(toSen(o.total)), `money px-3 py-4 text-right text-lg font-bold whitespace-nowrap ${refunded ? "text-danger" : ""}`)}
                    {cell(
                      <>
                        <StatusBadge status={o.status} />
                        <span className="mt-1 block text-sm text-ink-2">{METHOD_NAMES[o.payment_method] ?? o.payment_method}</span>
                      </>,
                      "px-5 py-4 text-right",
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* DETAIL (right) */}
      <aside className="card flex shrink-0 flex-col self-start overflow-hidden lg:sticky lg:top-6 lg:w-[340px] xl:w-[400px]">
        {!selected ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-ink-3">
            <MousePointerClick className="h-8 w-8" />
            <p>Select an order to see its details</p>
          </div>
        ) : (
          <Detail order={selected} items={items(selected)} time={time} closeHref={href({ o: "none" })} hasPin={hasPin} />
        )}
      </aside>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return status === "refunded" ? (
    <span className="label-caps rounded-md bg-danger/10 px-2 py-1 text-danger">Refunded</span>
  ) : (
    <span className="label-caps rounded-md bg-success/10 px-2 py-1 text-success">Completed</span>
  );
}

// one order row from the query above
type Order = {
  id: number;
  order_no: number;
  created_at: string;
  payment_method: string;
  order_type: string;
  table_label: string | null;
  customer_name: string | null;
  cashier: string | null;
  note: string | null;
  subtotal: number | string;
  discount: number | string;
  discount_pct: number | string;
  sst_amount: number | string;
  sst_rate: number | string;
  rounding: number | string;
  total: number | string;
  status: string;
  order_items: Line[];
  qr_orders: { ticket_no: number }[];
};

function Detail({
  order: o,
  items,
  time,
  closeHref,
  hasPin,
}: {
  order: Order;
  items: number;
  time: (iso: string) => string;
  closeHref: string;
  hasPin: boolean;
}) {
  const refunded = o.status === "refunded";
  const rounding = toSen(o.rounding);
  const chip = "rounded-lg bg-surface px-3 py-1.5";
  return (
    <>
      <div className="bg-tint p-5">
        <div className="flex items-start gap-3">
          <h2 className="money text-3xl font-bold tracking-tight">#{o.order_no}</h2>
          <span className="mt-2">
            <StatusBadge status={o.status} />
          </span>
          <Link href={closeHref} scroll={false} aria-label="Close" className="press ml-auto rounded-lg p-2 hover:bg-tint-3">
            <X className="h-5 w-5" />
          </Link>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-2">
          <Clock className="h-4 w-4" />
          {time(o.created_at)}
          {o.cashier ? ` · ${o.cashier}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
          <span className={chip}>{o.order_type === "dine_in" ? "Dine-in" : "Takeaway"}</span>
          {o.table_label && <span className={chip}>Table {o.table_label}</span>}
          {o.customer_name && <span className={chip}>{o.customer_name}</span>}
          <span className={chip}>{METHOD_NAMES[o.payment_method] ?? o.payment_method}</span>
          {o.qr_orders.length > 0 && (
            <span className={`${chip} flex items-center gap-1 text-primary`}>
              <QrCode className="h-4 w-4" />
              QR order {o.qr_orders.map((t) => `Q${t.ticket_no}`).join(", ")}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 p-5">
        <p className="label-caps mb-2 text-ink-2">Ordered items ({items})</p>
        <ul className="space-y-3">
          {o.order_items
            .filter((l) => !l.voided)
            .map((l) => (
              <li key={l.id} className="flex gap-3">
                <span className="money flex h-7 min-w-7 items-center justify-center rounded-md bg-tint px-1 text-sm font-bold text-primary">{l.quantity}×</span>
                <div className="flex-1">
                  <p className="font-semibold">{l.item_name}</p>
                  {l.options.map((x) => (
                    <p key={x.name} className="text-sm text-ink-2">
                      • {x.name}
                    </p>
                  ))}
                  {l.notes && <p className="text-sm text-primary italic">&quot;{l.notes}&quot;</p>}
                </div>
                <p className="money font-semibold">{formatRM(toSen(l.line_total))}</p>
              </li>
            ))}
        </ul>
        {o.note && (
          <p className="mt-4 rounded-xl bg-tint p-3 text-sm">
            <b>Kitchen note:</b> {o.note}
          </p>
        )}
        <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
          <Row k="Subtotal" v={formatRM(toSen(o.subtotal))} />
          {toSen(o.discount) > 0 && <Row k={`Discount (${Number(o.discount_pct)}%)`} v={`-${formatRM(toSen(o.discount))}`} />}
          {toSen(o.sst_amount) > 0 && <Row k={`SST (${Number(o.sst_rate)}%)`} v={formatRM(toSen(o.sst_amount))} />}
          {rounding !== 0 && <Row k="Rounding" v={`${rounding < 0 ? "-" : ""}${formatRM(Math.abs(rounding))}`} />}
          <div className="flex items-end justify-between pt-2">
            <dt className="text-lg font-bold">{refunded ? "Refunded" : "Total paid"}</dt>
            <dd className={`money text-[28px] leading-none font-bold ${refunded ? "text-danger line-through" : "text-primary"}`}>{formatRM(toSen(o.total))}</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-2 border-t border-line p-5">
        <Link href={`/receipt/${o.id}`} className="btn-primary flex h-14 items-center justify-center gap-2 text-lg">
          <Printer className="h-5 w-5" />
          View / reprint receipt
        </Link>
        {refunded ? (
          <button type="button" disabled className="btn-soft flex h-12 w-full items-center justify-center gap-2 text-danger">
            <RotateCcw className="h-4 w-4" />
            Already refunded
          </button>
        ) : (
          <RefundButton orderId={o.id} hasPin={hasPin} className="btn-soft flex h-12 w-full items-center justify-center gap-2 text-danger">
            <RotateCcw className="h-4 w-4" />
            Issue refund
          </RefundButton>
        )}
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-2">{k}</dt>
      <dd className="money font-semibold">{v}</dd>
    </div>
  );
}
