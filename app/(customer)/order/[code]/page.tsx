import { connection } from "next/server";
import { Suspense } from "react";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { CustomerMenu } from "./customer-menu";

// "/order/<code>" = the page a customer opens by scanning a QR code.
// <code> = a table's random qr_code (dine-in or takeaway) or the shop's takeaway_qr_code (takeaway only).
export default function QrOrderPage({ params }: PageProps<"/order/[code]">) {
    return (
        <Suspense fallback={<p className="p-6">Loading menu…</p>}>
            <QrOrder params={params} />
        </Suspense>
    );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// a friendly full-page message (bad code, paused…)
function Message({ title, text }: { title: string; text: string }) {
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-8 text-center">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-ink-2">{text}</p>
        </div>
    );
}

async function QrOrder({ params }: { params: PageProps<"/order/[code]">["params"] }) {
    await connection(); // menu + sold-out right now
    const { code } = await params;
    if (!UUID.test(code)) return <Message title="QR code not found" text="Please ask the staff for help." />;

    // which shop + table is this code? (secret key on the server; the customer only ever sees the code)
    const [{ data: table }, { data: counter }] = await Promise.all([
        supabaseAdmin.from("dining_tables").select("id, label, business_id").eq("qr_code", code).eq("is_active", true).maybeSingle(),
        supabaseAdmin.from("businesses").select("id").eq("takeaway_qr_code", code).maybeSingle(),
    ]);
    const businessId = table?.business_id ?? counter?.id;
    if (!businessId) return <Message title="QR code not found" text="Please ask the staff for help." />;

    const { data: shop } = await supabaseAdmin
        .from("businesses")
        .select("name, tagline, sst_registered, sst_rate, qr_ordering")
        .eq("id", businessId)
        .single();
    if (!shop) return <Message title="QR code not found" text="Please ask the staff for help." />;
    if (!shop.qr_ordering) return <Message title={shop.name} text="Ordering by QR is paused right now. Please order at the counter." />;

    // the menu (same data as the staff Order screen) + stock, to grey out what can't be made
    const [{ data: categories }, { data: items }, { data: groups }, { data: recipes }, { data: stock }] = await Promise.all([
        supabaseAdmin.from("categories").select("id, name").eq("business_id", businessId).order("sort_order"),
        supabaseAdmin
            .from("menu_items")
            .select("id, name, price, category_id, is_available, show_in_app, menu_item_option_groups(group_id)")
            .eq("business_id", businessId)
            .order("name"),
        supabaseAdmin
            .from("option_groups")
            .select("id, name, required, options(id, name, price, sort_order)")
            .eq("business_id", businessId)
            .order("sort_order")
            .order("sort_order", { referencedTable: "options" }),
        supabaseAdmin.from("menu_item_recipes").select("menu_item_id, stock_item_id, qty").eq("business_id", businessId),
        supabaseAdmin.from("stock_items").select("id, qty").eq("business_id", businessId),
    ]);

    // sold out = switched off on the Menu, or a recipe ingredient has run out (no numbers shown to customers)
    const onHand = new Map((stock ?? []).map((s) => [s.id, Number(s.qty)]));
    function canMake(itemId: number) {
        return (recipes ?? [])
            .filter((r) => r.menu_item_id === itemId)
            .every((r) => (onHand.get(r.stock_item_id) ?? 0) >= Number(r.qty));
    }
    const menu = (items ?? [])
        .filter((i) => i.show_in_app !== false)
        .map((i) => ({ ...i, is_available: i.is_available && canMake(i.id), left: null }));

    return (
        <CustomerMenu
            code={code}
            shopName={shop.name}
            tagline={shop.tagline}
            tableLabel={table?.label ?? null}
            sstRate={shop.sst_registered ? Number(shop.sst_rate) : 0}
            categories={categories ?? []}
            items={menu}
            groups={groups ?? []}
        />
    );
}
