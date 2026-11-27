import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseAuth } from "@/lib/supabase-server";

// remembered on this device at sign-in: which shop you last signed in to
// (signed in → only used if you really work there; signed out → only for the sign-in page's logo + code)
export const SHOP_COOKIE = "pos_shop";

const COLUMNS =
    "id, name, slug, tagline, sst_registered, sst_rate, address, phone, sst_reg_no, receipt_footer, service_mode, auto_print, pin_for, theme, logo_url, login_domain, is_active, company_id, outlet_label";

// THE SHOP of whoever is signed in (from business_members), not a fixed shop any more.
// cache(): if the layout AND the page both ask in one page load, it's only worked out once.
export const getBusiness = cache(async () => {
    await connection(); // depends on THIS request's login cookie, so never prerender it
    const remembered = (await cookies()).get(SHOP_COOKIE)?.value ?? null;

    const supabase = await supabaseAuth();
    const { data: auth } = await supabase.auth.getClaims();
    const userId = auth?.claims?.sub;

    let businessId: string | null = remembered;
    if (userId) {
        const { data: rows } = await supabaseAdmin.from("business_members").select("business_id").eq("user_id", userId);
        const mine = (rows ?? []).map((r) => r.business_id as string);
        businessId = remembered && mine.includes(remembered) ? remembered : (mine[0] ?? null);
    }
    if (!businessId) return null;

    const { data } = await supabaseAdmin.from("businesses").select(COLUMNS).eq("id", businessId).maybeSingle();
    if (!data || (userId && data.is_active === false)) return null; // switched-off shop = no POS
    return data;
});
