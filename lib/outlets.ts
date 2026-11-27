import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseAuth } from "@/lib/supabase-server";

export type MyOutlet = { id: string; name: string; label: string; slug: string; active: boolean };

// every outlet the signed-in person can open (from business_members).
// HQ users are owners in every outlet of their company, so they get the whole list.
export const myOutlets = cache(async (): Promise<MyOutlet[]> => {
    await connection();
    const supabase = await supabaseAuth();
    const { data: auth } = await supabase.auth.getClaims();
    const userId = auth?.claims?.sub;
    if (!userId) return [];

    const { data } = await supabaseAdmin
        .from("business_members")
        .select("businesses(id, name, outlet_label, slug, is_active)")
        .eq("user_id", userId);

    return (data ?? [])
        .map((r) => r.businesses as unknown as { id: string; name: string; outlet_label: string | null; slug: string; is_active: boolean } | null)
        .filter((b): b is NonNullable<typeof b> => !!b)
        // label = "HQ", "Johor Bharu"…; a shop without outlets just shows its name
        .map((b) => ({ id: b.id, name: b.name, label: b.outlet_label || b.name, slug: b.slug, active: b.is_active !== false }))
        .sort((a, b) => (a.label === "HQ" ? -1 : b.label === "HQ" ? 1 : a.label.localeCompare(b.label)));
});
