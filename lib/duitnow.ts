import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type Duitnow = { qrUrl: string | null; name: string | null; inApp: boolean };

// The shop's DuitNow QR settings (migration 018).
// Kept OUT of getBusiness() on purpose: if 018 isn't run yet, only this returns null —
// the rest of the POS keeps working.
export async function getDuitnow(businessId: string): Promise<Duitnow | null> {
    const { data, error } = await supabaseAdmin
        .from("businesses")
        .select("duitnow_qr_url, duitnow_name, duitnow_in_app")
        .eq("id", businessId)
        .maybeSingle();
    if (error || !data) return null;
    return { qrUrl: data.duitnow_qr_url, name: data.duitnow_name, inApp: Boolean(data.duitnow_in_app) };
}
