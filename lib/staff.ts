import "server-only";
import { cache } from "react";
import { getBusiness } from "./business";
import { supabaseAdmin } from "./supabase-admin";
import { supabaseAuth } from "./supabase-server";
import { displayName } from "./username";
import { redirect } from "next/navigation";

export type Role = "owner" | "manager" | "staff";

// the signed-in person + their role in THIS shop; null = not signed in or not staff here
export const getStaff = cache(async () => {
    const supabase = await supabaseAuth();
    // getClaims() = the signed-in person from the (checked) login cookie, without a trip to Supabase Auth
    const { data: auth } = await supabase.auth.getClaims();
    const claims = auth?.claims;
    if (!claims) return null;
    const user = { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };

    const business = await getBusiness();
    if (!business) return null;

    const { data } = await supabaseAdmin
        .from("business_members")
        .select("role")
        .eq("business_id", business.id)
        .eq("user_id", user.id)
        .maybeSingle();
    if (!data) return null;

    const email = user.email ?? "";
    return { id: user.id, email, name: displayName(email), role: data.role as Role }; // name = "ali"
});

// owner/manager only: anyone else is sent back to the Order screen
export async function requireManager() {
    const staff = await getStaff();
    if (!staff || staff.role === "staff") redirect("/");
    return staff;
}