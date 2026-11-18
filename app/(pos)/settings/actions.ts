"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { checkOwnPin, hasOwnPin, setOwnPin } from "@/lib/pin";
import { getBusiness } from "@/lib/business";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireManager } from "@/lib/staff";

// which section was open ("?tab=…"), so we go back to the same one
const TABS = ["business", "tax", "receipt", "service"];

// go back to /settings (same section) with a red message
function fail(tabQ: string, message: string): never {
    redirect(`/settings?${tabQ}error=${encodeURIComponent(message)}&t=${Date.now()}`);
}

export async function saveSettings(formData: FormData) {
    const tab = String(formData.get("tab") ?? "");
    const tabQ = TABS.includes(tab) && tab !== "business" ? `tab=${tab}&` : "";
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) fail(tabQ, "Shop not found");

    // read a text box: trimmed, cut to a max length, empty → null
    const text = (key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max) || null;

    const name = text("name", 60);
    const sstRegistered = formData.get("sst_registered") === "on"; // a ticked checkbox sends "on"
    const sstRate = Number(formData.get("sst_rate"));
    const serviceMode = String(formData.get("service_mode") ?? "cafe");

    // check on the server (the browser's checks can be skipped)
    if (!name) fail(tabQ, "Shop name is required");
    if (!Number.isFinite(sstRate) || sstRate < 0 || sstRate > 20) fail(tabQ, "SST rate must be between 0 and 20");
    if (serviceMode !== "cafe" && serviceMode !== "restaurant") fail(tabQ, "Pick a service style");

    const { error } = await supabaseAdmin
        .from("businesses")
        .update({
            name,
            tagline: text("tagline", 80),
            address: text("address", 200),
            phone: text("phone", 30),
            sst_registered: sstRegistered,
            sst_rate: sstRate,
            sst_reg_no: text("sst_reg_no", 40),
            receipt_footer: text("receipt_footer", 200),
            service_mode: serviceMode,
        })
        .eq("id", business.id);

    if (error) fail(tabQ, error.message);
    revalidatePath("/", "layout"); // redraw EVERY page (incl. the top bar in the layout) with the new details
    redirect(`/settings?${tabQ}saved=1&t=${Date.now()}`); // reload the page with a green "Saved" message
}


// ---------- manager PIN ----------

// back to the PIN card (#pin) with a red message
function pinFail(message: string): never {
    redirect(`/settings?tab=security&pinError=${encodeURIComponent(message)}&t=${Date.now()}`);
}

export async function changePin(formData: FormData) {
    const me = await requireManager(); // owners/managers only — each sets THEIR OWN PIN
    const business = await getBusiness();
    if (!business) pinFail("Shop not found");

    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("next") ?? "");
    const again = String(formData.get("again") ?? "");

    // changing an existing PIN needs the current one (so nobody else at the till can change it)
    if (await hasOwnPin(business.id, me.id)) {
        if (!(await checkOwnPin(business.id, me.id, current))) pinFail("Current PIN is wrong");
    }
    if (!/^\d{4,6}$/.test(next)) pinFail("New PIN must be 4 to 6 digits");
    if (next !== again) pinFail("The two new PINs are different");

    const problem = await setOwnPin(business.id, me.id, next);
    if (problem) pinFail(problem);
    redirect(`/settings?tab=security&pin=changed&t=${Date.now()}`);
}
