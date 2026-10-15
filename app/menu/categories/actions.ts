"use server";

import { redirect } from "next/navigation";
import { getBusiness } from "@/lib/business";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PAGE = "/menu/categories";

// a mistake the user can fix → back to the page with a message (instead of an error screen)
function fail(message: string): never {
    redirect(`${PAGE}?error=${encodeURIComponent(message)}`);
}

// small helpers shared by the 3 actions below
async function shopId() {
    const business = await getBusiness();
    if (!business) throw new Error("Shop not found");
    return business.id;
}

function readName(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) fail("Category name is required");
    if (name.length > 30) fail("Category name is too long (max 30)");
    return name;
}

function readStation(formData: FormData) {
    const station = String(formData.get("station") ?? "");
    if (station !== "bar" && station !== "kitchen") fail("Pick Bar or Kitchen");
    return station;
}

export async function addCategory(formData: FormData) {
    const businessId = await shopId();
    const name = readName(formData);
    const station = readStation(formData);

    // count the shop's categories, so the new one goes at the end of the list
    const { count } = await supabaseAdmin
        .from("categories")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId);

    const { error } = await supabaseAdmin
        .from("categories")
        .insert({ business_id: businessId, name, station, sort_order: (count ?? 0) + 1 });
    if (error) {
        // 23505 = Postgres "this name already exists" (unique (business_id, name))
        if (error.code === "23505") fail(`"${name}" already exists`);
        throw new Error(error.message); // anything else = a real bug → error screen is fine
    }

    redirect(PAGE); // clean address = no old error message
}

export async function updateCategory(formData: FormData) {
    const businessId = await shopId();
    const id = String(formData.get("id") ?? "");
    const name = readName(formData);
    const station = readStation(formData);

    const { error } = await supabaseAdmin
        .from("categories")
        .update({ name, station })
        .eq("business_id", businessId)
        .eq("id", id);
    if (error) {
        if (error.code === "23505") fail(`"${name}" already exists`);
        throw new Error(error.message);
    }

    redirect(PAGE);
}

export async function deleteCategory(formData: FormData) {
    const businessId = await shopId();
    const id = String(formData.get("id") ?? "");

    // its items are NOT deleted: the database sets their category to empty ("No category")
    const { error } = await supabaseAdmin.from("categories").delete().eq("business_id", businessId).eq("id", id);
    if (error) throw new Error(error.message);

    redirect(PAGE);
}
