import Link from "next/link";
import { Suspense } from "react";

import { getBusiness } from "@/lib/business";
import { toSen } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { OrderScreenClient } from "./order-screen-client";
import type { TableInfo } from "./order-screen";
import { Loading } from "@/components/loading";

// "/" = the Order screen (the till)
// "/?table=5" = restaurant mode: ordering for table 5 (the cart becomes the next round)
export default function OrderPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<Loading />}>
      <OrderContent searchParams={searchParams} />
    </Suspense>
  );
}

async function OrderContent({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const business = await getBusiness();
  if (!business) return <p className="p-6 text-red-600">Shop not found</p>;

  // RESTAURANT MODE: which table (only when the shop is in restaurant mode)
  // "?bill=123" = an open TAKEAWAY bill (from a QR order), to take the payment
  const { table, bill } = await searchParams;
  const tableLabel = business.service_mode === "restaurant" && typeof table === "string" && table.trim() ? table.trim() : null;
  const billId = typeof bill === "string" && /^\d+$/.test(bill) ? Number(bill) : null;
  let tableInfo: TableInfo | null = null;
  if (billId) {
    tableInfo = await loadTakeawayBill(business.id, billId);
  } else if (tableLabel) {
    tableInfo = await loadTable(business.id, tableLabel);
    if (!tableInfo) {
      return (
        <p className="p-6">
          Table {tableLabel} not found. <Link href="/tables" className="font-semibold text-primary underline">Back to Tables</Link>
        </p>
      );
    }
  }

  // SPEED: ask Supabase all 6 questions AT THE SAME TIME (Promise.all) instead of one after another.
  // Each question is a trip to the database; 6 trips in a row were the main reason this page was slow.
  const [
    { data: categories },
    { data: items, error },
    { data: groups },
    { data: tables },
    { data: recipes },
    { data: stock },
  ] = await Promise.all([
    supabase.from("categories").select("id, name").eq("business_id", business.id).order("sort_order"),
    supabase
      .from("menu_items")
      .select("id, name, price, category_id, is_available, menu_item_option_groups(group_id)")
      .eq("business_id", business.id)
      .order("name"),
    // option groups + their options (e.g. Temperature: Hot / Iced), groups sorted, then options inside each group
    supabase
      .from("option_groups")
      .select("id, name, required, options(id, name, price, sort_order)")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("sort_order", { referencedTable: "options" }),
    // table labels set up for this shop (suggestions for the table box)
    supabase.from("dining_tables").select("label").eq("business_id", business.id).order("label"),
    // recipes + stock are private → secret key (this file runs on the server)
    supabaseAdmin.from("menu_item_recipes").select("menu_item_id, stock_item_id, qty").eq("business_id", business.id),
    supabaseAdmin.from("stock_items").select("id, qty").eq("business_id", business.id),
  ]);
  if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;

  // a Map is a quick "look up by id" table: stock id → amount on hand
  const onHand = new Map((stock ?? []).map((s) => [s.id, Number(s.qty)]));

  // e.g. Latte needs 18 g beans (have 100 → 5) and 200 ml milk (have 8000 → 40) → can make 5
  function leftFor(itemId: number): number | null {
    const lines = (recipes ?? []).filter((r) => r.menu_item_id === itemId);
    if (lines.length === 0) return null; // no recipe = no limit
    return Math.min(...lines.map((r) => Math.floor((onHand.get(r.stock_item_id) ?? 0) / Number(r.qty))));
  }
  const itemsWithLeft = (items ?? []).map((i) => ({ ...i, left: leftFor(i.id) }));
  const sstRate = business.sst_registered ? Number(business.sst_rate) : 0;

  // key = a fresh screen (and its own saved cart) for each table, and for the counter
  return (
    <OrderScreenClient
      key={billId ? `bill-${billId}` : (tableLabel ?? "counter")}
      categories={categories ?? []}
      items={itemsWithLeft}
      groups={groups ?? []}
      sstRate={sstRate}
      tables={(tables ?? []).map((t) => t.label)}
      tableInfo={tableInfo}
    />
  );
}

// one line already sent to the kitchen, as saved by send_round (migration 010)
type SentRow = {
  id: number;
  item_name: string;
  quantity: number;
  line_total: number | string;
  options: { name: string }[];
  notes: string | null;
  round: number;
  voided: boolean;
};

// the table + its open bill (null = no such table)
async function loadTable(businessId: string, label: string): Promise<TableInfo | null> {
  const { data: tab } = await supabase
    .from("dining_tables")
    .select("id, label")
    .eq("business_id", businessId)
    .eq("label", label)
    .eq("is_active", true)
    .maybeSingle();
  if (!tab) return null;

  // bills are private (RLS) → secret key; lines in the order they were sent
  const { data: bill } = await supabaseAdmin
    .from("orders")
    .select(BILL_SELECT)
    .eq("business_id", businessId)
    .eq("table_id", tab.id)
    .eq("status", "open")
    .order("id", { referencedTable: "order_items" })
    .maybeSingle();

  return { label: tab.label, bill: toBill(bill) };
}

// a TAKEAWAY bill opened by an accepted QR order: pay only (no more rounds), then back to the QR board
async function loadTakeawayBill(businessId: string, orderId: number): Promise<TableInfo> {
  const [{ data: bill }, { data: qr }] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select(`${BILL_SELECT}, customer_name`)
      .eq("business_id", businessId)
      .eq("id", orderId)
      .eq("order_type", "takeaway")
      .eq("status", "open")
      .order("id", { referencedTable: "order_items" })
      .maybeSingle(),
    // the phone order that opened this bill → "Collected" button after paying
    supabaseAdmin.from("qr_orders").select("id").eq("business_id", businessId).eq("order_id", orderId).maybeSingle(),
  ]);

  return {
    label: "",
    title: bill ? `Takeaway · ${bill.customer_name ?? `#${bill.order_no}`}` : "Takeaway",
    canAdd: false,
    backHref: "/qr",
    backLabel: "QR orders",
    qrId: qr?.id ?? null,
    bill: toBill(bill),
  };
}

const BILL_SELECT = "id, order_no, subtotal, order_items(id, item_name, quantity, line_total, options, notes, round, voided)";

type BillRow = { id: number; order_no: number; subtotal: number | string; order_items: unknown };

// database row → what the Order screen needs (null = no open bill)
function toBill(bill: BillRow | null): TableInfo["bill"] {
  return bill
      ? {
          id: bill.id,
          orderNo: bill.order_no,
          subtotalSen: toSen(bill.subtotal),
          lines: (bill.order_items as SentRow[]).map((l) => ({
            id: l.id,
            name: l.item_name,
            qty: l.quantity,
            lineSen: toSen(l.line_total),
            options: l.options.map((o) => o.name),
            note: l.notes,
            round: l.round,
            voided: l.voided,
          })),
        }
      : null;
}