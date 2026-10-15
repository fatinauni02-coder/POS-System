"use server";

import { refresh } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { redirect } from "next/navigation";
import { getBusiness } from "@/lib/business";
import { requireManager } from "@/lib/staff";

export async function toggleSoldOut(formData: FormData) {
    const id = Number(formData.get("id"));
    const isAvailable = formData.get("available") === "true";

    if (!Number.isInteger(id)) throw new Error("Bad item id");

    const { error } = await supabaseAdmin
        .from("menu_items")
        .update({ is_available: !isAvailable })
        .eq("id", id); // w/o eq it would change all items in the table, not just the one with the given id

    if (error) throw new Error(error.message);

    refresh();
}

export async function saveItem(formData: FormData) {
    await requireManager(); // owners/managers only
    const idText = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const price = Number(formData.get("price"));
    const description = String(formData.get("description") ?? "").trim();
    const categoryId = String(formData.get("category_id") ?? "") || null;

    // never trust the browser: check everything again on the server
    if (!name) throw new Error("Item name is required");
    if (!(price > 0)) throw new Error("Price must be more than RM 0");

    const values = { name, price, description: description || null, category_id: categoryId };

    // no id = a NEW item → insert
    if (idText === "") {
        const business = await getBusiness();
        if (!business) throw new Error("Shop not found");

        const { data, error } = await supabaseAdmin
            .from("menu_items")
            .insert({ ...values, business_id: business.id })
            .select("id")
            .single();

        if (error) throw new Error(error.message);
        redirect(`/menu?item=${data.id}`); // open the new item in the editor
    }

    // has an id = an existing item → update
    const id = Number(idText);
    if (!Number.isInteger(id)) throw new Error("Bad item id");

    const { error } = await supabaseAdmin.from("menu_items").update(values).eq("id", id);
    if (error) throw new Error(error.message);

    refresh();
}

export async function deleteItem(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) throw new Error("Shop not found");

    const id = Number(formData.get("id"));
    if (!Number.isInteger(id)) throw new Error("Bad item id");

    const { error } = await supabaseAdmin
        .from("menu_items")
        .delete()
        .eq("business_id", business.id) // only ever this shop's item
        .eq("id", id);
    if (error) throw new Error(error.message);

    redirect("/menu"); // the item is gone, so close the editor
}



// ---------- recipes: how much stock 1 sold item uses ----------

// check that the menu item AND the stock item both belong to this shop
async function checkOwnership(businessId: string, menuItemId: number, stockItemId: string) {
    const [{ data: item }, { data: stock }] = await Promise.all([
        supabaseAdmin.from("menu_items").select("id").eq("business_id", businessId).eq("id", menuItemId).maybeSingle(),
        supabaseAdmin.from("stock_items").select("id").eq("business_id", businessId).eq("id", stockItemId).maybeSingle(),
    ]);
    if (!item || !stock) throw new Error("Item or stock not found");
}

export async function saveRecipeLine(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) throw new Error("Shop not found");

    const menuItemId = Number(formData.get("menu_item_id"));
    const stockItemId = String(formData.get("stock_item_id") ?? "");
    const qtyText = String(formData.get("qty") ?? "").trim();
    if (!Number.isInteger(menuItemId)) throw new Error("Bad item id");
    if (!/^\d+(\.\d{1,3})?$/.test(qtyText) || !(Number(qtyText) > 0)) throw new Error("Amount must be a number like 18 or 0.5");

    await checkOwnership(business.id, menuItemId, stockItemId);

    // upsert: add the line, or change the amount if this stock item is already in the recipe
    const { error } = await supabaseAdmin
        .from("menu_item_recipes")
        .upsert({ menu_item_id: menuItemId, stock_item_id: stockItemId, business_id: business.id, qty: Number(qtyText) });
    if (error) throw new Error(error.message);

    refresh();
}

export async function removeRecipeLine(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) throw new Error("Shop not found");

    const { error } = await supabaseAdmin
        .from("menu_item_recipes")
        .delete()
        .eq("business_id", business.id)
        .eq("menu_item_id", Number(formData.get("menu_item_id")))
        .eq("stock_item_id", String(formData.get("stock_item_id") ?? ""));
    if (error) throw new Error(error.message);

    refresh();
}



// ---------- which option groups an item uses ----------

export async function setItemGroups(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) throw new Error("Shop not found");

    const menuItemId = Number(formData.get("menu_item_id"));
    // getAll = every ticked checkbox called "group_id" (unticked ones send nothing)
    const groupIds = formData.getAll("group_id").map(String);
    if (!Number.isInteger(menuItemId)) throw new Error("Bad item id");

    // the item and every ticked group must belong to this shop
    const { data: item } = await supabaseAdmin
        .from("menu_items")
        .select("id")
        .eq("business_id", business.id)
        .eq("id", menuItemId)
        .maybeSingle();
    if (!item) throw new Error("Item not found");
    if (groupIds.length > 0) {
        const { data: groups } = await supabaseAdmin
            .from("option_groups")
            .select("id")
            .eq("business_id", business.id)
            .in("id", groupIds);
        if ((groups ?? []).length !== groupIds.length) throw new Error("Option group not found");
    }

    // simplest way to "make the links match the ticks": remove all, then add the ticked ones
    const { error: delError } = await supabaseAdmin
        .from("menu_item_option_groups")
        .delete()
        .eq("business_id", business.id)
        .eq("menu_item_id", menuItemId);
    if (delError) throw new Error(delError.message);

    if (groupIds.length > 0) {
        const { error } = await supabaseAdmin.from("menu_item_option_groups").insert(
            groupIds.map((groupId, i) => ({ menu_item_id: menuItemId, group_id: groupId, business_id: business.id, sort_order: i + 1 })),
        );
        if (error) throw new Error(error.message);
    }

    refresh();
}