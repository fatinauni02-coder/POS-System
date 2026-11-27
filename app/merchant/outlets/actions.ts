"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getBusiness } from "@/lib/business";
import { hqContext } from "@/lib/hq";
import { addOutletWithManager } from "@/lib/outlet-setup";
import { requireFeature } from "@/lib/features";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logActivity } from "@/lib/activity";

// HQ: the company's own outlets — add, rename, switch on / off. HQ users only (company_members).
const PAGE = "/merchant/outlets";

function fail(message: string): never {
    redirect(`${PAGE}?error=${encodeURIComponent(message)}&t=${Date.now()}`);
}
function done(message: string): never {
    revalidatePath("/", "layout");
    redirect(`${PAGE}?saved=${encodeURIComponent(message)}&t=${Date.now()}`);
}

export async function requireHq() {
    const hq = await hqContext();
    if (!hq.isHq || !hq.companyId) redirect("/merchant");
    return hq as { isHq: true; isMaster: boolean; companyId: string };
}

// the outlet must be one of THIS company's
async function myOutlet(companyId: string, id: string) {
    const { data } = await supabaseAdmin.from("businesses").select("id, name, outlet_label").eq("id", id).eq("company_id", companyId).maybeSingle();
    if (!data) fail("Outlet not found.");
    return data;
}

// ADD AN OUTLET: its label ("Johor Bharu") + its manager's login. It takes HQ's business name, logo,
// tagline and colours; HQ gets in automatically; push the menu to fill it.
export async function addOutlet(formData: FormData) {
    const hq = await requireHq();
    await requireFeature("outlets"); // "Multiple outlets" must be in the plan
    const name = String(formData.get("label") ?? "").trim().slice(0, 60);
    const managerId = String(formData.get("manager") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (!name) fail("Type the outlet name.");

    const error = await addOutletWithManager(hq.companyId, name, managerId, password, readContact(formData));
    if (error) fail(error);
    await logActivity("outlet.added", `Added outlet ${name} (manager: ${managerId})`, hq.companyId);
    done(`${name} added. Manager signs in as "${managerId}". Push the menu from the HQ menu outlet to fill it.`);
}

// the outlet's own details (everything else — logo, tagline, colours — comes from HQ)
function readContact(formData: FormData) {
    const text = (key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max) || null;
    return { address: text("address", 200), phone: text("phone", 30) };
}

// LABEL ("HQ", "Johor Bharu"), ADDRESS, PHONE of one outlet. The business name is the brand: change it in Settings at HQ.
export async function saveOutletDetails(formData: FormData) {
    const hq = await requireHq();
    const outlet = await myOutlet(hq.companyId, String(formData.get("id") ?? ""));
    const label = String(formData.get("label") ?? "").trim().slice(0, 60);
    if (!label) fail("Type the outlet name.");
    const { error } = await supabaseAdmin.from("businesses").update({ outlet_label: label, ...readContact(formData) }).eq("id", outlet.id);
    if (error) fail(error.message);
    await logActivity("outlet.updated", `Updated outlet ${label} (name / address / phone)`, hq.companyId);
    done(`${label} saved.`);
}

// off = nobody can sign in to that outlet (nothing is deleted). The HQ menu outlet and the one you're in stay on.
export async function setOutletActive(formData: FormData) {
    const hq = await requireHq();
    const outlet = await myOutlet(hq.companyId, String(formData.get("id") ?? ""));
    const active = formData.get("active") === "1";
    if (!active) {
        const [{ data: company }, here] = await Promise.all([
            supabaseAdmin.from("companies").select("hq_business_id").eq("id", hq.companyId).maybeSingle(),
            getBusiness(),
        ]);
        if (company?.hq_business_id === outlet.id) fail("The HQ menu outlet can't be switched off.");
        if (here?.id === outlet.id) fail("Switch to another outlet first.");
    }
    const { error } = await supabaseAdmin.from("businesses").update({ is_active: active }).eq("id", outlet.id);
    if (error) fail(error.message);
    const label = outlet.outlet_label || outlet.name;
    await logActivity(active ? "outlet.on" : "outlet.off", `${active ? "Switched on" : "Switched off"} outlet ${label}`, hq.companyId);
    done(active ? `${label} switched on.` : `${label} switched off.`);
}
