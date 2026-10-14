import { Suspense } from "react";

import { getBusiness } from "@/lib/business";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
//import { OrderScreen } from "./order-screen";
import { OrderScreenClient } from "./order-screen-client";

// "/" = the Order screen (the till)
export default function OrderPage() {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <OrderContent />
    </Suspense>
  );
}

async function OrderContent() {
  const business = await getBusiness();
  if (!business) return <p className="p-6 text-red-600">Shop not found</p>;

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("business_id", business.id)
    .order("sort_order");

  const { data: items, error } = await supabase
    .from("menu_items")
    .select("id, name, price, category_id, is_available, menu_item_option_groups(group_id)")
    .eq("business_id", business.id)
    .order("name");

  // option groups + their options (e.g. Temperature: Hot / Iced)
  const { data: groups } = await supabase
    .from("option_groups")
    .select("id, name, required, options(id, name, price, sort_order)")
    .eq("business_id", business.id)
    .order("sort_order")
    .order("sort_order", { referencedTable: "options" }); // sort the groups, then sort the options within each group

  if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;
  // table labels set up for this shop (suggestions for the table box); public data → anon key
  const { data: tables } = await supabase.from("dining_tables").select("label").eq("business_id", business.id).order("label");

  // SST only if the shop is registered (6% in Malaysia for F&B)
  // ---------- how many of each item the stock can still make ----------
  // recipes + stock are private → read them with the secret key (this file runs on the server)
  const [{ data: recipes }, { data: stock }] = await Promise.all([
    supabaseAdmin.from("menu_item_recipes").select("menu_item_id, stock_item_id, qty").eq("business_id", business.id),
    supabaseAdmin.from("stock_items").select("id, qty").eq("business_id", business.id),
  ]);
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

  return <OrderScreenClient categories={categories ?? []} items={itemsWithLeft} groups={groups ?? []} sstRate={sstRate} tables={(tables ??[]).map((t) => t.label)} />;
}