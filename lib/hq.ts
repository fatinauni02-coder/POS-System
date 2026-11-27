import "server-only";
import { cache } from "react";
import { getBusiness } from "@/lib/business";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseAuth } from "@/lib/supabase-server";

// who am I in this outlet's company?
//   isHq     = HQ user of the company (company_members)
//   isMaster = this outlet holds the company's master menu (companies.hq_business_id)
export const hqContext = cache(async () => {
    const none = { isHq: false, isMaster: false, companyId: null as string | null };
    const business = await getBusiness();
    if (!business?.company_id) return none;

    const supabase = await supabaseAuth();
    const { data: auth } = await supabase.auth.getClaims();
    const userId = auth?.claims?.sub;
    if (!userId) return none;

    const [{ data: hq }, { data: company }] = await Promise.all([
        supabaseAdmin.from("company_members").select("role").eq("company_id", business.company_id).eq("user_id", userId).maybeSingle(),
        supabaseAdmin.from("companies").select("hq_business_id").eq("id", business.company_id).maybeSingle(),
    ]);
    return { isHq: !!hq, isMaster: company?.hq_business_id === business.id, companyId: business.company_id as string };
});

// an outlet that is NOT the company's HQ menu outlet: its brand (logo, name, tagline, colours, address, phone)
// is set by HQ, so its own Settings can't change them
export const isBranchOutlet = cache(async () => {
    const business = await getBusiness();
    if (!business?.company_id) return false;
    const { data } = await supabaseAdmin.from("companies").select("hq_business_id").eq("id", business.company_id).maybeSingle();
    return !!data?.hq_business_id && data.hq_business_id !== business.id;
});

// READ-ONLY brand in Settings: an outlet (not the HQ menu outlet) opened by its OWN staff.
// HQ users switched into the outlet can still change everything.
export const outletLocked = cache(async () => {
    const [branch, hq] = await Promise.all([isBranchOutlet(), hqContext()]);
    return branch && !hq.isHq;
});
