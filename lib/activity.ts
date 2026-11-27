import "server-only";
import { headers } from "next/headers";
import { PORTAL_HEADER } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseAuth } from "@/lib/supabase-server";

// ACTIVITY LOG (migration 029): call after an important change succeeds.
// Never throws: a missing table (029 not run) or a hiccup must not break the action itself.
export async function logActivity(action: string, summary: string, companyId?: string | null) {
    try {
        const supabase = await supabaseAuth();
        const { data } = await supabase.auth.getClaims();
        const actor = typeof data?.claims?.email === "string" ? data.claims.email : "unknown";
        const portal = (await headers()).get(PORTAL_HEADER) === "admin" ? "admin" : "merchant";
        await supabaseAdmin.from("activity_log").insert({ actor, portal, action, summary: summary.slice(0, 300), company_id: companyId ?? null });
    } catch (e) {
        console.error("activity log failed:", e);
    }
}
