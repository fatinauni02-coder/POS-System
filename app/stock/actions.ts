"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getBusiness } from "@/lib/business";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireManager } from "@/lib/staff";

// back to /stock with a green (msg) or red (error) message
function back(kind: "msg" | "error", text: string): never {
    revalidatePath("/stock");
    redirect(`/stock?${kind}=${encodeURIComponent(text)}`);
}

// "12.5" → 12.5 ; anything else (empty, letters, negative, too many decimals) → null
function amount(value: FormDataEntryValue | null) {
    const text = String(value ?? "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    const n = Number(text);
    return n > 0 && n <= 100000 ? n : null;
}

const UNITS = ["pcs", "g", "kg", "ml", "l"];

export async function addStockItem(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) back("error", "Shop not found");

    const name = String(formData.get("name") ?? "").trim().slice(0, 60);
    const unit = String(formData.get("unit") ?? "");
    const lowText = String(formData.get("low_level") ?? "").trim();
    const lowLevel = lowText === "" ? 0 : amount(lowText);

    if (!name) back("error", "Give the stock item a name");
    if (!UNITS.includes(unit)) back("error", "Pick a unit");
    if (lowLevel === null) back("error", "Low level must be a number like 500 or 2.5");

    const { error } = await supabaseAdmin.from("stock_items").insert({ business_id: business.id, name, unit, low_level: lowLevel });
    if (error) back("error", error.code === "23505" ? `"${name}" already exists` : error.message);
    back("msg", `Added ${name}. Now receive the first delivery.`);
}

// one form, two buttons: the button you press decides the reason ("delivery" or "waste")
export async function adjustStock(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) back("error", "Shop not found");

    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "");
    const reason = String(formData.get("reason") ?? "");
    const qty = amount(formData.get("qty"));
    if (qty === null) back("error", `Type how much ${name} first (e.g. 500)`);
    if (reason !== "delivery" && reason !== "waste") back("error", "Unknown action");

    // migration 008: changes the amount AND writes the history, in one step
    const { error } = await supabaseAdmin.rpc("adjust_stock", {
        p_business_id: business.id,
        p_stock_item_id: id,
        p_change: reason === "delivery" ? qty : -qty, // waste takes away
        p_reason: reason,
    });
    if (error) back("error", error.message === "NOT_ENOUGH" ? `Not that much ${name} in stock` : error.message);
    back("msg", reason === "delivery" ? `Received ${qty} of ${name}` : `Wasted ${qty} of ${name}`);
}


// ---------- options that change stock (oat milk swap, extras) ----------

export async function addOptionEffect(formData: FormData) {
    await requireManager(); // owners/managers only
  const business = await getBusiness();
  if (!business) back("error", "Shop not found");

  const optionId = String(formData.get("option_id") ?? "");
  const stockId = String(formData.get("stock_item_id") ?? "");
  const replacesId = String(formData.get("replaces_stock_item_id") ?? "") || null; // "" → null = extra
  const qtyText = String(formData.get("qty") ?? "").trim();

  if (replacesId === stockId) back("error", "Pick two different stock items for a swap");
  const qty = replacesId ? null : amount(qtyText); // a swap uses the recipe's amount; an extra needs its own
  if (!replacesId && qty === null) back("error", "An extra needs an amount, e.g. 150");

  // everything must belong to THIS shop (the ids came from the browser)
  const stockIds = replacesId ? [stockId, replacesId] : [stockId];
  const [{ data: option }, { data: stock }] = await Promise.all([
    supabaseAdmin.from("options").select("id").eq("business_id", business.id).eq("id", optionId).maybeSingle(),
    supabaseAdmin.from("stock_items").select("id").eq("business_id", business.id).in("id", stockIds),
  ]);
  if (!option || (stock ?? []).length !== stockIds.length) back("error", "Option or stock item not found");

  const { error } = await supabaseAdmin.from("option_stock_effects").insert({
    business_id: business.id,
    option_id: optionId,
    stock_item_id: stockId,
    replaces_stock_item_id: replacesId,
    qty,
  });
  if (error) back("error", error.message);
  back("msg", "Rule added");
}

export async function removeOptionEffect(formData: FormData) {
    await requireManager(); // owners/managers only
  const business = await getBusiness();
  if (!business) back("error", "Shop not found");

  const { error } = await supabaseAdmin
    .from("option_stock_effects")
    .delete()
    .eq("business_id", business.id)
    .eq("id", String(formData.get("id") ?? ""));
  if (error) back("error", error.message);
  back("msg", "Rule removed");
}