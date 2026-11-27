import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getBusiness } from "@/lib/business";
import { ALL_ON, readFeatures, type FeatureKey, type Features } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase-admin";

// the features of the signed-in outlet's merchant (Admin → Shops → plan). No company / before 028 → everything on.
export const getFeatures = cache(async (): Promise<Features> => {
    const business = await getBusiness();
    if (!business?.company_id) return ALL_ON;
    const { data, error } = await supabaseAdmin.from("companies").select("features").eq("id", business.company_id).maybeSingle();
    if (error || !data) return ALL_ON;
    return readFeatures(data.features);
});

// a page / action that needs a feature: not in the plan → back to the Order screen
export async function requireFeature(key: FeatureKey) {
    if (!(await getFeatures())[key]) redirect("/merchant");
}
