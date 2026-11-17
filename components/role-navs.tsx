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
    // phone orders waiting for staff (only counted for signed-in staff)
    const { count } =
        staff && business
            ? await supabaseAdmin
                  .from("qr_orders")
                  .select("id", { count: "exact", head: true })
                  .eq("business_id", business.id)
                  .eq("status", "new")
            : { count: 0 };
    return {
        isManager: staff !== null && staff.role !== "staff",
        isRestaurant: business?.service_mode === "restaurant",
        newQr: count ?? 0,
    };
});

export async function SideNavForStaff() {
    return <SideNav {...await navInfo()} />;
}

export async function BottomNavForStaff() {
    return <BottomNav {...await navInfo()} />;
}
