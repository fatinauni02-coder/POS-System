import { cache } from "react";
import { BottomNav } from "@/app/(pos)/bottom-nav";
import { getBusiness } from "@/lib/business";
import { getStaff } from "@/lib/staff";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { SideNav } from "./side-nav";

// who's signed in + the shop's mode + waiting QR orders → which links (and badge) to show
// cache = worked out once per page, shared by the sidebar and the phone bottom bar
const navInfo = cache(async () => {
    const [staff, business] = await Promise.all([getStaff(), getBusiness()]);
    const isManager = staff !== null && staff.role !== "staff";
    if (!staff || !business) return { isManager, isRestaurant: false, newQr: 0, lowStock: 0 };

    const [{ count }, { data: stock }] = await Promise.all([
        // phone orders waiting for staff
        supabaseAdmin.from("qr_orders").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "new"),
        // stock levels — only managers see the Stock link, so only they need this
        isManager
            ? supabaseAdmin.from("stock_items").select("qty, low_level").eq("business_id", business.id)
            : Promise.resolve({ data: [] as { qty: number; low_level: number }[] }),
    ]);
    // low or out = at / under the "warn when below" level, or nothing left
    const lowStock = (stock ?? []).filter((s) => Number(s.qty) <= 0 || Number(s.qty) <= Number(s.low_level)).length;

    return {
        isManager,
        isRestaurant: business.service_mode === "restaurant",
        newQr: count ?? 0,
        lowStock,
    };
});

export async function SideNavForStaff() {
    return <SideNav {...await navInfo()} />;
}

export async function BottomNavForStaff() {
    return <BottomNav {...await navInfo()} />;
}
