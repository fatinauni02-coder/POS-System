import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// a QR code looks like 3f2b8c1e-…-… (a "UUID")
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/v1/menu?code=<qr code>
export async function GET(request: NextRequest) {
    // 1. read ?code=… from the address
    const code = request.nextUrl.searchParams.get("code");
    if (!code || !UUID.test(code)) {
        return Response.json({ error: "BAD_CODE", message: "That isn't a valid QR code." }, { status: 400 });
    }

    // 2. is it a TABLE's QR, or the shop's TAKEAWAY (counter) QR? Ask both at the same time
    const [{ data: table }, { data: counter }] = await Promise.all([
        supabaseAdmin.from("dining_tables").select("label, business_id").eq("qr_code", code).eq("is_active", true).maybeSingle(),
        supabaseAdmin.from("businesses").select("id").eq("takeaway_qr_code", code).maybeSingle(),
    ]);
    const businessId = table?.business_id ?? counter?.id;
    if (!businessId) {
        return Response.json({ error: "QR_NOT_FOUND", message: "QR code not found." }, { status: 404 });
    }

    // 3b. the menu: categories, items, option groups + stock (all at the same time)
    const [{ data: categories }, { data: items }, { data: groups }, { data: recipes }, { data: stock }] = await Promise.all([
        supabaseAdmin.from("categories").select("id, name").eq("business_id", businessId).order("sort_order"),
        supabaseAdmin
            .from("menu_items")
            .select("id, name, description, image_url, price, category_id, is_available, show_in_app, menu_item_option_groups(group_id)")
            .eq("business_id", businessId)
            .order("name"),
        supabaseAdmin
            .from("option_groups")
            .select("id, name, required, max_select, options(id, name, price, sort_order)")
            .eq("business_id", businessId)
            .order("sort_order")
            .order("sort_order", { referencedTable: "options" }),
        supabaseAdmin.from("menu_item_recipes").select("menu_item_id, stock_item_id, qty").eq("business_id", businessId),
        supabaseAdmin.from("stock_items").select("id, qty").eq("business_id", businessId),
    ]);

    // sold out = switched off on the Menu page, OR not enough stock to make one
    const onHand = new Map((stock ?? []).map((s) => [s.id, Number(s.qty)]));
    const canMake = (itemId: number) =>
        (recipes ?? []).filter((r) => r.menu_item_id === itemId).every((r) => (onHand.get(r.stock_item_id) ?? 0) >= Number(r.qty));

    // 3. the shop's details
    const { data: shop } = await supabaseAdmin
        .from("businesses")
        .select("name, tagline, logo_url, theme, sst_registered, sst_rate, qr_ordering")
        .eq("id", businessId)
        .single();
    if (!shop) {
        return Response.json({ error: "QR_NOT_FOUND", message: "QR code not found." }, { status: 404 });
    }

    // 4. the answer (200 OK is the default)
    return Response.json({
        shop: {
            name: shop.name,
            tagline: shop.tagline,
            logoUrl: shop.logo_url,
            theme: shop.theme,
            sstRate: shop.sst_registered ? Number(shop.sst_rate) : 0,
            acceptingOrders: shop.qr_ordering,
        },
        table: table ? { label: table.label } : null,
        orderTypes: table ? ["dine_in", "takeaway"] : ["takeaway"],
        categories: categories ?? [],
        items: (items ?? [])
            .filter((i) => i.show_in_app !== false) // hidden from the customer app (Menu → Show in customer app)
            .map((i) => ({
                id: i.id,
                name: i.name,
                description: i.description,
                imageUrl: i.image_url,
                priceSen: Math.round(Number(i.price) * 100), // money in sen: RM 8.00 = 800 (no rounding mistakes)
                categoryId: i.category_id,
                available: i.is_available && canMake(i.id),
                optionGroupIds: i.menu_item_option_groups.map((g) => g.group_id),
            })),
        optionGroups: (groups ?? []).map((g) => ({
            id: g.id,
            name: g.name,
            required: g.required, // true = must pick one (e.g. Hot / Iced)
            maxSelect: g.max_select,
            options: g.options.map((o) => ({ id: o.id, name: o.name, priceSen: Math.round(Number(o.price) * 100) })),
        })),
    });
}