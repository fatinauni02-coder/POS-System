"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getBusiness } from "@/lib/business";
import { hqContext } from "@/lib/hq";
import { logActivity } from "@/lib/activity";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseAuth } from "@/lib/supabase-server";

// HQ: push the master menu (this outlet's) to every other outlet of the company. Needs migration 022.
// Only HQ users of the company, and only from the master-menu outlet.
export async function pushHqMenu(formData: FormData) {
    const area = formData.get("area") === "/admin" ? "/admin" : "/merchant";
    function back(q: string): never {
        redirect(`${area}/menu?${q}`);
    }

    const supabase = await supabaseAuth();
    const { data: auth } = await supabase.auth.getClaims();
    const userId = auth?.claims?.sub;
    const business = await getBusiness();
    if (!userId || !business?.company_id) back("push_error=Not+an+HQ+outlet");

    const [{ data: hq }, { data: company }] = await Promise.all([
        supabaseAdmin.from("company_members").select("role").eq("company_id", business.company_id).eq("user_id", userId).maybeSingle(),
        supabaseAdmin.from("companies").select("hq_business_id").eq("id", business.company_id).maybeSingle(),
    ]);
    if (!hq) back("push_error=Only+HQ+can+push+the+menu");
    if (company?.hq_business_id !== business.id) back("push_error=Switch+to+the+HQ+menu+outlet+first");

    const { data, error } = await supabaseAdmin.rpc("push_hq_menu", { p_company: business.company_id });
    if (error) back(`push_error=${encodeURIComponent(error.message)}`);

    revalidatePath("/", "layout");
    await logActivity("menu.pushed", `Pushed the HQ menu to ${(data as { outlets: number }).outlets} outlet(s)`, business.company_id);
    back(`pushed=${(data as { outlets: number }).outlets}`);
}

// HQ: pause an item in EVERY outlet ("Unavailable (HQ)"), or lift the pause. Straight away, no push needed.
// Outlets can't switch a paused item back on; lifting the pause gives each outlet back its own Sold out state.
export async function pauseInAllOutlets(formData: FormData) {
    const hq = await hqContext();
    if (!hq.isHq || !hq.isMaster || !hq.companyId) throw new Error("Only HQ can pause items, from the HQ menu outlet.");

    const id = Number(formData.get("id"));
    const off = formData.get("off") === "true";
    if (!Number.isInteger(id)) throw new Error("Bad item id");

    const { error } = await supabaseAdmin.rpc("set_hq_pause", { p_company: hq.companyId, p_item: id, p_off: off });
    if (error) throw new Error(`${error.message} (did you run migration 023?)`);

    const { data: item } = await supabaseAdmin.from("menu_items").select("name").eq("id", id).maybeSingle();
    await logActivity(off ? "menu.paused" : "menu.resumed", `${off ? "Paused" : "Resumed"} ${item?.name ?? `item #${id}`} in all outlets`, hq.companyId);
    revalidatePath("/", "layout");
}
