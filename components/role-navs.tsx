import { BottomNav } from "@/app/(pos)/bottom-nav";
import { getBusiness } from "@/lib/business";
import { getStaff } from "@/lib/staff";
import { SideNav } from "./side-nav";

// who's signed in + the shop's mode → which links to show
async function navInfo() {
    const [staff, business] = await Promise.all([getStaff(), getBusiness()]);
    return {
        isManager: staff !== null && staff.role !== "staff",
        isRestaurant: business?.service_mode === "restaurant",
    };
}

export async function SideNavForStaff() {
    return <SideNav {...await navInfo()} />;
}

export async function BottomNavForStaff() {
    return <BottomNav {...await navInfo()} />;
}