"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getBusiness } from "@/lib/business";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireManager } from "@/lib/staff";

// back to /menu/options with a green (msg) or red (error) message
function back(kind: "msg" | "error", text: string): never {
  revalidatePath("/menu/options");
  revalidatePath("/"); // the Order screen shows these options too
  redirect(`/menu/options?${kind}=${encodeURIComponent(text)}`);
}

// Postgres error 23505 = duplicate name
function nameError(error: { code?: string; message: string }, name: string) {
  return error.code === "23505" ? `"${name}" already exists` : error.message;
}

async function shopId() {
  const business = await getBusiness();
  if (!business) back("error", "Shop not found");
  return business.id;
}

// ---------- groups (Temperature, Milk…) ----------

export async function addGroup(formData: FormData) {
    await requireManager(); // owners/managers only
  const businessId = await shopId();
  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  const required = formData.get("required") === "on"; // checkbox
  if (!name) back("error", "Give the group a name");

  const { error } = await supabaseAdmin.from("option_groups").insert({ business_id: businessId, name, required, max_select: 1 });
  if (error) back("error", nameError(error, name));
  back("msg", `Added ${name}. Now add its choices.`);
}

export async function toggleRequired(formData: FormData) {
    await requireManager(); // owners/managers only
  const businessId = await shopId();
  const { error } = await supabaseAdmin
    .from("option_groups")
    .update({ required: formData.get("required") !== "true" }) // flip it
    .eq("business_id", businessId)
    .eq("id", String(formData.get("id") ?? ""));
  if (error) back("error", error.message);
  back("msg", "Saved");
}

export async function deleteGroup(formData: FormData) {
    await requireManager(); // owners/managers only
  const businessId = await shopId();
  // its options, item links and stock rules are deleted with it (on delete cascade);
  // old orders keep their own copy of the options, so receipts don't change
  const { error } = await supabaseAdmin
    .from("option_groups")
    .delete()
    .eq("business_id", businessId)
    .eq("id", String(formData.get("id") ?? ""));
  if (error) back("error", error.message);
  back("msg", `Deleted ${String(formData.get("name") ?? "group")}`);
}

// ---------- choices inside a group (Hot, Iced +1.00…) ----------

export async function addOption(formData: FormData) {
    await requireManager(); // owners/managers only
  const businessId = await shopId();
  const groupId = String(formData.get("group_id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  const priceText = String(formData.get("price") ?? "").trim() || "0"; // empty = free
  if (!name) back("error", "Give the choice a name");
  if (!/^\d+(\.\d{1,2})?$/.test(priceText) || Number(priceText) > 1000) back("error", "Extra price must look like 1.00 (or empty for free)");

  // the group must belong to this shop; count its options to put the new one last
  const { data: group } = await supabaseAdmin
    .from("option_groups")
    .select("id, options(id)")
    .eq("business_id", businessId)
    .eq("id", groupId)
    .maybeSingle();
  if (!group) back("error", "Group not found");

  const { error } = await supabaseAdmin.from("options").insert({
    business_id: businessId,
    group_id: groupId,
    name,
    price: Number(priceText),
    sort_order: (group.options?.length ?? 0) + 1,
  });
  if (error) back("error", nameError(error, name));
  back("msg", `Added ${name}`);
}

export async function removeOption(formData: FormData) {
    await requireManager(); // owners/managers only
  const businessId = await shopId();
  const { error } = await supabaseAdmin
    .from("options")
    .delete()
    .eq("business_id", businessId)
    .eq("id", String(formData.get("id") ?? ""));
  if (error) back("error", error.message);
  back("msg", `Removed ${String(formData.get("name") ?? "choice")}`);
}