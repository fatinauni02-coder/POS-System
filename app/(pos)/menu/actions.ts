"use server";

import { refresh } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { redirect } from "next/navigation";
import { getBusiness } from "@/lib/business";
import { getStaff, requireManager } from "@/lib/staff";

export async function toggleSoldOut(formData: FormData) {
    // any signed-in staff (not only managers) may mark an item sold out — but never someone signed out
    if (!(await getStaff())) throw new Error("Please sign in again.");
    const business = await getBusiness();
    if (!business) throw new Error("Shop not found");

    const id = Number(formData.get("id"));
    const isAvailable = formData.get("available") === "true";

    if (!Number.isInteger(id)) throw new Error("Bad item id");

    const { error } = await supabaseAdmin
        .from("menu_items")
        .update({ is_available: !isAvailable })
        .eq("business_id", business.id) // only THIS shop's item
        .eq("id", id);

    if (error) throw new Error(error.message);

    refresh();
}

export async function saveItem(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) throw new Error ("Shop not found");
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

    const { error } = await supabaseAdmin.from("menu_items").update(values).eq("business_id", business.id).eq("id", id);
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

// ---------- show / hide on the customer QR menu ----------

export async function toggleShowInApp(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) throw new Error("Shop not found");

    const id = Number(formData.get("id"));
    const shown = formData.get("shown") === "true";
    if (!Number.isInteger(id)) throw new Error("Bad item id");

    const { error } = await supabaseAdmin
        .from("menu_items")
        .update({ show_in_app: !shown })
        .eq("business_id", business.id)
        .eq("id", id);
    if (error) throw new Error(error.message);

    refresh();
}


// ---------- item photo (migration 013: Storage bucket "menu-photos") ----------

const PHOTO_BUCKET = "menu-photos";
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png" };

// the browser already shrank the photo (photo-upload.tsx), so it's small; checked again here
export async function uploadItemPhoto(formData: FormData): Promise<string | null> {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) return "Shop not found";

    const id = Number(formData.get("id"));
    const file = formData.get("photo");
    if (!Number.isInteger(id)) return "Bad item id";
    if (!(file instanceof File) || file.size === 0) return "Pick a photo first";
    const ext = PHOTO_TYPES[file.type];
    if (!ext) return "Use a JPG, PNG or WebP photo";
    if (file.size > 1024 * 1024) return "Photo is too big (max 1 MB)";

    // the item must be this shop's; remember the old photo to delete it after
    const { data: item } = await supabaseAdmin
        .from("menu_items")
        .select("id, image_url")
        .eq("business_id", business.id)
        .eq("id", id)
        .maybeSingle();
    if (!item) return "Item not found";

    // a new file name every time, so phones never show an old cached photo
    const path = `${business.id}/${id}-${Date.now()}.${ext}`;
    const { error: upError } = await supabaseAdmin.storage
        .from(PHOTO_BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (upError) {
        console.error("photo upload failed:", upError);
        return "Couldn't upload the photo. Did you run migration 013?";
    }
    const url = supabaseAdmin.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;

    const { error } = await supabaseAdmin.from("menu_items").update({ image_url: url }).eq("business_id", business.id).eq("id", id);
    if (error) return error.message;

    await deleteStoredPhoto(item.image_url); // the old file is not needed any more
    refresh();
    return null;
}

export async function removeItemPhoto(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) throw new Error("Shop not found");

    const id = Number(formData.get("id"));
    if (!Number.isInteger(id)) throw new Error("Bad item id");

    const { data: item } = await supabaseAdmin
        .from("menu_items")
        .select("image_url")
        .eq("business_id", business.id)
        .eq("id", id)
        .maybeSingle();
    if (!item) throw new Error("Item not found");

    const { error } = await supabaseAdmin.from("menu_items").update({ image_url: null }).eq("business_id", business.id).eq("id", id);
    if (error) throw new Error(error.message);

    await deleteStoredPhoto(item.image_url);
    refresh();
}

// delete a photo file — only if it's one of OUR uploads (a link typed by hand is left alone)
async function deleteStoredPhoto(url: string | null) {
    const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
    if (!url || !url.includes(marker)) return;
    const path = decodeURIComponent(url.split(marker)[1]);
    await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([path]);
}
