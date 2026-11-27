"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBusiness } from "@/lib/business";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireManager } from "@/lib/staff";

const PAGE = "/merchant/tables";

// back to /tables with a toast
function back(kind: "msg" | "error", text: string): never {
    revalidatePath(PAGE);
    redirect(`${PAGE}?${kind}=${encodeURIComponent(text)}&t=${Date.now()}`);
}

export async function addTable(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) back("error", "Shop not found");

    const label = String(formData.get("label") ?? "").trim();
    if (!label) back("error", "Type a table name, e.g. 5 or Patio 1");
    if (label.length > 20) back("error", "Table name is too long (max 20)");

    // new table goes at the end of the list
    const { count } = await supabaseAdmin
        .from("dining_tables")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id);

    const { error } = await supabaseAdmin
        .from("dining_tables")
        .insert({ business_id: business.id, label, sort_order: (count ?? 0) + 1 });
    if (error) back("error", error.code === "23505" ? `Table ${label} already exists` : error.message);
    back("msg", `Added table ${label}`);
}

export async function deleteTable(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) back("error", "Shop not found");

    const id = String(formData.get("id") ?? "");
    const label = String(formData.get("label") ?? "");

    // never remove a table while people are eating there
    const { count } = await supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .eq("table_id", id)
        .eq("status", "open");
    if ((count ?? 0) > 0) back("error", `Table ${label} has an open bill. Pay or void it first.`);

    const { error } = await supabaseAdmin.from("dining_tables").delete().eq("business_id", business.id).eq("id", id);
    if (error) back("error", error.message);
    back("msg", `Removed table ${label}`);
}