import { BottomNav } from "@/app/bottom-nav";
import { getStaff } from "@/lib/staff";
import { SideNav } from "./side-nav";

async function isManager() {
    const staff = await getStaff();
    return staff !== null && staff.role !== "staff";
}

export async function SideNavForStaff() {
    return <SideNav isManager={await isManager()} />;
}

export async function BottomNavForStaff() {
    return <BottomNav isManager={await isManager()} />;
}